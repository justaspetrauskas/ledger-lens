// Ledger Lens proxy. One process serves both the built SPA (dist/) and the
// /api/* endpoints, same-origin, so there's no CORS to configure. It holds the
// funded Anthropic key, gates live mode behind a demo access code, and caps
// spend — falling back to scripted mode (client-side) when a code is wrong or
// the budget is spent.

import { readFile } from 'node:fs/promises'
import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import Anthropic from '@anthropic-ai/sdk'
import { AGENT_MODEL, ask, type AgentTurn } from './agent'
import * as budget from './budget'

const apiKey = process.env.ANTHROPIC_API_KEY
const client = apiKey ? new Anthropic({ apiKey }) : null

// Demo access codes you hand out (in a CV, an email). Comma-separated in env.
const CODES = new Set(
  (process.env.DEMO_ACCESS_CODES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

// Optional public code, safe to reveal to any visitor so a stranger (a recruiter)
// can try live mode without emailing for a code. It's still spend-capped by the
// same per-code/daily budget as any handed-out code. When set, we fold it into
// CODES and surface its value via /api/status so the client can offer one click.
const PUBLIC_CODE = process.env.PUBLIC_DEMO_CODE?.trim() || null
if (PUBLIC_CODE) CODES.add(PUBLIC_CODE)

const app = new Hono()

// Whether live mode is usable at all right now: key configured, at least one
// code configured, and the budget not yet spent for the day.
const liveAvailable = () => !!client && CODES.size > 0 && budget.hasHeadroom()

app.get('/api/status', (c) =>
  c.json({
    available: liveAvailable(),
    remaining: budget.remainingTokens(),
    publicCode: PUBLIC_CODE,
  }),
)

// Check a code without spending any budget, so the field can tell the visitor
// whether their code is live *before* they ask. 503 = live mode isn't configured
// here at all (no key), which is different from a code that simply isn't valid.
app.post('/api/verify', async (c) => {
  let body: { code?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ valid: false }, 400)
  }
  if (!client || CODES.size === 0) return c.json({ valid: false, reason: 'unavailable' }, 503)
  const code = (body.code ?? '').trim()
  const valid = !!code && CODES.has(code)
  return c.json({ valid, remaining: budget.remainingTokens() }, valid ? 200 : 401)
})

app.post('/api/ask', async (c) => {
  let body: { question?: string; history?: AgentTurn[]; code?: string }
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'bad_request' }, 400)
  }

  const code = (body.code ?? '').trim()
  const question = (body.question ?? '').trim()
  if (!code || !CODES.has(code)) return c.json({ error: 'unauthorized' }, 401)
  if (!question) return c.json({ error: 'bad_request' }, 400)
  if (!client) return c.json({ error: 'unavailable' }, 503)
  if (!budget.check(code)) return c.json({ error: 'exhausted' }, 429)

  budget.startRequest(code)
  const history = Array.isArray(body.history) ? body.history : []

  return streamSSE(c, async (stream) => {
    try {
      const result = await ask(client, history, question, {
        onText: (delta) => stream.writeSSE({ event: 'text', data: JSON.stringify({ text: delta }) }),
        onChart: (chart) => stream.writeSSE({ event: 'chart', data: JSON.stringify(chart) }),
        onCitation: (citation) => stream.writeSSE({ event: 'citation', data: JSON.stringify(citation) }),
      })
      budget.chargeTokens(result.usage.inputTokens + result.usage.outputTokens)
      await stream.writeSSE({ event: 'done', data: JSON.stringify(result.payload) })
    } catch (err) {
      await stream.writeSSE({
        event: 'error',
        data: JSON.stringify({ message: err instanceof Error ? err.message : String(err) }),
      })
    }
  })
})

// Static SPA. API routes are registered first, so they win; anything else falls
// through to the built assets, and unknown paths get index.html (client routing).
app.use('/*', serveStatic({ root: './dist' }))
app.get('*', async (c) => {
  try {
    return c.html(await readFile('./dist/index.html', 'utf8'))
  } catch {
    return c.text('Client not built. Run `npm run build`.', 500)
  }
})

const port = Number(process.env.PORT ?? 8080)
serve({ fetch: app.fetch, port }, (info) => {
  console.log(
    `Ledger Lens on :${info.port} — model ${AGENT_MODEL}, ` +
      `${CODES.size} access code(s), key ${client ? 'set' : 'MISSING'}`,
  )
})

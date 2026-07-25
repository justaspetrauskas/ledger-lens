// Proxy: serves the built SPA + /api/* same-origin, holds the key, gates live mode behind a demo code, and caps spend.

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

// Demo access codes you hand out, comma-separated in env.
const CODES = new Set(
  (process.env.DEMO_ACCESS_CODES ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
)

// Optional public code, safe to reveal so a visitor can try live mode without asking; still spend-capped, surfaced via /api/status.
const PUBLIC_CODE = process.env.PUBLIC_DEMO_CODE?.trim() || null
if (PUBLIC_CODE) CODES.add(PUBLIC_CODE)

const app = new Hono()

// Live mode usable now: key set, a code configured, budget not spent.
const liveAvailable = () => !!client && CODES.size > 0 && budget.hasHeadroom()

app.get('/api/status', (c) =>
  c.json({
    available: liveAvailable(),
    remaining: budget.remainingTokens(),
    publicCode: PUBLIC_CODE,
  }),
)

// Check a code without spending budget; 503 = live mode not configured here (distinct from an invalid code).
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

// Static SPA (API routes registered first win); unknown paths fall through to index.html.
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

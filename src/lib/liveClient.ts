// Live mode client: POSTs the question to /api/ask and renders the SSE stream the proxy sends back. No key, no SDK here.

import type { AssistantPayload, ChartSpec, CitationDef } from './types'

export type LiveErrorReason =
  | 'unauthorized' // bad/missing demo code
  | 'exhausted' // budget spent
  | 'unavailable' // proxy has no key configured
  | 'bad_request'
  | 'network' // couldn't reach the proxy
  | 'stream' // proxy reported an error mid-answer

/** Carries a machine-readable reason so the UI can decide how to fall back. */
export class LiveError extends Error {
  reason: LiveErrorReason
  constructor(reason: LiveErrorReason, message: string) {
    super(message)
    this.name = 'LiveError'
    this.reason = reason
  }
}

export interface LiveCallbacks {
  onText: (fullTextSoFar: string) => void
  onChart: (chart: ChartSpec) => void
  onCitation: (citation: CitationDef) => void
}

export interface LiveTurn {
  role: 'user' | 'assistant'
  text: string
}

export type CodeStatus = 'valid' | 'invalid' | 'unavailable'

// Check a demo code without spending budget; 'unavailable' = live mode not configured/reachable, distinct from a wrong code.
export async function verifyCode(code: string): Promise<CodeStatus> {
  let res: Response
  try {
    res = await fetch('/api/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code }),
    })
  } catch {
    return 'unavailable'
  }
  if (res.status === 503) return 'unavailable'
  if (!res.ok) return 'invalid'
  const body = (await res.json().catch(() => null)) as { valid?: boolean } | null
  return body?.valid ? 'valid' : 'invalid'
}

function parseSseEvent(raw: string): { event?: string; data: string } {
  let event: string | undefined
  const dataLines: string[] = []
  for (const line of raw.split('\n')) {
    if (line.startsWith('event:')) event = line.slice(6).trim()
    else if (line.startsWith('data:')) dataLines.push(line.slice(5).replace(/^ /, ''))
  }
  return { event, data: dataLines.join('\n') }
}

function reasonForStatus(status: number): LiveErrorReason {
  if (status === 401) return 'unauthorized'
  if (status === 429) return 'exhausted'
  if (status === 503) return 'unavailable'
  if (status === 400) return 'bad_request'
  return 'network'
}

// Ask via the proxy: streams text/chart/citation via callbacks, resolves the final payload, throws LiveError on any failure.
export async function askLive(
  code: string,
  history: LiveTurn[],
  question: string,
  cb: LiveCallbacks,
): Promise<AssistantPayload> {
  let res: Response
  try {
    res = await fetch('/api/ask', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code, history, question }),
    })
  } catch (err) {
    throw new LiveError('network', err instanceof Error ? err.message : String(err))
  }

  if (!res.ok || !res.body) {
    throw new LiveError(reasonForStatus(res.status), `Live request failed (${res.status})`)
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buf = ''
  let accumulated = ''
  const citations: CitationDef[] = []
  let chart: ChartSpec | undefined
  let payload: AssistantPayload | undefined
  let streamError: string | undefined

  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    let idx: number
    while ((idx = buf.indexOf('\n\n')) !== -1) {
      const raw = buf.slice(0, idx)
      buf = buf.slice(idx + 2)
      const { event, data } = parseSseEvent(raw)
      if (!event || !data) continue
      if (event === 'text') {
        accumulated += (JSON.parse(data) as { text: string }).text
        cb.onText(accumulated)
      } else if (event === 'chart') {
        chart = JSON.parse(data) as ChartSpec
        cb.onChart(chart)
      } else if (event === 'citation') {
        const citation = JSON.parse(data) as CitationDef
        citations.push(citation)
        cb.onCitation(citation)
      } else if (event === 'done') {
        payload = JSON.parse(data) as AssistantPayload
      } else if (event === 'error') {
        streamError = (JSON.parse(data) as { message: string }).message
      }
    }
  }

  if (streamError) throw new LiveError('stream', streamError)
  return payload ?? { answer: accumulated, citations, chart }
}

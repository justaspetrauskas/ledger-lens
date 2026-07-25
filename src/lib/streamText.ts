// Token-by-token streaming for scripted mode — the same rendering pipeline a
// real LLM stream feeds (partial markdown, abort, autoscroll), sourced from a
// local string instead of a network stream. Live mode replaces this with the
// actual Anthropic SSE stream; the consuming UI code is identical.

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export interface TextStreamHandle {
  /** Resolves when streaming finishes or is stopped. */
  done: Promise<void>
  /** Abort: the next tick stops; onUpdate fires once more with done=true. */
  stop: () => void
}

export function streamText(
  full: string,
  onUpdate: (textSoFar: string, done: boolean) => void,
): TextStreamHandle {
  let stopped = false
  // Word-ish tokens with whitespace attached: partial text is always a clean
  // prefix of the final text.
  const tokens = full.match(/\S+\s*/g) ?? []

  const done = (async () => {
    await sleep(180)
    let i = 0
    while (i < tokens.length && !stopped) {
      // 1–3 tokens per tick with jitter, mimicking model cadence
      i = Math.min(i + 1 + Math.floor(Math.random() * 3), tokens.length)
      onUpdate(tokens.slice(0, i).join(''), false)
      await sleep(24 + Math.random() * 56)
    }
    onUpdate(tokens.slice(0, i).join(''), true)
  })()

  return { done, stop: () => { stopped = true } }
}

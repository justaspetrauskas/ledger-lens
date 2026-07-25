// In-memory budget for the funded demo. Two independent, soft caps that degrade
// gracefully to scripted mode:
//   - a daily token cap across ALL traffic (the money knob)
//   - a per-code daily request cap (stops one shared code from draining the day)
//
// The hard backstop is the Anthropic *workspace spend cap*, configured in the
// console — that's what actually guarantees you can't be billed past a limit.
// This module is the friendly layer in front of it: when it says "exhausted",
// the client falls back to scripted rather than erroring.
//
// State is process-local (fine for a single Railway container). If this ever
// runs multi-instance or on Cloudflare Workers, swap this for KV/Durable Objects.

const DAILY_TOKEN_CAP = Number(process.env.DAILY_TOKEN_CAP ?? 300_000)
const PER_CODE_DAILY_REQUESTS = Number(process.env.PER_CODE_DAILY_REQUESTS ?? 40)

const today = () => new Date().toISOString().slice(0, 10) // UTC yyyy-mm-dd

let day = today()
let tokensUsed = 0
let requestsByCode = new Map<string, number>()

function roll() {
  const d = today()
  if (d !== day) {
    day = d
    tokensUsed = 0
    requestsByCode = new Map()
  }
}

/** True if both caps still have headroom for one more request from `code`. */
export function check(code: string): boolean {
  roll()
  if (tokensUsed >= DAILY_TOKEN_CAP) return false
  if ((requestsByCode.get(code) ?? 0) >= PER_CODE_DAILY_REQUESTS) return false
  return true
}

/** Count one accepted request against the per-code cap. Call after check() passes. */
export function startRequest(code: string) {
  roll()
  requestsByCode.set(code, (requestsByCode.get(code) ?? 0) + 1)
}

/** Charge tokens against the daily cap once a request completes. */
export function chargeTokens(n: number) {
  roll()
  tokensUsed += n
}

/** True if the daily token cap has any headroom left at all. */
export function hasHeadroom(): boolean {
  roll()
  return tokensUsed < DAILY_TOKEN_CAP
}

/** Tokens remaining under the daily cap (never negative). */
export function remainingTokens(): number {
  roll()
  return Math.max(0, DAILY_TOKEN_CAP - tokensUsed)
}

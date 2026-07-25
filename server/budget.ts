// In-memory soft caps (daily tokens + per-code daily requests) in front of the Anthropic workspace spend cap; process-local.

const DAILY_TOKEN_CAP = Number(process.env.DAILY_TOKEN_CAP ?? 300_000)
const PER_CODE_DAILY_REQUESTS = Number(process.env.PER_CODE_DAILY_REQUESTS ?? 40)

const today = () => new Date().toISOString().slice(0, 10)

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

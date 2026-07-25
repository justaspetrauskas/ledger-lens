// Query/aggregation engine over the ledger. This module is the "tool"
// implementation: scripted answers call it directly, and in live mode the
// model calls it through the query_ledger tool — same code path, so
// scripted and live answers can never drift from the data.

import { ledger, MONTHS, type Category, type LedgerEntry } from '../data/ledger'

export interface LedgerFilter {
  category?: Category
  counterparty?: string
  fromMonth?: string // 'yyyy-mm' inclusive
  toMonth?: string // 'yyyy-mm' inclusive
  minAbsAmount?: number
}

export function filterEntries(f: LedgerFilter): LedgerEntry[] {
  return ledger.filter((e) => {
    const month = e.date.slice(0, 7)
    if (f.category && e.category !== f.category) return false
    if (f.counterparty && e.counterparty !== f.counterparty) return false
    if (f.fromMonth && month < f.fromMonth) return false
    if (f.toMonth && month > f.toMonth) return false
    if (f.minAbsAmount && Math.abs(e.amount) < f.minAbsAmount) return false
    return true
  })
}

export function monthsBetween(fromMonth?: string, toMonth?: string): string[] {
  return MONTHS.filter((m) => (!fromMonth || m >= fromMonth) && (!toMonth || m <= toMonth))
}

/** Sum per month for a filter. Expenses are returned as positive magnitudes. */
export function monthlyTotals(f: LedgerFilter): { months: string[]; totals: number[] } {
  const months = monthsBetween(f.fromMonth, f.toMonth)
  const sums = new Map(months.map((m) => [m, 0]))
  for (const e of filterEntries(f)) {
    const m = e.date.slice(0, 7)
    if (sums.has(m)) sums.set(m, sums.get(m)! + e.amount)
  }
  const totals = months.map((m) => {
    const v = sums.get(m)!
    return f.category && f.category !== 'Revenue' ? Math.abs(v) : v
  })
  return { months, totals }
}

/** Total spend per expense category over a period (positive magnitudes). */
export function categoryTotals(fromMonth: string, toMonth: string): { categories: string[]; totals: number[] } {
  const sums = new Map<string, number>()
  for (const e of filterEntries({ fromMonth, toMonth })) {
    if (e.amount >= 0) continue
    sums.set(e.category, (sums.get(e.category) ?? 0) + Math.abs(e.amount))
  }
  const sorted = [...sums.entries()].sort((a, b) => b[1] - a[1])
  return { categories: sorted.map(([c]) => c), totals: sorted.map(([, t]) => Math.round(t)) }
}

/**
 * Entries that look like duplicate payments: same counterparty, description
 * and amount **within the same month**. The same-month constraint matters —
 * without it, legitimate recurring payments (rent, salaries, subscriptions)
 * are false positives.
 */
function duplicateGroups(): LedgerEntry[][] {
  const seen = new Map<string, LedgerEntry[]>()
  for (const e of ledger) {
    if (e.amount >= 0) continue
    const key = `${e.counterparty}|${e.description}|${e.amount}|${e.date.slice(0, 7)}`
    seen.set(key, [...(seen.get(key) ?? []), e])
  }
  return [...seen.values()].filter((g) => g.length > 1)
}

export function findDuplicateCandidates(): LedgerEntry[] {
  return duplicateGroups().flat()
}

/** Count of distinct items flagged for review (currently: duplicate-payment groups). */
export function flaggedForReviewCount(): number {
  return duplicateGroups().length
}

export function sum(entries: LedgerEntry[]): number {
  return entries.reduce((acc, e) => acc + e.amount, 0)
}

export const fmtDKK = (n: number) =>
  new Intl.NumberFormat('da-DK', { style: 'currency', currency: 'DKK', maximumFractionDigits: 0 }).format(n)

export const fmtMonth = (m: string) =>
  new Date(`${m}-01T00:00:00`).toLocaleDateString('en-GB', { month: 'short', year: '2-digit' })

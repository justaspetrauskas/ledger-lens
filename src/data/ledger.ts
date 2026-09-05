// Fictional bookkeeping for "Nordhavn Roastery ApS": parses the generated CSV (~1,400 rows) at load.

import csvRaw from './ledgerCsv'

// Single source of truth: Category is derived from this list, so a hand-copied
// subset elsewhere can no longer silently typecheck (the bug that shipped once).
export const CATEGORIES = [
  'Revenue', 'COGS', 'Salaries', 'Marketing', 'Rent', 'Software', 'Travel', 'Utilities',
  'Insurance', 'Fees', 'Maintenance',
] as const

export type Category = (typeof CATEGORIES)[number]

export interface LedgerEntry {
  id: string
  date: string // ISO yyyy-mm-dd
  description: string
  counterparty: string
  category: Category
  /** DKK. Positive = money in, negative = money out. */
  amount: number
}

// Minimal RFC-4180-style parser: quoted fields, embedded commas, escaped ("") quotes.
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let field = ''
  let row: string[] = []
  let inQuotes = false

  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      row.push(field)
      field = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field)
      rows.push(row)
      field = ''
      row = []
    } else {
      field += c
    }
  }
  // trailing field / row (file may not end in a newline)
  if (field.length > 0 || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

function loadLedger(): LedgerEntry[] {
  const [header, ...dataRows] = parseCsv(csvRaw.trim())
  const col = Object.fromEntries(header.map((name, i) => [name, i]))
  return dataRows.map((r) => ({
    id: r[col.id],
    date: r[col.date],
    description: r[col.description],
    counterparty: r[col.counterparty],
    category: r[col.category] as Category,
    amount: Number(r[col.amount]),
  }))
}

export const ledger: LedgerEntry[] = loadLedger()

/** All months present in the ledger, ascending ('yyyy-mm'). */
export const MONTHS: string[] = [...new Set(ledger.map((e) => e.date.slice(0, 7)))].sort()

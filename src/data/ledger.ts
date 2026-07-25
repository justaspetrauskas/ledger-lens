// Bookkeeping data for the fictional "Nordhavn Roastery ApS", a small Danish
// coffee roastery. The data lives in ledger.csv — a realistic-sized export
// (~1,400 rows over 30 months) that this module parses at load. The CSV is
// produced by scripts/generate-ledger.mjs (a seeded, deterministic generator),
// so every visitor sees the same books and the scripted answers always match
// the data they cite.

import csvRaw from './ledgerCsv'

export type Category =
  | 'Revenue'
  | 'COGS'
  | 'Salaries'
  | 'Marketing'
  | 'Rent'
  | 'Software'
  | 'Travel'
  | 'Utilities'
  | 'Insurance'
  | 'Fees'
  | 'Maintenance'

export interface LedgerEntry {
  id: string
  date: string // ISO yyyy-mm-dd
  description: string
  counterparty: string
  category: Category
  /** DKK. Positive = money in, negative = money out. */
  amount: number
}

// --- CSV parsing ------------------------------------------------------------
// Minimal RFC-4180-style parser: handles quoted fields, embedded commas and
// escaped ("") quotes. Enough for a trusted, well-formed export — not a
// general-purpose CSV library.

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

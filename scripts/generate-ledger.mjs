// Deterministic generator for the Ledger Lens dataset.
//
// Run with:  node scripts/generate-ledger.mjs
//
// Writes src/data/ledger.csv — a realistic-sized bookkeeping export
// (~30 months, thousands of rows) for the fictional "Nordhavn Roastery ApS".
// The app ingests that CSV at load; this script is how the CSV is produced,
// committed once and reproducible because the PRNG is seeded.

import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, '..', 'src', 'data', 'ledger.csv')

// --- deterministic PRNG -----------------------------------------------------

function mulberry32(seed) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const rand = mulberry32(20260724)
const pick = (arr) => arr[Math.floor(rand() * arr.length)]
const between = (min, max) => min + rand() * (max - min)
const round50 = (n) => Math.round(n / 50) * 50
const chance = (p) => rand() < p

// --- calendar: Jan 2024 – Jun 2026 (30 months) ------------------------------

const MONTHS = (() => {
  const out = []
  for (let y = 2024; y <= 2026; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === 2026 && m > 6) break
      out.push(`${y}-${String(m).padStart(2, '0')}`)
    }
  }
  return out
})()

const wholesaleCustomers = [
  'Kaffebar Vesterbro ApS',
  'Hotel Øresund A/S',
  'Grønne Kontorer ApS',
  'Baltika Coffee ApS',
  'Restaurant Havnen IVS',
  'CoWork Nordhavn A/S',
  'Kantine Amager P/S',
  'Bageriet Sundby ApS',
]
const beanSuppliers = ['Antigua Importers ApS', 'Cerrado Trading GmbH', 'Highland Beans Ltd']
const packagingSuppliers = ['Emballagehuset ApS', 'Nordic Paper Bags AB']

// --- generation --------------------------------------------------------------

const entries = []
const add = (e) => entries.push(e)
const day = (month, d) => `${month}-${String(d).padStart(2, '0')}`

// Unique reference numbers. Real ledger lines carry a distinct invoice/order
// ref, so two lines are only true duplicates when they share one. This makes
// transactions that recur within a month (webshop orders, deliveries, fees)
// distinguishable — the sole exception is the planted duplicate below, which
// deliberately reuses invoice 8841.
let refSeq = 10420
const nextRef = () => refSeq++

MONTHS.forEach((month, mi) => {
  const growth = 1 + mi * 0.03 // steady growth over 30 months
  const december = month.endsWith('-12') ? 1.35 : 1 // holiday bump
  const isWinter = ['-11', '-12', '-01', '-02'].some((s) => month.endsWith(s))

  // Revenue — wholesale invoices (large, lumpy)
  const invoiceCount = 6 + Math.floor(rand() * 4)
  for (let i = 0; i < invoiceCount; i++) {
    add({
      date: day(month, 2 + Math.floor(rand() * 26)),
      description: `Wholesale coffee delivery · inv ${nextRef()}`,
      counterparty: pick(wholesaleCustomers),
      category: 'Revenue',
      amount: round50(between(9000, 32000) * growth * december),
    })
  }

  // Revenue — webshop orders (many, small): this is what makes it feel like a real export
  const webshopCount = 14 + Math.floor(rand() * 16)
  for (let i = 0; i < webshopCount; i++) {
    add({
      date: day(month, 1 + Math.floor(rand() * 27)),
      description: `Webshop order #${nextRef()}`,
      counterparty: 'Shopify payout',
      category: 'Revenue',
      amount: round50(between(350, 2600) * growth * december),
    })
  }

  // COGS — green bean purchases (large)
  for (let i = 0; i < 2 + Math.floor(rand() * 2); i++) {
    add({
      date: day(month, 3 + Math.floor(rand() * 22)),
      description: `Green coffee beans · inv ${nextRef()}`,
      counterparty: pick(beanSuppliers),
      category: 'COGS',
      amount: -round50(between(14000, 30000) * growth * december),
    })
  }
  // COGS — packaging & consumables (medium)
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
    add({
      date: day(month, 4 + Math.floor(rand() * 20)),
      description: `${pick(['Bags, valves & labels', 'Takeaway cups & lids', 'Shipping boxes'])} · inv ${nextRef()}`,
      counterparty: pick(packagingSuppliers),
      category: 'COGS',
      amount: -round50(between(1800, 6500) * growth),
    })
  }

  // Salaries — progressive raise rounds
  const salaryBase = month >= '2026-01' ? 156000 : month >= '2025-01' ? 138000 : 118000
  add({
    date: day(month, 28),
    description: 'Salaries incl. pension & ATP',
    counterparty: 'DataLøn A/S',
    category: 'Salaries',
    amount: -salaryBase,
  })

  // Rent — indexation steps. June 2026 rent is deliberately left out: a
  // genuine gap in the books (a payment that was never recorded), which the
  // "Did we pay June rent?" scenario surfaces and proposes to settle. The
  // amount is fixed (no PRNG), so omitting it leaves every other row byte-
  // identical — only the ids after it shift down by one.
  const rent = month >= '2025-07' ? 32240 : month >= '2024-07' ? 31000 : 29800
  if (month !== '2026-06') {
    add({
      date: day(month, 1),
      description: 'Roastery & warehouse rent, Nordhavn',
      counterparty: 'Ejendomsselskabet Nordhavn A/S',
      category: 'Rent',
      amount: -rent,
    })
  }

  // Software subscriptions (recurring, distinct months → never false-positive duplicates)
  add({ date: day(month, 5), description: 'Accounting software subscription', counterparty: 'e-conomic (Visma)', category: 'Software', amount: -1450 })
  add({ date: day(month, 5), description: 'Webshop platform subscription', counterparty: 'Shopify International Ltd', category: 'Software', amount: -2100 })
  add({ date: day(month, 6), description: 'Email & docs subscription', counterparty: 'Google Ireland Ltd', category: 'Software', amount: -640 })
  if (month >= '2025-03')
    add({ date: day(month, 6), description: 'CRM subscription', counterparty: 'HubSpot Ireland Ltd', category: 'Software', amount: -1180 })

  // Marketing — modest baseline
  add({
    date: day(month, 10 + Math.floor(rand() * 10)),
    description: 'Social media advertising',
    counterparty: 'Meta Platforms Ireland Ltd',
    category: 'Marketing',
    amount: -round50(between(3000, 6500)),
  })
  if (chance(0.5))
    add({
      date: day(month, 12 + Math.floor(rand() * 10)),
      description: 'Search advertising',
      counterparty: 'Google Ireland Ltd',
      category: 'Marketing',
      amount: -round50(between(1500, 4000)),
    })

  // Utilities — electricity (winter bump) + water/waste
  add({
    date: day(month, 15),
    description: 'Electricity & heating (roaster)',
    counterparty: 'Ørsted Salg & Service A/S',
    category: 'Utilities',
    amount: -round50(between(5200, 8800) * (isWinter ? 1.4 : 1)),
  })
  add({ date: day(month, 15), description: 'Water & waste', counterparty: 'HOFOR A/S', category: 'Utilities', amount: -round50(between(700, 1300)) })

  // Insurance — monthly
  add({ date: day(month, 3), description: 'Business & liability insurance', counterparty: 'Tryg Forsikring A/S', category: 'Insurance', amount: -2450 })

  // Bank & transaction fees (several small)
  add({ date: day(month, 30 > 28 ? 28 : 28), description: 'Bank account & card fees', counterparty: 'Danske Bank A/S', category: 'Fees', amount: -round50(between(250, 600)) })
  for (let i = 0; i < 1 + Math.floor(rand() * 3); i++) {
    add({
      date: day(month, 8 + Math.floor(rand() * 18)),
      description: `Payment processing fee · ref ${nextRef()}`,
      counterparty: 'Nets A/S',
      category: 'Fees',
      amount: -round50(between(180, 720)),
    })
  }

  // Maintenance — occasional
  if (chance(0.4))
    add({
      date: day(month, 9 + Math.floor(rand() * 15)),
      description: pick(['Roaster service & calibration', 'Grinder maintenance', 'Cooling repair']),
      counterparty: 'Probat Service Nord ApS',
      category: 'Maintenance',
      amount: -round50(between(1800, 7200)),
    })

  // Travel — occasional sourcing trips / fairs
  if (chance(0.4))
    add({
      date: day(month, 8 + Math.floor(rand() * 14)),
      description: 'Sourcing trip / trade fair',
      counterparty: pick(['SAS AB', 'DSB', 'Hotel Bogotá Centro']),
      category: 'Travel',
      amount: -round50(between(2500, 11000)),
    })
})

// --- story hooks the scripted answers rely on -------------------------------

// 1) Marketing campaign spike, March–April 2026 ("spring wholesale push")
add({ date: '2026-03-04', description: 'Spring campaign — agency retainer', counterparty: 'Bureau København ApS', category: 'Marketing', amount: -38000 })
add({ date: '2026-03-18', description: 'Spring campaign — paid media budget', counterparty: 'Meta Platforms Ireland Ltd', category: 'Marketing', amount: -24500 })
add({ date: '2026-04-09', description: 'Spring campaign — trade fair stand, CPH Coffee Week', counterparty: 'CPH Coffee Week ApS', category: 'Marketing', amount: -17800 })

// 2) Duplicate payment: same invoice paid twice in May 2026
add({ date: '2026-05-06', description: 'Label printer lease, invoice 8841', counterparty: 'Nordisk Kontorteknik A/S', category: 'Software', amount: -7900 })
add({ date: '2026-05-21', description: 'Label printer lease, invoice 8841', counterparty: 'Nordisk Kontorteknik A/S', category: 'Software', amount: -7900 })

// --- sort, assign ids, write CSV --------------------------------------------

entries.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

const csvField = (v) => {
  const s = String(v)
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

const header = 'id,date,description,counterparty,category,amount'
const rows = entries.map((e, i) => {
  const id = `L-${String(i + 1).padStart(5, '0')}`
  return [id, e.date, e.description, e.counterparty, e.category, e.amount].map(csvField).join(',')
})

writeFileSync(OUT, `${header}\n${rows.join('\n')}\n`, 'utf8')
console.log(`Wrote ${rows.length} rows to ${OUT}`)

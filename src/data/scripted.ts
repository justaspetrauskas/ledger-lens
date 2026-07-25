// Scripted demo mode. Answers are pre-written, but every number, chart and
// citation is computed from the live dataset via the same query engine the
// AI uses in live mode — so the text can never contradict the books.

import {
  categoryTotals,
  filterEntries,
  findDuplicateCandidates,
  fmtDKK,
  fmtMonth,
  monthlyTotals,
  sum,
} from '../lib/ledgerQuery'
import type { AssistantPayload } from '../lib/types'

export interface ScriptedQA {
  id: string
  question: string
  payload: AssistantPayload
}

// --- Q1: marketing trend ------------------------------------------------------

const mkt = monthlyTotals({ category: 'Marketing', fromMonth: '2026-01', toMonth: '2026-06' })
const mktCampaign = filterEntries({ category: 'Marketing', fromMonth: '2026-03', toMonth: '2026-04', minAbsAmount: 15000 })
const mktCampaignTotal = Math.abs(sum(mktCampaign))

const marketingQA: ScriptedQA = {
  id: 'marketing-trend',
  question: 'How did marketing spend develop this year?',
  payload: {
    answer: `Marketing spend in 2026 has been **stable at a few thousand kroner per month, with one clear exception**: a spike in **March–April** [1].

The spike is the spring wholesale campaign — an agency retainer, extra paid media, and a stand at CPH Coffee Week, together about **${fmtDKK(mktCampaignTotal)}** [2].

Spend returned to the normal baseline in May and June [1], so this reads as a planned one-off, not a runaway budget.`,
    citations: [
      { label: 'Marketing entries, Jan–Jun 2026', filter: { category: 'Marketing', fromMonth: '2026-01', toMonth: '2026-06' } },
      { label: 'Campaign line items (≥ DKK 15,000), Mar–Apr 2026', entryIds: mktCampaign.map((e) => e.id) },
    ],
    chart: {
      type: 'bar',
      title: 'Marketing spend per month, 2026 (DKK)',
      labels: mkt.months.map(fmtMonth),
      series: [{ name: 'Marketing', data: mkt.totals.map(Math.round) }],
    },
  },
}

// --- Q2: revenue trend ----------------------------------------------------------

const rev = monthlyTotals({ category: 'Revenue', fromMonth: '2024-01', toMonth: '2026-06' })
const revFirst3 = rev.totals.slice(0, 3).reduce((a, b) => a + b, 0) / 3
const revLast3 = rev.totals.slice(-3).reduce((a, b) => a + b, 0) / 3
const revGrowthPct = Math.round(((revLast3 - revFirst3) / revFirst3) * 100)

const revenueQA: ScriptedQA = {
  id: 'revenue-trend',
  question: 'What does our revenue trend look like?',
  payload: {
    answer: `Revenue shows **steady growth with a December seasonality bump** [1].

Comparing the last three months to the first three months of the period, average monthly revenue is up roughly **${revGrowthPct}%** — from about ${fmtDKK(Math.round(revFirst3))} to about ${fmtDKK(Math.round(revLast3))} per month.

The December peaks come from holiday-season wholesale orders; growth outside of that is broad-based across the customer list [1].`,
    citations: [
      { label: 'All revenue entries, Jan 2024 – Jun 2026', filter: { category: 'Revenue', fromMonth: '2024-01', toMonth: '2026-06' } },
    ],
    chart: {
      type: 'line',
      title: 'Monthly revenue, Jan 2024 – Jun 2026 (DKK)',
      labels: rev.months.map(fmtMonth),
      series: [{ name: 'Revenue', data: rev.totals.map(Math.round) }],
    },
  },
}

// --- Q3: spend breakdown --------------------------------------------------------

const catQ2 = categoryTotals('2026-04', '2026-06')

const spendQA: ScriptedQA = {
  id: 'spend-breakdown',
  question: 'Where did we spend the most last quarter?',
  payload: {
    answer: `In Q2 2026 (April–June), the biggest cost categories were **${catQ2.categories[0]}** (${fmtDKK(catQ2.totals[0])}) and **${catQ2.categories[1]}** (${fmtDKK(catQ2.totals[1])}) [1].

Salaries reflect the January raise round and are fixed months ahead; bean purchases (COGS) scale with revenue, so the ratio between the two is the number worth watching [1].`,
    citations: [
      { label: 'All expense entries, Apr–Jun 2026', filter: { fromMonth: '2026-04', toMonth: '2026-06' } },
    ],
    advisory: true,
    chart: {
      type: 'donut',
      title: 'Expenses by category, Q2 2026 (DKK)',
      labels: catQ2.categories,
      series: [{ name: 'Spend', data: catQ2.totals }],
    },
  },
}

// --- Q4: spend breakdown carries an advisory footer (analysis, not fact) --------
// (marked below via advisory: true)

// --- Q5: missing payment + elevated (money-moving) approval ----------------------

const juneRent = filterEntries({ category: 'Rent', fromMonth: '2026-06', toMonth: '2026-06' })
const rentHistory = filterEntries({ category: 'Rent', fromMonth: '2026-01', toMonth: '2026-05' })
// Most recent posted rent = the amount the missing June payment should be.
const rentAmount = Math.abs(rentHistory[rentHistory.length - 1]?.amount ?? 0)

const rentQA: ScriptedQA = {
  id: 'june-rent',
  question: 'Did we pay June rent?',
  payload: {
    answer: `**No — there's no June 2026 rent payment in the books.** Rent of ${fmtDKK(rentAmount)} has posted on the 1st of every month for over two years, but June 2026 has **no rent entry at all** [1].

Every prior month is present and June is the only gap, so this reads as a **missed payment**, not a change in terms${juneRent.length === 0 ? '' : ' (note: a June rent entry now exists — the books have changed)'}.

I can prepare the missing rent payment to Ejendomsselskabet Nordhavn A/S for your authorization. **Moving money needs your explicit sign-off — nothing is paid without it.**`,
    citations: [
      { label: 'Rent payments, Jan–Jun 2026 (June absent)', filter: { category: 'Rent', fromMonth: '2026-01', toMonth: '2026-06' } },
    ],
    action: {
      risk: 'elevated',
      confirmValue: String(rentAmount),
      title: 'Pay June 2026 rent — Ejendomsselskabet Nordhavn A/S',
      description: `Initiate the missing June rent payment of ${fmtDKK(rentAmount)} to the landlord's account on file.`,
      draft: `Payment instruction

Payee:      Ejendomsselskabet Nordhavn A/S
Reference:  Roastery & warehouse rent — June 2026
Amount:     ${fmtDKK(rentAmount)}
Account:    usual rent account (on file)
Requested:  Nordhavn Roastery ApS`,
    },
  },
}

// --- Q6: abstention — a question the ledger honestly cannot answer ----------------

const vatQA: ScriptedQA = {
  id: 'vat-q2',
  question: 'How much VAT do we owe for Q2?',
  payload: {
    answer: `**I can't answer that from these books — and I won't guess.**

The ledger records cash movements by category, but it **doesn't track VAT**: there's no VAT category, no gross/net split, and no per-line VAT code telling me which amounts are VAT-liable. Computing Q2 VAT owed would need the VAT rate on each transaction, the split between VAT-able and exempt turnover, and input VAT on purchases — none of which is in this dataset.

A confidently-wrong VAT figure is worse than none, so I'm stopping here rather than estimating. This one belongs with your accountant or the VAT-coded records in e-conomic.`,
    citations: [],
  },
}

// --- Q4: anomaly + human-in-the-loop --------------------------------------------

const dupes = findDuplicateCandidates()
const dupeTotal = Math.abs(sum(dupes)) / 2

const anomalyQA: ScriptedQA = {
  id: 'anomalies',
  question: 'Any unusual transactions I should review?',
  payload: {
    answer: `One thing stands out: what looks like a **duplicate payment** in May 2026 [1].

"${dupes[0]?.description}" to **${dupes[0]?.counterparty}** was paid twice — ${dupes.map((d) => d.date).join(' and ')} — for the same amount, ${fmtDKK(Math.abs(dupes[0]?.amount ?? 0))} each time. If this is indeed one invoice paid twice, roughly **${fmtDKK(dupeTotal)}** may be recoverable.

I can draft a refund request for your review. **Nothing is sent without your approval.**`,
    citations: [{ label: 'Suspected duplicate payments', entryIds: dupes.map((d) => d.id) }],
    advisory: true,
    action: {
      title: 'Request refund from Nordisk Kontorteknik A/S',
      description: `Refund request for a suspected double payment of invoice 8841 (${fmtDKK(Math.abs(dupes[0]?.amount ?? 0))} paid twice in May 2026).`,
      draft: `Subject: Possible double payment — invoice 8841

Hi,

Going through our books we can see two identical payments for invoice 8841 (label printer lease), on ${dupes[0]?.date} and ${dupes[1]?.date}, of ${fmtDKK(Math.abs(dupes[0]?.amount ?? 0))} each.

Could you confirm whether the invoice was settled twice? If so, we'd appreciate a refund of the second payment to our usual account.

Best regards,
Nordhavn Roastery ApS`,
    },
  },
}

export const scriptedQAs: ScriptedQA[] = [marketingQA, revenueQA, spendQA, anomalyQA, rentQA, vatQA]

export const scriptedFallback: AssistantPayload = {
  answer: `Scripted demo mode can only answer the suggested questions — there's no model behind it, by design: the hosted demo has **no backend, no keys in the browser and nothing to break**.

Switch to **Live API** (top right) and enter a demo access code to ask anything about the books — same UI, same query engine, real model with tool use. The key stays server-side; access is a code, not something you paste.`,
  citations: [],
}

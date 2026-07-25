// Live mode: bring-your-own-key Claude integration with tool use.
// The model answers questions about the ledger by calling the same query
// engine the scripted mode uses (src/lib/ledgerQuery.ts), and drives the UI
// through render_chart / add_citation tools.
//
// The key lives in memory only — never persisted, never sent anywhere but
// api.anthropic.com. `dangerouslyAllowBrowser` is required for client-side
// use and is an acceptable tradeoff here precisely because the key is the
// visitor's own.

import Anthropic from '@anthropic-ai/sdk'
import { MONTHS, type Category } from '../data/ledger'
import { categoryTotals, filterEntries, monthlyTotals, type LedgerFilter } from './ledgerQuery'
import type { AssistantPayload, ChartSpec, CitationDef } from './types'

const MODEL = 'claude-opus-4-8'

const CATEGORIES: Category[] = [
  'Revenue', 'COGS', 'Salaries', 'Marketing', 'Rent', 'Software', 'Travel', 'Utilities',
]

const SYSTEM = `You are Ledger Lens, an assistant that answers questions about the
bookkeeping of Nordhavn Roastery ApS (a fictional Danish coffee roastery) strictly
from its ledger data, which you access through the query_ledger tool.

Data coverage: ${MONTHS[0]} to ${MONTHS[MONTHS.length - 1]}. Categories: ${CATEGORIES.join(', ')}.
Amounts are DKK; positive = money in, negative = money out.

Rules:
- Every factual claim must come from query_ledger results. Never invent numbers.
- Cite sources: after querying, call add_citation for the rows backing each claim,
  and put the matching marker [1], [2], … in your text at the claim it supports.
  Citation numbers follow the order of your add_citation calls, starting at 1.
- When a chart would help (trends, breakdowns, comparisons), call render_chart once
  with the aggregated data.
- Keep answers short and decision-oriented. Use **bold** for the key numbers.
- Markdown subset: paragraphs, "- " lists, **bold**, [n] markers. Nothing else.`

const tools: Anthropic.Tool[] = [
  {
    name: 'query_ledger',
    description:
      'Query the bookkeeping ledger. Filter by category, counterparty, month range and minimum absolute amount; optionally aggregate. Returns JSON. Use aggregate="monthly_totals" for time series, "category_totals" for spend breakdowns, "none" for raw rows (capped at 50).',
    input_schema: {
      type: 'object',
      properties: {
        category: { type: 'string', enum: CATEGORIES as unknown as string[] },
        counterparty: { type: 'string' },
        from_month: { type: 'string', description: 'yyyy-mm inclusive' },
        to_month: { type: 'string', description: 'yyyy-mm inclusive' },
        min_abs_amount: { type: 'number' },
        aggregate: { type: 'string', enum: ['none', 'monthly_totals', 'category_totals'] },
      },
    },
  },
  {
    name: 'render_chart',
    description:
      'Render a chart in the UI. Call at most once per answer, with data you obtained from query_ledger.',
    input_schema: {
      type: 'object',
      properties: {
        type: { type: 'string', enum: ['line', 'bar', 'donut'] },
        title: { type: 'string' },
        labels: { type: 'array', items: { type: 'string' } },
        series: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              data: { type: 'array', items: { type: 'number' } },
            },
            required: ['name', 'data'],
          },
        },
      },
      required: ['type', 'title', 'labels', 'series'],
    },
  },
  {
    name: 'add_citation',
    description:
      'Register a citation the user can open to inspect the underlying ledger rows. Returns the marker number to use in your text as [n].',
    input_schema: {
      type: 'object',
      properties: {
        label: { type: 'string', description: 'Short description of what these rows show' },
        entry_ids: { type: 'array', items: { type: 'string' }, description: 'Ledger row ids, e.g. ["L-0012"]' },
      },
      required: ['label', 'entry_ids'],
    },
  },
]

interface QueryLedgerInput extends Record<string, unknown> {
  category?: Category
  counterparty?: string
  from_month?: string
  to_month?: string
  min_abs_amount?: number
  aggregate?: 'none' | 'monthly_totals' | 'category_totals'
}

function runQueryLedger(input: QueryLedgerInput): string {
  const filter: LedgerFilter = {
    category: input.category,
    counterparty: input.counterparty,
    fromMonth: input.from_month,
    toMonth: input.to_month,
    minAbsAmount: input.min_abs_amount,
  }
  if (input.aggregate === 'monthly_totals') {
    return JSON.stringify(monthlyTotals(filter))
  }
  if (input.aggregate === 'category_totals') {
    return JSON.stringify(categoryTotals(input.from_month ?? MONTHS[0], input.to_month ?? MONTHS[MONTHS.length - 1]))
  }
  const rows = filterEntries(filter).slice(0, 50)
  return JSON.stringify({ count: rows.length, rows })
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

/**
 * Ask a question in live mode. Streams text via callbacks and runs the
 * tool-use loop client-side. Returns the final assistant payload.
 */
export async function askLive(
  apiKey: string,
  history: LiveTurn[],
  question: string,
  cb: LiveCallbacks,
): Promise<AssistantPayload> {
  const client = new Anthropic({ apiKey, dangerouslyAllowBrowser: true })

  const messages: Anthropic.MessageParam[] = [
    ...history.map((t): Anthropic.MessageParam => ({ role: t.role, content: t.text })),
    { role: 'user', content: question },
  ]

  let accumulated = ''
  const citations: CitationDef[] = []
  let chart: ChartSpec | undefined

  // Manual streaming loop (see SDK docs: streaming manual loop) — we need
  // per-token UI updates plus client-side tool execution.
  for (let iterations = 0; iterations < 8; iterations++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 4096,
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      tools,
      messages,
    })

    stream.on('text', (delta) => {
      accumulated += delta
      cb.onText(accumulated)
    })

    const message = await stream.finalMessage()

    if (message.stop_reason === 'pause_turn') {
      messages.push({ role: 'assistant', content: message.content })
      continue
    }

    if (message.stop_reason !== 'tool_use') break

    const toolResults: Anthropic.ToolResultBlockParam[] = []
    for (const block of message.content) {
      if (block.type !== 'tool_use') continue
      let result = 'ok'
      let isError = false
      try {
        if (block.name === 'query_ledger') {
          result = runQueryLedger(block.input as QueryLedgerInput)
        } else if (block.name === 'render_chart') {
          chart = block.input as unknown as ChartSpec
          cb.onChart(chart)
          result = 'Chart rendered.'
        } else if (block.name === 'add_citation') {
          const input = block.input as { label: string; entry_ids: string[] }
          citations.push({ label: input.label, entryIds: input.entry_ids })
          cb.onCitation(citations[citations.length - 1])
          result = `Citation registered as [${citations.length}].`
        } else {
          result = `Unknown tool: ${block.name}`
          isError = true
        }
      } catch (err) {
        result = `Tool error: ${err instanceof Error ? err.message : String(err)}`
        isError = true
      }
      toolResults.push({
        type: 'tool_result',
        tool_use_id: block.id,
        content: result,
        is_error: isError || undefined,
      })
    }

    messages.push({ role: 'assistant', content: message.content })
    messages.push({ role: 'user', content: toolResults })
  }

  return { answer: accumulated, citations, chart }
}

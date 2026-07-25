// Server-side agent. This is the whole point of Phase 4: the Anthropic key, the
// system prompt, the tool definitions, the ledger query engine, and the tool-use
// loop all live here, on the server. The browser sends a question and receives a
// merged event stream — it can't see or tamper with any of the below.
//
// It reuses the exact same query engine the scripted mode uses
// (src/lib/ledgerQuery.ts), so live and scripted answers still can't drift.

import Anthropic from '@anthropic-ai/sdk'
import { MONTHS, type Category } from '../src/data/ledger'
import { categoryTotals, filterEntries, monthlyTotals, type LedgerFilter } from '../src/lib/ledgerQuery'
import type { AssistantPayload, ChartSpec, CitationDef } from '../src/lib/types'

// Sonnet 5 on the funded path: strong reasoning with adaptive ("extended")
// thinking on, at roughly a fifth of Opus's cost — a good fit for a public,
// budget-capped demo. Adaptive thinking is how the model reasons through a
// question before answering; the token + workspace caps keep spend bounded.
const MODEL = 'claude-sonnet-5'

export const AGENT_MODEL = MODEL

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
- If the ledger cannot answer the question — it tracks cash movements by category
  only, so it has no VAT/tax breakdown, no budgets or forecasts, and nothing
  outside the coverage window — say so plainly and explain what data would be
  needed. Never estimate or fabricate a figure the ledger does not support; a
  confidently-wrong number is worse than an honest "I can't tell from this."
- Moving money or any high-impact action must be proposed for explicit human
  approval, never presented as done. Flag it clearly as needing sign-off.
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

export interface AgentCallbacks {
  /** Called with each streamed text delta (not the accumulated string). */
  onText: (delta: string) => void
  onChart: (chart: ChartSpec) => void
  onCitation: (citation: CitationDef) => void
}

export interface AgentTurn {
  role: 'user' | 'assistant'
  text: string
}

export interface AgentResult {
  payload: AssistantPayload
  /** Token usage summed across the loop, for budget accounting. */
  usage: { inputTokens: number; outputTokens: number }
}

/**
 * Run one question through the agent. Streams text/chart/citation via callbacks
 * and returns the final payload plus token usage.
 */
export async function ask(
  client: Anthropic,
  history: AgentTurn[],
  question: string,
  cb: AgentCallbacks,
): Promise<AgentResult> {
  const messages: Anthropic.MessageParam[] = [
    ...history.map((t): Anthropic.MessageParam => ({ role: t.role, content: t.text })),
    { role: 'user', content: question },
  ]

  let accumulated = ''
  const citations: CitationDef[] = []
  let chart: ChartSpec | undefined
  let inputTokens = 0
  let outputTokens = 0

  for (let iterations = 0; iterations < 8; iterations++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 8192,
      // Adaptive thinking = the model decides how much to reason per question.
      // The manual loop below already echoes assistant content (thinking blocks
      // included) back on tool-use turns, which is required when thinking is on.
      thinking: { type: 'adaptive' },
      system: SYSTEM,
      tools,
      messages,
    })

    stream.on('text', (delta) => {
      accumulated += delta
      cb.onText(delta)
    })

    const message = await stream.finalMessage()
    inputTokens += message.usage.input_tokens
    outputTokens += message.usage.output_tokens

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

  return {
    payload: { answer: accumulated, citations, chart },
    usage: { inputTokens, outputTokens },
  }
}

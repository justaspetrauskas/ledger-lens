// MCP tool surface over the same ledgerQuery engine the web app's live agent uses.
// No new query logic — every tool is a thin wrapper returning { result, entry_ids, source }
// so a client can cite the exact rows behind a number, same shape as the in-app add_citation.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'
import { z } from 'zod'
import { CATEGORIES, MONTHS } from '../src/data/ledger'
import {
  ASSUMED_OPENING_BALANCE,
  cashPosition,
  categoryTotals,
  filterEntries,
  findDuplicateCandidates,
  fmtDKK,
  monthlyTotals,
  type LedgerFilter,
} from '../src/lib/ledgerQuery'

const ROW_CAP = 50
const ENTRY_ID_CAP = 200

// Wraps a tool result with the citation ids that back it, capped rather than silently cut.
function respond(result: unknown, backingEntries: { id: string }[], source = 'ledger') {
  const ids = backingEntries.map((e) => e.id)
  const truncated = ids.length > ENTRY_ID_CAP
  const envelope = {
    result,
    entry_ids: truncated ? ids.slice(0, ENTRY_ID_CAP) : ids,
    ...(truncated ? { truncated: true as const } : {}),
    source,
  }
  return { content: [{ type: 'text' as const, text: JSON.stringify(envelope) }] }
}

const filterShape = {
  category: z.enum(CATEGORIES).optional(),
  counterparty: z.string().optional(),
  from_month: z.string().optional().describe('yyyy-mm inclusive'),
  to_month: z.string().optional().describe('yyyy-mm inclusive'),
  min_abs_amount: z.number().optional(),
}

function toFilter(input: { category?: (typeof CATEGORIES)[number]; counterparty?: string; from_month?: string; to_month?: string; min_abs_amount?: number }): LedgerFilter {
  return {
    category: input.category,
    counterparty: input.counterparty,
    fromMonth: input.from_month,
    toMonth: input.to_month,
    minAbsAmount: input.min_abs_amount,
  }
}

function buildServer() {
  const server = new McpServer({ name: 'ledger-lens', version: '0.1.0' })

  server.registerTool(
    'query_ledger',
    {
      description:
        'Query the bookkeeping ledger. Filter by category, counterparty, month range and minimum absolute amount. Returns matching rows, capped at 50 (see count for the true total), plus every backing entry id for citation.',
      inputSchema: filterShape,
    },
    async (input) => {
      const matches = filterEntries(toFilter(input))
      return respond({ count: matches.length, rows: matches.slice(0, ROW_CAP) }, matches)
    },
  )

  server.registerTool(
    'monthly_totals',
    {
      description: 'Sum of matching entries per month, as a time series. Same filters as query_ledger.',
      inputSchema: filterShape,
    },
    async (input) => {
      const filter = toFilter(input)
      return respond(monthlyTotals(filter), filterEntries(filter))
    },
  )

  server.registerTool(
    'category_totals',
    {
      description: 'Total spend per expense category over a period, sorted highest first.',
      inputSchema: {
        from_month: z.string().optional().describe('yyyy-mm inclusive, defaults to the first month in the ledger'),
        to_month: z.string().optional().describe('yyyy-mm inclusive, defaults to the last month in the ledger'),
      },
    },
    async ({ from_month, to_month }) => {
      const fromMonth = from_month ?? MONTHS[0]
      const toMonth = to_month ?? MONTHS[MONTHS.length - 1]
      const spend = filterEntries({ fromMonth, toMonth }).filter((e) => e.amount < 0)
      return respond(categoryTotals(fromMonth, toMonth), spend)
    },
  )

  server.registerTool(
    'find_duplicates',
    {
      description:
        'Suspected duplicate payments: same counterparty, description and amount within the same month. Not agent-reachable in the web app today.',
    },
    async () => {
      const matches = findDuplicateCandidates()
      return respond({ count: matches.length, rows: matches.slice(0, ROW_CAP) }, matches)
    },
  )

  server.registerTool(
    'cash_position',
    {
      description:
        'Current cash position: an assumed opening balance plus the net of every recorded movement. Not a bank-reported balance — see source for the assumption.',
    },
    async () =>
      respond(
        cashPosition(),
        [],
        `Assumed opening balance ${fmtDKK(ASSUMED_OPENING_BALANCE)} (ASSUMED_OPENING_BALANCE) plus the net of every recorded ledger movement.`,
      ),
  )

  return server
}

// Stateless Streamable HTTP: a fresh server + transport per request, per the SDK's own
// stateless example (`sessionIdGenerator: undefined`, closed once the response is sent).
export async function handleMcpRequest(request: Request): Promise<Response> {
  const server = buildServer()
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  })
  await server.connect(transport)
  const response = await transport.handleRequest(request)
  await transport.close()
  await server.close()
  return response
}

// Phase 0 spike: proves the transport + bearer auth work end to end.
// Real tools (query_ledger, monthly_totals, ...) land in Phase 1 — this stays a stub.

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js'

function buildServer() {
  const server = new McpServer({ name: 'ledger-lens', version: '0.0.0' })

  server.registerTool(
    'ping',
    { description: 'Spike tool — proves a client can list and call a tool over this transport.' },
    async () => ({ content: [{ type: 'text', text: 'pong' }] }),
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

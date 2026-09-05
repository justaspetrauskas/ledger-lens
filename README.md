# Ledger Lens

Ask a bookkeeping assistant a question and get an answer you can actually check —
every claim links straight to the ledger rows behind it.

It's a small demo of what *trustworthy* AI looks like in a financial UI: answers
stream in, numbers come with clickable citations, charts are generated on the
fly, and anything with a side effect (like emailing a supplier about a double
payment) pauses for you to approve it first.

## Running it

**Scripted mode** needs no API key — a set of prepared questions answered from
the real data. Enough to click around in:

```bash
npm install
npm run dev            # http://localhost:5173
```

**Live mode** lets you ask anything. The browser sends your question to a small
proxy that holds the API key server-side and runs the tool-use loop — the key
never reaches the client. Live mode is gated by a demo code, spend-capped, and
quietly falls back to scripted answers if the budget runs out.

```bash
npm run dev:server     # proxy
npm run dev            # client — Vite forwards /api to the proxy
```

Set `ANTHROPIC_API_KEY` and `DEMO_ACCESS_CODES` in a `.env` file to enable it.

## Connect to it via MCP

The same ledger is also exposed as an MCP server at `/mcp` — five read-only
query tools (`query_ledger`, `monthly_totals`, `category_totals`,
`find_duplicates`, `cash_position`) plus `propose_action`, which only ever logs
a pending proposal for a human to review in the app; it can't do anything on
its own. Every tool result carries the exact ledger row ids behind it, same as
the in-app citations.

Auth reuses the same demo code as live mode — no OAuth:

```bash
claude mcp add --transport http ledger-lens <url>/mcp \
  --header "Authorization: Bearer <demo code>"
```

Confirmed working end to end with Claude Code CLI. claude.ai and Claude
Desktop should work the same way via a custom connector with a static header,
but that's untested so far — propose something from wherever you try it and
check the decision log in the app to see if it landed.

## The data

Two and a half years of fictional books (~1,400 rows) for *Nordhavn Roastery
ApS*, a made-up Copenhagen coffee roastery. It's generated deterministically
(`scripts/generate-ledger.mjs`) so everyone sees the same numbers — planted
stories included, like an invoice that got paid twice.

All company names, amounts and transactions are fictional.

## Built with

React 19 · TypeScript · TanStack Table & Query · ApexCharts · Hono · the
Anthropic API (tool use) · the MCP TypeScript SDK · Vite. Ships as a single
container that serves the app, the `/api` proxy, and `/mcp` from one origin.

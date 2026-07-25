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

## The data

Two and a half years of fictional books (~1,400 rows) for *Nordhavn Roastery
ApS*, a made-up Copenhagen coffee roastery. It's generated deterministically
(`scripts/generate-ledger.mjs`) so everyone sees the same numbers — planted
stories included, like an invoice that got paid twice.

All company names, amounts and transactions are fictional.

## Built with

React 19 · TypeScript · TanStack Table & Query · ApexCharts · Hono · the
Anthropic API (tool use) · Vite. Ships as a single container that serves the app
and the `/api` proxy from one origin.

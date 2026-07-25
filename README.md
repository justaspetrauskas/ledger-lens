# Ledger Lens

**Ask your bookkeeping anything — and be able to verify every answer.**

A small exploration of the UX patterns that make AI assistants *trustworthy* in
financial contexts: streamed responses, source citations that open the actual
ledger rows, generated charts, and human-in-the-loop review for anything with
side effects.


## The data

Two and a half years (~1,400 rows) of fictional bookkeeping for *Nordhavn
Roastery ApS*, a Copenhagen coffee roastery. The data lives in a real CSV
export (`src/data/ledger.csv`) that the app parses at load; the CSV is produced
by a seeded, deterministic generator (`scripts/generate-ledger.mjs`) so every
visitor sees the same books. Regenerate with `node scripts/generate-ledger.mjs`.

Every line carries a unique invoice/order reference, so a *true* duplicate is
the same reference appearing twice. Planted story hooks: a spring marketing
campaign spike, and a duplicate invoice payment (invoice 8841, paid twice in
May 2026). The duplicate detector keys on same payee + amount + **same month** —
without that constraint, recurring rent and salaries become false positives.

## Run it

Scripted mode needs nothing but the front-end:

```bash
npm install
npm run dev            # http://localhost:5173
```

Live mode talks to a small proxy that holds the API key. Run both — Vite
forwards `/api` to the proxy, so the browser only ever sees one origin:

```bash
npm run dev            # client (Vite, :5173)
ANTHROPIC_API_KEY=sk-... DEMO_ACCESS_CODES=letmein npm run dev:server   # proxy (:8080)
```

## Live mode & the proxy

Live mode does **not** call Anthropic from the browser. The browser POSTs the
question to `/api/ask`; the proxy (`server/`) holds the funded key, runs the
tool-use loop, and streams the answer back. So:

- **The key is server-side only** — never in the bundle, never in the client.
- **Access is gated by a demo code** (`DEMO_ACCESS_CODES`), not a key you paste.
- **Spend is capped three ways**: the funded path is pinned to **Claude Sonnet**
  (extended reasoning on); an in-memory budget limits tokens/requests per day
  (`DAILY_TOKEN_CAP`, `PER_CODE_DAILY_REQUESTS`); and the Anthropic **workspace
  spend cap** (set in the console) is the hard backstop.
- **It degrades gracefully** — a wrong code, a spent budget, or an unreachable
  proxy falls back to the scripted answer, so the demo never dead-ends.
- **Enforcement lives in the tool layer, not the prompt.** The model can only
  touch the books through the `query_ledger` tool, which runs the same query
  engine (`src/lib/ledgerQuery.ts`) the scripted answers use — so live and
  scripted answers can't contradict the data, or each other.

Deploy is a single container (`Dockerfile`) that serves the static client and
`/api` same-origin. Set `ANTHROPIC_API_KEY` and `DEMO_ACCESS_CODES` in the host
(e.g. Railway) environment.

*All company names, amounts and transactions are fictional.*

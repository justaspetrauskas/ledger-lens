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

```bash
npm install
npm run dev
```

*All company names, amounts and transactions are fictional.*

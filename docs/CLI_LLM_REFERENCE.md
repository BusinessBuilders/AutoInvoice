# autoinvoice CLI — agent reference (terse, for small models)

One-shot CLI over the AutoInvoice Business OS. Same code path as the MCP tools
(packages/mcp registry) — CLI output rows == MCP tool rows, always.

```
autoinvoice <command> [--flag value ...] [--json]
autoinvoice <command> '<json-input>' [--json]     # flags override JSON keys
autoinvoice tools                                  # full command list + flags
```

RULES
- Always pass `--json` for machine output (compact, stable keys).
- ALL amounts are integer CENTS. Negative = money out.
- Dates are `YYYY-MM-DD`. Company slugs: `donovan-farms`, `business-builders`, `super-nova-robotics`.
- Success → JSON on stdout, exit 0. Any error → `{"error":{"code","message"}}` on stderr, exit 1.
- Commands marked WRITE change data — only call when explicitly asked.

## Read commands

| Command | What it answers | Exact example |
|---|---|---|
| `companies` | which companies exist | `autoinvoice companies --json` |
| `pulse` | YTD cash pulse, all companies | `autoinvoice pulse --json` |
| `cashflow` | daily cash for one company | `autoinvoice cashflow --company-id donovan-farms --start-date 2026-01-01 --end-date 2026-06-30 --json` |
| `burn` | Super Nova spend by category | `autoinvoice burn --start-date 2026-01-01 --json` |
| `dso` | days sales outstanding | `autoinvoice dso --months 6 --json` |
| `project-cash` | projected cash N days out | `autoinvoice project-cash --horizon-days 90 --allow-partial true --json` |
| `customer` | Customer 360 by name/email/phone/id | `autoinvoice customer --name Browns --json` |
| `aging-quotes` | quotes waiting on a decision | `autoinvoice aging-quotes --min-age-days 7 --json` |
| `attribution` | CAC/ROAS per ad channel | `autoinvoice attribution --months 6 --json` |
| `mrr` | monthly recurring revenue | `autoinvoice mrr --json` |
| `pipeline` | open leads/quotes by stage | `autoinvoice pipeline --company-id business-builders --json` |
| `jobs-today` | crew packet for a day | `autoinvoice jobs-today --date 2026-06-12 --json` |
| `revenue` | revenue by engine (spine) | `autoinvoice revenue --days 30 --json` |
| `transactions` | search bank transactions | `autoinvoice transactions --text AMZN --json` |

`transactions` is the spend question answerer. It returns up to `--limit` rows
(default 50, max 500) PLUS `match_count` and `total_cents` computed over ALL
matches — so "how much did I spend on Amazon in May?" is one call:

```
autoinvoice transactions --text amazon --start-date 2026-05-01 --end-date 2026-05-31 --json
```

More filters: `--company-id`, `--category office`, `--min-amount-cents -50000`,
`--max-amount-cents 0`.

## Write commands (WRITE — only when explicitly asked)

| Command | Effect | Exact example |
|---|---|---|
| `lead` | create a sales lead (Eve intake) | `autoinvoice lead --name "Jane Doe" --phone 5551234567 --company-id business-builders --utm-source facebook --json` |
| `activity` | log call/email/note on a timeline | `autoinvoice activity --type call --body "Asked for hydroseed quote" --customer-id <cuid> --json` |
| `reconcile` | mark company reconciled through date | `autoinvoice reconcile --company-id donovan-farms --through-date 2026-06-01 --source manual --written-by qwen --json` |
| `order` | ingest a store order (needs backend up) | `autoinvoice order '{"source_key":"...","event":"paid","order":{...}}' --json` |

## Notes

- Binary: symlinked at `~/.local/bin/autoinvoice` → `packages/mcp/dist/cli.js`
  (rebuild with `npm run build` in `packages/mcp` after changes).
- DB credentials auto-load from `apps/backend/.env` when `DATABASE_URL` /
  `AUTOINVOICE_DATABASE_URL` are not set in the environment.
- MRR / commerce / attribution return empty until those engines have live
  data — expected, not broken.
- Full per-flag detail: `autoinvoice tools` (human) or `autoinvoice tools --json`.

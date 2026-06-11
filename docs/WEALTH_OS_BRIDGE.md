# Wealth OS Bridge — Business OS Expansion (2026-06-10)

Handoff for the Vision Wealth OS session. AutoInvoice evolved into the Business OS of the
holding (branch `feat/business-os`, see `SUMMARY.md` + `docs/BUSINESS_OS_SPEC.md`). Everything
below is ADDITIVE — the existing contract (`v_company_cash_daily`, `v_ytd_pulse`,
`v_super_nova_burn`, `f_project_cash(int,text)`, the 7 original MCP tools, the `vision_reader`
role) is byte-identical and regression-checked (`docs/wealth-os-contract/contract-baseline.txt`).

## Core concept you can now rely on

Every dollar in — field-service job, subscription renewal, product order — normalizes into one
**RevenueEvent** row (company, customer, engine, amount, occurredAt, first-touch attribution).
Engines: `FIELD_SERVICE` (Donovan Farms), `SUBSCRIPTION` (Business Builders), `COMMERCE`
(online stores), `SERVICES` (legacy invoices), `OTHER` (future partnerships/licensing).
Company ids are slugs: `donovan-farms`, `business-builders`, `super-nova-robotics`.

## New views (SELECT granted to vision_reader; amounts in CENTS like the existing views)

| View | Grain | Columns |
|---|---|---|
| `v_revenue_events_daily` | company × date × engine | gross_cents, refund_cents, net_cents, event_count |
| `v_company_pnl_rollup` | company × month (YYYY-MM) | revenue_cents (spine), expenses_cents (categorized bank txns), net_cents |
| `v_crm_mrr` | company | mrr_cents, active_subs, past_due_subs, churn_risk_subs |
| `v_crm_pipeline_value` | company × record_type(lead\|quote) × stage | count, value_cents |
| `v_crm_win_rate` | company × month | quotes_sent, quotes_won, win_rate_pct, avg_days_to_decision |
| `v_commerce_sales_daily` | company × date × channel | orders, units, revenue_cents, cogs_cents, margin_cents, refund_cents |
| `v_attribution_cac_ltv` | company × month × channel | spend_cents, new_customers, cac_cents, attributed_revenue_cents, roas |

Notes: `v_company_pnl_rollup` revenue comes from RevenueEvents (operational), not the GL —
expenses come from the same tax-typed BankTransaction rules as `v_company_cash_daily`, so cash
and P&L reconcile. Consolidated holding view = SUM across company_id.

## New MCP tools (same server, `packages/mcp`, stdio + HTTP transports — 17 tools total)

Reads: `get_revenue_summary` (by engine, windowed), `get_mrr`, `get_pipeline`,
`get_attribution_report` (CAC/ROAS monthly), `list_aging_quotes`, `list_jobs_today` (crew
packet), `get_customer_360` (lookup by id/email/phone/name; profile + LTV + every engine's
history).
Writes: `create_lead` (Eve intake; accepts utm_* for first-touch attribution), `log_activity`
(calls/emails/notes onto the customer timeline), `ingest_order` (normalized order payload;
requires the AutoInvoice backend running — set `AUTOINVOICE_API_URL`).

## Consumption rules (unchanged)

Views + MCP only — no direct table coupling. vision_reader technically has SELECT on all
tables; resist the temptation. If a number you need is missing, ask the AutoInvoice side for a
new view rather than querying tables.

## Current data reality (so dashboards don't look broken)

Live since 2026-06-10: one historical FIELD-SERVICE/SERVICES revenue event ($749, donovan-farms,
2025-12-30) from backfill; P&L rollup has real expense months for donovan-farms; MRR/commerce/
attribution views are empty until subscriptions/orders/ad-spend start flowing. One deactivated
`smoke-test` ingest source and one "MCP Smoke Lead" exist — ignore. The AutoInvoice production
backend process may still be on the pre-Business-OS build; MCP reads and all views work
regardless (they hit Postgres directly).

# AutoInvoice Business OS — Implementation Summary

**Branch:** `feat/business-os` · **Completed:** 2026-06-10 · **Spec:** `docs/BUSINESS_OS_SPEC.md`
**Tests:** 123 passing on testcontainers (`npm test` in `apps/backend`) · **Live DB:** all 8 migrations applied with verified pg_dump backups in `~/db-backups/`

AutoInvoice is now the Business OS of the holding: one customer graph, one ledger, one AI surface across Donovan Farms (field service), Business Builders (subscriptions), and online product sales (commerce) — with Vision Wealth OS reading views + MCP only.

## The core rule, implemented

Every dollar in normalizes into one **RevenueEvent** (`companyId`, `customerId`, `engine`, `eventType`, `amount`, `occurredAt`, attribution snapshot). Single writer: `services/revenue-events.ts`. Idempotency is a DB unique constraint `(sourceType, sourceId, eventType)` — webhook replays and double-fired transitions cannot double-count.

| Dollar source | Path | Engine |
|---|---|---|
| Invoice paid (tRPC, check auto/manual match) | `emitInvoicePaymentEvent` | SERVICES / FIELD_SERVICE / per source |
| Job closed → auto-invoice → paid | job closeout creates invoice (`source: "job"`) | FIELD_SERVICE |
| Order paid (webhook/MCP) | `ingestOrder` creates PAID invoice + event | COMMERCE |
| Order refunded | negative REFUND event keyed by refund id | COMMERCE |
| Subscription renewal | `recordRenewal` — invoice + event idempotent per period | SUBSCRIPTION |
| Plow billing paid (Stripe link) | `emitPlowBillingPaymentEvent` | FIELD_SERVICE |

## Schema added (all additive; legacy rows backfilled to donovan-farms)

- **Phase 1:** `RevenueEvent`, `Activity`; `companyId` on Invoice/Lead/Quote; `primaryCompanyId` + `acquisitionSource/Campaign/firstTouchAt` on Customer
- **Phase 2:** `Job`/`JobAssignment`/`JobPhoto` (+`JobStatus`); `Service.unitCost`; `QuoteLineItem.serviceId/unitCost`
- **Phase 3:** `Product`, `Order`/`OrderItem` (unique `companyId+source+externalId`), `IngestSource` (per-store HMAC secrets)
- **Phase 4:** `Subscription` (interval, `currentPeriodEnd`, `dunningStage`, `churnRisk`)
- **Phase 5:** UTM block on `Lead`; `AdSpend` (unique per company+date+channel+campaign)
- **Phase 6:** `AutomationLog` (fire-once ledger)

Migrations `20260610000001…08` in `apps/backend/prisma/migrations/` — generated via `prisma migrate diff` (create-only), reviewed, applied via `psql --single-transaction`, recorded with `migrate resolve`. The pre-existing dirty migration ledger was never "repaired" destructively.

## API surface (tRPC routers)

`activity` (log/list) · `revenueEvents` (list/summary by engine) · `customer.timeline` (merged Customer 360) · `job` (lifecycle + dayView crew packet + photos + crew) · `quote.margin/winRate/aging` · `product` (catalog + low-stock + margin per SKU per channel) · `order` (list/fulfill/review/stats + ingest-source management) · `subscription` (CRUD/MRR/renewal/dunning) · `lead.convertToSubscription`, `lead.create` w/ UTM · `adSpend` (record/report CAC-ROAS/ltv)

**Order ingestion contract (v1):** `POST /webhook/orders/:sourceKey`, raw body, `X-AutoInvoice-Signature: sha256=<HMAC-SHA256>`, `X-AutoInvoice-Timestamp` (±5 min). Events: `order.created|paid|fulfilled|refunded|cancelled`. Replays → `200 {status:"duplicate"}`. Store adapters (Stripe/Shopify/custom) translate into this shape; the MCP `ingest_order` tool signs and posts the same payload.

## Automations (hourly BullMQ sweep, `services/automations.ts`)

aging_quote_nudge (7d) · post_job_review (2d after close) · renewal_reminder (7d before) · dunning stages 1–3 (3/7/14d past due) · churn_risk flag · restock alert. Fire-once via `AutomationLog` unique key (stage/period embedded); every firing creates a Task + timeline Activity — nothing happens silently.

## MCP tools (packages/mcp — 17 total)

New: `create_lead`, `log_activity`, `get_customer_360`, `ingest_order`, `list_aging_quotes`, `get_attribution_report`, `get_mrr`, `get_pipeline`, `list_jobs_today`, `get_revenue_summary`. Existing 7 (`list_companies`, `get_pulse`, `get_company_cashflow`, `get_super_nova_burn`, `get_dso`, `project_cash`, `mark_reconciliation`) untouched. Reads go to the `v_*` views/tables; `ingest_order` posts to the backend webhook (needs `AUTOINVOICE_API_URL`, default `http://127.0.0.1:4000` — note: the running production backend must be restarted onto this branch's build before `ingest_order`/`/webhook/orders` work live).

## What Wealth OS consumes (views + MCP only, all granted to `vision_reader`)

| New view | Grain | Gives |
|---|---|---|
| `v_revenue_events_daily` | company × day × engine | gross/refund/net cents — the spine |
| `v_crm_pipeline_value` | company × stage | open lead/quote counts + value |
| `v_crm_win_rate` | company × month | quotes sent/won, win %, days-to-decision |
| `v_crm_mrr` | company | MRR cents, active/past-due/churn-risk subs |
| `v_commerce_sales_daily` | company × day × channel | orders, units, revenue/cogs/margin/refund |
| `v_attribution_cac_ltv` | company × month × channel | spend, new customers, CAC, attributed revenue, ROAS |
| `v_company_pnl_rollup` | company × month | spine revenue vs categorized bank expenses |

**Contract preserved:** `v_company_cash_daily`, `v_ytd_pulse`, `v_super_nova_burn`, `f_project_cash`, the `vision_reader` role and the 7 original MCP tools are byte-identical (regression-checked each phase against `docs/wealth-os-contract/contract-baseline.txt`). A gap was found and fixed: default privileges hadn't covered application-created tables, so `vision_reader` would have silently lost SELECT on new tables (migration `…000002`).

## Extension contract (the Attio lesson)

A new record type (e.g. Robotics Partnership) is a typed Prisma model that (1) carries `companyId` + optional `customerId`, (2) emits revenue via `recordRevenueEvent` with `engine: OTHER` and a new `sourceType`, (3) surfaces on the timeline via Activities. No EAV.

## Dashboard UI (2026-06-10, second pass)

Five surfaces in `apps/web`, linked from a "Business OS" section on the home dashboard, all phone-friendly:

| Page | What it does |
|---|---|
| `/jobs`, `/jobs/day`, `/jobs/[id]` | The crew packet: status/company filters, new-job modal with customer autocomplete; route-ordered day view with map + tel: links and customer notes; lifecycle buttons (schedule→start→complete→close), closeout checklist, before/during/after photo capture, crew assignment, auto-invoice banner |
| `/revenue` | Net revenue + MRR + open-pipeline cards, revenue-by-engine bars, quote-aging buckets, recent revenue events feed; company + window filters |
| `/subscriptions` | MRR rollup cards, dunning/churn badges, record-renewal / payment-failed / cancel-at-period-end actions, new-subscription modal |
| `/products`, `/orders` | Catalog with COGS/margin and low-stock highlighting, stock adjust; orders with needs-review queue, fulfill action, refund display, invoice links; ingest-source management (HMAC secret shown exactly once with copy button + webhook instructions) |
| `/attribution` | Ad-spend entry (upsert-corrected), monthly CAC/ROAS per channel (ROAS<1 highlighted red), ROAS per campaign, top customers by LTV |

Verified end-to-end in a real browser (Playwright) against the production build: login → create job → schedule → start → complete (checklist + notes + cost) → close → invoice visible. Both services restarted onto the new builds (`node dist/index.js` on :4000 with the automations sweep registered; `next start` on :3000); all routes return 200 through `accounting.business-builder.online`.

UI smoke artifacts (own isolated account, invisible to the real user): user `ui-smoke@autoinvoice.test`, company `ui-smoke-co`, one CLOSED job J-00001 with DRAFT invoice INV-000092 ($1.00 — consumed one number in the global invoice sequence).

## Time clock + crew hub (2026-06-11)

Implements the April time-clock spec (.planning/spec-time-clock-service-hub.md §3.3 — the
TimeEntry table already existed in prod from that session; this added only GPS columns) fused
with the Business OS crew model:

- **`timeClock` router**: clockIn (returns the day's MISSION — the employee's assigned jobs,
  route-ordered), clockOut (server-computed minutes), status (live timer + mission), myEntries,
  teamStatus (owner/admin only: who's on the clock, since when, week totals, last punch GPS).
  One open entry per user enforced in code AND by the existing DB partial unique index.
- **Crew self-signup** at `/crew/signup`: public, gated by `CREW_SIGNUP_CODE` in the backend
  .env (share it with the crew; rotate by editing .env). Creates EMPLOYEE accounts that
  redirect to `/crew` on login — they never see the owner dashboard/accounting.
- **`/crew` hub** (phone-first): big Clock In/Out button with live worked-time, today's mission
  cards (map/tel links, customer notes), ▶ Start and one-tap **✅ Done with job** buttons.
- **GPS decision**: location stamps at punch events (clock-in/out coordinates on TimeEntry,
  job-completion coordinates in the timeline activity metadata) — deliberately NOT continuous
  tracking (battery, privacy, complexity). A 6s hard timeout means ignored permission prompts
  never block punching.
- Browser-verified end-to-end: signup → login → /crew → clock in → mission shown → start →
  done → clock out (4 new tests; 129 backend tests green).
- Crew smoke artifacts: user `smoke-crew@autoinvoice.test`, one COMPLETED job + closed time
  entry under the ui-smoke account.

## Operational notes

- Test harness: testcontainers (`pgvector/pgvector:pg16`), schema via `db push`, views applied from the migration file; `setup.ts` refuses to run against ambient `DATABASE_URL` (the old harness could wipe the real DB).
- Backfill: `scripts/backfill-business-os.ts` (`--dry-run`, `--default-company`) — ran in prod: 83 invoices/33 customers/2 leads scoped to donovan-farms, 1 historical payment event emitted.
- Smoke artifacts left in prod (harmless, clearly labeled): ingest source `smoke-test`, one PENDING order `SMOKE-TEST-001` (needsReview), one NEW lead "MCP Smoke Lead (safe to delete)".
- To take live: restart the backend on this branch's build (`npm run build`, `node dist/index.js`) — the hourly automations sweep self-registers; set `AUTOINVOICE_API_URL` for the MCP `ingest_order` tool.

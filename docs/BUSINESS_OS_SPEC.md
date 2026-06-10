# AutoInvoice Business OS — Design Specification

**Branch:** `feat/business-os`
**Status:** Approved baseline for implementation (phases 1–6)
**Date:** 2026-06-10
**DB backup taken before any work:** `/home/magiccat/db-backups/autoinvoice-invoice_platform-20260610-071757.dump` (74 MB, 385 TOC entries, pg_dump custom format, verified with `pg_restore -l`)
**Test baseline:** 7 suites / 9 tests, all failing on a missing `test:test@localhost` database — pre-existing environmental failure. The harness is rebuilt on testcontainers in Phase 1.

---

## 1. Mission & Core Rule

AutoInvoice evolves from an invoicing/accounting app into the **Business OS of a multi-company holding**:

| Company | Engine | Modules used |
|---|---|---|
| Donovan Farms | Field service (landscaping/hydroseeding) | Quotes/pricebook, Jobs, Invoices |
| Business Builders | Recurring revenue (websites/hosting/automation, Eve intake) | Leads, Proposals, Subscriptions |
| Online sales sites | Commerce (paid-ads-driven product sales) | Products, Orders, Attribution |
| Super Nova Robotics | R&D / partnerships (later) | Extension record types only |

**Core rule (the Odoo pattern):** every dollar in — a job invoice payment, a subscription renewal, a product order — normalizes into one **RevenueEvent** linked to a **Customer** and a **Company**. One customer graph, one ledger, shared by all modules. Dashboards and Vision Wealth OS never care which engine produced the dollar.

**Out of scope (hard no):** HR, manufacturing, full WMS, portfolio/capital management (stays in Wealth OS).

---

## 2. Current-State Facts That Shape the Design

1. **Scoping split.** CRM/invoicing models (`Customer`, `Invoice`, `Lead`, `Quote`, `Service`) are `userId`-scoped. The accounting layer (`Company`, `BankAccount`, `BankTransaction`, `TaxAccount`, `Vendor`, `CategorizationRule`, `ReconciliationLog`) is `companyId`-scoped. `Company` belongs to a `User` (the holding owner). The single `User` therefore acts as the holding; `Company` is the entity level.
2. **Wealth OS contract** lives in raw SQL migrations: `v_company_cash_daily`, `v_ytd_pulse`, `v_super_nova_burn` (migration `20260607000001`), `f_project_cash` (`20260531000004`), `vision_reader` role (`20260531000002`). All read `BankTransaction` + `TaxAccount`. `vision_reader` has `SELECT` on all current and future public tables. **We never ALTER/DROP these objects; all new views are new names, additive.**
3. **MCP package** exists at `packages/mcp/` (`@autoinvoice/mcp`): `toolSpec + handler` registration in `src/server.ts`, pg Pool in `src/db.ts`, stdio + HTTP(SSE, bearer token) transports, 7 read-mostly tools today.
4. **Conversion flows already exist:** Lead → Quote (`convertedToQuoteId`) → Invoice (`convertedToInvoiceId`); Invoice → JournalEntry (recognition + payment). TallyInvoice handles running voice/SMS tallies.
5. **Money** is Prisma `Decimal` in tables; Wealth OS views expose **cents** (`* 100`). New views follow the cents convention.
6. **pgvector** is in use (`Customer.embedding`, `Service.embedding` `vector(1536)`) — the test container image must ship pgvector.

---

## 3. Data Model

### 3.1 Company scoping strategy

- **The customer graph stays global to the holding** (`userId`-scoped). A Customer is ONE node regardless of how many companies they buy from — this is what makes Customer 360 possible.
- **Every transactional/revenue-bearing record carries `companyId`**: Lead, Quote, Job, Invoice, Order, Subscription, Activity, RevenueEvent, Product, AdSpend.
- `Customer.primaryCompanyId` (nullable) records the "home" company for defaults; actual company membership is **derived** from transactional records (a farms client who buys products simply has Orders in one company and Jobs in another).
- Existing rows: `companyId` columns are added **nullable**, then backfilled by script (userId → that user's default/active Company — Donovan Farms Inc in current data). Columns stay nullable at the schema level for one phase; routers always write it for new rows.
- No EAV. New record types (e.g. "Robotics Partnership") arrive as typed tables that link `customerId` + `companyId` and emit RevenueEvents — the extension contract is: *link the graph, emit the event, get the dashboards for free* (see §3.9).

### 3.2 RevenueEvent (the spine) — Phase 1

```prisma
enum RevenueEngine {
  FIELD_SERVICE   // Donovan Farms jobs
  SUBSCRIPTION    // Business Builders recurring
  COMMERCE        // online product sales
  SERVICES        // generic invoiced work (default for legacy invoices)
  OTHER           // partnerships, licensing, manual
}

enum RevenueEventType {
  INVOICE_PAYMENT       // invoice marked PAID
  ORDER_PAYMENT         // commerce order paid
  SUBSCRIPTION_RENEWAL  // renewal collected
  REFUND                // negative amount
  ADJUSTMENT            // manual correction (audit-logged)
}

model RevenueEvent {
  id          String           @id @default(cuid())
  companyId   String
  customerId  String?
  engine      RevenueEngine
  eventType   RevenueEventType
  sourceType  String           // "invoice" | "order" | "subscription" | "manual" | <future>
  sourceId    String           // id in the source table
  amount      Decimal          @db.Decimal(12, 2)  // negative for REFUND
  currency    String           @default("USD")
  occurredAt  DateTime         // when the dollar moved (payment date, not issue date)
  description String?
  // first-touch attribution snapshot (denormalized at emission time, Phase 5 fills it)
  attributionSource   String?
  attributionCampaign String?
  metadata    Json?
  createdAt   DateTime         @default(now())

  company  Company   @relation(...)
  customer Customer? @relation(...)

  @@unique([sourceType, sourceId, eventType])   // idempotency: one PAYMENT per invoice, etc.
  @@index([companyId, occurredAt])
  @@index([customerId])
  @@index([engine, occurredAt])
}
```

**Single writer:** `services/revenue-events.ts → recordRevenueEvent(input)` — idempotent upsert keyed on the unique constraint. **No other code writes this table.** Emission points:

| Trigger | engine | eventType |
|---|---|---|
| `invoice.updateStatus → PAID` (any path: tRPC, Stripe webhook, check match) | from invoice.engine (default SERVICES; FIELD_SERVICE when job-linked) | INVOICE_PAYMENT |
| Order ingested/updated with `paid` status | COMMERCE | ORDER_PAYMENT |
| Subscription renewal invoice paid | SUBSCRIPTION | SUBSCRIPTION_RENEWAL |
| Order refund ingested | COMMERCE | REFUND (negative) |

Backfill: one script emits INVOICE_PAYMENT events for historical PAID invoices (idempotent, additive).

**Relationship to the GL:** RevenueEvent is the *operational* revenue stream (per engine, per customer, real-time). The double-entry GL (`JournalEntry`) remains the *accounting* truth. Invoice payment already creates both; they reconcile by `sourceId`.

### 3.3 Customer 360 + Activity — Phase 1

```prisma
enum ActivityType { CALL EMAIL SMS MEETING SITE_VISIT NOTE SYSTEM }
enum ActivityDirection { INBOUND OUTBOUND }

model Activity {
  id          String   @id @default(cuid())
  userId      String                  // holding owner (who logged / on whose behalf)
  companyId   String?
  customerId  String?
  leadId      String?
  type        ActivityType
  direction   ActivityDirection?
  subject     String?
  body        String
  occurredAt  DateTime @default(now())
  source      String   @default("manual")  // "manual" | "api" | "eve" | "automation" | "system"
  metadata    Json?
  createdAt   DateTime @default(now())

  @@index([customerId, occurredAt])
  @@index([leadId, occurredAt])
  @@index([companyId, occurredAt])
}
```

Customer model additions: `primaryCompanyId String?`, `acquisitionSource String?`, `acquisitionCampaign String?`, `firstTouchAt DateTime?` (Phase 5 fills attribution).

**Customer 360 timeline** (`customer.timeline` tRPC query + later `get_customer_360` MCP tool): merged, time-ordered union of Invoices, Quotes, Leads, Activities, RevenueEvents — extended by Jobs (P2), Orders (P3), Subscriptions (P4). Existing `Conversation`/`Message`/`SmsMessage`/`LeadNote` stay as-is; the timeline reads them too. New communications go through Activity.

### 3.4 Field service: pricebook + Job — Phase 2

- `Service.unitCost Decimal?` (COGS per unit) — the pricebook gains cost; margin = price − cost.
- `QuoteLineItem` gains `serviceId String?` and `unitCost Decimal?` (snapshot at quote time) → quote-level cost/margin computed.
- `Quote.companyId`, `Lead.companyId` added (Phase 1 migration).

```prisma
enum JobStatus { REQUESTED SCHEDULED IN_PROGRESS COMPLETED CLOSED CANCELLED }

model Job {
  id             String    @id @default(cuid())
  userId         String
  companyId      String
  customerId     String
  locationId     String?
  quoteId        String?              // origin quote (pricing/margin source)
  jobNumber      String               // J-00001, unique per user
  title          String
  description    String?
  status         JobStatus @default(REQUESTED)
  scheduledStart DateTime?
  scheduledEnd   DateTime?
  routeOrder     Int?                 // ordering within the day's route
  estimatedCost  Decimal?  @db.Decimal(12,2)
  actualCost     Decimal?  @db.Decimal(12,2)
  // closeout (the crew packet)
  completedAt    DateTime?
  closeoutNotes  String?
  checklist      Json?                // [{item, done, doneAt, by}]
  customerNotes  String?              // notes for/about the customer
  invoiceId      String?   @unique    // auto-created on closeout
  createdAt/updatedAt

  assignments JobAssignment[]
  photos      JobPhoto[]

  @@unique([userId, jobNumber])
  @@index([companyId, status]); @@index([scheduledStart]); @@index([customerId])
}

model JobAssignment {  // crew
  id String @id @default(cuid())
  jobId String
  userId String        // crew member (User with EMPLOYEE role)
  role  String?        // "lead" | "crew"
  @@unique([jobId, userId])
}

model JobPhoto {
  id String @id @default(cuid())
  jobId String
  imageUrl String?
  imageData Bytes?
  caption String?
  takenAt DateTime @default(now())
  phase   String   @default("after")   // "before" | "during" | "after"
}
```

**State machine:** `REQUESTED → SCHEDULED → IN_PROGRESS → COMPLETED → CLOSED`; `CANCELLED` reachable from any non-CLOSED state. `COMPLETED → CLOSED` requires closeout (checklist complete or override) and **auto-creates the Invoice** from the quote/pricebook lines (reusing `invoice.create` logic), links `Job.invoiceId`, copies `companyId`. Invoice payment then emits the FIELD_SERVICE RevenueEvent — the job never touches RevenueEvent directly.

**Route/day view:** `job.dayView({date, companyId})` → jobs ordered by `routeOrder`, with location coordinates, crew, status. (Reuses the Location model; the plow-route page pattern already proves the map use case.)

**Quote KPIs:** `quote.winRate` (won = ACCEPTED+CONVERTED / sent, by month) and `quote.aging` (SENT/VIEWED quotes by age bucket) — these power the Phase 6 views and nudges.

### 3.5 Commerce: Product + Order — Phase 3

```prisma
model Product {
  id        String  @id @default(cuid())
  userId    String
  companyId String
  sku       String
  name      String
  description String?
  price     Decimal @db.Decimal(12,2)
  cogs      Decimal? @db.Decimal(12,2)
  stockQty  Int     @default(0)        // inventory-lite: a counter, not a WMS
  lowStockThreshold Int @default(0)    // 0 = no restock alerts
  active    Boolean @default(true)
  metadata  Json?
  @@unique([companyId, sku])
}

enum OrderStatus { PENDING PAID FULFILLED PARTIALLY_REFUNDED REFUNDED CANCELLED }

model Order {
  id          String   @id @default(cuid())
  userId      String
  companyId   String
  customerId  String?              // matched/created from payload email/phone
  source      String               // "stripe" | "shopify" | "custom" | <site key>
  externalId  String               // id in the source system
  status      OrderStatus
  currency    String  @default("USD")
  subtotal/taxAmount/shippingAmount/discountAmount/total  Decimal
  refundedAmount Decimal @default(0)
  placedAt    DateTime
  fulfilledAt DateTime?
  invoiceId   String? @unique      // auto-created sales record
  // attribution (Phase 5 adds the same block to Lead)
  utmSource/utmMedium/utmCampaign/utmTerm/utmContent String?
  landingPage String?
  referrer    String?
  needsReview Boolean @default(false)   // unknown SKU, unmatched customer, etc.
  rawPayload  Json                      // full original payload, audit trail
  items       OrderItem[]
  @@unique([companyId, source, externalId])   // ingestion idempotency
  @@index([companyId, placedAt]); @@index([customerId]); @@index([status])
}

model OrderItem {
  id        String  @id @default(cuid())
  orderId   String
  productId String?            // null when SKU unknown → order.needsReview = true
  sku       String
  name      String
  quantity  Int
  unitPrice Decimal @db.Decimal(12,2)
  unitCogs  Decimal? @db.Decimal(12,2)  // snapshot of Product.cogs at ingestion
}
```

**Order side effects (in one service, `services/commerce/ingest-order.ts`):**
1. Upsert by `(companyId, source, externalId)` — re-delivery is a no-op/update, never a duplicate.
2. Customer match: email (exact, case-insensitive) → phone → create new Customer (`source: "order"`).
3. SKU match → link Product, snapshot `unitCogs`, decrement `stockQty` on first transition to PAID/FULFILLED; unknown SKU → `needsReview`.
4. PAID → create Invoice (status PAID, source `"order"`) + emit `ORDER_PAYMENT` RevenueEvent.
5. Refund payload → update `refundedAmount`/status + emit negative `REFUND` RevenueEvent (idempotent per refund id in metadata).

Margin per SKU per channel = `SUM(qty*(unitPrice-unitCogs))` grouped by `sku, order.source` (powers `v_commerce_sales_daily` and a tRPC report).

### 3.6 Order-ingestion contract (webhook/API)

New raw Express routes (same mounting pattern as `/webhook/stripe` in `server.ts`):

- `POST /webhook/orders/:sourceKey` — order created/updated/refunded (one endpoint, `event` field discriminates).
- `GET /webhook/orders/health` — connectivity check for store setup.

```prisma
model IngestSource {           // per-store credentials
  id        String @id @default(cuid())
  userId    String
  companyId String
  key       String @unique     // ":sourceKey" in URL, e.g. "shopfront-1"
  name      String
  kind      String             // "stripe" | "shopify" | "custom"
  secret    String             // HMAC secret (random 32B, shown once)
  active    Boolean @default(true)
  lastSeenAt DateTime?
}
```

**Security:** `X-AutoInvoice-Signature: sha256=<hex HMAC-SHA256(rawBody, secret)>` + `X-AutoInvoice-Timestamp` (reject ±5 min skew). Raw-body capture before JSON parsing (same trick as the Stripe webhook). 401 on bad signature; 200 with `{status:"duplicate"}` on idempotent replay.

**Normalized payload (v1):**
```json
{
  "version": "1",
  "event": "order.paid",            // order.created | order.paid | order.fulfilled | order.refunded | order.cancelled
  "order": {
    "external_id": "ch_3abc...",
    "status": "paid",
    "currency": "USD",
    "placed_at": "2026-06-10T14:00:00Z",
    "customer": { "email": "a@b.com", "name": "Ada Lovelace", "phone": "+15551234567" },
    "items": [ { "sku": "HYDRO-MIX-5", "name": "Hydroseed Mix 5lb", "quantity": 2, "unit_price": "39.99" } ],
    "totals": { "subtotal": "79.98", "tax": "6.40", "shipping": "9.99", "discount": "0.00", "total": "96.37" },
    "refund": { "id": "re_1...", "amount": "96.37", "reason": "requested_by_customer" },   // only on order.refunded
    "attribution": { "utm_source": "facebook", "utm_medium": "cpc", "utm_campaign": "spring-lawn",
                      "utm_term": null, "utm_content": null, "landing_page": "/hydro", "referrer": "facebook.com" }
  }
}
```
Adapters (thin, per-store, **outside** this repo or in a later phase) translate Stripe/Shopify events into this shape — the contract is what's agnostic, not the endpoint code. The MCP `ingest_order` tool posts this same payload (Eve/agents are just another source).

### 3.7 Subscriptions + sales pipeline — Phase 4

```prisma
enum SubscriptionStatus { ACTIVE PAST_DUE PAUSED CANCELLED }
enum BillingInterval { MONTHLY QUARTERLY YEARLY }

model Subscription {
  id        String @id @default(cuid())
  userId    String
  companyId String
  customerId String
  name      String                  // "Acme — hosting + automation"
  status    SubscriptionStatus @default(ACTIVE)
  interval  BillingInterval    @default(MONTHLY)
  amount    Decimal @db.Decimal(12,2)   // per interval
  currency  String  @default("USD")
  startDate DateTime
  currentPeriodEnd DateTime            // = next renewal due date
  cancelAtPeriodEnd Boolean @default(false)
  cancelledAt DateTime?
  churnRisk  Boolean @default(false)   // automation-set flag
  churnReason String?
  dunningStage Int @default(0)         // 0 none; 1..3 escalating
  lastPaymentAt DateTime?
  externalRef String?                  // stripe sub id etc.
  leadId     String?                   // origin of the deal
  notes      String?
  @@index([companyId, status]); @@index([currentPeriodEnd]); @@index([customerId])
}
```

- **MRR** = Σ active subscriptions normalized monthly (`MONTHLY=amount`, `QUARTERLY=amount/3`, `YEARLY=amount/12`).
- **Renewal flow:** `subscription.recordRenewal` (manual or webhook/automation-driven) → creates a PAID Invoice (source `"subscription"`) + advances `currentPeriodEnd` + emits `SUBSCRIPTION_RENEWAL` RevenueEvent + resets `dunningStage`. Failed payment → `PAST_DUE` + `dunningStage=1` (Phase 6 automation escalates).
- **Pipeline:** the existing `LeadStatus` machine (`NEW → CONTACTED → QUALIFIED → QUOTED → NEGOTIATING → WON/LOST/DEAD`) already models Lead → Proposal (Quote with `projectType:"subscription"`) → Won. WON + subscription quote → `lead.convertToSubscription` creates Customer (existing path) + Subscription. **No new pipeline enum.** Eve creates leads via the existing `lead.create` surface exposed as the `create_lead` MCP tool with `source:"eve"`.

### 3.8 Attribution — Phase 5

- Lead gains the same UTM block as Order (`utmSource/Medium/Campaign/Term/Content`, `landingPage`, `referrer`). Lead already has a coarse `source` field — kept; UTM is finer-grained.
- **First-touch model:** when a Customer is created from a Lead or Order, snapshot `acquisitionSource/acquisitionCampaign/firstTouchAt` onto the Customer (never overwritten — first touch wins). RevenueEvents emitted for that customer copy the snapshot into `attributionSource/attributionCampaign`.

```prisma
model AdSpend {
  id        String @id @default(cuid())
  userId    String
  companyId String
  date      DateTime @db.Date
  channel   String          // "facebook" | "google" | ... (matches utmSource)
  campaign  String?         // matches utmCampaign
  spend     Decimal @db.Decimal(12,2)
  clicks    Int?
  impressions Int?
  notes     String?
  @@unique([companyId, date, channel, campaign])
}
```

- **CAC (channel, month)** = spend / count(new customers whose `acquisitionSource` = channel that month).
- **LTV (customer)** = Σ RevenueEvent.amount for the customer (all time).
- **ROAS (campaign, company)** = Σ RevenueEvent.amount where `attributionCampaign` = campaign ÷ Σ AdSpend for campaign.
First-touch only, by design; multi-touch is a later refinement, not in scope.

### 3.9 Extension contract (the Attio lesson)

A new record type (e.g. `RoboticsPartnership`) is a **typed Prisma model** that follows three rules: (1) carries `companyId` + optional `customerId`, (2) revenue is emitted via `recordRevenueEvent` with `engine: OTHER` and a new `sourceType` string, (3) timeline visibility via Activity rows or a registered timeline adapter. The `sourceType`/`metadata Json` fields on RevenueEvent and Activity are the deliberate, narrow flexibility valves — everything else stays typed. No generic Object/Attribute tables.

### 3.10 Automations — Phase 6

Repeatable BullMQ jobs (existing queue infra) + a dedupe log; rules are code with per-rule config, not a rules engine:

```prisma
model AutomationLog {
  id        String @id @default(cuid())
  rule      String            // "aging_quote_nudge" | "post_job_review" | "renewal_reminder" | "dunning" | "churn_risk" | "restock"
  entityType String
  entityId  String
  companyId String?
  firedAt   DateTime @default(now())
  result    Json?
  @@unique([rule, entityType, entityId])   // fire-once semantics (per stage where applicable: key embeds stage)
}
```

| Rule | Trigger | Action |
|---|---|---|
| aging_quote_nudge | Quote SENT/VIEWED > N days (default 7) | Task + Activity(`source:"automation"`) + optional Telegram ping |
| post_job_review | Job CLOSED + 2 days | review-request Task/Activity |
| renewal_reminder | `currentPeriodEnd` within 7 days | Task + Activity |
| dunning | PAST_DUE, stage-based (3/7/14 days) | escalate `dunningStage`, Task/Activity per stage |
| churn_risk | PAST_DUE > 14d or 2+ failed renewals | set `churnRisk`, alert |
| restock | `stockQty <= lowStockThreshold` (>0) | restock Task/alert |

All automation output is visible (Tasks + Activities) — nothing silently mutates business state except flag fields (`churnRisk`, `dunningStage`).

---

## 4. State Machines (consolidated)

```
Lead:    NEW → CONTACTED → QUALIFIED → QUOTED → NEGOTIATING → WON | LOST | DEAD   (existing, unchanged)
Quote:   DRAFT → SENT → VIEWED → ACCEPTED → CONVERTED | REJECTED | EXPIRED        (existing, unchanged)
Job:     REQUESTED → SCHEDULED → IN_PROGRESS → COMPLETED → CLOSED ; * → CANCELLED (new; CLOSED auto-invoices)
Invoice: DRAFT → SENT → VIEWED → PAID | OVERDUE | CANCELLED                       (existing; PAID emits RevenueEvent)
Order:   PENDING → PAID → FULFILLED → PARTIALLY_REFUNDED | REFUNDED ; * → CANCELLED (new; PAID emits, REFUND emits negative)
Subscription: ACTIVE ⇄ PAST_DUE → CANCELLED ; ACTIVE ⇄ PAUSED → CANCELLED          (new; renewal emits)
```

Transitions are enforced in routers/services (reject invalid jumps); status history is captured as Activities (`type: SYSTEM`).

---

## 5. MCP Tool Surface (Phase 6, pattern from `packages/mcp`)

Read tools query Postgres directly (existing pattern, views preferred). **Write tools call the backend HTTP API** with a service token (`AUTOINVOICE_API_URL` + `AUTOINVOICE_SERVICE_TOKEN`, a long-lived JWT for a service user) so business logic — revenue events, embeddings, customer matching, idempotency — has exactly one implementation.

| Tool | R/W | Backing |
|---|---|---|
| `create_lead` | W | `lead.create` (source defaults `"api"`, Eve passes `"eve"`) |
| `log_activity` | W | `activity.create` |
| `ingest_order` | W | `POST /webhook/orders/:sourceKey` (normalized payload §3.6) |
| `get_customer_360` | R | timeline SQL (customer + invoices/quotes/jobs/orders/subscriptions/activities/revenue events) |
| `list_aging_quotes` | R | quote aging query |
| `get_attribution_report` | R | `v_attribution_cac_ltv` |
| `get_mrr` | R | `v_crm_mrr` |
| `get_pipeline` | R | `v_crm_pipeline_value` |
| `list_jobs_today` | R | day-view query (crew packet for agents) |
| `get_revenue_summary` | R | `v_revenue_events_daily` |

Existing 7 tools (`list_companies`, `get_pulse`, …) untouched.

---

## 6. Holding-Company Views (Phase 6 — all NEW objects, `GRANT SELECT TO vision_reader`)

All amounts in **cents** (existing convention). Definitions sketched; exact SQL lands in the Phase 6 migration, `CREATE VIEW` only (no `OR REPLACE` on existing names, no changes to `v_company_cash_daily` / `v_ytd_pulse` / `v_super_nova_burn` / `f_project_cash` / `vision_reader` grants beyond additive `GRANT SELECT` on new views).

| View | Grain | Columns (essence) |
|---|---|---|
| `v_revenue_events_daily` | company × day × engine | gross_cents, refund_cents, net_cents, event_count |
| `v_crm_pipeline_value` | company × stage | open lead/quote counts, pipeline value_cents (quotes total + leads estimatedValue) |
| `v_crm_win_rate` | company × month | quotes_sent, quotes_won, win_rate_pct, avg_days_to_decision |
| `v_crm_mrr` | company | mrr_cents, active_subs, past_due_subs, churn_risk_subs |
| `v_commerce_sales_daily` | company × day × source(channel) | orders, units, revenue_cents, cogs_cents, margin_cents, refund_cents |
| `v_attribution_cac_ltv` | company × channel × month | spend_cents, new_customers, cac_cents, attributed_revenue_cents, roas |
| `v_company_pnl_rollup` | company × month | revenue_cents (RevenueEvent), expenses_cents (BankTransaction × TaxAccount EXPENSE%), net_cents |

Wealth OS consumes **views + MCP tools only** — no table coupling, same bridge style it uses today.

---

## 7. Reuse vs Extend vs New

| Existing | Decision |
|---|---|
| `Customer` | **Extend**: `primaryCompanyId`, acquisition fields. Stays THE graph node. |
| `Lead` | **Extend**: `companyId` (P1), UTM block (P5). Status machine unchanged. |
| `Quote`/`QuoteLineItem` | **Extend**: `companyId` (P1); `serviceId` + `unitCost` on lines (P2). |
| `Invoice` | **Extend**: `companyId` (P1). PAID transition emits RevenueEvent. Auto-created by Job closeout, Order ingest, Subscription renewal. |
| `Service` | **Extend**: `unitCost` (P2) → becomes the pricebook. |
| `Company` | **Reuse** as-is (already the entity model Wealth OS knows). |
| `Location` | **Reuse** for Job sites. |
| `Task`/`Reminder` | **Reuse** as automation output surface. |
| `Conversation`/`Message`/`SmsMessage`/`LeadNote` | **Reuse untouched**; timeline reads them; new comms go to Activity. |
| `TallyInvoice`, `PlowBilling`, accounting layer, all Wealth OS SQL | **Untouched.** |
| New tables | `RevenueEvent`, `Activity`, `Job`+`JobAssignment`+`JobPhoto`, `Product`, `Order`+`OrderItem`, `IngestSource`, `Subscription`, `AdSpend`, `AutomationLog`. |

UI scope: this effort is **API-first** (tRPC + MCP + views). Thin web pages may be added per phase where smoke-testing benefits, but UI completeness is not an acceptance gate.

---

## 8. Safety & Testing Rules (binding for every phase)

1. Migrations via `prisma migrate dev --create-only`, manually reviewed, **additive only** (ADD COLUMN nullable / CREATE TABLE / CREATE INDEX / CREATE VIEW with new names). Never DROP/TRUNCATE/DELETE FROM/`migrate reset`.
2. Fresh verified `pg_dump` before each `migrate deploy` to the real DB (setup backup recorded above; re-dump per phase).
3. Tests run on **testcontainers** (`pgvector/pgvector:pg16` image — pgvector required by schema), never the real DB. The current `src/__tests__/setup.ts` (which `deleteMany()`s whatever `DATABASE_URL` points at) is replaced in Phase 1.
4. Live smoke per phase against the dev backend with read-only or additive operations only.
5. Wealth OS regression check per phase: `SELECT` from `v_company_cash_daily`, `v_ytd_pulse`, `v_super_nova_burn`, `f_project_cash(30, NULL)` as `vision_reader` still succeeds with identical column sets.

---

## 9. Phase Plan & Acceptance Criteria

### Phase 1 — Spec + Customer 360 + Revenue Event spine
Schema: `RevenueEvent`, `Activity`, `companyId` on Customer(primary)/Lead/Quote/Invoice; backfill script (historical PAID invoices → events; companyId backfill). Services: `recordRevenueEvent`. Routers: `activity` (create/list), `customer.timeline`, `revenueEvents.list/summary`. Test harness: testcontainers; existing 9 tests pass on it.
**Accept when:** spec committed; migration applied with backup; backfill emitted events for existing PAID invoices (count reported); `customer.timeline` returns merged history for a real customer; all tests green on testcontainers; Wealth OS regression check passes.

### Phase 2 — Quotes/pricebook + job lifecycle
Schema: Job/JobAssignment/JobPhoto, Service.unitCost, QuoteLineItem.serviceId+unitCost. Routers: `job` (CRUD, transitions, dayView, closeout→auto-invoice), `quote.winRate`, `quote.aging`.
**Accept when:** a job can run REQUESTED→CLOSED in tests and live smoke, producing a linked Invoice whose PAID transition emits a FIELD_SERVICE RevenueEvent; dayView returns route-ordered jobs; invalid transitions rejected; margins computed on quotes with costs.

### Phase 3 — Commerce
Schema: Product/Order/OrderItem/IngestSource. Webhook endpoint + HMAC + idempotency; ingest service side effects (§3.5); `product`/`order` routers; margin report.
**Accept when:** replayed webhook creates exactly one order; PAID order auto-creates Invoice + ORDER_PAYMENT event; refund emits negative event and totals reconcile; unknown SKU flags review; stock decrements once; margin per SKU per source query correct in tests; live smoke posts a signed test order end-to-end.

### Phase 4 — Subscriptions + sales pipeline
Schema: Subscription. Router: CRUD, `recordRenewal`, `markPaymentFailed`, MRR rollup; `lead.convertToSubscription`.
**Accept when:** renewal advances period + creates PAID invoice + SUBSCRIPTION_RENEWAL event (idempotent per period); failed payment → PAST_DUE/dunningStage; MRR normalizes intervals correctly in tests; Eve-style `lead.create(source:"eve")` → WON → subscription flow passes integration test.

### Phase 5 — Attribution
Schema: UTM block on Lead, AdSpend; Customer acquisition snapshot; RevenueEvent attribution stamping. Router: `adSpend` CRUD + import, `attribution.report` (CAC/LTV/ROAS).
**Accept when:** lead/order with UTM → customer first-touch snapshot → revenue events carry attribution; CAC/LTV/ROAS math verified against hand-computed fixtures; first touch never overwritten.

### Phase 6 — Automations + MCP + holding views
AutomationLog + 6 rules as repeatable queue jobs; 10 MCP tools; 7 `v_*` views + grants; SUMMARY.md.
**Accept when:** each rule fires once per entity(+stage) in tests; views return real data for ≥1 company from the live DB; `vision_reader` can SELECT all new views and existing contract is regression-clean; MCP tools callable end-to-end (stdio smoke: create_lead → get_customer_360 shows it); SUMMARY.md documents schema, tools, views, and the Wealth OS consumption surface.

---

## 10. Done

All six phases on `feat/business-os`, tests green, `v_*` views returning real data for at least one company, MCP tools verified end-to-end, SUMMARY.md complete.

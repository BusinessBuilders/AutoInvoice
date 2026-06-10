# Spec: Time Clock + Universal Service Billing Hub
**Date**: 2026-04-28
**Branch**: `feature/time-clock-service-hub`
**Worktree**: `/home/magiccat/autoinvoice-features`
**Status**: Approved — ready for implementation

---

## 1. Overview

Two new features that share a branch but are independently usable:

1. **Universal Service Billing Hub** — generalizes the existing `plow-billing` page into a tag-driven billing board that works for any service type (Fertilizer, Plow, Lawn, custom). Customers are grouped by tag, billed via Stripe payment links, and optionally set on a recurring schedule.

2. **Time Clock** — employees punch in/out on their own phones using their existing EMPLOYEE-role accounts. Owner/admin sees a live team status panel and weekly payroll summary. EMPLOYEE role is scoped: no access to billing, invoices, or any financial data.

---

## 2. Architecture Decision

**Option B selected**: Parallel new models alongside existing. `PlowBilling` stays untouched. Three new focused Prisma models added. Two new tRPC routers. Employee access scoped at the router/middleware level using the existing `UserRole` enum.

---

## 3. Data Model

### 3.1 `ServiceSchedule`

Tracks one customer's relationship to one service type. Created the first time a customer appears in a service billing hub. Drives the recurring schedule and "next service date" display.

```prisma
model ServiceSchedule {
  id              String    @id @default(cuid())

  customerId      String
  customer        Customer  @relation(fields: [customerId], references: [id])

  serviceCode     String    // matches SERVICE_CONFIGS key: "plow", "fertilizer", "lawn", or custom slug
  serviceLabel    String    // display name, e.g. "Fertilizer" or "Spring Cleanup"

  isRecurring     Boolean   @default(false)
  interval        String?   // "weekly" | "biweekly" | "monthly" | "every-6-weeks" | "seasonal"
  nextServiceDate DateTime?
  lastServiceDate DateTime?

  notes           String?
  isActive        Boolean   @default(true)

  billings        ServiceBilling[]

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@unique([customerId, serviceCode])
  @@index([serviceCode])
  @@index([nextServiceDate])
}
```

**Key invariants:**
- One record per `(customerId, serviceCode)` — enforced by `@@unique`.
- `nextServiceDate` is always set by the owner explicitly. When `isRecurring` is true, `markJobDone` pre-fills a suggested next date from the interval; owner accepts or overrides.
- `interval` is a plain string enum (not a Prisma enum) so custom services can use custom intervals without a migration.

### 3.2 `ServiceBilling`

One record per billing event. Mirrors `PlowBilling` exactly but generalized across all service types. Holds the Stripe payment link and tracks status through its lifecycle.

```prisma
model ServiceBilling {
  id              String    @id @default(cuid())

  customerId      String
  customer        Customer  @relation(fields: [customerId], references: [id])

  scheduleId      String?   // null for one-off bills; set when linked to a ServiceSchedule
  schedule        ServiceSchedule? @relation(fields: [scheduleId], references: [id])

  serviceCode     String
  serviceLabel    String
  amount          Decimal
  description     String?   // line-item detail, e.g. "Lawn mow + edge - May 1"

  // Stripe
  stripePaymentLinkId   String?
  stripePaymentLinkUrl  String
  stripeSessionId       String?   // set when customer clicks link
  stripePaymentIntentId String?   // set when payment completes

  // Status
  status          ServiceBillingStatus @default(PENDING)
  sentAt          DateTime?
  paidAt          DateTime?

  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt

  @@index([customerId])
  @@index([serviceCode])
  @@index([status])
  @@index([stripePaymentLinkId])
}

enum ServiceBillingStatus {
  PENDING     // Link generated, not yet sent
  SENT        // Link texted/shared with customer
  VIEWED      // Customer clicked link (optional tracking)
  PAID        // Stripe webhook confirmed payment
  EXPIRED     // Link expired without payment
  CANCELLED   // Manually cancelled
}
```

### 3.3 `TimeEntry`

One record per clock-in event. `clockOut` and `totalMinutes` are null while the employee is still clocked in.

```prisma
model TimeEntry {
  id           String    @id @default(cuid())

  userId       String
  user         User      @relation(fields: [userId], references: [id])

  clockIn      DateTime
  clockOut     DateTime?
  totalMinutes Int?      // calculated on clockOut: (clockOut - clockIn) in minutes

  notes        String?   // optional note from employee on clock-out

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([userId])
  @@index([clockIn])
}
```

**Key invariants:**
- Only one open entry (no `clockOut`) per user at a time — enforced in the `clockIn` mutation.
- `totalMinutes` is always calculated server-side on `clockOut`, never sent from the client.
- Owner can correct any entry via `adminCorrect`; the corrected `totalMinutes` is recalculated server-side.

### 3.4 Schema additions to existing models

```prisma
// Customer — add relations
model Customer {
  // ... existing fields ...
  serviceSchedules  ServiceSchedule[]
  serviceBillings   ServiceBilling[]
}

// User — add relation
model User {
  // ... existing fields ...
  timeEntries       TimeEntry[]
}
```

---

## 4. API Surface

### 4.1 `serviceScheduling` router

All procedures are `protectedProcedure`. OWNER and ADMIN have full access. EMPLOYEE role is blocked at the middleware layer (not exposed to the employee-facing app).

| Procedure | Type | Purpose |
|-----------|------|---------|
| `list(serviceCode)` | query | Customers tagged with `serviceCode` + their `ServiceSchedule` + latest `ServiceBilling` status |
| `upsertSchedule(customerId, serviceCode, serviceLabel, isRecurring, interval?, nextServiceDate?)` | mutation | Create or update a `ServiceSchedule`. Used when toggling recurring or setting next date. |
| `createBilling(customerId, serviceCode, amount, description?)` | mutation | Create Stripe Price + PaymentLink, save `ServiceBilling` as PENDING. Returns `{ url, billingId }`. |
| `markSent(billingId)` | mutation | Mark billing as SENT, record `sentAt`. |
| `markJobDone(scheduleId, nextServiceDate?)` | mutation | Set `lastServiceDate = now()`. If `nextServiceDate` provided, saves it. If not and `isRecurring`, returns suggested date from interval. |
| `cancelBilling(billingId)` | mutation | Mark billing as CANCELLED. |
| `listBillings(serviceCode, status?, customerId?, limit?)` | query | Billing history for a service type with optional filters. |
| `getSuggestedNextDate(scheduleId)` | query | Calculate suggested next date from interval + lastServiceDate. Used for the UI pre-fill. |

### 4.2 `timeClock` router

Scoped so EMPLOYEE users only access their own data. OWNER/ADMIN access full team data.

| Procedure | Type | Access | Purpose |
|-----------|------|--------|---------|
| `clockIn(notes?)` | mutation | Any auth user | Create open `TimeEntry`. Errors if user already has an open entry. |
| `clockOut(notes?)` | mutation | Any auth user | Close open `TimeEntry`, calculate `totalMinutes`. |
| `myStatus()` | query | Any auth user | Returns open `TimeEntry` if clocked in, else `null`. |
| `myHistory(weekStart)` | query | Any auth user | All `TimeEntry` records for current user in the given week. |
| `teamStatus()` | query | OWNER/ADMIN | All users with open `TimeEntry` (currently clocked in). |
| `teamWeekly(weekStart)` | query | OWNER/ADMIN | All employees' `TimeEntry` records for the week, grouped by user with total hours. |
| `adminCorrect(entryId, clockIn, clockOut)` | mutation | OWNER/ADMIN | Correct any entry; recalculates `totalMinutes` server-side. |

---

## 5. UI Behavior

### 5.1 Service Billing Hub (`/service-billing/[serviceCode]`)

**Already mocked** in the worktree at `apps/web/src/app/service-billing/[serviceCode]/page.tsx`. Implementation wires real data.

- **Service tab bar**: Fertilizer / Plow / Lawn + inline input + `+` button for custom services. Custom service codes persist in `localStorage`.
- **Customer list**: Filtered by `customer.tags` containing `serviceCode`. Each row shows:
  - Name, phone, address
  - Next service date (editable inline → calls `upsertSchedule`)
  - Last service date
  - Recurring badge + interval if `isRecurring`
  - Latest billing status badge (PENDING / SENT / PAID / RECURRING)
  - "Send Bill" button → `createBilling` → copies Stripe link to clipboard + shows SMS share
  - "Mark Done" button → `markJobDone` → advances date, updates `lastServiceDate`
- **Recurring toggle** (per customer row): slide-out panel with interval picker and next date picker. Saves via `upsertSchedule`.
- **Billing history drawer**: tap customer name → slide-out shows all `ServiceBilling` records for that customer × service.

### 5.2 Time Clock (`/time-clock`)

**Already mocked** in the worktree at `apps/web/src/app/time-clock/page.tsx`. Implementation wires real data.

**OWNER/ADMIN view (3 tabs):**
- **Tab 1 — Clock**: Big Clock In / Clock Out button. Shows current time and elapsed time if clocked in. Calls `clockIn` / `clockOut`.
- **Tab 2 — Team**: Live panel of all employees currently clocked in (from `teamStatus`). Shows name, role, clock-in time, elapsed hours.
- **Tab 3 — Payroll**: Week picker → table of all employees × days with daily totals and weekly total hours. Data from `teamWeekly`. Future: export to CSV.

**EMPLOYEE view (restricted):**
- Tab 1 only (their own Clock In/Out button).
- Below the button: their own punch history for the current week (`myHistory`).
- No Team or Payroll tabs rendered. No navigation links to any other section of the app.

**Mobile-first**: The clock tab is designed for a phone screen. Large tap targets, no sidebars.

---

## 6. Stripe Integration

### 6.1 Creating a billing link

`serviceScheduling.createBilling` calls the Stripe API identically to `createPlowBillingLink`:
1. Create a Stripe `Price` (one-time, `unit_amount` in cents)
2. Create a Stripe `PaymentLink` with `metadata: { serviceBillingId, customerId, serviceCode }`
3. Save `ServiceBilling` record with `stripePaymentLinkUrl` and status `PENDING`
4. Return `{ url }` to the frontend

### 6.2 Webhook handling

Extend the existing Stripe webhook handler (in `apps/backend/src/routers/payments.ts` or its own route) to handle `ServiceBilling` events:

```
checkout.session.completed
  → find ServiceBilling by metadata.serviceBillingId
  → set status = PAID, paidAt = now(), stripePaymentIntentId
  → if schedule.isRecurring → call getSuggestedNextDate logic (do NOT auto-set; just log for owner review)

payment_link.completed (alternative event)
  → same as above
```

No automatic next-date advancement on webhook — the owner manually confirms the job was done via `markJobDone`. The webhook only marks the money as received.

---

## 7. Employee Access Security

The EMPLOYEE role must never see:
- Invoice data, customer financials, billing history
- Bank transactions, accounting, general ledger
- Any other employee's time entries (except their own)
- Company settings, Stripe configuration

**Enforcement layers:**
1. **Router-level**: `timeClock.teamStatus`, `timeClock.teamWeekly`, `timeClock.adminCorrect` check `ctx.user.role` and throw `UNAUTHORIZED` if EMPLOYEE.
2. **Middleware redirect**: A Next.js middleware checks role from JWT and redirects EMPLOYEE users to `/time-clock` if they try to access any other route (except `/login`, `/payment-success`).
3. **UI**: Employee view renders no navigation links to other sections. Not just hidden — the routes are gated.

**Access scoping**: `timeClock` queries are always filtered by `ctx.user.id` so employees can only ever see their own entries. `serviceScheduling` queries are accessible to OWNER/ADMIN only — no filtering needed beyond role check since this is a single-tenant deployment per business.

---

## 8. Implementation Phases

### Phase 1 — Schema Migration
- Add `ServiceSchedule`, `ServiceBilling`, `TimeEntry` models to `prisma/schema.prisma`
- Add relations to `Customer` and `User`
- Add `ServiceBillingStatus` enum
- Run `npm run generate` + `npm run db:migrate`

### Phase 2 — Time Clock Backend
- Create `apps/backend/src/routers/timeClock.ts`
- Add `timeClock` to `routers/index.ts`
- All 7 procedures implemented and tested

### Phase 3 — Time Clock Frontend
- Wire `apps/web/src/app/time-clock/page.tsx` to real tRPC data (replace all `MOCK_*` constants)
- Add Next.js middleware for EMPLOYEE role redirect
- Mobile-responsive clock button and punch history

### Phase 4 — Service Billing Backend
- Create `apps/backend/src/routers/serviceScheduling.ts`
- Add `serviceScheduling` to `routers/index.ts`
- All 8 procedures implemented and tested

### Phase 5 — Service Billing Frontend
- Wire `apps/web/src/app/service-billing/[serviceCode]/page.tsx` to real tRPC data
- Inline date editing, recurring toggle panel, billing history drawer

### Phase 6 — Stripe Webhooks
- Extend existing webhook handler to process `ServiceBilling` payment events
- Mark PAID on `checkout.session.completed`

### Phase 7 — Payroll View
- Weekly hours table in Time Clock Tab 3
- Per-employee totals, week navigation
- Future: CSV export hook-in point

---

## 9. Out of Scope (Future Phases)

- Job-linked punches (employee selects customer/job on clock-in)
- Google Calendar sync for service schedules
- Labor billing (adding hours to customer invoices)
- Stripe Subscriptions (true auto-charge recurring)
- Push notifications for next service date reminders
- CSV payroll export

---

## 10. Database Backup

Backup taken before any schema changes:
```
/home/magiccat/AutoInvoice/.backups/pre-time-clock-service-hub-20260428-193548.dump
```
Restore command:
```bash
PGPASSWORD=invoice_dev_password pg_restore -h localhost -U invoice_user -d invoice_platform --clean \
  /home/magiccat/AutoInvoice/.backups/pre-time-clock-service-hub-20260428-193548.dump
```

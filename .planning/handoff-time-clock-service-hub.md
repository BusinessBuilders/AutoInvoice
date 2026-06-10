# Handoff: Time Clock + Universal Service Billing Hub (UPDATED 2026-04-29)
**Date**: 2026-04-25
**Branch**: `feature/time-clock-service-hub`
**Worktree**: `/home/magiccat/autoinvoice-features`

---

## What Was Done SESSION 2 (2026-04-29)

### Completed
1. Ran full `/superpowers:brainstorming` — all 7 questions answered, design approved (Option B)
2. Took DB backup: `.backups/pre-time-clock-service-hub-20260428-193548.dump`
3. Wrote spec: `.planning/spec-time-clock-service-hub.md` (approved by user)
4. Wrote implementation plan: `.planning/2026-04-29-time-clock-service-hub.md` (10 tasks, complete code, zero placeholders)

### Known Fix Needed in Plan (Task 8)
`handleSendBill` in the service-billing frontend is missing `setCopiedId` calls. When implementing Task 8, add these two lines after `await markSent.mutateAsync(...)`:
```typescript
setCopiedId(customer.id);
setTimeout(() => setCopiedId(null), 2000);
```

### Next Action
Start implementation. User chose to proceed — ask them: **Subagent-Driven or Inline Execution?** Then invoke `superpowers:subagent-driven-development` or `superpowers:executing-plans` accordingly.

---

## What Was Done SESSION 1 (original)

### 1. Branch Analysis
- Confirmed `feature/accounting-customer-statements` (commit `30c8ad0`) is the most complete branch
- All other branches (main, tally-voice-invoice, enormous-eggnog) are significantly behind
- New worktree created at `/home/magiccat/autoinvoice-features` on branch `feature/time-clock-service-hub`

### 2. Visual Mockup Pages (mock data only — NO backend wired yet)
Both pages are live. Start the dev server to see them:
```bash
cd /home/magiccat/autoinvoice-features/apps/web && PORT=3001 npm run dev
```
- **Time Clock**: `http://localhost:3001/time-clock`
  - Tab 1: Clock In/Out button + live team status panel
  - Tab 2: Weekly schedule grid + Add Shift modal
  - Tab 3: Time log with employee filter
  - File: `apps/web/src/app/time-clock/page.tsx`

- **Service Billing Hub**: `http://localhost:3001/service-billing/fertilizer`
  - Dynamic route `/service-billing/[serviceCode]` — one component for ALL services
  - Service tab bar: Fertilizer / Plow / Lawn + inline input + `+` button to add custom services
  - Custom services persist via localStorage
  - One-time vs Recurring billing mode toggle
  - Per-customer quantity controls + schedule slide-out panel
  - File: `apps/web/src/app/service-billing/[serviceCode]/page.tsx`

### 3. Brainstorming Started But Incomplete
`/sc:brainstorm` was invoked but the 7 critical questions were never answered by the user.
**The spec and implementation plan have NOT been written yet.**

---

## What Needs To Happen Next

### Step 1 — Run `/superpowers:brainstorming`
Use this skill to conduct the full requirements discovery session and produce a written spec + implementation plan. Do NOT write any backend code until the spec is signed off.

The 7 unanswered questions are:

**Service Billing Hub:**
1. **Customer filtering** — Show all customers, or only those tagged for each service (like plow uses "plow"/"snow" tags)?
2. **Payment collection** — Does the customer pay online via Stripe link, or is it a fast record and you collect cash/check in person?
3. **Recurring billing** — Real Stripe subscription (auto-charges card), or a reminder that prompts you to generate a new link each cycle?
4. **Next service date ownership** — Who updates it after a job: owner manually, employee after completing, or auto-advance by interval?

**Time Clock:**
5. **Clock-in device** — Employees on their own phones, shared shop tablet, or owner punches them in?
6. **Job-linked punches** — Simple clock in/out for the day, or tied to a specific customer/job?
7. **Hours data purpose** — For payroll (paying employees), billing customers (labor on invoice), or just visibility/accountability?

### Step 2 — Write the Spec
After answers, produce a spec doc at `.planning/spec-time-clock-service-hub.md` covering:
- Data model (Prisma schema additions)
- API surface (tRPC routers needed)
- UI behaviour per page
- Stripe integration approach
- Google Calendar sync approach
- Implementation phases with dependencies

### Step 3 — Phase 1 Implementation
Only after spec is approved:
- Add `ServiceSchedule`, `TimeEntry`, `Shift` models to Prisma schema
- Create `timeClock` tRPC router
- Create `serviceScheduling` tRPC router
- Wire real data into the existing mockup pages

---

## Existing Codebase Context (AutoInvoice)

| Thing | Detail |
|-------|--------|
| Stack | Next.js 14 App Router + React 18 + tRPC + Prisma + PostgreSQL |
| Stripe | Already integrated — `apps/backend/src/routers/payments.ts` has `createPlowBillingLink`, `createPaymentLink` |
| Google Calendar | Already wired — `apps/backend/src/services/google/calendar.ts` has `createCalendarEvent()` |
| Existing plow page | `apps/web/src/app/plow-billing/page.tsx` — this is the pattern the Service Hub replaces/generalizes |
| Team router | `apps/backend/src/routers/team.ts` — basic CRUD, no time clock yet |
| Auth | JWT with refresh tokens, `protectedProcedure` for all new endpoints |
| Company model | Multi-tenant via `companyId` on all records |

---

## Key Architectural Decisions Already Made
- Dynamic route `/service-billing/[serviceCode]` replaces per-service pages
- `SERVICE_CONFIGS` registry in the frontend — adding a service = one object entry, no new pages
- Custom services (user-added) stored in localStorage, color-cycled from a palette
- New Prisma models needed: `ServiceSchedule`, `TimeEntry`, `Shift`

---

## Instructions for Next Session

1. Read this file first for full context
2. Run `/superpowers:brainstorming` with the 7 questions above
3. Get answers from the user
4. Write spec to `.planning/spec-time-clock-service-hub.md`
5. Get sign-off before any implementation

# Spec: Time Clock 2.0 — Calendar, Shifts, Entry CRUD

**Date**: 2026-05-05
**Branch**: `feature/time-clock-service-hub` (continuation, no new branch)
**Worktree**: `/home/magiccat/autoinvoice-features`
**Status**: Approved — ready for implementation plan generation

---

## 1. Overview

Adds three capabilities the v1 Time Clock + Service Billing Hub didn't ship:

1. **Full CRUD on time entries** — owner can edit, delete, or create backdated `TimeEntry` rows for the four common operator scenarios (employee forgot to clock out, employee forgot to clock in, punch time was off, bogus entry to delete).
2. **Calendar surface** — new dedicated `/calendar` page that overlays past punches, scheduled services, and planned shifts in one view, plus contextual mini-calendars on each `/service-billing/[code]` page scoped to that one service.
3. **Shift scheduling** — new `Shift` model for planned future work, generic with optional customer + service link, supporting recurring rules (RFC 5545 RRULE) and drag-and-drop interactions.

Also fixes the date validation bug that's currently breaking `myHistory` and `teamWeekly` queries on the existing time-clock page.

---

## 2. Goals + Non-Goals

### Goals (v1)

- Operator can correct any timesheet error post-hoc without leaving the Payroll tab.
- Single canonical calendar view shows everyone's shifts, all upcoming services, and all past punches with toggle filters.
- Recurring shifts (e.g. "Tom every Mon–Wed 8–4") expressible in one config that expands into individual instances.
- Drag-create / drag-resize / drag-move on the calendar widget.
- Mini-calendar on each service-billing page showing only that service's scheduled jobs.
- Employees get read-only access to `/calendar` showing only their own punches and shifts.
- Existing date validation bug on `timeClock.myHistory` / `timeClock.teamWeekly` resolved.

### Non-Goals (deferred to v2)

- Email or SMS notification when a shift is assigned (employees check the calendar themselves for v1).
- Audit log of who edited which entry and when.
- iCal / Google Calendar subscription export.
- Employee-initiated shift change requests / swap proposals.
- Auto-payroll calculation (hourly rate × hours → dollar amounts).
- Mobile native app — v1 is mobile-responsive web only.

---

## 3. Architecture

```
┌────────────────────────────────────────────────────────────────────┐
│  Frontend (Next.js)                                                │
│                                                                    │
│  /calendar (master view)                                           │
│    ├── @fullcalendar/react with day/week/month/list views          │
│    ├── Toggle filters: punches | services | shifts                 │
│    ├── Color-coded events (green=punches, blue=services, purple=shifts) │
│    ├── Click event → modal (edit/delete/mark-done by type)         │
│    ├── Drag empty → create-shift modal                             │
│    └── Drag-resize / drag-move shift → updateOne mutation          │
│                                                                    │
│  /service-billing/[code] (existing pages, mini-calendar added)     │
│    └── timeGridWeek FullCalendar scoped to one serviceCode         │
│                                                                    │
│  /time-clock (existing page, Payroll tab gets row-click → edit)    │
│    └── New "Add Entry" button on Payroll tab                       │
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ tRPC + superjson transformer
┌────────────────────────────────────────────────────────────────────┐
│  Backend (tRPC routers)                                            │
│                                                                    │
│  timeClock (existing, +3 procs):                                   │
│    adminEdit, adminDelete, adminCreate                             │
│                                                                    │
│  shifts (NEW):                                                     │
│    list, myShifts, create (expands RRULE),                         │
│    updateOne, updateSeries, deleteOne, deleteSeries                │
│                                                                    │
│  calendar (NEW):                                                   │
│    feed({ start, end, types[] }) → unified event[] for FullCalendar│
└────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ Prisma
┌────────────────────────────────────────────────────────────────────┐
│  PostgreSQL                                                        │
│  + new Shift table (rrule + parentId for series)                   │
│  + nullable shiftId on existing TimeEntry                          │
└────────────────────────────────────────────────────────────────────┘
```

---

## 4. Data Model

### 4.1 NEW: `Shift`

```prisma
model Shift {
  id           String      @id @default(cuid())

  userId       String
  user         User        @relation(fields: [userId], references: [id])

  startTime    DateTime
  endTime      DateTime

  // Optional job linking
  customerId   String?
  customer     Customer?   @relation(fields: [customerId], references: [id])
  serviceCode  String?
  serviceLabel String?

  // Recurrence
  rrule        String?     // RFC 5545 string, e.g. "FREQ=WEEKLY;BYDAY=MO,TU,WE;UNTIL=20260801T000000Z"
  parentId     String?     // FK to template shift if this is a generated instance
  parent       Shift?      @relation("ShiftRecurrence", fields: [parentId], references: [id])
  instances    Shift[]     @relation("ShiftRecurrence")

  status       ShiftStatus @default(SCHEDULED)
  notes        String?

  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@index([userId, startTime])
  @@index([startTime])
  @@index([customerId])
  @@index([serviceCode])
  @@index([parentId])
}

enum ShiftStatus {
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  CANCELLED
  NO_SHOW
}
```

**Key invariants:**
- `endTime > startTime` enforced via Zod `.refine()` on all create/update inputs.
- A shift with `rrule != null AND parentId == null` is a TEMPLATE. The backend on create expands the rule into 90 days of dated `Shift` rows whose `parentId` points back to the template. Templates themselves are not rendered on the calendar — only their instances.
- Editing a single instance writes to that instance only; editing a series re-expands future instances from the template, leaving past instances untouched.
- 90-day window is a constant, not env-configurable (matches industry default — When I Work, Deputy use similar horizons).

### 4.2 Modified: `TimeEntry`

```prisma
model TimeEntry {
  // ... existing fields ...
  shiftId   String?
  shift     Shift?  @relation(fields: [shiftId], references: [id])
  @@index([shiftId])
}
```

Auto-link rule: when `clockIn` mutation fires, the backend looks for a `SCHEDULED` shift for `ctx.user.id` whose `startTime` is within ±30 min of `now()`. If one is found, the new `TimeEntry` gets that `shiftId` AND the shift's `status` flips to `IN_PROGRESS`. On `clockOut`, the shift flips to `COMPLETED`.

### 4.3 No other model changes

`Customer`, `User`, `ServiceSchedule`, `ServiceBilling` are unchanged. Just adding the new `Shift` table and one nullable FK on `TimeEntry`.

---

## 5. API Surface

### 5.1 `timeClock` router (existing, +3 procedures)

| Procedure | Type | Auth | Purpose |
|---|---|---|---|
| `adminEdit({ entryId, clockIn?, clockOut?, notes?, userId? })` | mutation | OWNER/ADMIN | Replaces existing `adminCorrect`. Recalculates `totalMinutes` server-side. Refines `clockIn < clockOut`. |
| `adminDelete({ entryId })` | mutation | OWNER/ADMIN | Hard delete. If `shiftId` set, the linked shift's status reverts to `SCHEDULED`. |
| `adminCreate({ userId, clockIn, clockOut?, notes?, shiftId? })` | mutation | OWNER/ADMIN | Backdated entry. If `clockOut` provided, calc `totalMinutes`. Auto-link to shift if window matches. |

The existing 7 procedures (clockIn / clockOut / myStatus / myHistory / teamStatus / teamWeekly / adminCorrect) stay. `adminCorrect` is kept as a deprecated alias of `adminEdit` for one release to avoid frontend breakage if anything else calls it.

### 5.2 `shifts` router (NEW)

| Procedure | Type | Auth | Purpose |
|---|---|---|---|
| `list({ start, end, userId? })` | query | OWNER/ADMIN | Returns all shifts overlapping `[start, end]`, optionally filtered by employee. Includes user, customer, parent. |
| `myShifts({ start, end })` | query | Any auth user | Same as `list` but scoped to `ctx.user.id`. |
| `create({ userId, startTime, endTime, customerId?, serviceCode?, serviceLabel?, rrule?, notes? })` | mutation | OWNER/ADMIN | Create a shift. If `rrule` provided, persists as template + expands 90 days of instances in a single transaction. Returns `{ shift, instanceCount }`. |
| `updateOne({ shiftId, ... patchable fields })` | mutation | OWNER/ADMIN | Edit a single shift instance. If editing a template, only the template metadata changes — instances are NOT re-expanded (use `updateSeries` for that). |
| `updateSeries({ parentId, ... patchable fields })` | mutation | OWNER/ADMIN | Edit the existing template row in place (keeps the same `parentId` so child instances stay linked) AND delete future instances (those with `startTime > now()`) AND re-expand from the updated rule. Past instances untouched. |
| `deleteOne({ shiftId })` | mutation | OWNER/ADMIN | Delete one instance. |
| `deleteSeries({ parentId })` | mutation | OWNER/ADMIN | Delete the template + all future instances. Past instances untouched. |

### 5.3 `calendar` router (NEW)

| Procedure | Type | Auth | Purpose |
|---|---|---|---|
| `feed({ start, end, types: ('time_entry' \| 'service' \| 'shift')[], serviceCode? })` | query | Any auth user | Returns a unified `CalendarEvent[]` from the requested data types within `[start, end]`. Each event is `{ id, type, title, start, end, color, allDay, meta }`. EMPLOYEE callers are auto-scoped to own data (own punches, own shifts) and `service` requests return empty for them. Template shifts (rrule != null AND parentId == null) are NEVER returned — only their expanded instances. Optional `serviceCode` parameter narrows results to events whose `meta.serviceCode` matches (used by the mini-calendars on `/service-billing/[code]` pages — server-side filter is more efficient than client-side). |

`CalendarEvent` shape is normalized so FullCalendar consumes it directly without per-type adapter logic on the frontend.

### 5.4 Bug fix — superjson transformer

Add `superjson` as the tRPC transformer:
- Backend: `initTRPC.context<Context>().create({ transformer: superjson })`
- Frontend: `httpBatchLink({ url, transformer: superjson, headers: ... })`

This fixes the `Expected date, received string` errors on `timeClock.myHistory` and `timeClock.teamWeekly` immediately, plus prevents the same class of bug on every new `z.date()` input the new routers introduce.

---

## 6. Frontend

### 6.1 NEW: `/calendar` page

Components:
- `<CalendarShell>` — page wrapper with header, view-toggle controls, filter chips
- `<FullCalendarHost>` — wraps `@fullcalendar/react` with the four view plugins (dayGridMonth, timeGridWeek, timeGridDay, listWeek), interaction plugin, rrule plugin
- `<EventModal>` — discriminated-union modal that renders different forms based on event type:
  - Time entry: edit clockIn/clockOut/notes/userId, delete button
  - Service: mark-done button, link to service-billing page
  - Shift: edit times/job/notes, delete-one-vs-delete-series choice if `parentId` present

Behavior:
- Default view = current week (`timeGridWeek`)
- Default filter = all three types ON
- Click empty time slot → opens "Create Shift" modal pre-filled with that time range
- Click existing event → opens `<EventModal>` for that event's type
- Drag-resize a shift → `shifts.updateOne({ shiftId, endTime })` with optimistic update
- Drag-move a shift → `shifts.updateOne({ shiftId, startTime, endTime })` with optimistic update
- Color tokens: punches=green-600, services=blue-600, shifts=purple-600, with status-based opacity (e.g. CANCELLED shifts at 40% opacity with strikethrough)

### 6.2 Mini-calendars on `/service-billing/[code]`

Add a `<ServiceMiniCalendar serviceCode={...} />` widget below the customer list. Uses FullCalendar `timeGridWeek` view, fetching from `calendar.feed({ ..., serviceCode })` so the filter is server-side. Shows scheduled services for that service type and any shifts linked to it. Click event → same `<EventModal>` as the master calendar.

### 6.3 `/time-clock` Payroll tab — row click → edit modal

The existing Payroll tab table gets:
- Each employee row has expandable detail rows showing individual punches for the week
- Each punch row is clickable → opens the `<EventModal>` time-entry form for that entry
- New "Add Entry" button at the top of the Payroll tab → opens the modal in create mode

### 6.4 EMPLOYEE access

Update `apps/web/src/middleware.ts`:
```typescript
const EMPLOYEE_ALLOWED = ['/time-clock', '/calendar', '/login', '/payment-success'];
```

The `calendar.feed` query auto-scopes EMPLOYEE callers to own data only — no UI-side filtering needed.

EMPLOYEE view of `/calendar` hides:
- Other employees' shifts and punches
- Service-billing events (services are owner-only)
- Filter toggles for service / shift types still appear but service is disabled

### 6.5 New shared utilities

Replace inline date helpers (`getWeekStart`, `formatMinutes`, `formatTime`, `getDayKey`, `shiftWeek`, `formatWeekRange`) with `date-fns` equivalents:
- `startOfWeek(date, { weekStartsOn: 1 })` → replaces `getWeekStart`
- `format(date, 'h:mma')` → replaces `formatTime`
- `addWeeks(date, n)` → replaces `shiftWeek`
- `getISODay(date)` → replaces `getDayKey` (returns 1=Mon..7=Sun)

`formatMinutes` stays bespoke (no clean date-fns equivalent for "Xh Ym" format).

---

## 7. New Dependencies

| Package | Purpose | Bundle (gz) |
|---|---|---|
| `@fullcalendar/react` | React wrapper | ~12kb |
| `@fullcalendar/daygrid` | Month view | ~10kb |
| `@fullcalendar/timegrid` | Week/day views | ~12kb |
| `@fullcalendar/list` | Agenda view | ~5kb |
| `@fullcalendar/interaction` | Drag/drop | ~8kb |
| `@fullcalendar/rrule` | RRULE recurrence | ~6kb |
| `rrule` | RRULE expansion (server + RRULE plugin) | ~30kb |
| `date-fns` | Date math | ~10kb (tree-shaken) |
| `superjson` | tRPC transformer | ~4kb |

Total ~97kb gzipped. Acceptable for a scheduling-heavy page.

---

## 8. Implementation Phases

Phases are designed to ship in order — each phase produces a working, committable, testable increment. Earlier phases unblock later ones.

| # | Phase | Deliverable | Depends on |
|---|---|---|---|
| 1 | superjson + date-fns foundation | Bug fix: myHistory/teamWeekly work; date-fns imported | — |
| 2 | TimeEntry CRUD backend | `adminEdit`, `adminDelete`, `adminCreate` procedures + tests | 1 |
| 3 | TimeEntry CRUD frontend | EventModal (time-entry mode) + Payroll row click + Add Entry button | 2 |
| 4 | Shift schema + partial unique index | Prisma model, migration, updated test setup, regression tests | 1 |
| 5 | Shift backend (single + series) | `shifts` router with all 7 procedures + RRULE expansion logic + tests | 4 |
| 6 | Calendar feed | `calendar.feed` query returning unified `CalendarEvent[]` + tests | 5 |
| 7 | `/calendar` page (no drag-drop yet) | FullCalendar shell with views + filters + read-only event display + EventModal click handlers | 6 |
| 8 | Drag-and-drop interactions | Drag-create, drag-resize, drag-move wired through optimistic mutations | 7 |
| 9 | Mini-calendars on service-billing | `<ServiceMiniCalendar>` component embedded on `/service-billing/[code]` | 6 |
| 10 | EMPLOYEE access | Middleware allowlist update + role-scoped feed verification + smoke test | 7 |
| 11 | TimeEntry ↔ Shift auto-linking | clockIn/clockOut update shift status + tests | 5, 2 |
| 12 | E2E smoke test | Live verification of every flow | all |

Subagent-driven execution: each phase is one implementer dispatch (Opus) + spec review + code quality review (Sonnet), with fix loops as needed. Same workflow as the original spec.

---

## 9. Testing Strategy

- Unit tests for the new routers in the existing Jest + isolated `invoice_platform_test` DB (already set up).
- RRULE expansion test: create a recurring shift "weekly Mon/Wed for 4 weeks" → assert exactly 8 instance rows are created with correct dates.
- Auto-linking test: create a SCHEDULED shift starting now, call `clockIn`, assert `TimeEntry.shiftId` set and `Shift.status === IN_PROGRESS`.
- Series-edit test: create recurring shift with 12 instances, call `updateSeries` → assert future instances re-expanded with new params, past instances unchanged.
- Calendar feed scoping test: as EMPLOYEE caller, request `feed({ types: ['shift', 'service', 'time_entry'] })` → assert only own data returned, services empty.

---

## 10. Database Backup

Backup taken before any schema changes (Phase 4 entry):
```bash
PGPASSWORD=invoice_dev_password pg_dump -h localhost -U invoice_user -d invoice_platform -Fc \
  -f /home/magiccat/AutoInvoice/.backups/pre-time-clock-v2-$(date +%Y%m%d-%H%M%S).dump
```

Same for `invoice_platform_test`.

---

## 11. Out of Scope (Repeated for Clarity)

Explicitly NOT in v1, deferred to a follow-up spec when needed:

- Email/SMS notifications on shift assignment
- Audit log of admin edits
- iCal subscription URL per employee
- Employee shift swap / change request workflow
- Auto-payroll dollar calculation
- Bulk import of shifts from CSV
- Mobile native app
- Calendar print / PDF export

---

## 12. Open Questions

None — all decisions captured during brainstorming have been incorporated above.

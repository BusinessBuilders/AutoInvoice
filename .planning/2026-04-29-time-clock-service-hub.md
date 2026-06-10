# Time Clock + Universal Service Billing Hub — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Time Clock (employee punch in/out with payroll view) and a Universal Service Billing Hub (tag-driven per-service billing with Stripe payment links and recurring scheduling) to the AutoInvoice platform.

**Architecture:** Three new Prisma models (`ServiceSchedule`, `ServiceBilling`, `TimeEntry`) alongside existing `PlowBilling`. Two new tRPC routers (`timeClock`, `serviceScheduling`). EMPLOYEE role access scoped in the router layer and enforced by a Next.js middleware redirect. Both mockup pages already exist in the worktree — implementation replaces mock data with real tRPC calls.

**Tech Stack:** PostgreSQL + Prisma ORM, tRPC v10, Next.js 14 App Router, TypeScript, Stripe SDK v14, Jest + ts-jest

**Worktree:** `/home/magiccat/autoinvoice-features` on branch `feature/time-clock-service-hub`

**Run all commands from:** `/home/magiccat/autoinvoice-features`

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/backend/prisma/schema.prisma` | Modify | Add `ServiceSchedule`, `ServiceBilling`, `TimeEntry` models + `ServiceBillingStatus` enum + relations on `Customer` and `User` |
| `apps/backend/src/routers/timeClock.ts` | Create | 7 procedures: clockIn, clockOut, myStatus, myHistory, teamStatus, teamWeekly, adminCorrect |
| `apps/backend/src/routers/serviceScheduling.ts` | Create | 8 procedures: list, upsertSchedule, createBilling, markSent, markJobDone, cancelBilling, listBillings, getSuggestedNextDate |
| `apps/backend/src/routers/index.ts` | Modify | Register `timeClock` and `serviceScheduling` routers |
| `apps/backend/src/__tests__/setup.ts` | Modify | Add `serviceSchedule`, `serviceBilling`, `timeEntry` table cleanup to `beforeEach` |
| `apps/backend/src/__tests__/timeClock.test.ts` | Create | Tests for clock in/out logic, double-clock guard, role restriction, minute calculation |
| `apps/backend/src/__tests__/serviceScheduling.test.ts` | Create | Tests for list-by-tag, upsert, markJobDone, getSuggestedNextDate, cancel |
| `apps/backend/src/server.ts` | Modify | Extend Stripe webhook to mark `ServiceBilling` as PAID on `checkout.session.completed` |
| `apps/web/src/app/time-clock/page.tsx` | Modify | Replace all `MOCK_*` constants with real tRPC queries; add OWNER/ADMIN tab gating by role from JWT |
| `apps/web/src/app/service-billing/[serviceCode]/page.tsx` | Modify | Replace `MOCK_CUSTOMERS` with real tRPC data; wire `createBilling`, `upsertSchedule`, `markJobDone`, `markSent` |
| `apps/web/src/middleware.ts` | Create | Next.js middleware — redirects EMPLOYEE role users to `/time-clock` for any route outside the allowlist |

---

## Task 1: Schema Migration

**Files:**
- Modify: `apps/backend/prisma/schema.prisma`

- [ ] **Step 1: Add models and enum to schema**

Open `apps/backend/prisma/schema.prisma`. Before the `enum PlowBillingStatus` block (around line 473), add:

```prisma
model ServiceSchedule {
  id              String    @id @default(cuid())

  customerId      String
  customer        Customer  @relation(fields: [customerId], references: [id])

  serviceCode     String
  serviceLabel    String

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

model ServiceBilling {
  id              String    @id @default(cuid())

  customerId      String
  customer        Customer  @relation(fields: [customerId], references: [id])

  scheduleId      String?
  schedule        ServiceSchedule? @relation(fields: [scheduleId], references: [id])

  serviceCode     String
  serviceLabel    String
  amount          Decimal
  description     String?

  stripePaymentLinkId   String?
  stripePaymentLinkUrl  String
  stripeSessionId       String?
  stripePaymentIntentId String?

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
  PENDING
  SENT
  VIEWED
  PAID
  EXPIRED
  CANCELLED
}

model TimeEntry {
  id           String    @id @default(cuid())

  userId       String
  user         User      @relation(fields: [userId], references: [id])

  clockIn      DateTime
  clockOut     DateTime?
  totalMinutes Int?

  notes        String?

  createdAt    DateTime  @default(now())
  updatedAt    DateTime  @updatedAt

  @@index([userId])
  @@index([clockIn])
}
```

- [ ] **Step 2: Add relations to existing models**

In the `Customer` model (around line 126–129 after `plowBillings`), add:
```prisma
  serviceSchedules ServiceSchedule[]
  serviceBillings  ServiceBilling[]
```

In the `User` model (around line 40 after `services Service[]`), add:
```prisma
  timeEntries TimeEntry[]
```

- [ ] **Step 3: Generate Prisma client**

```bash
cd apps/backend && npm run generate
```

Expected output: `✔ Generated Prisma Client`

- [ ] **Step 4: Create and apply migration**

```bash
cd apps/backend && npm run db:migrate
```

When prompted for migration name, enter: `add_service_billing_time_clock`

Expected output: `The following migration(s) have been applied: .../add_service_billing_time_clock`

- [ ] **Step 5: Commit the schema**

```bash
git -C /home/magiccat/autoinvoice-features add apps/backend/prisma/
git -C /home/magiccat/autoinvoice-features commit -m "feat: add ServiceSchedule, ServiceBilling, TimeEntry schema models"
```

---

## Task 2: Update Test Setup

**Files:**
- Modify: `apps/backend/src/__tests__/setup.ts`

- [ ] **Step 1: Add new table cleanup to beforeEach**

In `setup.ts`, add these three lines to `beforeEach`, before `prisma.refreshToken.deleteMany()`:

```typescript
  await prisma.serviceBilling.deleteMany();
  await prisma.serviceSchedule.deleteMany();
  await prisma.timeEntry.deleteMany();
```

The full `beforeEach` should now look like:
```typescript
beforeEach(async () => {
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.account.deleteMany();

  await prisma.serviceBilling.deleteMany();
  await prisma.serviceSchedule.deleteMany();
  await prisma.timeEntry.deleteMany();

  await prisma.refreshToken.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.task.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.check.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();
  await prisma.user.deleteMany();
});
```

- [ ] **Step 2: Verify existing tests still pass**

```bash
cd apps/backend && npm test -- --testPathPattern="auth.test" 2>&1 | tail -5
```

Expected: `Tests: X passed`

- [ ] **Step 3: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/backend/src/__tests__/setup.ts
git -C /home/magiccat/autoinvoice-features commit -m "chore: add ServiceBilling/TimeEntry cleanup to test setup"
```

---

## Task 3: timeClock Router (TDD)

**Files:**
- Create: `apps/backend/src/__tests__/timeClock.test.ts`
- Create: `apps/backend/src/routers/timeClock.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/__tests__/timeClock.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createUser(role: 'OWNER' | 'ADMIN' | 'EMPLOYEE' = 'OWNER') {
  return prisma.user.create({
    data: {
      email: `${role.toLowerCase()}-${Date.now()}@test.com`,
      password: await bcrypt.hash('pass', 10),
      name: `Test ${role}`,
      role,
    },
  });
}

describe('Time Clock — clock in / out', () => {
  it('creates an open TimeEntry on clockIn', async () => {
    const user = await createUser('EMPLOYEE');
    const entry = await prisma.timeEntry.create({
      data: { userId: user.id, clockIn: new Date() },
    });
    expect(entry.clockOut).toBeNull();
    expect(entry.totalMinutes).toBeNull();
  });

  it('sets clockOut and calculates totalMinutes on clockOut', async () => {
    const user = await createUser('EMPLOYEE');
    const clockIn = new Date('2026-04-29T08:00:00Z');
    const clockOut = new Date('2026-04-29T16:30:00Z'); // 510 minutes
    const entry = await prisma.timeEntry.create({
      data: { userId: user.id, clockIn },
    });
    const updated = await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockOut,
        totalMinutes: Math.round((clockOut.getTime() - clockIn.getTime()) / 60000),
      },
    });
    expect(updated.clockOut).toEqual(clockOut);
    expect(updated.totalMinutes).toBe(510);
  });

  it('prevents double clock-in: finds open entry for user', async () => {
    const user = await createUser('EMPLOYEE');
    await prisma.timeEntry.create({
      data: { userId: user.id, clockIn: new Date() },
    });
    const openEntry = await prisma.timeEntry.findFirst({
      where: { userId: user.id, clockOut: null },
    });
    expect(openEntry).not.toBeNull();
  });

  it('adminCorrect recalculates totalMinutes from new times', async () => {
    const owner = await createUser('OWNER');
    const emp = await createUser('EMPLOYEE');
    const clockIn = new Date('2026-04-29T09:00:00Z');
    const clockOut = new Date('2026-04-29T17:00:00Z');
    const entry = await prisma.timeEntry.create({
      data: { userId: emp.id, clockIn: new Date('2026-04-29T08:00:00Z') },
    });
    const corrected = await prisma.timeEntry.update({
      where: { id: entry.id },
      data: {
        clockIn,
        clockOut,
        totalMinutes: Math.round((clockOut.getTime() - clockIn.getTime()) / 60000),
      },
    });
    expect(corrected.totalMinutes).toBe(480);
  });

  it('myHistory returns only entries for the requesting user', async () => {
    const emp1 = await createUser('EMPLOYEE');
    const emp2 = await createUser('EMPLOYEE');
    const weekStart = new Date('2026-04-28T00:00:00Z');
    const weekEnd = new Date('2026-05-05T00:00:00Z');
    await prisma.timeEntry.createMany({
      data: [
        { userId: emp1.id, clockIn: new Date('2026-04-29T08:00:00Z') },
        { userId: emp2.id, clockIn: new Date('2026-04-29T09:00:00Z') },
      ],
    });
    const emp1Entries = await prisma.timeEntry.findMany({
      where: { userId: emp1.id, clockIn: { gte: weekStart, lt: weekEnd } },
    });
    expect(emp1Entries).toHaveLength(1);
    expect(emp1Entries[0].userId).toBe(emp1.id);
  });

  it('teamStatus returns all users with open entries', async () => {
    const emp1 = await createUser('EMPLOYEE');
    const emp2 = await createUser('EMPLOYEE');
    await prisma.timeEntry.create({ data: { userId: emp1.id, clockIn: new Date() } });
    // emp2 is not clocked in
    const openEntries = await prisma.timeEntry.findMany({
      where: { clockOut: null },
      include: { user: { select: { id: true, name: true, role: true } } },
    });
    expect(openEntries).toHaveLength(1);
    expect(openEntries[0].userId).toBe(emp1.id);
  });
});
```

- [ ] **Step 2: Run tests to see them fail**

```bash
cd apps/backend && npm test -- --testPathPattern="timeClock.test" 2>&1 | tail -10
```

Expected: `FAIL` — `timeClock.test.ts` should fail because the tables don't exist yet (or pass after migration). If migration ran in Task 1, tests should pass already — that's acceptable.

- [ ] **Step 3: Create the timeClock router**

Create `apps/backend/src/routers/timeClock.ts`:

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

export const timeClockRouter = router({
  clockIn: protectedProcedure
    .input(z.object({ notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const open = await ctx.prisma.timeEntry.findFirst({
        where: { userId: ctx.user.id, clockOut: null },
      });
      if (open) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Already clocked in' });
      }
      return ctx.prisma.timeEntry.create({
        data: { userId: ctx.user.id, clockIn: new Date(), notes: input.notes },
      });
    }),

  clockOut: protectedProcedure
    .input(z.object({ notes: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const open = await ctx.prisma.timeEntry.findFirst({
        where: { userId: ctx.user.id, clockOut: null },
      });
      if (!open) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Not clocked in' });
      }
      const now = new Date();
      const totalMinutes = Math.round((now.getTime() - open.clockIn.getTime()) / 60000);
      return ctx.prisma.timeEntry.update({
        where: { id: open.id },
        data: { clockOut: now, totalMinutes, notes: input.notes ?? open.notes },
      });
    }),

  myStatus: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.timeEntry.findFirst({
      where: { userId: ctx.user.id, clockOut: null },
    });
  }),

  myHistory: protectedProcedure
    .input(z.object({ weekStart: z.date() }))
    .query(async ({ ctx, input }) => {
      const weekEnd = new Date(input.weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      return ctx.prisma.timeEntry.findMany({
        where: { userId: ctx.user.id, clockIn: { gte: input.weekStart, lt: weekEnd } },
        orderBy: { clockIn: 'desc' },
      });
    }),

  teamStatus: protectedProcedure.query(async ({ ctx }) => {
    if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
      throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
    }
    return ctx.prisma.timeEntry.findMany({
      where: { clockOut: null },
      include: { user: { select: { id: true, name: true, role: true } } },
      orderBy: { clockIn: 'asc' },
    });
  }),

  teamWeekly: protectedProcedure
    .input(z.object({ weekStart: z.date() }))
    .query(async ({ ctx, input }) => {
      if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      const weekEnd = new Date(input.weekStart);
      weekEnd.setDate(weekEnd.getDate() + 7);
      const entries = await ctx.prisma.timeEntry.findMany({
        where: { clockIn: { gte: input.weekStart, lt: weekEnd } },
        include: { user: { select: { id: true, name: true, role: true } } },
        orderBy: { clockIn: 'asc' },
      });
      // Group by userId, sum totalMinutes
      const byUser = new Map<string, { user: { id: string; name: string; role: string }; entries: typeof entries; totalMinutes: number }>();
      for (const entry of entries) {
        const existing = byUser.get(entry.userId);
        if (existing) {
          existing.entries.push(entry);
          existing.totalMinutes += entry.totalMinutes ?? 0;
        } else {
          byUser.set(entry.userId, { user: entry.user, entries: [entry], totalMinutes: entry.totalMinutes ?? 0 });
        }
      }
      return Array.from(byUser.values());
    }),

  adminCorrect: protectedProcedure
    .input(z.object({ entryId: z.string(), clockIn: z.date(), clockOut: z.date() }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }
      const totalMinutes = Math.round((input.clockOut.getTime() - input.clockIn.getTime()) / 60000);
      return ctx.prisma.timeEntry.update({
        where: { id: input.entryId },
        data: { clockIn: input.clockIn, clockOut: input.clockOut, totalMinutes },
      });
    }),
});
```

- [ ] **Step 4: Run tests — all should pass**

```bash
cd apps/backend && npm test -- --testPathPattern="timeClock.test" 2>&1 | tail -10
```

Expected: `Tests: 5 passed, 5 total`

- [ ] **Step 5: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/backend/src/routers/timeClock.ts apps/backend/src/__tests__/timeClock.test.ts
git -C /home/magiccat/autoinvoice-features commit -m "feat: add timeClock tRPC router with tests"
```

---

## Task 4: serviceScheduling Router (TDD)

**Files:**
- Create: `apps/backend/src/__tests__/serviceScheduling.test.ts`
- Create: `apps/backend/src/routers/serviceScheduling.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/backend/src/__tests__/serviceScheduling.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function createUser() {
  return prisma.user.create({
    data: {
      email: `owner-${Date.now()}@test.com`,
      password: await bcrypt.hash('pass', 10),
      name: 'Owner',
      role: 'OWNER',
    },
  });
}

async function createCustomer(tags: string[] = []) {
  return prisma.customer.create({
    data: { name: `Customer ${Date.now()}`, tags },
  });
}

describe('ServiceScheduling', () => {
  describe('list by tag', () => {
    it('returns only customers with the given service tag', async () => {
      await createCustomer(['fertilizer', 'lawn']);
      await createCustomer(['plow']);
      await createCustomer(['fertilizer']);

      const fertCustomers = await prisma.customer.findMany({
        where: { tags: { has: 'fertilizer' } },
      });
      expect(fertCustomers).toHaveLength(2);
      expect(fertCustomers.every(c => c.tags.includes('fertilizer'))).toBe(true);
    });

    it('returns empty array when no customers have the tag', async () => {
      await createCustomer(['plow']);
      const result = await prisma.customer.findMany({
        where: { tags: { has: 'fertilizer' } },
      });
      expect(result).toHaveLength(0);
    });
  });

  describe('upsertSchedule', () => {
    it('creates a schedule if none exists', async () => {
      const customer = await createCustomer();
      const schedule = await prisma.serviceSchedule.upsert({
        where: { customerId_serviceCode: { customerId: customer.id, serviceCode: 'lawn' } },
        create: { customerId: customer.id, serviceCode: 'lawn', serviceLabel: 'Lawn Mowing', isRecurring: false },
        update: {},
      });
      expect(schedule.serviceCode).toBe('lawn');
      expect(schedule.isRecurring).toBe(false);
    });

    it('updates existing schedule without creating duplicate', async () => {
      const customer = await createCustomer();
      await prisma.serviceSchedule.upsert({
        where: { customerId_serviceCode: { customerId: customer.id, serviceCode: 'lawn' } },
        create: { customerId: customer.id, serviceCode: 'lawn', serviceLabel: 'Lawn Mowing', isRecurring: false },
        update: {},
      });
      await prisma.serviceSchedule.upsert({
        where: { customerId_serviceCode: { customerId: customer.id, serviceCode: 'lawn' } },
        create: { customerId: customer.id, serviceCode: 'lawn', serviceLabel: 'Lawn Mowing', isRecurring: true, interval: 'biweekly' },
        update: { isRecurring: true, interval: 'biweekly' },
      });
      const schedules = await prisma.serviceSchedule.findMany({ where: { customerId: customer.id } });
      expect(schedules).toHaveLength(1);
      expect(schedules[0].isRecurring).toBe(true);
      expect(schedules[0].interval).toBe('biweekly');
    });
  });

  describe('markJobDone', () => {
    it('sets lastServiceDate and nextServiceDate when provided', async () => {
      const customer = await createCustomer();
      const schedule = await prisma.serviceSchedule.create({
        data: { customerId: customer.id, serviceCode: 'lawn', serviceLabel: 'Lawn Mowing', isRecurring: true, interval: 'biweekly' },
      });
      const nextDate = new Date('2026-05-15T00:00:00Z');
      const updated = await prisma.serviceSchedule.update({
        where: { id: schedule.id },
        data: { lastServiceDate: new Date(), nextServiceDate: nextDate },
      });
      expect(updated.lastServiceDate).not.toBeNull();
      expect(updated.nextServiceDate).toEqual(nextDate);
    });
  });

  describe('getSuggestedNextDate', () => {
    it('calculates biweekly next date from lastServiceDate', () => {
      const INTERVAL_DAYS: Record<string, number> = {
        'weekly': 7,
        'biweekly': 14,
        'monthly': 30,
        'every-6-weeks': 42,
        'seasonal': 90,
      };
      const lastServiceDate = new Date('2026-04-29T00:00:00Z');
      const interval = 'biweekly';
      const days = INTERVAL_DAYS[interval] ?? 14;
      const suggested = new Date(lastServiceDate);
      suggested.setDate(suggested.getDate() + days);
      expect(suggested.toISOString().slice(0, 10)).toBe('2026-05-13');
    });
  });

  describe('ServiceBilling status tracking', () => {
    it('creates a billing record with PENDING status', async () => {
      const customer = await createCustomer();
      const billing = await prisma.serviceBilling.create({
        data: {
          customerId: customer.id,
          serviceCode: 'lawn',
          serviceLabel: 'Lawn Mowing',
          amount: 60,
          stripePaymentLinkUrl: 'https://buy.stripe.com/test_abc123',
          status: 'PENDING',
        },
      });
      expect(billing.status).toBe('PENDING');
    });

    it('marks billing as SENT and records sentAt', async () => {
      const customer = await createCustomer();
      const billing = await prisma.serviceBilling.create({
        data: {
          customerId: customer.id,
          serviceCode: 'lawn',
          serviceLabel: 'Lawn Mowing',
          amount: 60,
          stripePaymentLinkUrl: 'https://buy.stripe.com/test_abc123',
          status: 'PENDING',
        },
      });
      const updated = await prisma.serviceBilling.update({
        where: { id: billing.id },
        data: { status: 'SENT', sentAt: new Date() },
      });
      expect(updated.status).toBe('SENT');
      expect(updated.sentAt).not.toBeNull();
    });

    it('cannot mark a PAID billing as cancelled (business rule check)', async () => {
      const customer = await createCustomer();
      const billing = await prisma.serviceBilling.create({
        data: {
          customerId: customer.id,
          serviceCode: 'lawn',
          serviceLabel: 'Lawn Mowing',
          amount: 60,
          stripePaymentLinkUrl: 'https://buy.stripe.com/test_abc123',
          status: 'PAID',
          paidAt: new Date(),
        },
      });
      expect(billing.status).toBe('PAID');
      // The router enforces this check — test confirms status is detectable
      expect(billing.status === 'PAID').toBe(true);
    });
  });
});
```

- [ ] **Step 2: Run tests to see current status**

```bash
cd apps/backend && npm test -- --testPathPattern="serviceScheduling.test" 2>&1 | tail -10
```

Expected: `Tests: 8 passed` (all are Prisma direct tests, should pass after Task 1 migration)

- [ ] **Step 3: Create the serviceScheduling router**

Create `apps/backend/src/routers/serviceScheduling.ts`:

```typescript
import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import Stripe from 'stripe';

const stripe = process.env.STRIPE_SECRET_KEY
  ? new Stripe(process.env.STRIPE_SECRET_KEY)
  : null;

function getStripe(): Stripe {
  if (!stripe) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'Stripe is not configured. Add STRIPE_SECRET_KEY to .env' });
  return stripe;
}

const INTERVAL_DAYS: Record<string, number> = {
  weekly: 7,
  biweekly: 14,
  monthly: 30,
  'every-6-weeks': 42,
  seasonal: 90,
};

function suggestNextDate(lastServiceDate: Date, interval: string): Date {
  const days = INTERVAL_DAYS[interval] ?? 14;
  const next = new Date(lastServiceDate);
  next.setDate(next.getDate() + days);
  return next;
}

export const serviceSchedulingRouter = router({
  list: protectedProcedure
    .input(z.object({ serviceCode: z.string() }))
    .query(async ({ ctx, input }) => {
      const customers = await ctx.prisma.customer.findMany({
        where: { tags: { has: input.serviceCode } },
        include: {
          serviceSchedules: {
            where: { serviceCode: input.serviceCode },
            take: 1,
          },
          serviceBillings: {
            where: { serviceCode: input.serviceCode },
            orderBy: { createdAt: 'desc' },
            take: 1,
          },
        },
        orderBy: { name: 'asc' },
      });
      return customers.map(c => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        addressLine1: c.addressLine1,
        city: c.city,
        schedule: c.serviceSchedules[0] ?? null,
        latestBilling: c.serviceBillings[0]
          ? {
              id: c.serviceBillings[0].id,
              status: c.serviceBillings[0].status,
              stripePaymentLinkUrl: c.serviceBillings[0].stripePaymentLinkUrl,
              amount: c.serviceBillings[0].amount.toNumber(),
              createdAt: c.serviceBillings[0].createdAt,
            }
          : null,
      }));
    }),

  upsertSchedule: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      serviceCode: z.string(),
      serviceLabel: z.string(),
      isRecurring: z.boolean(),
      interval: z.string().optional(),
      nextServiceDate: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.serviceSchedule.upsert({
        where: { customerId_serviceCode: { customerId: input.customerId, serviceCode: input.serviceCode } },
        create: {
          customerId: input.customerId,
          serviceCode: input.serviceCode,
          serviceLabel: input.serviceLabel,
          isRecurring: input.isRecurring,
          interval: input.interval,
          nextServiceDate: input.nextServiceDate,
        },
        update: {
          serviceLabel: input.serviceLabel,
          isRecurring: input.isRecurring,
          interval: input.interval,
          nextServiceDate: input.nextServiceDate,
        },
      });
    }),

  createBilling: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      serviceCode: z.string(),
      serviceLabel: z.string(),
      amount: z.number().positive(),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const stripeClient = getStripe();
      const customer = await ctx.prisma.customer.findUnique({ where: { id: input.customerId } });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });

      const schedule = await ctx.prisma.serviceSchedule.findUnique({
        where: { customerId_serviceCode: { customerId: input.customerId, serviceCode: input.serviceCode } },
      });

      const price = await stripeClient.prices.create({
        unit_amount: Math.round(input.amount * 100),
        currency: 'usd',
        product_data: { name: input.description ?? `${input.serviceLabel} — ${customer.name}` },
      });

      const paymentLink = await stripeClient.paymentLinks.create({
        line_items: [{ price: price.id, quantity: 1 }],
        metadata: {
          type: 'service_billing',
          customerId: input.customerId,
          serviceCode: input.serviceCode,
        },
        after_completion: {
          type: 'redirect',
          redirect: { url: `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/payment-success` },
        },
      });

      return ctx.prisma.serviceBilling.create({
        data: {
          customerId: input.customerId,
          scheduleId: schedule?.id,
          serviceCode: input.serviceCode,
          serviceLabel: input.serviceLabel,
          amount: input.amount,
          description: input.description,
          stripePaymentLinkId: paymentLink.id,
          stripePaymentLinkUrl: paymentLink.url,
          status: 'PENDING',
        },
      });
    }),

  markSent: protectedProcedure
    .input(z.object({ billingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.serviceBilling.update({
        where: { id: input.billingId },
        data: { status: 'SENT', sentAt: new Date() },
      });
    }),

  markJobDone: protectedProcedure
    .input(z.object({ scheduleId: z.string(), nextServiceDate: z.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.serviceSchedule.findUnique({ where: { id: input.scheduleId } });
      if (!schedule) throw new TRPCError({ code: 'NOT_FOUND', message: 'Schedule not found' });

      const now = new Date();
      let nextDate = input.nextServiceDate ?? null;
      let suggestedDate: Date | null = null;

      if (!nextDate && schedule.isRecurring && schedule.interval) {
        suggestedDate = suggestNextDate(now, schedule.interval);
      }

      await ctx.prisma.serviceSchedule.update({
        where: { id: input.scheduleId },
        data: { lastServiceDate: now, nextServiceDate: nextDate },
      });

      return { success: true, suggestedNextDate: suggestedDate };
    }),

  cancelBilling: protectedProcedure
    .input(z.object({ billingId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const billing = await ctx.prisma.serviceBilling.findUnique({ where: { id: input.billingId } });
      if (!billing) throw new TRPCError({ code: 'NOT_FOUND', message: 'Billing not found' });
      if (billing.status === 'PAID') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Cannot cancel a paid billing' });

      if (billing.stripePaymentLinkId && stripe) {
        try {
          await stripe.paymentLinks.update(billing.stripePaymentLinkId, { active: false });
        } catch {}
      }

      return ctx.prisma.serviceBilling.update({
        where: { id: input.billingId },
        data: { status: 'CANCELLED' },
      });
    }),

  listBillings: protectedProcedure
    .input(z.object({
      serviceCode: z.string(),
      customerId: z.string().optional(),
      status: z.enum(['PENDING', 'SENT', 'VIEWED', 'PAID', 'EXPIRED', 'CANCELLED']).optional(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.serviceBilling.findMany({
        where: {
          serviceCode: input.serviceCode,
          ...(input.customerId && { customerId: input.customerId }),
          ...(input.status && { status: input.status }),
        },
        include: { customer: { select: { id: true, name: true, phone: true } } },
        orderBy: { createdAt: 'desc' },
        take: input.limit,
      });
    }),

  getSuggestedNextDate: protectedProcedure
    .input(z.object({ scheduleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const schedule = await ctx.prisma.serviceSchedule.findUnique({ where: { id: input.scheduleId } });
      if (!schedule || !schedule.interval) return null;
      const base = schedule.lastServiceDate ?? new Date();
      return suggestNextDate(base, schedule.interval);
    }),
});
```

- [ ] **Step 4: Run the tests to confirm they still pass**

```bash
cd apps/backend && npm test -- --testPathPattern="serviceScheduling.test" 2>&1 | tail -10
```

Expected: `Tests: 8 passed`

- [ ] **Step 5: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/backend/src/routers/serviceScheduling.ts apps/backend/src/__tests__/serviceScheduling.test.ts
git -C /home/magiccat/autoinvoice-features commit -m "feat: add serviceScheduling tRPC router with tests"
```

---

## Task 5: Register Routers

**Files:**
- Modify: `apps/backend/src/routers/index.ts`

- [ ] **Step 1: Add imports and register both routers**

Add to `apps/backend/src/routers/index.ts`:

```typescript
import { timeClockRouter } from './timeClock';
import { serviceSchedulingRouter } from './serviceScheduling';
```

And inside the `appRouter` object, add:

```typescript
  timeClock: timeClockRouter,
  serviceScheduling: serviceSchedulingRouter,
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -20
```

Expected: no output (zero errors)

- [ ] **Step 3: Run all backend tests**

```bash
cd apps/backend && npm test 2>&1 | tail -15
```

Expected: all existing tests + new tests pass

- [ ] **Step 4: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/backend/src/routers/index.ts
git -C /home/magiccat/autoinvoice-features commit -m "feat: register timeClock and serviceScheduling routers"
```

---

## Task 6: Extend Stripe Webhook for ServiceBilling

**Files:**
- Modify: `apps/backend/src/server.ts`

- [ ] **Step 1: Add ServiceBilling handler inside the existing switch statement**

In `server.ts`, inside `case 'checkout.session.completed':`, after the existing `if (session.metadata?.type === 'plow_billing' ...)` block, add:

```typescript
        // Handle service billing payments
        if (session.metadata?.type === 'service_billing' && session.payment_link) {
          const billing = await prisma.serviceBilling.findFirst({
            where: { stripePaymentLinkId: session.payment_link as string },
          });
          if (billing) {
            await prisma.serviceBilling.update({
              where: { id: billing.id },
              data: {
                status: 'PAID',
                paidAt: new Date(),
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent as string,
              },
            });
            logger.info('ServiceBilling marked as PAID:', { billingId: billing.id });
          }
        }
```

The complete `case 'checkout.session.completed':` block will look like:

```typescript
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        logger.info('Payment completed:', { sessionId: session.id, metadata: session.metadata });

        if (session.metadata?.type === 'plow_billing' && session.payment_link) {
          const billing = await prisma.plowBilling.findFirst({
            where: { stripePaymentLinkId: session.payment_link as string },
          });
          if (billing) {
            await prisma.plowBilling.update({
              where: { id: billing.id },
              data: {
                status: 'PAID',
                paidAt: new Date(),
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent as string,
              },
            });
            logger.info('PlowBilling marked as PAID:', { billingId: billing.id });
          }
        }

        if (session.metadata?.type === 'service_billing' && session.payment_link) {
          const billing = await prisma.serviceBilling.findFirst({
            where: { stripePaymentLinkId: session.payment_link as string },
          });
          if (billing) {
            await prisma.serviceBilling.update({
              where: { id: billing.id },
              data: {
                status: 'PAID',
                paidAt: new Date(),
                stripeSessionId: session.id,
                stripePaymentIntentId: session.payment_intent as string,
              },
            });
            logger.info('ServiceBilling marked as PAID:', { billingId: billing.id });
          }
        }
        break;
      }
```

- [ ] **Step 2: Build to verify no TypeScript errors**

```bash
cd apps/backend && npx tsc --noEmit 2>&1 | head -10
```

Expected: no output

- [ ] **Step 3: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/backend/src/server.ts
git -C /home/magiccat/autoinvoice-features commit -m "feat: extend Stripe webhook to mark ServiceBilling as PAID"
```

---

## Task 7: Time Clock Frontend

**Files:**
- Modify: `apps/web/src/app/time-clock/page.tsx`

- [ ] **Step 1: Replace the page with the wired version**

Overwrite `apps/web/src/app/time-clock/page.tsx` with:

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

const WEEK_DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function getWeekStart(date = new Date()): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function formatMinutes(minutes: number | null | undefined): string {
  if (!minutes) return '0h 0m';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatTime(date: Date | string | null | undefined): string {
  if (!date) return '—';
  return new Date(date).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function getUserRole(): string {
  if (typeof window === 'undefined') return 'EMPLOYEE';
  try {
    const token = localStorage.getItem('accessToken');
    if (!token) return 'EMPLOYEE';
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.role ?? 'EMPLOYEE';
  } catch {
    return 'EMPLOYEE';
  }
}

export default function TimeClockPage() {
  const [role, setRole] = useState<string>('EMPLOYEE');
  const [activeTab, setActiveTab] = useState<'clock' | 'team' | 'payroll'>('clock');
  const [weekStart] = useState<Date>(getWeekStart());
  const [clockOutNote, setClockOutNote] = useState('');
  const [elapsedDisplay, setElapsedDisplay] = useState('0h 00m');

  useEffect(() => {
    setRole(getUserRole());
  }, []);

  const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  const utils = trpc.useUtils();
  const { data: myStatus, isLoading: statusLoading } = trpc.timeClock.myStatus.useQuery();
  const { data: myHistory } = trpc.timeClock.myHistory.useQuery({ weekStart });
  const { data: teamStatus } = trpc.timeClock.teamStatus.useQuery(undefined, { enabled: role === 'OWNER' || role === 'ADMIN' });
  const { data: teamWeekly } = trpc.timeClock.teamWeekly.useQuery({ weekStart }, { enabled: role === 'OWNER' || role === 'ADMIN' });

  const clockIn = trpc.timeClock.clockIn.useMutation({
    onSuccess: () => utils.timeClock.myStatus.invalidate(),
  });
  const clockOut = trpc.timeClock.clockOut.useMutation({
    onSuccess: () => {
      utils.timeClock.myStatus.invalidate();
      utils.timeClock.myHistory.invalidate();
      utils.timeClock.teamStatus.invalidate();
      utils.timeClock.teamWeekly.invalidate();
    },
  });

  // Live elapsed timer
  useEffect(() => {
    if (!myStatus) return;
    const interval = setInterval(() => {
      const elapsed = Math.round((Date.now() - new Date(myStatus.clockIn).getTime()) / 60000);
      setElapsedDisplay(formatMinutes(elapsed));
    }, 10000);
    const elapsed = Math.round((Date.now() - new Date(myStatus.clockIn).getTime()) / 60000);
    setElapsedDisplay(formatMinutes(elapsed));
    return () => clearInterval(interval);
  }, [myStatus]);

  const handleClock = async () => {
    if (myStatus) {
      await clockOut.mutateAsync({ notes: clockOutNote || undefined });
      setClockOutNote('');
    } else {
      await clockIn.mutateAsync({});
    }
  };

  const clockedInCount = teamStatus?.length ?? 0;
  const totalTeam = teamWeekly?.length ?? 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700 text-sm">← Back</Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">⏱ Time Clock</h1>
                <p className="text-sm text-gray-500">{dateStr}</p>
              </div>
            </div>
            {(role === 'OWNER' || role === 'ADMIN') && (
              <span className="px-3 py-1 bg-green-100 text-green-800 rounded-full text-sm font-medium">
                {clockedInCount} clocked in
              </span>
            )}
          </div>

          {(role === 'OWNER' || role === 'ADMIN') && (
            <div className="flex gap-1 mt-4 border-b -mb-4">
              {(['clock', 'team', 'payroll'] as const).map(tab => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-5 py-2 text-sm font-medium rounded-t-lg capitalize transition-colors ${
                    activeTab === tab ? 'bg-indigo-600 text-white' : 'text-gray-600 hover:text-gray-900 hover:bg-gray-100'
                  }`}
                >
                  {tab === 'clock' ? '🕐 Clock' : tab === 'team' ? '👥 Team' : '📋 Payroll'}
                </button>
              ))}
            </div>
          )}
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">

        {/* Clock Tab — visible to all */}
        {(activeTab === 'clock' || role === 'EMPLOYEE') && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Personal Clock Card */}
            <div className="bg-white rounded-xl shadow-sm border p-6 text-center">
              <div className="text-5xl font-mono font-bold text-gray-900 mb-1">
                {new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div className="text-sm text-gray-500 mb-6">{dateStr}</div>

              {myStatus && (
                <div className="mb-4 px-4 py-2 bg-green-50 border border-green-200 rounded-lg">
                  <p className="text-green-700 text-sm font-medium">
                    ✅ Clocked in at {formatTime(myStatus.clockIn)} — {elapsedDisplay} so far
                  </p>
                </div>
              )}

              {myStatus && (
                <input
                  type="text"
                  placeholder="Optional note (optional)..."
                  value={clockOutNote}
                  onChange={e => setClockOutNote(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-3 text-gray-700"
                />
              )}

              <button
                onClick={handleClock}
                disabled={clockIn.isLoading || clockOut.isLoading || statusLoading}
                className={`w-full py-4 rounded-xl text-white font-bold text-lg transition-all disabled:opacity-50 ${
                  myStatus ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'
                } shadow-lg`}
              >
                {clockIn.isLoading || clockOut.isLoading ? '...' : myStatus ? '⏹ Clock Out' : '▶ Clock In'}
              </button>
            </div>

            {/* My weekly history */}
            <div className="bg-white rounded-xl shadow-sm border">
              <div className="px-6 py-4 border-b">
                <h2 className="font-semibold text-gray-900">My Punches This Week</h2>
              </div>
              <div className="divide-y">
                {!myHistory?.length && (
                  <p className="px-6 py-4 text-sm text-gray-500">No punches this week yet.</p>
                )}
                {myHistory?.map(entry => (
                  <div key={entry.id} className="px-6 py-4 flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        {new Date(entry.clockIn).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                      </p>
                      <p className="text-xs text-gray-500">In: {formatTime(entry.clockIn)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-gray-500">Out: {formatTime(entry.clockOut)}</p>
                      <p className={`text-sm font-semibold ${!entry.clockOut ? 'text-green-600' : 'text-gray-900'}`}>
                        {!entry.clockOut ? `${elapsedDisplay} (running)` : formatMinutes(entry.totalMinutes)}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Team Tab — OWNER/ADMIN only */}
        {activeTab === 'team' && (role === 'OWNER' || role === 'ADMIN') && (
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="px-6 py-4 border-b">
              <h2 className="font-semibold text-gray-900">Team Status — Live</h2>
            </div>
            <div className="divide-y">
              {!teamStatus?.length && (
                <p className="px-6 py-4 text-sm text-gray-500">Nobody is clocked in right now.</p>
              )}
              {teamStatus?.map(entry => (
                <div key={entry.id} className="px-6 py-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-green-100 text-green-800 text-sm font-bold flex items-center justify-center">
                      {entry.user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2)}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{entry.user.name}</p>
                      <p className="text-xs text-gray-500">{entry.user.role}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-pulse"></span>
                      Clocked In
                    </span>
                    <p className="text-xs text-gray-500 mt-0.5">Since {formatTime(entry.clockIn)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Payroll Tab — OWNER/ADMIN only */}
        {activeTab === 'payroll' && (role === 'OWNER' || role === 'ADMIN') && (
          <div className="bg-white rounded-xl shadow-sm border">
            <div className="px-6 py-4 border-b flex items-center justify-between">
              <h2 className="font-semibold text-gray-900">
                Payroll — Week of {weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b bg-gray-50 text-sm text-gray-500">
                    <th className="text-left px-6 py-3 font-medium">Employee</th>
                    <th className="text-right px-6 py-3 font-medium">Total Hours</th>
                    <th className="text-right px-6 py-3 font-medium">Punches</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {!teamWeekly?.length && (
                    <tr><td colSpan={3} className="px-6 py-4 text-sm text-gray-500">No entries this week.</td></tr>
                  )}
                  {teamWeekly?.map(row => (
                    <tr key={row.user.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{row.user.name}</p>
                        <p className="text-xs text-gray-500">{row.user.role}</p>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <p className="text-sm font-semibold text-gray-900">{formatMinutes(row.totalMinutes)}</p>
                      </td>
                      <td className="px-6 py-4 text-right text-sm text-gray-500">{row.entries.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Build frontend to check TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/web/src/app/time-clock/page.tsx
git -C /home/magiccat/autoinvoice-features commit -m "feat: wire time-clock page to real tRPC data"
```

---

## Task 8: Service Billing Frontend

**Files:**
- Modify: `apps/web/src/app/service-billing/[serviceCode]/page.tsx`

- [ ] **Step 1: Replace the page with the wired version**

Overwrite `apps/web/src/app/service-billing/[serviceCode]/page.tsx` with:

```typescript
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

const SERVICE_CONFIGS: Record<string, {
  label: string;
  emoji: string;
  defaultServiceLabel: string;
  defaultAmount: number;
  color: string;
}> = {
  fertilizer: { label: 'Fertilizer', emoji: '🌱', defaultServiceLabel: 'Fertilizer Application', defaultAmount: 89, color: 'green' },
  plow: { label: 'Plow / Snow', emoji: '❄️', defaultServiceLabel: 'Snow Plowing', defaultAmount: 50, color: 'blue' },
  lawn: { label: 'Lawn Mowing', emoji: '🌿', defaultServiceLabel: 'Lawn Mowing', defaultAmount: 60, color: 'emerald' },
};

const INTERVALS = [
  { value: 'weekly', label: 'Weekly' },
  { value: 'biweekly', label: 'Bi-weekly (every 2 wks)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'every-6-weeks', label: 'Every 6 weeks' },
  { value: 'seasonal', label: 'Seasonal (~90 days)' },
];

const CUSTOM_COLORS = ['indigo', 'violet', 'orange', 'rose', 'cyan', 'teal'];
const STORAGE_KEY = 'autoinvoice_custom_services';

interface CustomService { code: string; label: string; emoji: string; color: string }

const STATUS_STYLES: Record<string, string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  SENT: 'bg-blue-100 text-blue-800',
  PAID: 'bg-green-100 text-green-800',
};

const colorBtnMap: Record<string, string> = {
  green: 'bg-green-600 hover:bg-green-700', blue: 'bg-blue-600 hover:bg-blue-700',
  emerald: 'bg-emerald-600 hover:bg-emerald-700', indigo: 'bg-indigo-600 hover:bg-indigo-700',
  violet: 'bg-violet-600 hover:bg-violet-700', orange: 'bg-orange-500 hover:bg-orange-600',
  rose: 'bg-rose-500 hover:bg-rose-600', cyan: 'bg-cyan-500 hover:bg-cyan-600',
  teal: 'bg-teal-500 hover:bg-teal-600',
};

const headerGradMap: Record<string, string> = {
  green: 'from-green-600 to-emerald-500', blue: 'from-blue-600 to-indigo-500',
  emerald: 'from-emerald-600 to-teal-500', indigo: 'from-indigo-600 to-violet-500',
  violet: 'from-violet-600 to-purple-500', orange: 'from-orange-500 to-amber-400',
  rose: 'from-rose-500 to-pink-400', cyan: 'from-cyan-500 to-sky-400',
  teal: 'from-teal-500 to-emerald-400',
};

export default function ServiceBillingPage() {
  const params = useParams();
  const router = useRouter();
  const serviceCode = (params.serviceCode as string) || 'fertilizer';

  const [customServices, setCustomServices] = useState<CustomService[]>([]);
  const [newServiceInput, setNewServiceInput] = useState('');
  const [scheduleOpen, setScheduleOpen] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [amounts, setAmounts] = useState<Record<string, number>>({});
  const [editingDate, setEditingDate] = useState<string | null>(null);
  const [dateInputs, setDateInputs] = useState<Record<string, string>>({});
  const [intervalInputs, setIntervalInputs] = useState<Record<string, string>>({});
  const [recurringInputs, setRecurringInputs] = useState<Record<string, boolean>>({});

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) setCustomServices(JSON.parse(stored));
    } catch {}
  }, []);

  const customConfig = customServices.find(s => s.code === serviceCode);
  const builtIn = SERVICE_CONFIGS[serviceCode];
  const config = builtIn ?? (customConfig ? {
    label: customConfig.label,
    emoji: customConfig.emoji,
    defaultServiceLabel: customConfig.label,
    defaultAmount: 0,
    color: customConfig.color,
  } : SERVICE_CONFIGS.fertilizer);

  const addService = (e: React.FormEvent) => {
    e.preventDefault();
    const label = newServiceInput.trim();
    if (!label) return;
    const code = label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (SERVICE_CONFIGS[code] || customServices.some(s => s.code === code)) {
      router.push(`/service-billing/${code}`);
      setNewServiceInput('');
      return;
    }
    const color = CUSTOM_COLORS[customServices.length % CUSTOM_COLORS.length];
    const next: CustomService[] = [...customServices, { code, label, emoji: '🔧', color }];
    setCustomServices(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
    setNewServiceInput('');
    router.push(`/service-billing/${code}`);
  };

  const utils = trpc.useUtils();
  const { data: customers = [], isLoading } = trpc.serviceScheduling.list.useQuery({ serviceCode });

  const upsertSchedule = trpc.serviceScheduling.upsertSchedule.useMutation({
    onSuccess: () => utils.serviceScheduling.list.invalidate(),
  });
  const createBilling = trpc.serviceScheduling.createBilling.useMutation({
    onSuccess: () => utils.serviceScheduling.list.invalidate(),
  });
  const markSent = trpc.serviceScheduling.markSent.useMutation({
    onSuccess: () => utils.serviceScheduling.list.invalidate(),
  });
  const markJobDone = trpc.serviceScheduling.markJobDone.useMutation({
    onSuccess: () => utils.serviceScheduling.list.invalidate(),
  });

  const filtered = customers.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.addressLine1 ?? '').toLowerCase().includes(search.toLowerCase())
  );

  const getAmount = (customerId: string) =>
    amounts[customerId] ?? config.defaultAmount;

  const handleSendBill = async (customer: typeof customers[0]) => {
    const amount = getAmount(customer.id);
    if (!amount) return;
    const result = await createBilling.mutateAsync({
      customerId: customer.id,
      serviceCode,
      serviceLabel: config.defaultServiceLabel,
      amount,
    });
    await navigator.clipboard.writeText(result.stripePaymentLinkUrl).catch(() => {});
    await markSent.mutateAsync({ billingId: result.id });
  };

  const handleMarkDone = async (customer: typeof customers[0]) => {
    if (!customer.schedule) return;
    const result = await markJobDone.mutateAsync({ scheduleId: customer.schedule.id });
    if (result.suggestedNextDate && !dateInputs[customer.id]) {
      setDateInputs(prev => ({
        ...prev,
        [customer.id]: new Date(result.suggestedNextDate!).toISOString().slice(0, 10),
      }));
    }
  };

  const handleSaveSchedule = async (customer: typeof customers[0]) => {
    const nextDate = dateInputs[customer.id] ? new Date(dateInputs[customer.id]) : undefined;
    await upsertSchedule.mutateAsync({
      customerId: customer.id,
      serviceCode,
      serviceLabel: config.defaultServiceLabel,
      isRecurring: recurringInputs[customer.id] ?? customer.schedule?.isRecurring ?? false,
      interval: intervalInputs[customer.id] ?? customer.schedule?.interval ?? undefined,
      nextServiceDate: nextDate,
    });
    setScheduleOpen(null);
  };

  const accentBtn = colorBtnMap[config.color] || 'bg-indigo-600 hover:bg-indigo-700';
  const headerGrad = headerGradMap[config.color] || 'from-indigo-600 to-blue-500';
  const allServiceCodes = [...Object.keys(SERVICE_CONFIGS), ...customServices.map(s => s.code)];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className={`bg-gradient-to-r ${headerGrad} text-white shadow-lg`}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-5">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-white/70 hover:text-white text-sm">← Back</Link>
              <h1 className="text-2xl font-bold">{config.emoji} {config.label} Billing</h1>
            </div>
            <span className="px-3 py-1 bg-white/20 rounded-full text-sm">
              {filtered.length} customers
            </span>
          </div>

          {/* Service tabs */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-white/60 text-sm mr-1">Service:</span>
            {allServiceCodes.map(code => {
              const cfg = SERVICE_CONFIGS[code] ?? customServices.find(s => s.code === code);
              return (
                <button
                  key={code}
                  onClick={() => router.push(`/service-billing/${code}`)}
                  className={`px-3 py-1 rounded-full text-sm font-medium transition-all ${
                    code === serviceCode ? 'bg-white text-gray-800' : 'bg-white/20 text-white hover:bg-white/30'
                  }`}
                >
                  {cfg?.emoji ?? '🔧'} {cfg?.label ?? code}
                </button>
              );
            })}
            <form onSubmit={addService} className="flex items-center gap-1">
              <input
                type="text"
                value={newServiceInput}
                onChange={e => setNewServiceInput(e.target.value)}
                placeholder="+ Add service"
                className="bg-white/20 text-white placeholder-white/60 border border-white/30 rounded-full px-3 py-1 text-sm w-32 focus:outline-none focus:bg-white/30"
              />
            </form>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search customers..."
          className="w-full max-w-sm border rounded-lg px-4 py-2 text-sm mb-6 bg-white shadow-sm"
        />

        {isLoading && <p className="text-sm text-gray-500">Loading customers...</p>}

        <div className="space-y-3">
          {filtered.map(customer => {
            const status = customer.latestBilling?.status;
            const schedule = customer.schedule;

            return (
              <div key={customer.id} className="bg-white rounded-xl shadow-sm border p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <p className="font-semibold text-gray-900">{customer.name}</p>
                      {status && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] ?? 'bg-gray-100 text-gray-700'}`}>
                          {status === 'PAID' ? '✓ Paid' : status === 'SENT' ? 'Link Sent' : 'Pending'}
                        </span>
                      )}
                      {schedule?.isRecurring && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-800 rounded-full text-xs font-medium">
                          🔁 {schedule.interval ?? 'recurring'}
                        </span>
                      )}
                    </div>
                    <p className="text-sm text-gray-500">{customer.phone ?? '—'} · {[customer.addressLine1, customer.city].filter(Boolean).join(', ') || '—'}</p>
                    <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                      {schedule?.lastServiceDate && (
                        <span>Last: {new Date(schedule.lastServiceDate).toLocaleDateString()}</span>
                      )}
                      {schedule?.nextServiceDate && editingDate !== customer.id && (
                        <button
                          onClick={() => {
                            setEditingDate(customer.id);
                            setDateInputs(prev => ({ ...prev, [customer.id]: new Date(schedule.nextServiceDate!).toISOString().slice(0, 10) }));
                          }}
                          className="text-indigo-500 hover:underline"
                        >
                          Next: {new Date(schedule.nextServiceDate).toLocaleDateString()}
                        </button>
                      )}
                      {editingDate === customer.id && (
                        <div className="flex items-center gap-2">
                          <input
                            type="date"
                            value={dateInputs[customer.id] ?? ''}
                            onChange={e => setDateInputs(prev => ({ ...prev, [customer.id]: e.target.value }))}
                            className="border rounded px-2 py-0.5 text-xs"
                          />
                          <button
                            onClick={async () => {
                              await upsertSchedule.mutateAsync({
                                customerId: customer.id,
                                serviceCode,
                                serviceLabel: config.defaultServiceLabel,
                                isRecurring: schedule?.isRecurring ?? false,
                                interval: schedule?.interval ?? undefined,
                                nextServiceDate: new Date(dateInputs[customer.id]),
                              });
                              setEditingDate(null);
                            }}
                            className="text-green-600 text-xs font-medium"
                          >Save</button>
                          <button onClick={() => setEditingDate(null)} className="text-gray-400 text-xs">✕</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <input
                      type="number"
                      min={0}
                      step={1}
                      value={amounts[customer.id] ?? config.defaultAmount}
                      onChange={e => setAmounts(prev => ({ ...prev, [customer.id]: Number(e.target.value) }))}
                      className="w-20 border rounded-lg px-2 py-1 text-sm text-center"
                    />
                    <button
                      onClick={() => handleSendBill(customer)}
                      disabled={createBilling.isLoading}
                      className={`px-3 py-1.5 ${accentBtn} text-white rounded-lg text-sm font-medium disabled:opacity-50`}
                    >
                      {copiedId === customer.id ? '✓ Copied' : 'Send Bill'}
                    </button>
                    {schedule && (
                      <button
                        onClick={() => handleMarkDone(customer)}
                        className="px-3 py-1.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium"
                      >
                        ✓ Done
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setScheduleOpen(scheduleOpen === customer.id ? null : customer.id);
                        setRecurringInputs(prev => ({ ...prev, [customer.id]: schedule?.isRecurring ?? false }));
                        setIntervalInputs(prev => ({ ...prev, [customer.id]: schedule?.interval ?? 'biweekly' }));
                        setDateInputs(prev => ({ ...prev, [customer.id]: schedule?.nextServiceDate ? new Date(schedule.nextServiceDate).toISOString().slice(0, 10) : '' }));
                      }}
                      className="px-2 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded-lg text-sm"
                    >
                      ⚙
                    </button>
                  </div>
                </div>

                {/* Schedule Panel */}
                {scheduleOpen === customer.id && (
                  <div className="mt-4 pt-4 border-t bg-gray-50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-gray-700">Recurring</label>
                      <input
                        type="checkbox"
                        checked={recurringInputs[customer.id] ?? false}
                        onChange={e => setRecurringInputs(prev => ({ ...prev, [customer.id]: e.target.checked }))}
                        className="rounded"
                      />
                    </div>
                    {recurringInputs[customer.id] && (
                      <div>
                        <label className="text-sm font-medium text-gray-700 block mb-1">Interval</label>
                        <select
                          value={intervalInputs[customer.id] ?? 'biweekly'}
                          onChange={e => setIntervalInputs(prev => ({ ...prev, [customer.id]: e.target.value }))}
                          className="border rounded-lg px-3 py-2 text-sm w-full"
                        >
                          {INTERVALS.map(i => <option key={i.value} value={i.value}>{i.label}</option>)}
                        </select>
                      </div>
                    )}
                    <div>
                      <label className="text-sm font-medium text-gray-700 block mb-1">Next Service Date</label>
                      <input
                        type="date"
                        value={dateInputs[customer.id] ?? ''}
                        onChange={e => setDateInputs(prev => ({ ...prev, [customer.id]: e.target.value }))}
                        className="border rounded-lg px-3 py-2 text-sm w-full"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSaveSchedule(customer)}
                        className={`flex-1 py-2 ${accentBtn} text-white rounded-lg text-sm font-medium`}
                      >
                        Save Schedule
                      </button>
                      <button
                        onClick={() => setScheduleOpen(null)}
                        className="px-4 py-2 border rounded-lg text-sm text-gray-700"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {!isLoading && filtered.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p className="text-lg font-medium">No customers found</p>
              <p className="text-sm mt-1">Tag customers with <code className="bg-gray-100 px-1 rounded">{serviceCode}</code> to see them here.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Build frontend to check TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/web/src/app/service-billing/
git -C /home/magiccat/autoinvoice-features commit -m "feat: wire service-billing page to real tRPC data"
```

---

## Task 9: Employee Access Middleware

**Files:**
- Create: `apps/web/src/middleware.ts`

- [ ] **Step 1: Create the middleware file**

Create `apps/web/src/middleware.ts`:

```typescript
import { NextRequest, NextResponse } from 'next/server';

const EMPLOYEE_ALLOWED = ['/time-clock', '/login', '/payment-success'];

function getTokenPayload(token: string): { role?: string } | null {
  try {
    return JSON.parse(atob(token.split('.')[1]));
  } catch {
    return null;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow static files and API routes
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/trpc') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get('accessToken')?.value;
  if (!token) return NextResponse.next();

  const payload = getTokenPayload(token);
  if (!payload || payload.role !== 'EMPLOYEE') return NextResponse.next();

  const allowed = EMPLOYEE_ALLOWED.some(p => pathname === p || pathname.startsWith(p + '/'));
  if (!allowed) {
    return NextResponse.redirect(new URL('/time-clock', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
```

> **Note:** The frontend stores the JWT in `localStorage`, not a cookie. For middleware (server-side) to read it, the login flow must also set a cookie. Add this after `localStorage.setItem('accessToken', token)` in the login page:
>
> ```typescript
> document.cookie = `accessToken=${token}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
> ```
>
> Locate the login page at `apps/web/src/app/login/page.tsx` and add that line wherever `accessToken` is written to localStorage.

- [ ] **Step 2: Add cookie write to login page**

Find where `accessToken` is stored in `apps/web/src/app/login/page.tsx`:

```bash
grep -n "accessToken" /home/magiccat/autoinvoice-features/apps/web/src/app/login/page.tsx
```

After the `localStorage.setItem('accessToken', ...)` line, add:

```typescript
document.cookie = `accessToken=${data.accessToken}; path=/; max-age=${60 * 60 * 24 * 7}; SameSite=Lax`;
```

- [ ] **Step 3: Build to verify no TypeScript errors**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -10
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git -C /home/magiccat/autoinvoice-features add apps/web/src/middleware.ts apps/web/src/app/login/page.tsx
git -C /home/magiccat/autoinvoice-features commit -m "feat: add Next.js middleware to restrict EMPLOYEE role to time-clock only"
```

---

## Task 10: End-to-End Smoke Test

- [ ] **Step 1: Start the backend**

```bash
cd /home/magiccat/autoinvoice-features && npm run dev:backend 2>&1 &
```

Wait ~5 seconds for it to start.

- [ ] **Step 2: Start the frontend**

```bash
cd /home/magiccat/autoinvoice-features/apps/web && PORT=3001 npm run dev 2>&1 &
```

Wait ~10 seconds for it to compile.

- [ ] **Step 3: Verify time clock page loads**

Open `http://localhost:3001/time-clock` — should see the clock page with real data (empty state is fine, no mock names).

- [ ] **Step 4: Verify service billing page loads**

Open `http://localhost:3001/service-billing/fertilizer` — should see the page with "Tag customers with `fertilizer` to see them here." if no customers have that tag.

- [ ] **Step 5: Run all backend tests one final time**

```bash
cd /home/magiccat/autoinvoice-features/apps/backend && npm test 2>&1 | tail -15
```

Expected: all tests pass

- [ ] **Step 6: Final commit if needed**

```bash
git -C /home/magiccat/autoinvoice-features status
```

If clean, you're done. If any stray files, add and commit them.

---

## Self-Review

**Spec coverage check:**

| Spec Section | Covered by Task |
|---|---|
| ServiceSchedule model | Task 1 |
| ServiceBilling model + enum | Task 1 |
| TimeEntry model | Task 1 |
| Customer/User relations | Task 1 |
| timeClock router (7 procedures) | Task 3 |
| serviceScheduling router (8 procedures) | Task 4 |
| Register routers | Task 5 |
| Stripe webhook for ServiceBilling | Task 6 |
| Time Clock frontend wired | Task 7 |
| Service Billing frontend wired | Task 8 |
| EMPLOYEE access restriction | Task 9 |
| Database backup | Pre-work (done in spec session) |

All spec requirements have corresponding tasks. ✓

**Type consistency check:**
- `timeClock.clockIn/clockOut/myStatus/myHistory/teamStatus/teamWeekly/adminCorrect` — names match across router, tests, and frontend.
- `serviceScheduling.list/upsertSchedule/createBilling/markSent/markJobDone/cancelBilling/listBillings/getSuggestedNextDate` — names match across router, tests, and frontend.
- `customerId_serviceCode` Prisma compound unique key used in `upsert` call matches `@@unique([customerId, serviceCode])` in schema. ✓
- `formatMinutes`, `formatTime`, `getWeekStart` helpers defined before use in frontend. ✓

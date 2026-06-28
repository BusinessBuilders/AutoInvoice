import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient, JobStatus, InvoiceStatus, RevenueEngine } from '@prisma/client';
import { jobRouter } from '../../routers/job';
import { quoteRouter } from '../../routers/quote';
import { invoiceRouter } from '../../routers/invoice';

const prisma = new PrismaClient();

describe('Business OS Phase 2 — jobs + pricebook', () => {
  let userId: string;
  let companyId: string;
  let customerId: string;

  const ctx = () => ({ req: {} as any, res: {} as any, userId, prisma }) as any;

  beforeEach(async () => {
    await (prisma as any).jobPhoto.deleteMany();
    await (prisma as any).jobAssignment.deleteMany();
    await (prisma as any).job.deleteMany();
    const user = await prisma.user.create({
      data: { email: 'jobs@test.com', password: 'x', name: 'Jobs Test' },
    });
    userId = user.id;
    companyId = (await prisma.company.create({ data: { userId, name: 'Donovan Test' } })).id;
    customerId = (
      await prisma.customer.create({ data: { userId, name: 'Field Customer', primaryCompanyId: companyId } })
    ).id;
  });

  it('runs the full lifecycle REQUESTED→SCHEDULED→IN_PROGRESS→COMPLETED→CLOSED with auto-invoice and revenue event on payment', async () => {
    const jobs = jobRouter.createCaller(ctx());
    const quotes = quoteRouter.createCaller(ctx());
    const invoices = invoiceRouter.createCaller(ctx());

    const quote = await quotes.create({
      customerId,
      projectType: 'hydroseed',
      lineItems: [
        { description: 'Hydroseed 10k sqft', quantity: 10000, unit: 'sqft', rate: 0.15, amount: 1500, unitCost: 0.05 },
      ],
      subtotal: 1500,
      taxRate: 0,
      taxAmount: 0,
      total: 1500,
    });

    const job = await jobs.create({
      companyId,
      customerId,
      quoteId: quote.id,
      title: 'Hydroseed front lawn',
    });
    expect(job.status).toBe(JobStatus.REQUESTED);
    expect(job.jobNumber).toBe('J-00001');

    await jobs.schedule({ id: job.id, scheduledStart: new Date('2026-06-15T08:00:00Z'), routeOrder: 1 });
    await jobs.start({ id: job.id });
    await jobs.complete({
      id: job.id,
      closeoutNotes: 'Seeded and watered',
      checklist: [{ item: 'photos taken', done: true }],
    });

    const { job: closed, invoice } = await jobs.close({ id: job.id });
    expect(closed.status).toBe(JobStatus.CLOSED);
    expect(invoice).not.toBeNull();
    expect(Number(invoice!.total)).toBe(1500);

    // Invoice payment emits the FIELD_SERVICE revenue event
    await invoices.updateStatus({ id: invoice!.id, status: InvoiceStatus.PAID });
    const events = await prisma.revenueEvent.findMany({ where: { sourceId: invoice!.id } });
    expect(events).toHaveLength(1);
    expect(events[0].engine).toBe(RevenueEngine.FIELD_SERVICE);
    expect(Number(events[0].amount)).toBe(1500);
    expect(events[0].companyId).toBe(companyId);

    // Lifecycle is visible as SYSTEM activities on the customer
    const activities = await prisma.activity.findMany({ where: { customerId } });
    expect(activities.length).toBeGreaterThanOrEqual(5);
  });

  it('rejects invalid transitions', async () => {
    const jobs = jobRouter.createCaller(ctx());
    const job = await jobs.create({ companyId, customerId, title: 'No shortcuts' });
    await expect(jobs.start({ id: job.id })).rejects.toThrow(/Invalid job transition/);
    await expect(jobs.close({ id: job.id })).rejects.toThrow(/Invalid job transition/);
  });

  it('closing without a quote invoices the actual cost', async () => {
    const jobs = jobRouter.createCaller(ctx());
    const job = await jobs.create({
      companyId, customerId, title: 'T&M cleanup', estimatedCost: 300,
      scheduledStart: new Date(),
    });
    await jobs.start({ id: job.id });
    await jobs.complete({ id: job.id, actualCost: 350 });
    const { invoice } = await jobs.close({ id: job.id });
    expect(Number(invoice!.total)).toBe(350);
    expect(invoice!.source).toBe('job');
  });

  it('close is idempotent on the invoice (re-close attempt cannot duplicate)', async () => {
    const jobs = jobRouter.createCaller(ctx());
    const job = await jobs.create({ companyId, customerId, title: 'Once only', estimatedCost: 100, scheduledStart: new Date() });
    await jobs.start({ id: job.id });
    await jobs.complete({ id: job.id });
    await jobs.close({ id: job.id });
    await expect(jobs.close({ id: job.id })).rejects.toThrow(/Invalid job transition/);
    expect(await prisma.invoice.count({ where: { customerId } })).toBe(1);
  });

  it('dayView returns route-ordered jobs with crew', async () => {
    const jobs = jobRouter.createCaller(ctx());
    const crew = await prisma.user.create({
      data: { email: 'crew@test.com', password: 'x', name: 'Tristan', role: 'EMPLOYEE' },
    });
    const day = new Date('2026-06-20T00:00:00');
    const j2 = await jobs.create({ companyId, customerId, title: 'Second stop', scheduledStart: new Date('2026-06-20T11:00:00') });
    const j1 = await jobs.create({ companyId, customerId, title: 'First stop', scheduledStart: new Date('2026-06-20T08:00:00') });
    await jobs.schedule({ id: j1.id, scheduledStart: new Date('2026-06-20T08:00:00'), routeOrder: 1 });
    await jobs.schedule({ id: j2.id, scheduledStart: new Date('2026-06-20T11:00:00'), routeOrder: 2 });
    await jobs.assignCrew({ jobId: j1.id, userId: crew.id, role: 'lead' });

    const view = await jobs.dayView({ date: day, companyId });
    expect(view.map((j) => j.title)).toEqual(['First stop', 'Second stop']);
    expect(view[0].assignments[0].user.name).toBe('Tristan');
  });

  it('quote margin and win rate/aging compute from pricebook data', async () => {
    const quotes = quoteRouter.createCaller(ctx());
    const q = await quotes.create({
      customerId,
      projectType: 'hydroseed',
      lineItems: [
        { description: 'Seed', quantity: 100, rate: 2, amount: 200, unitCost: 0.5 },
        { description: 'Labor', quantity: 4, rate: 50, amount: 200 },
      ],
      subtotal: 400, taxRate: 0, taxAmount: 0, total: 400,
    });
    const margin = await quotes.margin({ id: q.id });
    expect(margin.revenue).toBe(400);
    expect(margin.cost).toBe(50);
    expect(margin.margin).toBe(350);

    await prisma.quote.update({
      where: { id: q.id },
      data: { status: 'ACCEPTED', sentAt: new Date('2026-06-01'), acceptedAt: new Date('2026-06-04') },
    });
    const winRate = await quotes.winRate({});
    expect(winRate).toHaveLength(1);
    expect(winRate[0].quotesWon).toBe(1);
    expect(winRate[0].winRatePct).toBe(100);

    await quotes.create({
      customerId, projectType: 'mowing',
      lineItems: [{ description: 'Mow', quantity: 1, rate: 60, amount: 60 }],
      subtotal: 60, taxRate: 0, taxAmount: 0, total: 60,
    });
    const old = new Date();
    old.setDate(old.getDate() - 20);
    await prisma.quote.updateMany({
      where: { userId, status: 'DRAFT' },
      data: { status: 'SENT', sentAt: old },
    });
    const aging = await quotes.aging({});
    expect(aging.totalOpen).toBe(1);
    expect(aging.buckets['15-30']).toHaveLength(1);
  });

  it('assigned crew can see and work their jobs but cannot close or schedule', async () => {
    const owner = jobRouter.createCaller(ctx());
    const crewUser = await prisma.user.create({
      data: { email: 'tristan@test.com', password: 'x', name: 'Tristan', role: 'EMPLOYEE' },
    });
    const crewCtx = { req: {} as any, res: {} as any, userId: crewUser.id, prisma } as any;
    const crew = jobRouter.createCaller(crewCtx);

    const job = await owner.create({
      companyId, customerId, title: 'Crew-visible job', estimatedCost: 50,
      scheduledStart: new Date(),
    });

    // not assigned yet → invisible
    expect((await crew.list({ limit: 10 })).items).toHaveLength(0);
    await expect(crew.get({ id: job.id })).rejects.toThrow(/not found/i);

    await owner.assignCrew({ jobId: job.id, userId: crewUser.id, role: 'lead' });

    // assigned → visible in list, day view and detail
    expect((await crew.list({ limit: 10 })).items).toHaveLength(1);
    expect((await crew.dayView({ date: new Date() })).map((j) => j.id)).toContain(job.id);
    expect((await crew.get({ id: job.id })).id).toBe(job.id);

    // crew can work the job
    await crew.start({ id: job.id });
    await crew.complete({ id: job.id, closeoutNotes: 'done by crew' });

    // but cannot close (invoice) or schedule — owner-only
    await expect(crew.close({ id: job.id })).rejects.toThrow(/not found/i);
    await expect(
      crew.schedule({ id: job.id, scheduledStart: new Date() })
    ).rejects.toThrow(/not found/i);

    // owner closes and the invoice exists
    const { invoice } = await owner.close({ id: job.id });
    expect(invoice).not.toBeNull();
  });

  it('weekOverview counts scheduled jobs per day', async () => {
    const jobs = jobRouter.createCaller(ctx());
    await jobs.create({ companyId, customerId, title: 'Mon job', scheduledStart: new Date('2026-06-15T09:00:00') });
    await jobs.create({ companyId, customerId, title: 'Wed job', scheduledStart: new Date('2026-06-17T09:00:00') });
    const week = await jobs.weekOverview({ start: new Date('2026-06-15T00:00:00') });
    expect(week).toHaveLength(7);
    expect(week[0].total).toBe(1);
    expect(week[2].total).toBe(1);
    expect(week[1].total).toBe(0);
  });
});

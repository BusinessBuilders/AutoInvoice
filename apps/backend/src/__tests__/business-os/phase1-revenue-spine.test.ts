import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient, RevenueEngine, RevenueEventType, InvoiceStatus } from '@prisma/client';
import { recordRevenueEvent, emitInvoicePaymentEvent } from '../../services/revenue-events';
import { activityRouter } from '../../routers/activity';
import { revenueEventsRouter } from '../../routers/revenueEvents';
import { customerRouter } from '../../routers/customer';

const prisma = new PrismaClient();

describe('Business OS Phase 1 — Revenue Event spine + Customer 360', () => {
  let userId: string;
  let companyId: string;
  let customerId: string;

  const ctx = () => ({ req: {} as any, res: {} as any, userId, prisma }) as any;

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: 'os@test.com', password: 'x', name: 'OS Test' },
    });
    userId = user.id;
    const company = await prisma.company.create({
      data: { userId, name: 'Donovan Farms Test' },
    });
    companyId = company.id;
    const customer = await prisma.customer.create({
      data: { userId, name: 'Blair', primaryCompanyId: companyId },
    });
    customerId = customer.id;
  });

  describe('recordRevenueEvent', () => {
    it('records an event and is idempotent on (sourceType, sourceId, eventType)', async () => {
      const input = {
        companyId,
        customerId,
        engine: RevenueEngine.FIELD_SERVICE,
        eventType: RevenueEventType.INVOICE_PAYMENT,
        sourceType: 'invoice',
        sourceId: 'inv-123',
        amount: 250,
        occurredAt: new Date('2026-06-01T12:00:00Z'),
      };
      const first = await recordRevenueEvent(input);
      const second = await recordRevenueEvent({ ...input, amount: 999 }); // replay with drifted amount
      expect(second.id).toBe(first.id);
      expect(second.amount.toNumber()).toBe(250); // original never overwritten

      const count = await prisma.revenueEvent.count();
      expect(count).toBe(1);
    });

    it('allows a REFUND alongside a PAYMENT for the same source', async () => {
      const base = {
        companyId,
        customerId,
        engine: RevenueEngine.COMMERCE,
        sourceType: 'order',
        sourceId: 'ord-1',
        occurredAt: new Date(),
      };
      await recordRevenueEvent({ ...base, eventType: RevenueEventType.ORDER_PAYMENT, amount: 100 });
      await recordRevenueEvent({ ...base, eventType: RevenueEventType.REFUND, amount: -40 });
      const events = await prisma.revenueEvent.findMany({ where: { sourceId: 'ord-1' } });
      expect(events).toHaveLength(2);
    });
  });

  describe('emitInvoicePaymentEvent', () => {
    const makeInvoice = (over: Record<string, unknown> = {}) =>
      prisma.invoice.create({
        data: {
          userId,
          customerId,
          invoiceNumber: `INV-${Math.random().toString(36).slice(2, 8)}`,
          serviceDate: new Date(),
          dueDate: new Date(),
          subtotal: 100,
          total: 100,
          status: InvoiceStatus.PAID,
          paidDate: new Date('2026-06-05T00:00:00Z'),
          companyId,
          ...over,
        },
      });

    it('emits a SERVICES event for a paid invoice with its company', async () => {
      const invoice = await makeInvoice();
      const event = await emitInvoicePaymentEvent(invoice.id);
      expect(event).not.toBeNull();
      expect(event!.companyId).toBe(companyId);
      expect(event!.customerId).toBe(customerId);
      expect(event!.engine).toBe(RevenueEngine.SERVICES);
      expect(event!.amount.toNumber()).toBe(100);
      expect(event!.occurredAt.toISOString()).toBe('2026-06-05T00:00:00.000Z');
    });

    it('is a no-op on re-emission (replay-safe)', async () => {
      const invoice = await makeInvoice();
      await emitInvoicePaymentEvent(invoice.id);
      await emitInvoicePaymentEvent(invoice.id);
      expect(await prisma.revenueEvent.count({ where: { sourceId: invoice.id } })).toBe(1);
    });

    it('resolves company via customer primary company when invoice has none', async () => {
      const invoice = await makeInvoice({ companyId: null });
      const event = await emitInvoicePaymentEvent(invoice.id);
      expect(event!.companyId).toBe(companyId);
    });

    it('resolves company via the single active company when nothing else set', async () => {
      await prisma.customer.update({
        where: { id: customerId },
        data: { primaryCompanyId: null },
      });
      const invoice = await makeInvoice({ companyId: null });
      const event = await emitInvoicePaymentEvent(invoice.id);
      expect(event!.companyId).toBe(companyId);
    });

    it('returns null for non-PAID invoices', async () => {
      const invoice = await makeInvoice({ status: InvoiceStatus.SENT, paidDate: null });
      expect(await emitInvoicePaymentEvent(invoice.id)).toBeNull();
      expect(await prisma.revenueEvent.count()).toBe(0);
    });

    it('maps invoice source to the right engine', async () => {
      const order = await makeInvoice({ source: 'order' });
      const sub = await makeInvoice({ source: 'subscription' });
      const job = await makeInvoice({ source: 'job' });
      expect((await emitInvoicePaymentEvent(order.id))!.engine).toBe(RevenueEngine.COMMERCE);
      expect((await emitInvoicePaymentEvent(sub.id))!.engine).toBe(RevenueEngine.SUBSCRIPTION);
      expect((await emitInvoicePaymentEvent(job.id))!.engine).toBe(RevenueEngine.FIELD_SERVICE);
    });
  });

  describe('activity router', () => {
    it('creates and lists activities against a customer', async () => {
      const caller = activityRouter.createCaller(ctx());
      await caller.create({
        customerId,
        companyId,
        type: 'CALL',
        direction: 'OUTBOUND',
        body: 'Discussed spring hydroseeding',
        source: 'manual',
      });
      await caller.create({ customerId, type: 'NOTE', body: 'Prefers morning visits' });

      const { items } = await caller.list({ customerId, limit: 10 });
      expect(items).toHaveLength(2);
      expect(items.map((a) => a.type).sort()).toEqual(['CALL', 'NOTE']);
    });

    it('rejects activities against records the user does not own', async () => {
      const stranger = await prisma.user.create({
        data: { email: 'other@test.com', password: 'x', name: 'Other' },
      });
      const strangerCtx = { req: {} as any, res: {} as any, userId: stranger.id, prisma } as any;
      const caller = activityRouter.createCaller(strangerCtx);
      await expect(
        caller.create({ customerId, type: 'NOTE', body: 'should fail' })
      ).rejects.toThrow();
    });
  });

  describe('revenueEvents router', () => {
    it('summarizes revenue by engine', async () => {
      const caller = revenueEventsRouter.createCaller(ctx());
      const base = { companyId, customerId, occurredAt: new Date() };
      await recordRevenueEvent({
        ...base, engine: RevenueEngine.FIELD_SERVICE,
        eventType: RevenueEventType.INVOICE_PAYMENT, sourceType: 'invoice', sourceId: 'a', amount: 300,
      });
      await recordRevenueEvent({
        ...base, engine: RevenueEngine.COMMERCE,
        eventType: RevenueEventType.ORDER_PAYMENT, sourceType: 'order', sourceId: 'b', amount: 120,
      });
      await recordRevenueEvent({
        ...base, engine: RevenueEngine.COMMERCE,
        eventType: RevenueEventType.REFUND, sourceType: 'order', sourceId: 'b2', amount: -20,
      });

      const summary = await caller.summary({ companyId });
      expect(summary.net).toBe(400);
      const commerce = summary.byEngine.find((e) => e.engine === 'COMMERCE');
      expect(commerce?.total).toBe(100);
    });
  });

  describe('customer.timeline', () => {
    it('merges invoices, activities and revenue events newest-first', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId, customerId, companyId,
          invoiceNumber: 'INV-TL-1',
          serviceDate: new Date('2026-05-01'), dueDate: new Date('2026-05-31'),
          issueDate: new Date('2026-05-01'),
          subtotal: 100, total: 100, status: InvoiceStatus.PAID, paidDate: new Date('2026-05-20'),
        },
      });
      await emitInvoicePaymentEvent(invoice.id);
      const activityCaller = activityRouter.createCaller(ctx());
      await activityCaller.create({
        customerId, type: 'CALL', body: 'Follow-up call', occurredAt: new Date('2026-06-01'),
      });

      const caller = customerRouter.createCaller(ctx());
      const timeline = await caller.timeline({ customerId, limit: 20 });
      const kinds = timeline.items.map((i) => i.kind);
      expect(kinds).toContain('invoice');
      expect(kinds).toContain('activity');
      expect(kinds).toContain('revenue_event');
      // newest first
      const dates = timeline.items.map((i) => new Date(i.at).getTime());
      expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    });
  });
});

import { describe, it, expect, beforeEach } from '@jest/globals';
import crypto from 'crypto';
import { PrismaClient, OrderStatus, RevenueEventType } from '@prisma/client';
import { ingestOrder } from '../../services/commerce/ingest-order';
import { verifySignature } from '../../services/commerce/webhook';
import { productRouter } from '../../routers/product';

const prisma = new PrismaClient();

describe('Business OS Phase 3 — commerce', () => {
  let userId: string;
  let companyId: string;
  const sourceKey = 'shop-test';

  const ctx = () => ({ req: {} as any, res: {} as any, userId, prisma }) as any;

  const payload = (over: any = {}) => ({
    version: '1',
    event: 'order.paid',
    order: {
      external_id: 'ord-100',
      currency: 'USD',
      placed_at: '2026-06-09T10:00:00Z',
      customer: { email: 'buyer@example.com', name: 'Online Buyer' },
      items: [{ sku: 'HYDRO-5', name: 'Hydroseed Mix 5lb', quantity: 2, unit_price: '39.99' }],
      totals: { subtotal: '79.98', tax: '6.40', shipping: '9.99', discount: '0.00', total: '96.37' },
      attribution: { utm_source: 'facebook', utm_medium: 'cpc', utm_campaign: 'spring-lawn' },
      ...over,
    },
  });

  beforeEach(async () => {
    const user = await prisma.user.create({
      data: { email: 'commerce@test.com', password: 'x', name: 'Commerce Test' },
    });
    userId = user.id;
    companyId = (await prisma.company.create({ data: { userId, name: 'Shop Co' } })).id;
    await prisma.ingestSource.create({
      data: { userId, companyId, key: sourceKey, name: 'Test shop', kind: 'custom', secret: 'shhh' },
    });
    await prisma.product.create({
      data: { userId, companyId, sku: 'HYDRO-5', name: 'Hydroseed Mix 5lb', price: 39.99, cogs: 12.5, stockQty: 50, lowStockThreshold: 5 },
    });
  });

  it('paid order creates customer, order, PAID invoice and COMMERCE revenue event; replay is a no-op', async () => {
    const first = await ingestOrder(sourceKey, payload());
    expect(first.duplicate).toBe(false);
    expect(first.status).toBe(OrderStatus.PAID);
    expect(first.needsReview).toBe(false);

    const replay = await ingestOrder(sourceKey, payload());
    expect(replay.duplicate).toBe(true);
    expect(replay.orderId).toBe(first.orderId);

    const orders = await prisma.order.findMany({ include: { items: true, invoice: true } });
    expect(orders).toHaveLength(1);
    const order = orders[0];
    expect(Number(order.total)).toBeCloseTo(96.37);
    expect(order.utmCampaign).toBe('spring-lawn');
    expect(order.invoice?.status).toBe('PAID');
    expect(order.invoice?.source).toBe('order');
    expect(Number(order.items[0].unitCogs)).toBeCloseTo(12.5);

    // customer created and linked
    const customer = await prisma.customer.findFirst({ where: { email: 'buyer@example.com' } });
    expect(customer).not.toBeNull();
    expect(order.customerId).toBe(customer!.id);

    // exactly one revenue event despite replay
    const events = await prisma.revenueEvent.findMany({ where: { sourceId: order.id } });
    expect(events).toHaveLength(1);
    expect(events[0].eventType).toBe(RevenueEventType.ORDER_PAYMENT);
    expect(events[0].attributionSource).toBe('facebook');

    // stock decremented exactly once
    const product = await prisma.product.findFirst({ where: { sku: 'HYDRO-5' } });
    expect(product!.stockQty).toBe(48);

    // invoice payment hook does NOT double-emit (order invoices are PAID at creation,
    // so the only event for this dollar is the ORDER_PAYMENT)
    const allEvents = await prisma.revenueEvent.findMany();
    expect(allEvents).toHaveLength(1);
  });

  it('matches existing customer by email instead of duplicating', async () => {
    const existing = await prisma.customer.create({
      data: { userId, name: 'Blair', email: 'buyer@example.com' },
    });
    const res = await ingestOrder(sourceKey, payload());
    const order = await prisma.order.findUnique({ where: { id: res.orderId } });
    expect(order!.customerId).toBe(existing.id);
    expect(await prisma.customer.count()).toBe(1);
  });

  it('unknown SKU flags review and keeps the line unlinked', async () => {
    const res = await ingestOrder(
      sourceKey,
      payload({ items: [{ sku: 'MYSTERY', name: 'Unknown thing', quantity: 1, unit_price: '10.00' }] })
    );
    expect(res.needsReview).toBe(true);
    const item = await prisma.orderItem.findFirst({ where: { sku: 'MYSTERY' } });
    expect(item!.productId).toBeNull();
  });

  it('refunds: partial then full, replay-safe, totals from events', async () => {
    await ingestOrder(sourceKey, payload());
    await ingestOrder(sourceKey, payload({ event: undefined }));

    // partial refund
    const partial = payload();
    partial.event = 'order.refunded';
    partial.order.refund = { id: 're_1', amount: '40.00', reason: 'damaged item' };
    await ingestOrder(sourceKey, partial);
    let order = await prisma.order.findFirst();
    expect(order!.status).toBe(OrderStatus.PARTIALLY_REFUNDED);
    expect(Number(order!.refundedAmount)).toBeCloseTo(40);

    // replay same refund — no double-count
    await ingestOrder(sourceKey, partial);
    order = await prisma.order.findFirst();
    expect(Number(order!.refundedAmount)).toBeCloseTo(40);

    // second refund completes it
    const rest = payload();
    rest.event = 'order.refunded';
    rest.order.refund = { id: 're_2', amount: '56.37' };
    await ingestOrder(sourceKey, rest);
    order = await prisma.order.findFirst();
    expect(order!.status).toBe(OrderStatus.REFUNDED);
    expect(Number(order!.refundedAmount)).toBeCloseTo(96.37);

    // event math: +96.37 - 40 - 56.37 = 0
    const agg = await prisma.revenueEvent.aggregate({ _sum: { amount: true } });
    expect(Number(agg._sum.amount)).toBeCloseTo(0);
  });

  it('verifySignature accepts the right HMAC and rejects tampering', () => {
    const body = Buffer.from(JSON.stringify(payload()));
    const sig = 'sha256=' + crypto.createHmac('sha256', 'shhh').update(body).digest('hex');
    expect(verifySignature(body, 'shhh', sig)).toBe(true);
    expect(verifySignature(body, 'shhh', sig.replace(/.$/, '0'))).toBe(false);
    expect(verifySignature(Buffer.concat([body, Buffer.from('x')]), 'shhh', sig)).toBe(false);
    expect(verifySignature(body, 'wrong-secret', sig)).toBe(false);
    expect(verifySignature(body, 'shhh', undefined)).toBe(false);
  });

  it('margin per SKU per channel', async () => {
    await prisma.ingestSource.create({
      data: { userId, companyId, key: 'stripe-site', name: 'Stripe site', kind: 'stripe', secret: 's2' },
    });
    await ingestOrder(sourceKey, payload());
    const other = payload({ external_id: 'ord-200' });
    await ingestOrder('stripe-site', other);

    const products = productRouter.createCaller(ctx());
    const report = await products.marginReport({ companyId });
    expect(report).toHaveLength(2);
    const byChannel = Object.fromEntries(report.map((r) => [r.channel, r]));
    expect(byChannel[sourceKey].units).toBe(2);
    expect(byChannel[sourceKey].revenue).toBeCloseTo(79.98);
    expect(byChannel[sourceKey].cogs).toBeCloseTo(25);
    expect(byChannel[sourceKey].margin).toBeCloseTo(54.98);
  });
});

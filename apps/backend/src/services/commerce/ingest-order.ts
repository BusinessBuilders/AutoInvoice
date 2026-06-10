import { z } from 'zod';
import { Prisma, OrderStatus, RevenueEngine, RevenueEventType } from '@prisma/client';
import { prisma } from '../../utils/db';
import logger from '../../utils/logger';
import { recordRevenueEvent } from '../revenue-events';
import { calculateDueDate } from '../../utils/payment-terms';

/**
 * Order ingestion (spec §3.5/3.6). One normalized payload regardless of store
 * (Stripe/Shopify/custom adapters translate into this shape). Side effects:
 *  1. upsert by (companyId, source, externalId) — replays never duplicate
 *  2. customer match by email → phone → create (source "order")
 *  3. SKU match → product link + cogs snapshot; unknown SKU → needsReview
 *  4. first transition to PAID: stock decrement, Invoice (status PAID,
 *     source "order"), ORDER_PAYMENT RevenueEvent
 *  5. refunds: refundedAmount/status update + negative REFUND event
 *     (idempotent per refund id)
 */

export const orderPayloadSchema = z.object({
  version: z.literal('1').default('1'),
  event: z.enum(['order.created', 'order.paid', 'order.fulfilled', 'order.refunded', 'order.cancelled']),
  order: z.object({
    external_id: z.string().min(1),
    status: z.enum(['pending', 'paid', 'fulfilled', 'partially_refunded', 'refunded', 'cancelled']).optional(),
    currency: z.string().default('USD'),
    placed_at: z.coerce.date(),
    customer: z
      .object({
        email: z.string().email().optional(),
        name: z.string().optional(),
        phone: z.string().optional(),
      })
      .optional(),
    items: z
      .array(
        z.object({
          sku: z.string().min(1),
          name: z.string().min(1),
          quantity: z.number().int().positive(),
          unit_price: z.coerce.number(),
        })
      )
      .default([]),
    totals: z.object({
      subtotal: z.coerce.number().default(0),
      tax: z.coerce.number().default(0),
      shipping: z.coerce.number().default(0),
      discount: z.coerce.number().default(0),
      total: z.coerce.number(),
    }),
    refund: z
      .object({
        id: z.string().min(1),
        amount: z.coerce.number().positive(),
        reason: z.string().optional(),
      })
      .optional(),
    attribution: z
      .object({
        utm_source: z.string().nullish(),
        utm_medium: z.string().nullish(),
        utm_campaign: z.string().nullish(),
        utm_term: z.string().nullish(),
        utm_content: z.string().nullish(),
        landing_page: z.string().nullish(),
        referrer: z.string().nullish(),
      })
      .nullish(),
  }),
});

export type OrderPayload = z.infer<typeof orderPayloadSchema>;

const EVENT_STATUS: Record<OrderPayload['event'], OrderStatus> = {
  'order.created': OrderStatus.PENDING,
  'order.paid': OrderStatus.PAID,
  'order.fulfilled': OrderStatus.FULFILLED,
  'order.refunded': OrderStatus.REFUNDED, // adjusted to PARTIALLY_REFUNDED below
  'order.cancelled': OrderStatus.CANCELLED,
};

async function matchOrCreateCustomer(
  userId: string,
  companyId: string,
  customer: NonNullable<OrderPayload['order']['customer']> | undefined
): Promise<string | null> {
  if (!customer || (!customer.email && !customer.phone)) return null;
  if (customer.email) {
    const byEmail = await prisma.customer.findFirst({
      where: { userId, email: { equals: customer.email, mode: 'insensitive' } },
    });
    if (byEmail) return byEmail.id;
  }
  if (customer.phone) {
    const byPhone = await prisma.customer.findFirst({
      where: { userId, phone: customer.phone },
    });
    if (byPhone) return byPhone.id;
  }
  const created = await prisma.customer.create({
    data: {
      userId,
      name: customer.name ?? customer.email ?? customer.phone ?? 'Online customer',
      email: customer.email,
      phone: customer.phone,
      primaryCompanyId: companyId,
      tags: ['online-order'],
    },
  });
  return created.id;
}

async function createInvoiceForOrder(order: {
  id: string; userId: string; companyId: string; customerId: string | null;
  subtotal: Prisma.Decimal; taxAmount: Prisma.Decimal; discountAmount: Prisma.Decimal;
  shippingAmount: Prisma.Decimal; total: Prisma.Decimal; paidAt: Date | null; placedAt: Date;
  items: { sku: string; name: string; quantity: number; unitPrice: Prisma.Decimal }[];
}) {
  if (!order.customerId) return null; // invoice requires a customer; order stays reviewable

  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastNumber = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0 : 0;
  const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;
  const issueDate = order.paidAt ?? new Date();

  const lines = order.items.map((it, idx) => ({
    description: `${it.name} (${it.sku})`,
    quantity: it.quantity,
    unit: 'ea',
    rate: it.unitPrice,
    amount: new Prisma.Decimal(it.unitPrice).mul(it.quantity),
    order: idx,
  }));
  if (Number(order.shippingAmount) > 0) {
    lines.push({
      description: 'Shipping',
      quantity: 1,
      unit: 'ea',
      rate: order.shippingAmount,
      amount: new Prisma.Decimal(order.shippingAmount),
      order: lines.length,
    });
  }

  return prisma.invoice.create({
    data: {
      userId: order.userId,
      companyId: order.companyId,
      customerId: order.customerId,
      invoiceNumber,
      serviceDate: order.placedAt,
      issueDate,
      dueDate: calculateDueDate(issueDate, 'Due on Receipt'),
      paymentTerms: 'Due on Receipt',
      status: 'PAID',
      paidDate: order.paidAt ?? issueDate,
      subtotal: order.subtotal,
      taxAmount: order.taxAmount,
      discount: order.discountAmount,
      total: order.total,
      source: 'order',
      lineItems: { create: lines },
    },
  });
}

export async function ingestOrder(
  sourceKey: string,
  payload: unknown
): Promise<{ orderId: string; status: OrderStatus; duplicate: boolean; needsReview: boolean }> {
  const source = await prisma.ingestSource.findUnique({ where: { key: sourceKey } });
  if (!source || !source.active) throw new Error(`Unknown or inactive ingest source: ${sourceKey}`);

  const parsed = orderPayloadSchema.parse(payload);
  const o = parsed.order;

  const existing = await prisma.order.findUnique({
    where: {
      companyId_source_externalId: {
        companyId: source.companyId,
        source: source.key,
        externalId: o.external_id,
      },
    },
    include: { items: true },
  });

  // Match products by SKU for cogs snapshots and review flagging
  const skus = [...new Set(o.items.map((i) => i.sku))];
  const products = await prisma.product.findMany({
    where: { companyId: source.companyId, sku: { in: skus } },
  });
  const productBySku = new Map(products.map((p) => [p.sku, p]));
  const unknownSku = o.items.some((i) => !productBySku.has(i.sku));

  const customerId =
    existing?.customerId ??
    (await matchOrCreateCustomer(source.userId, source.companyId, o.customer));

  const targetStatus = EVENT_STATUS[parsed.event];

  let order;
  let duplicate = false;
  if (!existing) {
    order = await prisma.order.create({
      data: {
        userId: source.userId,
        companyId: source.companyId,
        customerId,
        source: source.key,
        externalId: o.external_id,
        status: targetStatus === OrderStatus.REFUNDED ? OrderStatus.PENDING : targetStatus,
        currency: o.currency,
        subtotal: o.totals.subtotal,
        taxAmount: o.totals.tax,
        shippingAmount: o.totals.shipping,
        discountAmount: o.totals.discount,
        total: o.totals.total,
        placedAt: o.placed_at,
        paidAt: parsed.event === 'order.paid' ? new Date() : null,
        fulfilledAt: parsed.event === 'order.fulfilled' ? new Date() : null,
        utmSource: o.attribution?.utm_source ?? null,
        utmMedium: o.attribution?.utm_medium ?? null,
        utmCampaign: o.attribution?.utm_campaign ?? null,
        utmTerm: o.attribution?.utm_term ?? null,
        utmContent: o.attribution?.utm_content ?? null,
        landingPage: o.attribution?.landing_page ?? null,
        referrer: o.attribution?.referrer ?? null,
        needsReview: unknownSku || !customerId,
        rawPayload: payload as Prisma.InputJsonValue,
        items: {
          create: o.items.map((it) => ({
            productId: productBySku.get(it.sku)?.id ?? null,
            sku: it.sku,
            name: it.name,
            quantity: it.quantity,
            unitPrice: it.unit_price,
            unitCogs: productBySku.get(it.sku)?.cogs ?? null,
          })),
        },
      },
      include: { items: true },
    });
  } else {
    order = existing;
    duplicate = true;
  }

  // ---- transitions (run for both new and replayed orders; each is idempotent)

  // PAID: stock decrement once + invoice + revenue event.
  // "First paid" is judged against the PRIOR state (a new order arriving as
  // order.paid has paidAt set at creation but was never paid before).
  if (parsed.event === 'order.paid' && order.status !== OrderStatus.FULFILLED) {
    const firstPaid = !existing?.paidAt;
    if (existing) {
      order = await prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.PAID, paidAt: order.paidAt ?? new Date(), customerId },
        include: { items: true },
      });
    }
    if (firstPaid) {
      for (const item of order.items) {
        if (item.productId) {
          await prisma.product.update({
            where: { id: item.productId },
            data: { stockQty: { decrement: item.quantity } },
          });
        }
      }
    }
    if (!order.invoiceId) {
      const invoice = await createInvoiceForOrder(order);
      if (invoice) {
        order = await prisma.order.update({
          where: { id: order.id },
          data: { invoiceId: invoice.id },
          include: { items: true },
        });
      }
    }
    await recordRevenueEvent({
      companyId: order.companyId,
      customerId: order.customerId,
      engine: RevenueEngine.COMMERCE,
      eventType: RevenueEventType.ORDER_PAYMENT,
      sourceType: 'order',
      sourceId: order.id,
      amount: order.total,
      currency: order.currency,
      occurredAt: order.paidAt ?? new Date(),
      description: `Order ${order.externalId} (${order.source}) paid`,
      attributionSource: order.utmSource,
      attributionCampaign: order.utmCampaign,
    });
  }

  if (parsed.event === 'order.fulfilled') {
    order = await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.FULFILLED, fulfilledAt: order.fulfilledAt ?? new Date() },
      include: { items: true },
    });
  }

  if (parsed.event === 'order.cancelled' && order.status === OrderStatus.PENDING) {
    order = await prisma.order.update({
      where: { id: order.id },
      data: { status: OrderStatus.CANCELLED },
      include: { items: true },
    });
  }

  // REFUND: negative event keyed by refund id → replay-safe
  if (parsed.event === 'order.refunded') {
    if (!o.refund) throw new Error('order.refunded requires order.refund');
    const refundEvent = await recordRevenueEvent({
      companyId: order.companyId,
      customerId: order.customerId,
      engine: RevenueEngine.COMMERCE,
      eventType: RevenueEventType.REFUND,
      sourceType: `order_refund:${o.refund.id}`,
      sourceId: order.id,
      amount: -Math.abs(o.refund.amount),
      currency: order.currency,
      occurredAt: new Date(),
      description: `Refund ${o.refund.id} on order ${order.externalId}${o.refund.reason ? ` (${o.refund.reason})` : ''}`,
      attributionSource: order.utmSource,
      attributionCampaign: order.utmCampaign,
      metadata: { refundId: o.refund.id },
    });
    // Recompute refunded total from events (source of truth, replay-proof)
    const agg = await prisma.revenueEvent.aggregate({
      where: { sourceId: order.id, eventType: RevenueEventType.REFUND },
      _sum: { amount: true },
    });
    const refunded = Math.abs(Number(agg._sum.amount ?? 0));
    order = await prisma.order.update({
      where: { id: order.id },
      data: {
        refundedAmount: refunded,
        status:
          refunded >= Number(order.total)
            ? OrderStatus.REFUNDED
            : OrderStatus.PARTIALLY_REFUNDED,
      },
      include: { items: true },
    });
    void refundEvent;
  }

  await prisma.ingestSource.update({
    where: { id: source.id },
    data: { lastSeenAt: new Date() },
  });

  logger.info('Order ingested', {
    sourceKey,
    externalId: o.external_id,
    event: parsed.event,
    orderId: order.id,
    duplicate,
  });

  return { orderId: order.id, status: order.status, duplicate, needsReview: order.needsReview };
}

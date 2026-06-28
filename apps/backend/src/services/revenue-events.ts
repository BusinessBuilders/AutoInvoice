import { Prisma, RevenueEngine, RevenueEventType, type RevenueEvent } from '@prisma/client';
import { prisma } from '../utils/db';
import logger from '../utils/logger';

/**
 * The Revenue Event spine (see docs/BUSINESS_OS_SPEC.md §3.2).
 *
 * Every dollar in — a job invoice payment, a subscription renewal, a product
 * order — normalizes into one RevenueEvent linked to a Customer and a Company.
 *
 * THIS MODULE IS THE ONLY WRITER of the RevenueEvent table. Idempotency is
 * enforced by the DB unique constraint (sourceType, sourceId, eventType):
 * re-emitting an event is a no-op, so webhook replays and double-fired status
 * transitions cannot double-count revenue.
 */

export interface RecordRevenueEventInput {
  companyId: string;
  customerId?: string | null;
  engine: RevenueEngine;
  eventType: RevenueEventType;
  /** "invoice" | "order" | "subscription" | "manual" | future source types */
  sourceType: string;
  /** id of the row in the source table */
  sourceId: string;
  /** negative for REFUND */
  amount: Prisma.Decimal | number | string;
  currency?: string;
  /** when the dollar actually moved (payment date, not issue date) */
  occurredAt: Date;
  description?: string | null;
  attributionSource?: string | null;
  attributionCampaign?: string | null;
  metadata?: Prisma.InputJsonValue;
}

export async function recordRevenueEvent(input: RecordRevenueEventInput): Promise<RevenueEvent> {
  const event = await prisma.revenueEvent.upsert({
    where: {
      sourceType_sourceId_eventType: {
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        eventType: input.eventType,
      },
    },
    // Idempotent: an already-recorded event is never overwritten.
    update: {},
    create: {
      companyId: input.companyId,
      customerId: input.customerId ?? null,
      engine: input.engine,
      eventType: input.eventType,
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      amount: new Prisma.Decimal(input.amount as Prisma.Decimal.Value),
      currency: input.currency ?? 'USD',
      occurredAt: input.occurredAt,
      description: input.description ?? null,
      attributionSource: input.attributionSource ?? null,
      attributionCampaign: input.attributionCampaign ?? null,
      metadata: input.metadata,
    },
  });
  return event;
}

/**
 * Emit the INVOICE_PAYMENT event for an invoice that reached PAID.
 * Called from every path that marks an invoice paid (tRPC updateStatus,
 * Stripe webhook, check auto-match). Safe to call repeatedly.
 *
 * Resolution rules:
 * - companyId: invoice.companyId, falling back to the customer's primary
 *   company, falling back to the owner's single active company. If no company
 *   can be resolved the event is skipped with a warning (never throws — the
 *   payment itself must not fail because of analytics).
 * - attribution: snapshot from the customer's first-touch fields.
 */
export async function emitInvoicePaymentEvent(invoiceId: string): Promise<RevenueEvent | null> {
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: { customer: true },
  });
  if (!invoice) return null;
  if (invoice.status !== 'PAID') return null;

  let companyId = invoice.companyId ?? invoice.customer?.primaryCompanyId ?? null;
  if (!companyId) {
    const companies = await prisma.company.findMany({
      where: { userId: invoice.userId, active: true },
      select: { id: true },
      take: 2,
    });
    if (companies.length === 1) companyId = companies[0].id;
  }
  if (!companyId) {
    logger.warn(
      `RevenueEvent skipped for invoice ${invoice.invoiceNumber}: no company resolvable`
    );
    return null;
  }

  // Job-linked invoices are field service; orders/subscriptions emit through
  // their own services with their own engine, so a plain invoice is SERVICES.
  const engine: RevenueEngine =
    invoice.source === 'order'
      ? RevenueEngine.COMMERCE
      : invoice.source === 'subscription'
        ? RevenueEngine.SUBSCRIPTION
        : invoice.source === 'job'
          ? RevenueEngine.FIELD_SERVICE
          : RevenueEngine.SERVICES;

  return recordRevenueEvent({
    companyId,
    customerId: invoice.customerId,
    engine,
    eventType: RevenueEventType.INVOICE_PAYMENT,
    sourceType: 'invoice',
    sourceId: invoice.id,
    amount: invoice.total,
    occurredAt: invoice.paidDate ?? new Date(),
    description: `Invoice ${invoice.invoiceNumber} paid`,
    attributionSource: invoice.customer?.acquisitionSource ?? null,
    attributionCampaign: invoice.customer?.acquisitionCampaign ?? null,
  });
}

/**
 * Emit the payment event for a PlowBilling (Stripe payment-link flow that
 * bypasses Invoice). Plowing is Donovan Farms field service.
 */
export async function emitPlowBillingPaymentEvent(plowBillingId: string): Promise<RevenueEvent | null> {
  const billing = await prisma.plowBilling.findUnique({
    where: { id: plowBillingId },
    include: { customer: true },
  });
  if (!billing || billing.status !== 'PAID') return null;

  let companyId = billing.customer?.primaryCompanyId ?? null;
  if (!companyId && billing.customer) {
    const companies = await prisma.company.findMany({
      where: { userId: billing.customer.userId, active: true },
      select: { id: true },
      take: 2,
    });
    if (companies.length === 1) companyId = companies[0].id;
  }
  if (!companyId) {
    logger.warn(`RevenueEvent skipped for plow billing ${billing.id}: no company resolvable`);
    return null;
  }

  return recordRevenueEvent({
    companyId,
    customerId: billing.customerId,
    engine: RevenueEngine.FIELD_SERVICE,
    eventType: RevenueEventType.INVOICE_PAYMENT,
    sourceType: 'plow_billing',
    sourceId: billing.id,
    amount: billing.totalAmount,
    occurredAt: billing.paidAt ?? new Date(),
    description: 'Plow billing paid',
    attributionSource: billing.customer?.acquisitionSource ?? null,
    attributionCampaign: billing.customer?.acquisitionCampaign ?? null,
  });
}

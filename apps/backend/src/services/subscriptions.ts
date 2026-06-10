import { Prisma, BillingInterval, RevenueEngine, RevenueEventType, SubscriptionStatus } from '@prisma/client';
import { prisma } from '../utils/db';
import logger from '../utils/logger';
import { recordRevenueEvent } from './revenue-events';
import { calculateDueDate } from '../utils/payment-terms';

/**
 * Recurring revenue (spec §3.7). A renewal:
 *  - creates a PAID invoice (source "subscription") for the period,
 *  - emits a SUBSCRIPTION_RENEWAL revenue event idempotent PER PERIOD
 *    (sourceType "subscription_period:<periodEnd ISO date>"),
 *  - advances currentPeriodEnd and clears dunning.
 * A failed payment moves to PAST_DUE and bumps dunningStage (Phase 6
 * automations escalate it).
 */

export function advance(date: Date, interval: BillingInterval): Date {
  // UTC arithmetic: renewal dates must not drift with the server timezone.
  const next = new Date(date);
  if (interval === BillingInterval.MONTHLY) next.setUTCMonth(next.getUTCMonth() + 1);
  else if (interval === BillingInterval.QUARTERLY) next.setUTCMonth(next.getUTCMonth() + 3);
  else next.setUTCFullYear(next.getUTCFullYear() + 1);
  return next;
}

export function monthlyAmount(amount: Prisma.Decimal | number, interval: BillingInterval): number {
  const a = Number(amount);
  if (interval === BillingInterval.MONTHLY) return a;
  if (interval === BillingInterval.QUARTERLY) return a / 3;
  return a / 12;
}

export async function recordRenewal(subscriptionId: string, paidAt: Date = new Date()) {
  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { customer: true },
  });
  if (!sub) throw new Error('Subscription not found');
  if (sub.status === SubscriptionStatus.CANCELLED) {
    throw new Error('Cannot renew a cancelled subscription');
  }

  const periodEnd = sub.currentPeriodEnd;
  const periodKey = periodEnd.toISOString().slice(0, 10);

  // Invoice for the period (idempotence: skip if this period already invoiced)
  const existingEvent = await prisma.revenueEvent.findUnique({
    where: {
      sourceType_sourceId_eventType: {
        sourceType: `subscription_period:${periodKey}`,
        sourceId: sub.id,
        eventType: RevenueEventType.SUBSCRIPTION_RENEWAL,
      },
    },
  });
  if (existingEvent) {
    logger.info('Renewal already recorded for period', { subscriptionId, periodKey });
    return { subscription: sub, invoice: null, event: existingEvent, duplicate: true };
  }

  const lastInvoice = await prisma.invoice.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { invoiceNumber: true },
  });
  const lastNumber = lastInvoice ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0 : 0;
  const invoice = await prisma.invoice.create({
    data: {
      userId: sub.userId,
      companyId: sub.companyId,
      customerId: sub.customerId,
      invoiceNumber: `INV-${String(lastNumber + 1).padStart(6, '0')}`,
      serviceDate: periodEnd,
      issueDate: paidAt,
      dueDate: calculateDueDate(paidAt, 'Due on Receipt'),
      paymentTerms: 'Due on Receipt',
      status: 'PAID',
      paidDate: paidAt,
      subtotal: sub.amount,
      total: sub.amount,
      source: 'subscription',
      notes: `${sub.name} — renewal for period ending ${periodKey}`,
      lineItems: {
        create: [
          {
            description: `${sub.name} (${sub.interval.toLowerCase()} renewal)`,
            quantity: 1,
            unit: sub.interval.toLowerCase(),
            rate: sub.amount,
            amount: sub.amount,
            order: 0,
          },
        ],
      },
    },
  });

  const event = await recordRevenueEvent({
    companyId: sub.companyId,
    customerId: sub.customerId,
    engine: RevenueEngine.SUBSCRIPTION,
    eventType: RevenueEventType.SUBSCRIPTION_RENEWAL,
    sourceType: `subscription_period:${periodKey}`,
    sourceId: sub.id,
    amount: sub.amount,
    currency: sub.currency,
    occurredAt: paidAt,
    description: `${sub.name} renewal (${periodKey})`,
    attributionSource: sub.customer.acquisitionSource,
    attributionCampaign: sub.customer.acquisitionCampaign,
    metadata: { invoiceId: invoice.id },
  });

  const subscription = await prisma.subscription.update({
    where: { id: sub.id },
    data: {
      currentPeriodEnd: advance(periodEnd, sub.interval),
      status: sub.cancelAtPeriodEnd ? SubscriptionStatus.CANCELLED : SubscriptionStatus.ACTIVE,
      cancelledAt: sub.cancelAtPeriodEnd ? paidAt : null,
      dunningStage: 0,
      churnRisk: false,
      lastPaymentAt: paidAt,
    },
  });

  logger.info('Subscription renewal recorded', {
    subscriptionId,
    periodKey,
    invoiceNumber: invoice.invoiceNumber,
  });
  return { subscription, invoice, event, duplicate: false };
}

export async function markPaymentFailed(subscriptionId: string, reason?: string) {
  const sub = await prisma.subscription.findUnique({ where: { id: subscriptionId } });
  if (!sub) throw new Error('Subscription not found');
  const dunningStage = Math.min(sub.dunningStage + 1, 3);
  return prisma.subscription.update({
    where: { id: sub.id },
    data: {
      status: SubscriptionStatus.PAST_DUE,
      dunningStage,
      churnRisk: dunningStage >= 2 ? true : sub.churnRisk,
      churnReason: dunningStage >= 2 ? (reason ?? 'repeated failed payments') : sub.churnReason,
    },
  });
}

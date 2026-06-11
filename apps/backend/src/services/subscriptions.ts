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

// ---- Stripe wiring (uses the account's existing STRIPE_SECRET_KEY) ----

/** Create a recurring Stripe payment link for a subscription. The customer
 * subscribes through it; webhooks then drive renewals automatically. */
export async function createStripeLinkForSubscription(subscriptionId: string) {
  const Stripe = (await import('stripe')).default;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
  const stripe = new Stripe(key);

  const sub = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { customer: true },
  });
  if (!sub) throw new Error('Subscription not found');
  if (sub.stripePaymentLinkUrl) return { url: sub.stripePaymentLinkUrl, existing: true };

  const product = await stripe.products.create({ name: sub.name });
  const recurring =
    sub.interval === 'YEARLY'
      ? { interval: 'year' as const }
      : sub.interval === 'QUARTERLY'
        ? { interval: 'month' as const, interval_count: 3 }
        : { interval: 'month' as const };
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: Math.round(Number(sub.amount) * 100),
    currency: sub.currency.toLowerCase(),
    recurring,
  });
  const link = await stripe.paymentLinks.create({
    line_items: [{ price: price.id, quantity: 1 }],
    metadata: { autoinvoiceSubscriptionId: sub.id },
    subscription_data: { metadata: { autoinvoiceSubscriptionId: sub.id } },
  });

  await prisma.subscription.update({
    where: { id: sub.id },
    data: { stripePaymentLinkUrl: link.url },
  });
  logger.info('Stripe payment link created for subscription', { subscriptionId, url: link.url });
  return { url: link.url, existing: false };
}

/** Webhook entry: invoice.paid / invoice.payment_failed for Stripe
 * subscriptions. Resolves our Subscription via the Stripe subscription id
 * (externalRef) or the metadata stamped on the payment link. */
export async function handleStripeSubscriptionEvent(event: {
  type: string;
  stripeSubscriptionId?: string | null;
  metadataSubscriptionId?: string | null;
  paidAt?: Date;
}) {
  let sub =
    (event.metadataSubscriptionId
      ? await prisma.subscription.findUnique({ where: { id: event.metadataSubscriptionId } })
      : null) ??
    (event.stripeSubscriptionId
      ? await prisma.subscription.findFirst({ where: { externalRef: event.stripeSubscriptionId } })
      : null);
  if (!sub) return null;

  // first contact: remember the Stripe subscription id
  if (event.stripeSubscriptionId && sub.externalRef !== event.stripeSubscriptionId) {
    sub = await prisma.subscription.update({
      where: { id: sub.id },
      data: { externalRef: event.stripeSubscriptionId },
    });
  }

  if (event.type === 'invoice.paid') {
    return recordRenewal(sub.id, event.paidAt ?? new Date());
  }
  if (event.type === 'invoice.payment_failed') {
    return markPaymentFailed(sub.id, 'stripe payment failed');
  }
  return sub;
}

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { BillingInterval, SubscriptionStatus } from '@prisma/client';
import { router, protectedProcedure } from '../trpc';
import { markPaymentFailed, monthlyAmount, recordRenewal } from '../services/subscriptions';

/** Recurring revenue surface (spec §3.7): Business Builders subscriptions. */

export const subscriptionRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        customerId: z.string(),
        leadId: z.string().optional(),
        name: z.string().min(1),
        interval: z.nativeEnum(BillingInterval).default(BillingInterval.MONTHLY),
        amount: z.number().positive(),
        startDate: z.coerce.date().optional(),
        externalRef: z.string().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.userId },
      });
      if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      const customer = await ctx.prisma.customer.findFirst({
        where: { id: input.customerId, userId: ctx.userId },
      });
      if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });

      const startDate = input.startDate ?? new Date();
      const { advance } = await import('../services/subscriptions');
      return ctx.prisma.subscription.create({
        data: {
          userId: ctx.userId,
          companyId: input.companyId,
          customerId: input.customerId,
          leadId: input.leadId,
          name: input.name,
          interval: input.interval,
          amount: input.amount,
          startDate,
          currentPeriodEnd: advance(startDate, input.interval),
          externalRef: input.externalRef,
          notes: input.notes,
        },
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        customerId: z.string().optional(),
        status: z.nativeEnum(SubscriptionStatus).optional(),
        renewingBefore: z.coerce.date().optional(),
        churnRiskOnly: z.boolean().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.subscription.findMany({
        where: {
          userId: ctx.userId,
          companyId: input.companyId,
          customerId: input.customerId,
          status: input.status,
          churnRisk: input.churnRiskOnly ? true : undefined,
          currentPeriodEnd: input.renewingBefore ? { lte: input.renewingBefore } : undefined,
        },
        include: { customer: { select: { id: true, name: true } } },
        orderBy: { currentPeriodEnd: 'asc' },
      });
    }),

  /** MRR rollup (spec §3.7): active subs normalized to monthly. */
  mrr: protectedProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const subs = await ctx.prisma.subscription.findMany({
        where: {
          userId: ctx.userId,
          companyId: input.companyId,
          status: { in: [SubscriptionStatus.ACTIVE, SubscriptionStatus.PAST_DUE] },
        },
      });
      const mrr = subs.reduce((sum, s) => sum + monthlyAmount(s.amount, s.interval), 0);
      return {
        mrr,
        activeCount: subs.filter((s) => s.status === SubscriptionStatus.ACTIVE).length,
        pastDueCount: subs.filter((s) => s.status === SubscriptionStatus.PAST_DUE).length,
        churnRiskCount: subs.filter((s) => s.churnRisk).length,
      };
    }),

  recordRenewal: protectedProcedure
    .input(z.object({ id: z.string(), paidAt: z.coerce.date().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await ctx.prisma.subscription.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      return recordRenewal(sub.id, input.paidAt);
    }),

  markPaymentFailed: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await ctx.prisma.subscription.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      return markPaymentFailed(sub.id, input.reason);
    }),

  /** Create (or fetch) the recurring Stripe payment link for a subscription. */
  createStripeLink: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sub = await ctx.prisma.subscription.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      const { createStripeLinkForSubscription } = await import('../services/subscriptions');
      return createStripeLinkForSubscription(sub.id);
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        amount: z.number().positive().optional(),
        interval: z.nativeEnum(BillingInterval).optional(),
        cancelAtPeriodEnd: z.boolean().optional(),
        status: z.nativeEnum(SubscriptionStatus).optional(),
        churnRisk: z.boolean().optional(),
        churnReason: z.string().nullable().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const sub = await ctx.prisma.subscription.findFirst({ where: { id, userId: ctx.userId } });
      if (!sub) throw new TRPCError({ code: 'NOT_FOUND', message: 'Subscription not found' });
      return ctx.prisma.subscription.update({
        where: { id },
        data: {
          ...data,
          cancelledAt:
            input.status === SubscriptionStatus.CANCELLED && sub.status !== SubscriptionStatus.CANCELLED
              ? new Date()
              : undefined,
        },
      });
    }),
});

import { z } from 'zod';
import crypto from 'crypto';
import { TRPCError } from '@trpc/server';
import { OrderStatus } from '@prisma/client';
import { router, protectedProcedure } from '../trpc';

/** Orders read surface + fulfillment + ingest-source management (spec §3.5/3.6).
 * Orders are WRITTEN by the ingestion service (webhook / ingest_order MCP tool),
 * never created manually here. */

export const orderRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        customerId: z.string().optional(),
        status: z.nativeEnum(OrderStatus).optional(),
        source: z.string().optional(),
        needsReview: z.boolean().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.order.findMany({
        where: {
          userId: ctx.userId,
          companyId: input.companyId,
          customerId: input.customerId,
          status: input.status,
          source: input.source,
          needsReview: input.needsReview,
          placedAt: { gte: input.from, lte: input.to },
        },
        include: {
          customer: { select: { id: true, name: true } },
          items: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true } },
        },
        orderBy: { placedAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) nextCursor = items.pop()!.id;
      return { items, nextCursor };
    }),

  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    const order = await ctx.prisma.order.findFirst({
      where: { id: input.id, userId: ctx.userId },
      include: {
        customer: true,
        items: { include: { product: true } },
        invoice: true,
      },
    });
    if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
    return order;
  }),

  markFulfilled: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      if (order.status !== OrderStatus.PAID) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: `Cannot fulfill order in ${order.status}` });
      }
      return ctx.prisma.order.update({
        where: { id: order.id },
        data: { status: OrderStatus.FULFILLED, fulfilledAt: new Date() },
      });
    }),

  resolveReview: protectedProcedure
    .input(z.object({ id: z.string(), customerId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const order = await ctx.prisma.order.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!order) throw new TRPCError({ code: 'NOT_FOUND', message: 'Order not found' });
      if (input.customerId) {
        const customer = await ctx.prisma.customer.findFirst({
          where: { id: input.customerId, userId: ctx.userId },
        });
        if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }
      return ctx.prisma.order.update({
        where: { id: order.id },
        data: { needsReview: false, customerId: input.customerId ?? order.customerId },
      });
    }),

  stats: protectedProcedure
    .input(z.object({ companyId: z.string().optional(), from: z.coerce.date().optional(), to: z.coerce.date().optional() }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.prisma.order.groupBy({
        by: ['status'],
        where: {
          userId: ctx.userId,
          companyId: input.companyId,
          placedAt: { gte: input.from, lte: input.to },
        },
        _count: { _all: true },
        _sum: { total: true, refundedAmount: true },
      });
      return grouped.map((g) => ({
        status: g.status,
        count: g._count._all,
        total: Number(g._sum.total ?? 0),
        refunded: Number(g._sum.refundedAmount ?? 0),
      }));
    }),

  // ---- ingest source management (per-store webhook credentials) ----

  createIngestSource: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        key: z.string().regex(/^[a-z0-9-]{3,40}$/),
        name: z.string().min(1),
        kind: z.enum(['stripe', 'shopify', 'custom']),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.userId },
      });
      if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      const secret = crypto.randomBytes(32).toString('hex');
      const source = await ctx.prisma.ingestSource.create({
        data: { ...input, userId: ctx.userId, secret },
      });
      // The secret is returned exactly once, at creation.
      return { ...source, secret };
    }),

  listIngestSources: protectedProcedure
    .input(z.object({ companyId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const sources = await ctx.prisma.ingestSource.findMany({
        where: { userId: ctx.userId, companyId: input.companyId },
        orderBy: { createdAt: 'desc' },
      });
      return sources.map(({ secret, ...rest }) => rest); // never expose secrets on list
    }),

  setIngestSourceActive: protectedProcedure
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const source = await ctx.prisma.ingestSource.findFirst({
        where: { id: input.id, userId: ctx.userId },
      });
      if (!source) throw new TRPCError({ code: 'NOT_FOUND', message: 'Ingest source not found' });
      const updated = await ctx.prisma.ingestSource.update({
        where: { id: source.id },
        data: { active: input.active },
      });
      const { secret, ...rest } = updated;
      return rest;
    }),
});

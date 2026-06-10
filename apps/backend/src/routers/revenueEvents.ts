import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

/**
 * Read surface for the Revenue Event spine (spec §3.2). Events are written
 * exclusively by services/revenue-events.ts — this router is query-only plus
 * a manual ADJUSTMENT escape hatch.
 */

const engineSchema = z.enum(['FIELD_SERVICE', 'SUBSCRIPTION', 'COMMERCE', 'SERVICES', 'OTHER']);

export const revenueEventsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        customerId: z.string().optional(),
        engine: engineSchema.optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(500).default(100),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.revenueEvent.findMany({
        where: {
          company: { userId: ctx.userId },
          companyId: input.companyId,
          customerId: input.customerId,
          engine: input.engine,
          occurredAt: { gte: input.from, lte: input.to },
        },
        include: {
          customer: { select: { id: true, name: true } },
          company: { select: { id: true, name: true } },
        },
        orderBy: { occurredAt: 'desc' },
        take: input.limit + 1,
        ...(input.cursor ? { cursor: { id: input.cursor }, skip: 1 } : {}),
      });
      let nextCursor: string | undefined;
      if (items.length > input.limit) {
        nextCursor = items.pop()!.id;
      }
      return { items, nextCursor };
    }),

  /** Totals by engine (and net) for a period — the "which engine produced the
   * dollar" question, answered without caring how it was produced. */
  summary: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.prisma.revenueEvent.groupBy({
        by: ['engine'],
        where: {
          company: { userId: ctx.userId },
          companyId: input.companyId,
          occurredAt: { gte: input.from, lte: input.to },
        },
        _sum: { amount: true },
        _count: { _all: true },
      });
      const byEngine = grouped.map((g) => ({
        engine: g.engine,
        total: g._sum.amount?.toNumber() ?? 0,
        count: g._count._all,
      }));
      const net = byEngine.reduce((acc, e) => acc + e.total, 0);
      return { byEngine, net };
    }),
});

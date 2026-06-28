import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

/** Inventory-lite product catalog (spec §3.5): SKU, price, COGS, stock counter. */

async function ownedCompany(ctx: any, companyId: string) {
  const company = await ctx.prisma.company.findFirst({
    where: { id: companyId, userId: ctx.userId },
  });
  if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
  return company;
}

export const productRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        sku: z.string().min(1).max(64),
        name: z.string().min(1),
        description: z.string().optional(),
        price: z.number().nonnegative(),
        cogs: z.number().nonnegative().optional(),
        stockQty: z.number().int().default(0),
        lowStockThreshold: z.number().int().min(0).default(0),
      })
    )
    .mutation(async ({ ctx, input }) => {
      await ownedCompany(ctx, input.companyId);
      return ctx.prisma.product.create({ data: { ...input, userId: ctx.userId } });
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        price: z.number().nonnegative().optional(),
        cogs: z.number().nonnegative().nullable().optional(),
        stockQty: z.number().int().optional(),
        lowStockThreshold: z.number().int().min(0).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      const product = await ctx.prisma.product.findFirst({ where: { id, userId: ctx.userId } });
      if (!product) throw new TRPCError({ code: 'NOT_FOUND', message: 'Product not found' });
      return ctx.prisma.product.update({ where: { id }, data });
    }),

  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        active: z.boolean().optional(),
        lowStockOnly: z.boolean().default(false),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const products = await ctx.prisma.product.findMany({
        where: {
          userId: ctx.userId,
          companyId: input.companyId,
          active: input.active,
          ...(input.search
            ? {
                OR: [
                  { name: { contains: input.search, mode: 'insensitive' } },
                  { sku: { contains: input.search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
        orderBy: { sku: 'asc' },
      });
      return input.lowStockOnly
        ? products.filter((p) => p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold)
        : products;
    }),

  /** Margin per SKU per channel (spec §3.5 acceptance). */
  marginReport: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      await ownedCompany(ctx, input.companyId);
      const items = await ctx.prisma.orderItem.findMany({
        where: {
          order: {
            companyId: input.companyId,
            status: { in: ['PAID', 'FULFILLED', 'PARTIALLY_REFUNDED'] },
            placedAt: { gte: input.from, lte: input.to },
          },
        },
        include: { order: { select: { source: true } } },
      });
      const byKey = new Map<
        string,
        { sku: string; channel: string; units: number; revenue: number; cogs: number }
      >();
      for (const it of items) {
        const key = `${it.sku}|${it.order.source}`;
        const row = byKey.get(key) ?? {
          sku: it.sku,
          channel: it.order.source,
          units: 0,
          revenue: 0,
          cogs: 0,
        };
        row.units += it.quantity;
        row.revenue += Number(it.unitPrice) * it.quantity;
        row.cogs += Number(it.unitCogs ?? 0) * it.quantity;
        byKey.set(key, row);
      }
      return [...byKey.values()]
        .map((r) => ({
          ...r,
          margin: r.revenue - r.cogs,
          marginPct: r.revenue > 0 ? ((r.revenue - r.cogs) / r.revenue) * 100 : null,
        }))
        .sort((a, b) => b.margin - a.margin);
    }),
});

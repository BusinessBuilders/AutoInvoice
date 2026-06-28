import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

/**
 * Marketing attribution (spec §3.8). First-touch model:
 *  - Customer.acquisitionSource/Campaign/firstTouchAt snapshot at creation
 *  - RevenueEvent.attributionSource/Campaign copied at emission
 *  - AdSpend is the denominator: CAC = spend / new customers,
 *    ROAS = attributed revenue / spend.
 * This is what tells us which ads build the $1M and which burn it.
 */

const monthKey = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

export const adSpendRouter = router({
  record: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        date: z.coerce.date(),
        channel: z.string().min(1),
        campaign: z.string().default(''),
        spend: z.number().nonnegative(),
        clicks: z.number().int().nonnegative().optional(),
        impressions: z.number().int().nonnegative().optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.userId },
      });
      if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      // upsert: re-importing a day's spend corrects rather than duplicates
      return ctx.prisma.adSpend.upsert({
        where: {
          companyId_date_channel_campaign: {
            companyId: input.companyId,
            date: input.date,
            channel: input.channel,
            campaign: input.campaign,
          },
        },
        update: { spend: input.spend, clicks: input.clicks, impressions: input.impressions, notes: input.notes },
        create: { ...input, userId: ctx.userId },
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        channel: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      return ctx.prisma.adSpend.findMany({
        where: {
          userId: ctx.userId,
          companyId: input.companyId,
          channel: input.channel,
          date: { gte: input.from, lte: input.to },
        },
        orderBy: { date: 'desc' },
      });
    }),

  /** CAC per channel, ROAS per campaign, monthly — first-touch (spec §3.8). */
  report: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        from: z.coerce.date(),
        to: z.coerce.date(),
      })
    )
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.userId },
      });
      if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });

      const [spends, newCustomers, events] = await Promise.all([
        ctx.prisma.adSpend.findMany({
          where: { companyId: input.companyId, date: { gte: input.from, lte: input.to } },
        }),
        ctx.prisma.customer.findMany({
          where: {
            userId: ctx.userId,
            primaryCompanyId: input.companyId,
            firstTouchAt: { gte: input.from, lte: input.to },
          },
          select: { id: true, acquisitionSource: true, acquisitionCampaign: true, firstTouchAt: true },
        }),
        ctx.prisma.revenueEvent.findMany({
          where: {
            companyId: input.companyId,
            occurredAt: { gte: input.from, lte: input.to },
            attributionSource: { not: null },
          },
          select: { amount: true, attributionSource: true, attributionCampaign: true, occurredAt: true },
        }),
      ]);

      type Row = {
        month: string; channel: string;
        spend: number; clicks: number; impressions: number;
        newCustomers: number; cac: number | null;
        attributedRevenue: number; roas: number | null;
      };
      const rows = new Map<string, Row>();
      const row = (month: string, channel: string): Row => {
        const key = `${month}|${channel}`;
        let r = rows.get(key);
        if (!r) {
          r = { month, channel, spend: 0, clicks: 0, impressions: 0, newCustomers: 0, cac: null, attributedRevenue: 0, roas: null };
          rows.set(key, r);
        }
        return r;
      };

      for (const s of spends) {
        const r = row(monthKey(s.date), s.channel);
        r.spend += Number(s.spend);
        r.clicks += s.clicks ?? 0;
        r.impressions += s.impressions ?? 0;
      }
      for (const c of newCustomers) {
        if (!c.acquisitionSource || !c.firstTouchAt) continue;
        row(monthKey(c.firstTouchAt), c.acquisitionSource).newCustomers += 1;
      }
      for (const e of events) {
        row(monthKey(e.occurredAt), e.attributionSource!).attributedRevenue += Number(e.amount);
      }

      const channels = [...rows.values()]
        .map((r) => ({
          ...r,
          cac: r.newCustomers > 0 ? r.spend / r.newCustomers : null,
          roas: r.spend > 0 ? r.attributedRevenue / r.spend : null,
        }))
        .sort((a, b) => a.month.localeCompare(b.month) || a.channel.localeCompare(b.channel));

      // ROAS per campaign over the whole window
      const campaignRows = new Map<string, { campaign: string; spend: number; attributedRevenue: number }>();
      for (const s of spends) {
        if (!s.campaign) continue;
        const r = campaignRows.get(s.campaign) ?? { campaign: s.campaign, spend: 0, attributedRevenue: 0 };
        r.spend += Number(s.spend);
        campaignRows.set(s.campaign, r);
      }
      for (const e of events) {
        if (!e.attributionCampaign) continue;
        const r = campaignRows.get(e.attributionCampaign) ?? { campaign: e.attributionCampaign, spend: 0, attributedRevenue: 0 };
        r.attributedRevenue += Number(e.amount);
        campaignRows.set(e.attributionCampaign, r);
      }
      const campaigns = [...campaignRows.values()].map((r) => ({
        ...r,
        roas: r.spend > 0 ? r.attributedRevenue / r.spend : null,
      }));

      return { channels, campaigns };
    }),

  /** Lifetime value: total revenue events per customer (spec §3.8). */
  ltv: protectedProcedure
    .input(z.object({ customerId: z.string().optional(), companyId: z.string().optional(), top: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const grouped = await ctx.prisma.revenueEvent.groupBy({
        by: ['customerId'],
        where: {
          company: { userId: ctx.userId },
          companyId: input.companyId,
          customerId: input.customerId ?? { not: null },
        },
        _sum: { amount: true },
        _count: { _all: true },
        orderBy: { _sum: { amount: 'desc' } },
        take: input.top,
      });
      const customers = await ctx.prisma.customer.findMany({
        where: { id: { in: grouped.map((g) => g.customerId!).filter(Boolean) } },
        select: { id: true, name: true, acquisitionSource: true, acquisitionCampaign: true },
      });
      const byId = new Map(customers.map((c) => [c.id, c]));
      return grouped.map((g) => ({
        customerId: g.customerId,
        name: byId.get(g.customerId!)?.name ?? null,
        acquisitionSource: byId.get(g.customerId!)?.acquisitionSource ?? null,
        ltv: Number(g._sum.amount ?? 0),
        eventCount: g._count._all,
      }));
    }),
});

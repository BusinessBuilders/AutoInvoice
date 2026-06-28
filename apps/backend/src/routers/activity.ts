import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

/**
 * Activity + communications log (spec §3.3). Calls, emails, texts, site
 * visits, meetings, notes — against customer/lead records. Manual entries and
 * API entries (Eve, automations) share this surface; `source` tells them apart.
 */

const activityTypeSchema = z.enum(['CALL', 'EMAIL', 'SMS', 'MEETING', 'SITE_VISIT', 'NOTE', 'SYSTEM']);
const directionSchema = z.enum(['INBOUND', 'OUTBOUND']);

export const activityRouter = router({
  create: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        customerId: z.string().optional(),
        leadId: z.string().optional(),
        type: activityTypeSchema,
        direction: directionSchema.optional(),
        subject: z.string().max(300).optional(),
        body: z.string().min(1),
        occurredAt: z.coerce.date().optional(),
        source: z.enum(['manual', 'api', 'eve', 'automation', 'system']).default('manual'),
        metadata: z.record(z.unknown()).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      // Validate ownership of the records the activity points at.
      if (input.customerId) {
        const customer = await ctx.prisma.customer.findFirst({
          where: { id: input.customerId, userId: ctx.userId },
          select: { id: true },
        });
        if (!customer) throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }
      if (input.leadId) {
        const lead = await ctx.prisma.lead.findFirst({
          where: { id: input.leadId, userId: ctx.userId },
          select: { id: true },
        });
        if (!lead) throw new TRPCError({ code: 'NOT_FOUND', message: 'Lead not found' });
      }
      if (input.companyId) {
        const company = await ctx.prisma.company.findFirst({
          where: { id: input.companyId, userId: ctx.userId },
          select: { id: true },
        });
        if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      return ctx.prisma.activity.create({
        data: {
          userId: ctx.userId,
          companyId: input.companyId,
          customerId: input.customerId,
          leadId: input.leadId,
          type: input.type,
          direction: input.direction,
          subject: input.subject,
          body: input.body,
          occurredAt: input.occurredAt ?? new Date(),
          source: input.source,
          metadata: input.metadata as object | undefined,
        },
      });
    }),

  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string().optional(),
        customerId: z.string().optional(),
        leadId: z.string().optional(),
        type: activityTypeSchema.optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        cursor: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const items = await ctx.prisma.activity.findMany({
        where: {
          userId: ctx.userId,
          companyId: input.companyId,
          customerId: input.customerId,
          leadId: input.leadId,
          type: input.type,
          occurredAt: {
            gte: input.from,
            lte: input.to,
          },
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
});

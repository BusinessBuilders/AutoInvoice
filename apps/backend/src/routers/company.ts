import { z } from 'zod';
import { randomBytes } from 'crypto';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure } from '../trpc';

function requireAdmin(ctx: any) {
  if (ctx.user.role !== 'OWNER' && ctx.user.role !== 'ADMIN') {
    throw new TRPCError({ code: 'FORBIDDEN', message: 'Owners and admins only' });
  }
}

/** Slugify a company name into a short, readable code prefix. */
function codePrefix(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 2)
    .join('-');
  return slug || 'crew';
}

/** Companies of the holding — powers the company filter on Business OS pages. */
export const companyRouter = router({
  list: protectedProcedure
    .input(z.object({ includeInactive: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      return ctx.prisma.company.findMany({
        where: { userId: ctx.userId, ...(input?.includeInactive ? {} : { active: true }) },
        select: { id: true, name: true, active: true },
        orderBy: { name: 'asc' },
      });
    }),

  /**
   * Per-business crew invite codes — OWNER/ADMIN only. This is the code a hire
   * types at /crew/signup to join that business's time clock.
   */
  crewCodes: protectedProcedure.query(async ({ ctx }) => {
    requireAdmin(ctx);
    return ctx.prisma.company.findMany({
      where: { active: true },
      select: { id: true, name: true, crewSignupCode: true },
      orderBy: { name: 'asc' },
    });
  }),

  /** Generate (or rotate) a company's crew signup code — OWNER/ADMIN only. */
  regenerateCrewCode: protectedProcedure
    .input(z.object({ companyId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      requireAdmin(ctx);
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, active: true },
        select: { id: true, name: true },
      });
      if (!company) throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      const code = `${codePrefix(company.name)}-crew-${randomBytes(4).toString('hex')}`;
      const updated = await ctx.prisma.company.update({
        where: { id: company.id },
        data: { crewSignupCode: code },
        select: { id: true, name: true, crewSignupCode: true },
      });
      return updated;
    }),
});

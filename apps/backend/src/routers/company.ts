import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

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
});

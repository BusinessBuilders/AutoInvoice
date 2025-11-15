import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

const createServiceSchema = z.object({
  name: z.string().min(1),
  code: z.string().min(1),
  category: z.string(),
  description: z.string().optional(),
  basePrice: z.number().optional(),
  priceUnit: z.string().optional(),
});

export const serviceRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return ctx.prisma.service.findMany({
      orderBy: { category: 'asc' },
    });
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.service.findUnique({
        where: { id: input.id },
      });
    }),

  create: protectedProcedure
    .input(createServiceSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.service.create({
        data: input,
      });
    }),

  update: protectedProcedure
    .input(createServiceSchema.partial().extend({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.service.update({
        where: { id },
        data,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.service.delete({
        where: { id: input.id },
      });
    }),
});

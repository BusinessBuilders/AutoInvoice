import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';

const createCustomerSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().optional(),
  company: z.string().optional(),
  nickname: z.array(z.string()).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  zipCode: z.string().optional(),
  defaultRate: z.number().optional(),
  paymentTerms: z.string().default('NET30'),
  taxExempt: z.boolean().default(false),
  notes: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

const updateCustomerSchema = createCustomerSchema.partial().extend({
  id: z.string(),
});

export const customerRouter = router({
  // List all customers
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, search } = input;

      const customers = await ctx.prisma.customer.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        where: search
          ? {
              OR: [
                { name: { contains: search, mode: 'insensitive' } },
                { email: { contains: search, mode: 'insensitive' } },
                { phone: { contains: search } },
                { company: { contains: search, mode: 'insensitive' } },
              ],
            }
          : undefined,
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined = undefined;
      if (customers.length > limit) {
        const nextItem = customers.pop();
        nextCursor = nextItem?.id;
      }

      return {
        customers,
        nextCursor,
      };
    }),

  // Get customer by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const customer = await ctx.prisma.customer.findUnique({
        where: { id: input.id },
        include: {
          invoices: {
            orderBy: { createdAt: 'desc' },
            take: 10,
          },
          locations: true,
          priceOverrides: {
            include: {
              service: true,
            },
          },
        },
      });

      if (!customer) {
        throw new Error('Customer not found');
      }

      return customer;
    }),

  // Create customer
  create: protectedProcedure
    .input(createCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.customer.create({
        data: input,
      });
    }),

  // Update customer
  update: protectedProcedure
    .input(updateCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;
      return ctx.prisma.customer.update({
        where: { id },
        data,
      });
    }),

  // Delete customer
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.customer.delete({
        where: { id: input.id },
      });
    }),

  // Search by nickname or name
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.customer.findMany({
        where: {
          OR: [
            { name: { contains: input.query, mode: 'insensitive' } },
            { nickname: { has: input.query } },
            { email: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      });
    }),
});

import { z } from 'zod';
import { TRPCError } from '@trpc/server';
import { router, protectedProcedure, publicProcedure } from '../trpc';
import { generateCustomerEmbedding } from '../services/embeddings';
import { Prisma } from '@prisma/client';

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
        where: {
          userId: ctx.userId,
          ...(search
            ? {
                OR: [
                  { name: { contains: search, mode: 'insensitive' } },
                  { email: { contains: search, mode: 'insensitive' } },
                  { phone: { contains: search } },
                  { company: { contains: search, mode: 'insensitive' } },
                ],
              }
            : {}),
        },
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
      const customer = await ctx.prisma.customer.findFirst({
        where: { id: input.id, userId: ctx.userId },
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
      const embedding = await generateCustomerEmbedding({
        name: input.name,
        nickname: input.nickname,
        company: input.company,
      });

      const customer = await ctx.prisma.customer.create({
        data: {
          ...input,
          userId: ctx.userId,
        },
      });

      if (embedding) {
        await ctx.prisma.$executeRaw`
          UPDATE "Customer"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${customer.id}
        `;
      }

      return customer;
    }),

  // Update customer
  update: protectedProcedure
    .input(updateCustomerSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      let embedding: number[] | null = null;
      if (data.name || data.nickname || data.company !== undefined) {
        const existing = await ctx.prisma.customer.findFirst({
          where: { id, userId: ctx.userId },
        });

        if (existing) {
          embedding = await generateCustomerEmbedding({
            name: data.name || existing.name,
            nickname: data.nickname || existing.nickname,
            company: data.company !== undefined ? data.company : existing.company,
          });
        }
      }

      const owned = await ctx.prisma.customer.findFirst({ where: { id, userId: ctx.userId } });
      if (!owned) throw new Error('Customer not found');

      const customer = await ctx.prisma.customer.update({
        where: { id },
        data,
      });

      if (embedding) {
        await ctx.prisma.$executeRaw`
          UPDATE "Customer"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${id}
        `;
      }

      return customer;
    }),

  // Delete customer
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const owned = await ctx.prisma.customer.findFirst({ where: { id: input.id, userId: ctx.userId } });
      if (!owned) throw new Error('Customer not found');
      return ctx.prisma.customer.delete({ where: { id: input.id } });
    }),

  // Search by nickname or name
  search: protectedProcedure
    .input(z.object({ query: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.customer.findMany({
        where: {
          userId: ctx.userId,
          OR: [
            { name: { contains: input.query, mode: 'insensitive' } },
            { nickname: { has: input.query } },
            { email: { contains: input.query, mode: 'insensitive' } },
          ],
        },
        take: 10,
      });
    }),

  // Customer 360 timeline (spec §3.3): merged, time-ordered history across all
  // engines. Extended by jobs (P2), orders (P3), subscriptions (P4).
  timeline: protectedProcedure
    .input(
      z.object({
        customerId: z.string(),
        limit: z.number().int().min(1).max(100).default(50),
        before: z.coerce.date().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const customer = await ctx.prisma.customer.findFirst({
        where: { id: input.customerId, userId: ctx.userId },
        select: { id: true, name: true, primaryCompanyId: true },
      });
      if (!customer) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Customer not found' });
      }

      const timeFilter = input.before ? { lt: input.before } : undefined;
      const take = input.limit;

      const [invoices, quotes, leads, activities, revenueEvents] = await Promise.all([
        ctx.prisma.invoice.findMany({
          where: { customerId: customer.id, ...(timeFilter ? { issueDate: timeFilter } : {}) },
          select: { id: true, invoiceNumber: true, status: true, total: true, issueDate: true, companyId: true },
          orderBy: { issueDate: 'desc' },
          take,
        }),
        ctx.prisma.quote.findMany({
          where: { customerId: customer.id, ...(timeFilter ? { createdAt: timeFilter } : {}) },
          select: { id: true, quoteNumber: true, status: true, total: true, createdAt: true, companyId: true },
          orderBy: { createdAt: 'desc' },
          take,
        }),
        ctx.prisma.lead.findMany({
          where: { convertedToCustomerId: customer.id, ...(timeFilter ? { createdAt: timeFilter } : {}) },
          select: { id: true, name: true, status: true, source: true, createdAt: true, companyId: true },
          orderBy: { createdAt: 'desc' },
          take,
        }),
        ctx.prisma.activity.findMany({
          where: { customerId: customer.id, ...(timeFilter ? { occurredAt: timeFilter } : {}) },
          select: { id: true, type: true, subject: true, body: true, occurredAt: true, source: true, companyId: true },
          orderBy: { occurredAt: 'desc' },
          take,
        }),
        ctx.prisma.revenueEvent.findMany({
          where: { customerId: customer.id, ...(timeFilter ? { occurredAt: timeFilter } : {}) },
          select: { id: true, engine: true, eventType: true, amount: true, occurredAt: true, description: true, companyId: true },
          orderBy: { occurredAt: 'desc' },
          take,
        }),
      ]);

      type TimelineItem = {
        kind: 'invoice' | 'quote' | 'lead' | 'activity' | 'revenue_event';
        id: string;
        at: Date;
        title: string;
        amount?: number;
        status?: string;
        companyId?: string | null;
      };

      const items: TimelineItem[] = [
        ...invoices.map((i): TimelineItem => ({
          kind: 'invoice', id: i.id, at: i.issueDate,
          title: `Invoice ${i.invoiceNumber}`, amount: Number(i.total), status: i.status, companyId: i.companyId,
        })),
        ...quotes.map((q): TimelineItem => ({
          kind: 'quote', id: q.id, at: q.createdAt,
          title: `Quote ${q.quoteNumber}`, amount: Number(q.total), status: q.status, companyId: q.companyId,
        })),
        ...leads.map((l): TimelineItem => ({
          kind: 'lead', id: l.id, at: l.createdAt,
          title: `Lead (${l.source})`, status: l.status, companyId: l.companyId,
        })),
        ...activities.map((a): TimelineItem => ({
          kind: 'activity', id: a.id, at: a.occurredAt,
          title: a.subject ?? `${a.type.toLowerCase()}: ${a.body.slice(0, 80)}`, status: a.type, companyId: a.companyId,
        })),
        ...revenueEvents.map((e): TimelineItem => ({
          kind: 'revenue_event', id: e.id, at: e.occurredAt,
          title: e.description ?? `${e.engine} ${e.eventType}`, amount: Number(e.amount), status: e.eventType, companyId: e.companyId,
        })),
      ]
        .sort((a, b) => b.at.getTime() - a.at.getTime())
        .slice(0, input.limit);

      return { customer, items };
    }),

  // Public endpoint for plow route - no auth required
  getPlowRoute: publicProcedure.query(async ({ ctx }) => {
    const customers = await ctx.prisma.customer.findMany({
      where: {
        OR: [
          { tags: { hasSome: ['plow', 'snow', 'Plow', 'Snow'] } },
          { notes: { contains: 'plow', mode: 'insensitive' } },
          { notes: { contains: 'snow', mode: 'insensitive' } },
        ],
      },
      select: {
        id: true,
        name: true,
        addressLine1: true,
        city: true,
        state: true,
      },
    });

    return customers
      .filter((c) => c.addressLine1)
      .map((c) => ({
        id: c.id,
        name: c.name,
        address: c.addressLine1 || '',
        city: c.city || '',
        state: c.state || 'MA',
      }));
  }),
});

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { InvoiceStatus } from '@prisma/client';

const lineItemSchema = z.object({
  serviceId: z.string().optional(),
  description: z.string(),
  quantity: z.number().positive(),
  unit: z.string().optional(),
  rate: z.number(),
  amount: z.number(),
  order: z.number().int(),
});

const createInvoiceSchema = z.object({
  customerId: z.string(),
  locationId: z.string().optional(),
  serviceAddress: z.string().optional(),
  serviceDate: z.coerce.date(),
  dueDate: z.coerce.date(),
  lineItems: z.array(lineItemSchema),
  notes: z.string().optional(),
  terms: z.string().optional(),
  taxRate: z.number().default(0),
  discount: z.number().default(0),
  source: z.string().optional(),
});

export const invoiceRouter = router({
  // List invoices
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
        status: z.nativeEnum(InvoiceStatus).optional(),
        customerId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, status, customerId } = input;

      const invoices = await ctx.prisma.invoice.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          ...(status && { status }),
          ...(customerId && { customerId }),
        },
        include: {
          customer: true,
          lineItems: {
            orderBy: { order: 'asc' },
          },
        },
        orderBy: { createdAt: 'desc' },
      });

      let nextCursor: string | undefined = undefined;
      if (invoices.length > limit) {
        const nextItem = invoices.pop();
        nextCursor = nextItem?.id;
      }

      return {
        invoices,
        nextCursor,
      };
    }),

  // Get invoice by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: input.id },
        include: {
          customer: true,
          location: true,
          lineItems: {
            include: {
              service: true,
            },
            orderBy: { order: 'asc' },
          },
          receipts: true,
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      return invoice;
    }),

  // Create invoice
  create: protectedProcedure
    .input(createInvoiceSchema)
    .mutation(async ({ ctx, input }) => {
      const { lineItems, taxRate, discount, ...invoiceData } = input;

      // Calculate totals
      const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
      const taxAmount = subtotal * (taxRate / 100);
      const total = subtotal + taxAmount - discount;

      // Generate invoice number
      const lastInvoice = await ctx.prisma.invoice.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });

      const lastNumber = lastInvoice
        ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
        : 0;
      const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

      // Create invoice with line items
      return ctx.prisma.invoice.create({
        data: {
          ...invoiceData,
          invoiceNumber,
          subtotal,
          taxRate,
          taxAmount,
          discount,
          total,
          lineItems: {
            create: lineItems,
          },
        },
        include: {
          customer: true,
          lineItems: true,
        },
      });
    }),

  // Update invoice status
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.nativeEnum(InvoiceStatus),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const updates: any = { status: input.status };

      // Set paidDate when marked as PAID
      if (input.status === InvoiceStatus.PAID) {
        updates.paidDate = new Date();
      }

      // Set sentAt when marked as SENT
      if (input.status === InvoiceStatus.SENT) {
        updates.sentAt = new Date();
      }

      return ctx.prisma.invoice.update({
        where: { id: input.id },
        data: updates,
      });
    }),

  // Delete invoice
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.invoice.delete({
        where: { id: input.id },
      });
    }),

  // Get stats
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, draft, sent, paid, overdue] = await Promise.all([
      ctx.prisma.invoice.count(),
      ctx.prisma.invoice.count({ where: { status: InvoiceStatus.DRAFT } }),
      ctx.prisma.invoice.count({ where: { status: InvoiceStatus.SENT } }),
      ctx.prisma.invoice.count({ where: { status: InvoiceStatus.PAID } }),
      ctx.prisma.invoice.count({ where: { status: InvoiceStatus.OVERDUE } }),
    ]);

    const totalRevenue = await ctx.prisma.invoice.aggregate({
      where: { status: InvoiceStatus.PAID },
      _sum: { total: true },
    });

    const outstandingRevenue = await ctx.prisma.invoice.aggregate({
      where: {
        status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] }
      },
      _sum: { total: true },
    });

    return {
      total,
      draft,
      sent,
      paid,
      overdue,
      totalRevenue: totalRevenue._sum.total || 0,
      outstandingRevenue: outstandingRevenue._sum.total || 0,
    };
  }),
});

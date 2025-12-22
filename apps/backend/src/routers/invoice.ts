import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { InvoiceStatus } from '@prisma/client';

const lineItemSchema = z.object({
  serviceId: z.string().nullish(),
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

  // Update invoice
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        customerId: z.string().optional(),
        locationId: z.string().optional(),
        serviceAddress: z.string().optional(),
        serviceDate: z.coerce.date().optional(),
        dueDate: z.coerce.date().optional(),
        lineItems: z.array(lineItemSchema.extend({ id: z.string().optional() })).optional(),
        notes: z.string().optional(),
        terms: z.string().optional(),
        taxRate: z.number().optional(),
        discount: z.number().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, lineItems, taxRate, discount, ...invoiceData } = input;

      // Get current invoice to preserve existing values
      const currentInvoice = await ctx.prisma.invoice.findUnique({
        where: { id },
        include: { lineItems: true },
      });

      if (!currentInvoice) {
        throw new Error('Invoice not found');
      }

      // Use provided values or fall back to current values (default to 0 if null)
      const finalTaxRate = taxRate !== undefined ? taxRate : Number(currentInvoice.taxRate || 0);
      const finalDiscount = discount !== undefined ? discount : Number(currentInvoice.discount || 0);

      // If line items are provided, recalculate totals
      let updates: any = { ...invoiceData };

      if (lineItems) {
        const subtotal = lineItems.reduce((sum, item) => sum + item.amount, 0);
        const taxAmount = subtotal * (finalTaxRate / 100);
        const total = subtotal + taxAmount - finalDiscount;

        updates.subtotal = subtotal;
        updates.taxRate = finalTaxRate;
        updates.taxAmount = taxAmount;
        updates.discount = finalDiscount;
        updates.total = total;

        // Delete all existing line items and create new ones
        await ctx.prisma.lineItem.deleteMany({
          where: { invoiceId: id },
        });

        updates.lineItems = {
          create: lineItems.map(({ id: _id, ...item }) => item),
        };
      } else if (taxRate !== undefined || discount !== undefined) {
        // Recalculate with existing line items if tax/discount changed
        const subtotal = Number(currentInvoice.subtotal);
        const taxAmount = subtotal * (finalTaxRate / 100);
        const total = subtotal + taxAmount - finalDiscount;

        updates.taxRate = finalTaxRate;
        updates.taxAmount = taxAmount;
        updates.discount = finalDiscount;
        updates.total = total;
      }

      return ctx.prisma.invoice.update({
        where: { id },
        data: updates,
        include: {
          customer: true,
          lineItems: {
            include: { service: true },
            orderBy: { order: 'asc' },
          },
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

  // Download PDF
  downloadPdf: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const { generateInvoicePdf } = await import('../services/pdf/professional-generator');
      const path = await import('path');

      // Fetch invoice
      const invoice = await ctx.prisma.invoice.findUnique({
        where: { id: input.id },
        include: {
          customer: true,
          lineItems: {
            include: { service: true },
          },
        },
      });

      if (!invoice) {
        throw new Error('Invoice not found');
      }

      // Fetch user branding
      const user = await ctx.prisma.user.findFirst({
        select: {
          logoPath: true,
          brandColors: true,
          companyName: true,
          companyAddress: true,
          companyPhone: true,
          companyEmail: true,
          companyWebsite: true,
          companyTaxId: true,
        },
      });

      // Prepare branding options
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const logoPath = user?.logoPath ? path.join(uploadDir, user.logoPath) : undefined;
      const brandColors = user?.brandColors as any;
      const primaryColor = brandColors?.primary || process.env.BRAND_COLOR || '#2563eb';

      // Generate PDF
      const pdfBuffer = await generateInvoicePdf({
        invoiceId: input.id,
        template: 'professional',
        logoPath,
        brandColor: primaryColor,
        companyInfo: user ? {
          name: user.companyName || process.env.COMPANY_NAME || 'AutoInvoice',
          address: user.companyAddress || process.env.COMPANY_ADDRESS,
          phone: user.companyPhone || process.env.COMPANY_PHONE,
          email: user.companyEmail || process.env.COMPANY_EMAIL,
          website: user.companyWebsite || process.env.COMPANY_WEBSITE,
          taxId: user.companyTaxId || process.env.COMPANY_TAX_ID,
        } : undefined,
      });

      // Return PDF as base64
      return {
        filename: `${invoice.invoiceNumber}.pdf`,
        data: pdfBuffer.toString('base64'),
      };
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

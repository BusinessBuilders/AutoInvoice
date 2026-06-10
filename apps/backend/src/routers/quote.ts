import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import logger from '../utils/logger';

// Quote calculation formulas
const PRICING_FORMULAS = {
  hydroseed: {
    name: 'Hydroseed',
    unit: 'sqft',
    calculate: (area: number, rate: number = 0.15) => area * rate,
  },
  'lawn-mowing': {
    name: 'Lawn Mowing',
    unit: 'sqft',
    calculate: (area: number, rate: number = 0.05) => area * rate,
  },
  fertilizer: {
    name: 'Fertilizer Application',
    unit: 'sqft',
    calculate: (area: number, rate: number = 0.08) => area * rate,
  },
  mulch: {
    name: 'Mulch Installation',
    unit: 'cubic-yards',
    calculate: (cubicYards: number, rate: number = 65) => cubicYards * rate,
  },
  'tree-trimming': {
    name: 'Tree Trimming',
    unit: 'hour',
    calculate: (hours: number, rate: number = 75) => hours * rate,
  },
  custom: {
    name: 'Custom Service',
    unit: 'unit',
    calculate: (quantity: number, rate: number) => quantity * rate,
  },
};

export const quoteRouter = router({
  /**
   * Calculate quote (hydroseed, lawn mowing, etc.)
   */
  calculate: protectedProcedure
    .input(
      z.object({
        projectType: z.enum(['hydroseed', 'lawn-mowing', 'fertilizer', 'mulch', 'tree-trimming', 'custom']),
        quantity: z.number().positive(),
        rate: z.number().positive().optional(),
        customDescription: z.string().optional(),
      })
    )
    .mutation(({ input }) => {
      const formula = PRICING_FORMULAS[input.projectType];
      const rate = input.rate || 0.15; // Default rate if not provided

      const subtotal = formula.calculate(input.quantity, rate);
      const taxRate = 0.08; // 8% tax (configurable)
      const taxAmount = subtotal * taxRate;
      const total = subtotal + taxAmount;

      return {
        projectType: input.projectType,
        projectName: input.customDescription || formula.name,
        quantity: input.quantity,
        unit: formula.unit,
        rate,
        subtotal: Math.round(subtotal * 100) / 100,
        taxRate,
        taxAmount: Math.round(taxAmount * 100) / 100,
        total: Math.round(total * 100) / 100,
      };
    }),

  /**
   * Create full quote from calculation
   */
  create: protectedProcedure
    .input(
      z.object({
        leadId: z.string().optional(),
        customerId: z.string().optional(),
        projectType: z.string(),
        area: z.number().optional(),
        description: z.string().optional(),
        lineItems: z.array(
          z.object({
            description: z.string(),
            quantity: z.number(),
            unit: z.string().optional(),
            rate: z.number(),
            amount: z.number(),
          })
        ),
        subtotal: z.number(),
        taxRate: z.number().default(0.08),
        taxAmount: z.number(),
        total: z.number(),
        validDays: z.number().default(30),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      // Generate quote number
      const count = await prisma.quote.count();
      const quoteNumber = `Q-${String(count + 1).padStart(5, '0')}`;

      const quote = await prisma.quote.create({
        data: {
          quoteNumber,
          leadId: input.leadId,
          customerId: input.customerId,
          userId: ctx.user.id,
          projectType: input.projectType,
          area: input.area,
          description: input.description,
          subtotal: input.subtotal,
          taxRate: input.taxRate,
          taxAmount: input.taxAmount,
          total: input.total,
          validUntil: new Date(Date.now() + input.validDays * 24 * 60 * 60 * 1000),
          notes: input.notes,
          lineItems: {
            create: input.lineItems.map((item, index) => ({
              ...item,
              order: index,
            })),
          },
        },
        include: {
          lineItems: true,
        },
      });

      // Update lead status if quote is for a lead
      if (input.leadId) {
        await prisma.lead.update({
          where: { id: input.leadId },
          data: {
            status: 'QUOTED',
            convertedToQuoteId: quote.id,
          },
        });
      }

      logger.info('Quote created', {
        quoteId: quote.id,
        quoteNumber: quote.quoteNumber,
        total: quote.total,
      });

      return quote;
    }),

  /**
   * Get quote by ID
   */
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input, ctx }) => {
      const quote = await prisma.quote.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        include: {
          lineItems: {
            orderBy: { order: 'asc' },
          },
          lead: true,
          customer: true,
        },
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      return quote;
    }),

  /**
   * List quotes
   */
  list: protectedProcedure
    .input(
      z.object({
        status: z.enum(['DRAFT', 'SENT', 'VIEWED', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CONVERTED']).optional(),
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        userId: ctx.user.id,
      };

      if (input.status) where.status = input.status;

      const quotes = await prisma.quote.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: input.limit,
        skip: input.offset,
        include: {
          lead: {
            select: { id: true, name: true, phone: true },
          },
          customer: {
            select: { id: true, name: true, email: true },
          },
          lineItems: true,
        },
      });

      return quotes;
    }),

  /**
   * Accept quote (customer acceptance)
   */
  accept: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const quote = await prisma.quote.updateMany({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        data: {
          status: 'ACCEPTED',
          acceptedAt: new Date(),
        },
      });

      logger.info('Quote accepted', { quoteId: input.id });

      return { success: true };
    }),

  /**
   * Convert quote to invoice
   */
  convertToInvoice: protectedProcedure
    .input(
      z.object({
        quoteId: z.string(),
        serviceDate: z.date().optional(),
        dueDate: z.date().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const quote = await prisma.quote.findFirst({
        where: {
          id: input.quoteId,
          userId: ctx.user.id,
        },
        include: {
          lineItems: true,
          lead: true,
          customer: true,
        },
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      // Ensure we have a customer
      let customerId = quote.customerId;

      // If quote is from a lead and not yet converted to customer
      if (!customerId && quote.leadId && quote.lead) {
        // Create customer from lead
        const customer = await prisma.customer.create({
          data: {
            userId: ctx.user.id,
            name: quote.lead.name,
            phone: quote.lead.phone,
            email: quote.lead.email,
            tags: ['from-lead', 'from-quote'],
          },
        });

        customerId = customer.id;

        // Update lead
        await prisma.lead.update({
          where: { id: quote.leadId },
          data: {
            convertedToCustomerId: customer.id,
            status: 'WON',
            convertedAt: new Date(),
          },
        });
      }

      if (!customerId) {
        throw new Error('No customer associated with quote');
      }

      // Generate invoice number
      const count = await prisma.invoice.count();
      const invoiceNumber = `INV-${String(count + 1).padStart(5, '0')}`;

      // Create invoice
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          userId: ctx.user.id,
          customerId,
          serviceDate: input.serviceDate || new Date(),
          issueDate: new Date(),
          dueDate: input.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subtotal: quote.subtotal,
          taxRate: quote.taxRate,
          taxAmount: quote.taxAmount,
          total: quote.total,
          notes: quote.notes,
          terms: quote.terms,
          source: 'quote',
          lineItems: {
            create: quote.lineItems.map((item) => ({
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
              amount: item.amount,
              order: item.order,
            })),
          },
        },
        include: {
          lineItems: true,
          customer: true,
        },
      });

      // Update quote
      await prisma.quote.update({
        where: { id: input.quoteId },
        data: {
          status: 'CONVERTED',
          convertedToInvoiceId: invoice.id,
          convertedAt: new Date(),
        },
      });

      logger.info('Quote converted to invoice', {
        quoteId: input.quoteId,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      });

      return invoice;
    }),

  /**
   * Generate quote message (for SMS)
   */
  generateMessage: protectedProcedure
    .input(z.object({ quoteId: z.string() }))
    .query(async ({ input, ctx }) => {
      const quote = await prisma.quote.findFirst({
        where: {
          id: input.quoteId,
          userId: ctx.user.id,
        },
        include: {
          lead: true,
          customer: true,
        },
      });

      if (!quote) {
        throw new Error('Quote not found');
      }

      const name = quote.lead?.name || quote.customer?.name || 'Customer';

      const message = `Hi ${name}! Here's your quote for ${quote.projectType}:\n\n` +
        `Total: $${quote.total.toFixed(2)}\n` +
        `Valid for ${Math.floor((quote.validUntil.getTime() - Date.now()) / (1000 * 60 * 60 * 24))} days\n\n` +
        `Ready to get started? Just reply YES and I'll schedule you in!`;

      return { message };
    }),
});

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TallyStatus } from '@prisma/client';
import * as smartTemplates from '../services/smart-templates';
import logger from '../utils/logger';

export const tallyRouter = router({
  /**
   * Get or create an open tally for a customer
   */
  getOrCreate: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      source: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Try to find existing open tally
      let tally = await ctx.prisma.tallyInvoice.findFirst({
        where: {
          customerId: input.customerId,
          userId,
          status: TallyStatus.OPEN,
        },
        include: {
          customer: true,
          tallyItems: {
            orderBy: { order: 'asc' },
          },
        },
      });

      // Create new tally if none exists
      if (!tally) {
        tally = await ctx.prisma.tallyInvoice.create({
          data: {
            customerId: input.customerId,
            userId,
            status: TallyStatus.OPEN,
            source: input.source || 'web',
          },
          include: {
            customer: true,
            tallyItems: true,
          },
        });
        logger.info('Created new tally', { tallyId: tally.id, customerId: input.customerId });
      }

      return tally;
    }),

  /**
   * Add item to tally via natural language
   */
  addItem: protectedProcedure
    .input(z.object({
      tallyId: z.string(),
      text: z.string().min(1),
      source: z.enum(['voice', 'text']).optional().default('text'),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Get the tally
      const tally = await ctx.prisma.tallyInvoice.findFirst({
        where: {
          id: input.tallyId,
          userId,
          status: TallyStatus.OPEN,
        },
        include: {
          customer: true,
          tallyItems: true,
        },
      });

      if (!tally) {
        throw new Error('Tally not found or not open');
      }

      // Parse the text using smart templates (reuse existing AI parsing)
      const parsed = await smartTemplates.parseQuickInvoice({
        text: input.text,
        userId,
        autoCreateCustomer: false,
        autoCreateService: false,
      });

      if (!parsed.lineItems || parsed.lineItems.length === 0) {
        throw new Error('Could not parse any line items from input');
      }

      // Add each parsed line item to the tally
      const newItems = [];
      const currentItemCount = tally.tallyItems.length;

      for (let i = 0; i < parsed.lineItems.length; i++) {
        const item = parsed.lineItems[i];
        const newItem = await ctx.prisma.tallyItem.create({
          data: {
            tallyInvoiceId: tally.id,
            serviceId: item.service?.id || null,
            description: item.service?.name || item.description || 'Unnamed item',
            quantity: item.quantity,
            unit: item.unit,
            rate: item.rate,
            amount: item.amount,
            serviceDate: new Date(parsed.date),
            source: input.source,
            rawInput: input.text,
            order: currentItemCount + i,
          },
        });
        newItems.push(newItem);
      }

      // Update tally totals
      const updatedTally = await ctx.prisma.tallyInvoice.update({
        where: { id: tally.id },
        data: {
          subtotal: {
            increment: parsed.total,
          },
          itemCount: {
            increment: newItems.length,
          },
        },
        include: {
          customer: true,
          tallyItems: {
            orderBy: { order: 'asc' },
          },
        },
      });

      // Generate confirmation text
      const itemDesc = newItems.map(i =>
        `${i.quantity} ${i.unit || 'units'} ${i.description}`
      ).join(', ');
      const confirmationText = `Added ${itemDesc}. Tally total is now $${Number(updatedTally.subtotal).toFixed(2)}.`;

      logger.info('Added items to tally', {
        tallyId: tally.id,
        itemCount: newItems.length,
        newTotal: updatedTally.subtotal,
      });

      return {
        tally: updatedTally,
        newItems,
        confirmationText,
      };
    }),

  /**
   * List user's open tallies
   */
  listOpen: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.user.id;

    const tallies = await ctx.prisma.tallyInvoice.findMany({
      where: {
        userId,
        status: TallyStatus.OPEN,
      },
      include: {
        customer: true,
        tallyItems: {
          orderBy: { order: 'asc' },
        },
      },
      orderBy: { updatedAt: 'desc' },
    });

    return tallies;
  }),

  /**
   * Get a specific tally with all items
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const tally = await ctx.prisma.tallyInvoice.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        include: {
          customer: true,
          location: true,
          tallyItems: {
            include: {
              service: true,
            },
            orderBy: { order: 'asc' },
          },
        },
      });

      if (!tally) {
        throw new Error('Tally not found');
      }

      return tally;
    }),

  /**
   * Finalize tally -> create Invoice
   */
  finalize: protectedProcedure
    .input(z.object({
      tallyId: z.string(),
      taxRate: z.number().default(0),
      discount: z.number().default(0),
      dueDate: z.coerce.date().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.user.id;

      // Get the tally with items
      const tally = await ctx.prisma.tallyInvoice.findFirst({
        where: {
          id: input.tallyId,
          userId,
          status: TallyStatus.OPEN,
        },
        include: {
          customer: true,
          tallyItems: {
            orderBy: { order: 'asc' },
          },
        },
      });

      if (!tally) {
        throw new Error('Tally not found or already finalized');
      }

      if (tally.tallyItems.length === 0) {
        throw new Error('Cannot finalize empty tally');
      }

      // Generate invoice number
      const lastInvoice = await ctx.prisma.invoice.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });
      const lastNumber = lastInvoice
        ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
        : 0;
      const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

      // Calculate totals
      const subtotal = Number(tally.subtotal);
      const taxAmount = subtotal * (input.taxRate / 100);
      const total = subtotal + taxAmount - input.discount;

      // Find earliest and latest service dates from items
      const serviceDates = tally.tallyItems.map(i => i.serviceDate);
      const serviceDate = serviceDates.reduce((a, b) => a < b ? a : b);

      // Default due date to 30 days from now if not provided
      const dueDate = input.dueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);

      // Create the invoice
      const invoice = await ctx.prisma.invoice.create({
        data: {
          invoiceNumber,
          customerId: tally.customerId,
          locationId: tally.locationId,
          serviceAddress: tally.serviceAddress,
          serviceDate,
          dueDate,
          subtotal,
          taxRate: input.taxRate,
          taxAmount,
          discount: input.discount,
          total,
          notes: input.notes || `Created from tally`,
          source: 'tally',
          lineItems: {
            create: tally.tallyItems.map((item, index) => ({
              serviceId: item.serviceId,
              description: item.description,
              quantity: item.quantity,
              unit: item.unit,
              rate: item.rate,
              amount: item.amount,
              order: index,
            })),
          },
        },
        include: {
          customer: true,
          lineItems: true,
        },
      });

      // Mark tally as finalized
      await ctx.prisma.tallyInvoice.update({
        where: { id: tally.id },
        data: {
          status: TallyStatus.FINALIZED,
          convertedToInvoiceId: invoice.id,
          convertedAt: new Date(),
        },
      });

      logger.info('Finalized tally to invoice', {
        tallyId: tally.id,
        invoiceId: invoice.id,
        invoiceNumber,
      });

      return invoice;
    }),

  /**
   * Update a tally item
   */
  updateItem: protectedProcedure
    .input(z.object({
      itemId: z.string(),
      description: z.string().optional(),
      quantity: z.number().optional(),
      unit: z.string().optional(),
      rate: z.number().optional(),
      serviceDate: z.coerce.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Get the item and its tally
      const item = await ctx.prisma.tallyItem.findUnique({
        where: { id: input.itemId },
        include: {
          tallyInvoice: true,
        },
      });

      if (!item) {
        throw new Error('Item not found');
      }

      if (item.tallyInvoice.userId !== ctx.user.id) {
        throw new Error('Unauthorized');
      }

      if (item.tallyInvoice.status !== TallyStatus.OPEN) {
        throw new Error('Cannot modify finalized tally');
      }

      // Calculate new amount if quantity or rate changed
      const newQuantity = input.quantity ?? Number(item.quantity);
      const newRate = input.rate ?? Number(item.rate);
      const newAmount = newQuantity * newRate;
      const oldAmount = Number(item.amount);

      // Update the item
      const updatedItem = await ctx.prisma.tallyItem.update({
        where: { id: input.itemId },
        data: {
          description: input.description,
          quantity: input.quantity,
          unit: input.unit,
          rate: input.rate,
          amount: newAmount,
          serviceDate: input.serviceDate,
        },
      });

      // Update tally subtotal if amount changed
      if (newAmount !== oldAmount) {
        await ctx.prisma.tallyInvoice.update({
          where: { id: item.tallyInvoiceId },
          data: {
            subtotal: {
              increment: newAmount - oldAmount,
            },
          },
        });
      }

      // Return updated tally
      const updatedTally = await ctx.prisma.tallyInvoice.findFirst({
        where: { id: item.tallyInvoiceId },
        include: {
          customer: true,
          tallyItems: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return updatedTally;
    }),

  /**
   * Remove an item from tally
   */
  removeItem: protectedProcedure
    .input(z.object({ itemId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Get the item and its tally
      const item = await ctx.prisma.tallyItem.findUnique({
        where: { id: input.itemId },
        include: {
          tallyInvoice: true,
        },
      });

      if (!item) {
        throw new Error('Item not found');
      }

      if (item.tallyInvoice.userId !== ctx.user.id) {
        throw new Error('Unauthorized');
      }

      if (item.tallyInvoice.status !== TallyStatus.OPEN) {
        throw new Error('Cannot modify finalized tally');
      }

      // Delete the item
      await ctx.prisma.tallyItem.delete({
        where: { id: input.itemId },
      });

      // Update tally totals
      const updatedTally = await ctx.prisma.tallyInvoice.update({
        where: { id: item.tallyInvoiceId },
        data: {
          subtotal: {
            decrement: item.amount,
          },
          itemCount: {
            decrement: 1,
          },
        },
        include: {
          customer: true,
          tallyItems: {
            orderBy: { order: 'asc' },
          },
        },
      });

      return updatedTally;
    }),

  /**
   * Cancel/delete a tally
   */
  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const tally = await ctx.prisma.tallyInvoice.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!tally) {
        throw new Error('Tally not found');
      }

      if (tally.status === TallyStatus.FINALIZED) {
        throw new Error('Cannot cancel finalized tally');
      }

      // Mark as cancelled (keeps history)
      await ctx.prisma.tallyInvoice.update({
        where: { id: input.id },
        data: {
          status: TallyStatus.CANCELLED,
        },
      });

      return { success: true };
    }),
});

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import { aiRouter } from '../services/ai';
import logger from '../utils/logger';

export const receiptRouter = router({
  /**
   * Upload and process receipt image
   */
  upload: protectedProcedure
    .input(
      z.object({
        imageBase64: z.string(),
        filename: z.string().optional(),
        paymentMethod: z.enum(['credit_card', 'debit_card', 'cash', 'check', 'other']).optional(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      try {
        // Convert base64 to buffer
        const imageBuffer = Buffer.from(input.imageBase64, 'base64');

        logger.info('Processing receipt upload', {
          userId: ctx.user.id,
          size: imageBuffer.length,
          filename: input.filename,
          paymentMethod: input.paymentMethod,
          hasNotes: !!input.notes,
        });

        // Extract receipt data using AI vision
        const receiptData = await aiRouter.extractReceipt(imageBuffer);

        // Create receipt record with image data
        const receipt = await prisma.receipt.create({
          data: {
            userId: ctx.user.id,
            vendor: receiptData.vendor,
            amount: receiptData.amount,
            date: new Date(receiptData.date),
            category: receiptData.category,
            confidence: receiptData.confidence,
            ocrData: receiptData as any,
            imageData: imageBuffer, // Save image to database
            imageUrl: null, // Optional: Can add S3/storage URL later
            paymentMethod: input.paymentMethod || null,
            notes: input.notes || null,
            status: receiptData.confidence > 0.7 ? 'processed' : 'review_needed',
          },
        });

        logger.info('Receipt processed and saved successfully', {
          receiptId: receipt.id,
          vendor: receiptData.vendor,
          amount: receiptData.amount,
          hasImage: true,
          imageSize: imageBuffer.length,
          paymentMethod: input.paymentMethod,
        });

        return {
          receipt,
          extractedData: receiptData,
        };
      } catch (error) {
        logger.error('Receipt upload error:', error);
        throw new Error('Failed to process receipt');
      }
    }),

  /**
   * Get all receipts for current user
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        status: z.enum(['all', 'processed', 'review_needed', 'pending']).default('all'),
        // New filters
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        category: z.string().optional(),
        paymentMethod: z.enum(['credit_card', 'debit_card', 'cash', 'check', 'other', 'all']).optional(),
        minAmount: z.number().optional(),
        maxAmount: z.number().optional(),
        vendor: z.string().optional(),
        minConfidence: z.number().min(0).max(1).optional(),
        hasInvoice: z.boolean().optional(),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        userId: ctx.user.id,
      };

      if (input.status !== 'all') {
        where.status = input.status;
      }

      // Date range filter
      if (input.startDate || input.endDate) {
        where.date = {
          ...(input.startDate && { gte: input.startDate }),
          ...(input.endDate && { lte: input.endDate }),
        };
      }

      // Category filter
      if (input.category) {
        where.category = { contains: input.category, mode: 'insensitive' };
      }

      // Payment method filter
      if (input.paymentMethod && input.paymentMethod !== 'all') {
        where.paymentMethod = input.paymentMethod;
      }

      // Amount range filter
      if (input.minAmount !== undefined || input.maxAmount !== undefined) {
        where.amount = {
          ...(input.minAmount !== undefined && { gte: input.minAmount }),
          ...(input.maxAmount !== undefined && { lte: input.maxAmount }),
        };
      }

      // Vendor search filter
      if (input.vendor) {
        where.vendor = { contains: input.vendor, mode: 'insensitive' };
      }

      // Confidence filter
      if (input.minConfidence !== undefined) {
        where.confidence = { gte: input.minConfidence };
      }

      // Invoice link filter
      if (input.hasInvoice !== undefined) {
        if (input.hasInvoice) {
          where.invoiceId = { not: null };
        } else {
          where.invoiceId = null;
        }
      }

      const receipts = await prisma.receipt.findMany({
        where,
        orderBy: { date: 'desc' },
        take: input.limit,
        skip: input.offset,
        include: {
          invoice: {
            select: {
              id: true,
              invoiceNumber: true,
              status: true,
            },
          },
        },
      });

      return receipts;
    }),

  /**
   * Get receipt by ID
   */
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const receipt = await prisma.receipt.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        include: {
          invoice: {
            include: {
              customer: true,
              lineItems: true,
            },
          },
        },
      });

      if (!receipt) {
        throw new Error('Receipt not found');
      }

      // Convert imageData Buffer to base64 string for client
      return {
        ...receipt,
        imageData: receipt.imageData ? receipt.imageData.toString('base64') : null,
      };
    }),

  /**
   * Convert receipt to invoice
   */
  convertToInvoice: protectedProcedure
    .input(
      z.object({
        receiptId: z.string(),
        customerId: z.string(),
        notes: z.string().optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const receipt = await prisma.receipt.findFirst({
        where: {
          id: input.receiptId,
          userId: ctx.user.id,
        },
      });

      if (!receipt) {
        throw new Error('Receipt not found');
      }

      if (receipt.invoiceId) {
        throw new Error('Receipt already converted to invoice');
      }

      // Get last invoice number
      const lastInvoice = await prisma.invoice.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { invoiceNumber: true },
      });

      const lastNumber = lastInvoice
        ? parseInt(lastInvoice.invoiceNumber.replace(/\D/g, '')) || 0
        : 0;
      const invoiceNumber = `INV-${String(lastNumber + 1).padStart(6, '0')}`;

      // Create invoice from receipt
      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          customerId: input.customerId,
          serviceDate: receipt.date,
          issueDate: new Date(),
          dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          subtotal: receipt.amount,
          total: receipt.amount,
          status: 'DRAFT',
          source: 'receipt',
          notes: input.notes || `Created from receipt: ${receipt.vendor}`,
          lineItems: {
            create: [
              {
                description: `${receipt.vendor} - ${receipt.category || 'Expense'}`,
                quantity: 1,
                unit: 'unit',
                rate: receipt.amount,
                amount: receipt.amount,
                order: 0,
              },
            ],
          },
        },
        include: {
          customer: true,
          lineItems: true,
        },
      });

      // Link receipt to invoice
      await prisma.receipt.update({
        where: { id: receipt.id },
        data: { invoiceId: invoice.id },
      });

      logger.info('Receipt converted to invoice', {
        receiptId: receipt.id,
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoiceNumber,
      });

      return invoice;
    }),

  /**
   * Delete receipt
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const receipt = await prisma.receipt.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!receipt) {
        throw new Error('Receipt not found');
      }

      if (receipt.invoiceId) {
        throw new Error('Cannot delete receipt linked to invoice');
      }

      await prisma.receipt.delete({
        where: { id: input.id },
      });

      logger.info('Receipt deleted', { receiptId: input.id });

      return { success: true };
    }),

  /**
   * Update receipt status
   */
  updateStatus: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        status: z.enum(['processed', 'review_needed', 'pending']),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const receipt = await prisma.receipt.update({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
        data: {
          status: input.status,
        },
      });

      return receipt;
    }),

  /**
   * Update receipt details
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        category: z.string().optional(),
        notes: z.string().optional(),
        paymentMethod: z.enum(['credit_card', 'debit_card', 'cash', 'check', 'other']).optional(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const { id, ...updateData } = input;

      const receipt = await prisma.receipt.update({
        where: {
          id,
          userId: ctx.user.id,
        },
        data: updateData,
      });

      logger.info('Receipt updated', { receiptId: id, fields: Object.keys(updateData) });
      return receipt;
    }),

  /**
   * Get receipt stats
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, processed, reviewNeeded, totalAmount] = await Promise.all([
      prisma.receipt.count({
        where: { userId: ctx.user.id },
      }),
      prisma.receipt.count({
        where: {
          userId: ctx.user.id,
          status: 'processed',
        },
      }),
      prisma.receipt.count({
        where: {
          userId: ctx.user.id,
          status: 'review_needed',
        },
      }),
      prisma.receipt.aggregate({
        where: { userId: ctx.user.id },
        _sum: {
          amount: true,
        },
      }),
    ]);

    return {
      total,
      processed,
      reviewNeeded,
      totalAmount: totalAmount._sum.amount || 0,
    };
  }),

  getCategoryList: protectedProcedure
    .query(async ({ ctx }) => {
      const receipts = await prisma.receipt.findMany({
        where: { userId: ctx.user.id },
        select: { category: true },
        distinct: ['category'],
      });

      const categories = receipts
        .map((r) => r.category)
        .filter((c): c is string => c !== null && c !== undefined && c.trim() !== '')
        .sort();

      return categories;
    }),
});

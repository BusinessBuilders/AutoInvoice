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
        });

        // Extract receipt data using AI vision
        const receiptData = await aiRouter.extractReceipt(imageBuffer);

        // Create receipt record
        const receipt = await prisma.receipt.create({
          data: {
            userId: ctx.user.id,
            vendor: receiptData.vendor,
            amount: receiptData.amount,
            date: new Date(receiptData.date),
            category: receiptData.category,
            confidence: receiptData.confidence,
            ocrData: receiptData as any,
            imageUrl: null, // TODO: Store in S3/storage
            status: receiptData.confidence > 0.7 ? 'processed' : 'review_needed',
          },
        });

        logger.info('Receipt processed successfully', {
          receiptId: receipt.id,
          vendor: receiptData.vendor,
          amount: receiptData.amount,
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
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        userId: ctx.user.id,
      };

      if (input.status !== 'all') {
        where.status = input.status;
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

      return receipt;
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
});

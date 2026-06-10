import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { prisma } from '../utils/db';
import { aiRouter } from '../services/ai';
import logger from '../utils/logger';
import { createCheckDepositEntry, voidJournalEntry } from '../services/accounting/journal-service';

export const checkRouter = router({
  /**
   * Upload and process check image
   * Extracts check data and attempts to auto-match to an invoice
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

        logger.info('Processing check upload', {
          userId: ctx.user.id,
          size: imageBuffer.length,
          filename: input.filename,
        });

        // Extract check data using AI vision
        const checkData = await aiRouter.extractCheck(imageBuffer);

        logger.info('Check data extracted', {
          checkNumber: checkData.checkNumber,
          amount: checkData.amount,
          date: checkData.date,
          confidence: checkData.confidence,
        });

        // Try to find matching invoice by amount and date range (within 30 days)
        const checkDate = new Date(checkData.date);
        const dateRangeStart = new Date(checkDate);
        dateRangeStart.setDate(dateRangeStart.getDate() - 30);
        const dateRangeEnd = new Date(checkDate);
        dateRangeEnd.setDate(dateRangeEnd.getDate() + 30);

        // Find invoices with matching amount and nearby date
        const matchingInvoices = await prisma.invoice.findMany({
          where: {
            total: checkData.amount,
            serviceDate: {
              gte: dateRangeStart,
              lte: dateRangeEnd,
            },
            status: {
              in: ['SENT', 'VIEWED', 'OVERDUE'],
            },
          },
          include: {
            customer: true,
          },
          orderBy: {
            serviceDate: 'desc',
          },
          take: 5,
        });

        logger.info('Found matching invoices', {
          count: matchingInvoices.length,
          invoices: matchingInvoices.map((inv: typeof matchingInvoices[number]) => ({
            id: inv.id,
            number: inv.invoiceNumber,
            amount: inv.total,
            customer: inv.customer.name,
          })),
        });

        // Auto-match if we have exactly one high-confidence match
        let matchedInvoiceId: string | null = null;
        let autoMatched = false;
        let journalEntryId: string | null = null;

        // Create check record first (needed for journal entry)
        const checkData_temp = {
          userId: ctx.user.id,
          checkNumber: checkData.checkNumber,
          amount: checkData.amount,
          date: new Date(checkData.date),
          payee: checkData.payee,
          memo: checkData.memo,
          confidence: checkData.confidence,
          ocrData: checkData as any,
          imageUrl: null, // TODO: Store in S3/storage
          status: 'pending',
          invoiceId: null,
          matchedAt: null,
          processed: false,
          journalEntryId: null,
        };

        const check = await prisma.check.create({
          data: checkData_temp,
        });

        // Now try auto-matching
        if (matchingInvoices.length === 1 && checkData.confidence > 0.8) {
          matchedInvoiceId = matchingInvoices[0].id;
          autoMatched = true;

          try {
            // Create journal entry for check deposit
            const journalEntryResult = await createCheckDepositEntry(
              check,
              ctx.user.id,
              matchedInvoiceId
            );
            journalEntryId = journalEntryResult.id;

            // Mark invoice as PAID
            await prisma.invoice.update({
              where: { id: matchedInvoiceId },
              data: {
                status: 'PAID',
                paidDate: new Date(checkData.date),
              },
            });

            // Update check with match and journal entry
            await prisma.check.update({
              where: { id: check.id },
              data: {
                status: 'matched',
                invoiceId: matchedInvoiceId,
                matchedAt: new Date(),
                processed: true,
                journalEntryId,
              },
            });

            logger.info('Auto-matched, created journal entry, and marked invoice as PAID', {
              checkId: check.id,
              invoiceId: matchedInvoiceId,
              invoiceNumber: matchingInvoices[0].invoiceNumber,
              journalEntryId,
            });
          } catch (error) {
            logger.error('Failed to create journal entry during auto-match', {
              checkId: check.id,
              invoiceId: matchedInvoiceId,
              error,
            });
            // Don't fail the whole operation - just mark check for review
            await prisma.check.update({
              where: { id: check.id },
              data: {
                status: 'review_needed',
              },
            });
          }
        }

        logger.info('Check record created', {
          checkId: check.id,
          checkNumber: check.checkNumber,
          status: check.status,
          autoMatched,
        });

        return {
          check,
          extractedData: checkData,
          matchingInvoices: matchingInvoices.map((inv: typeof matchingInvoices[number]) => ({
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            total: inv.total,
            serviceDate: inv.serviceDate,
            customer: {
              id: inv.customer.id,
              name: inv.customer.name,
            },
          })),
          autoMatched,
          matchedInvoiceId,
        };
      } catch (error) {
        logger.error('Check upload error:', error);
        throw new Error('Failed to process check');
      }
    }),

  /**
   * Manually match a check to an invoice
   */
  matchToInvoice: protectedProcedure
    .input(
      z.object({
        checkId: z.string(),
        invoiceId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const check = await prisma.check.findFirst({
        where: {
          id: input.checkId,
          userId: ctx.user.id,
        },
      });

      if (!check) {
        throw new Error('Check not found');
      }

      if (check.invoiceId) {
        throw new Error('Check already matched to an invoice');
      }

      if (check.journalEntryId) {
        throw new Error('Check already has a journal entry');
      }

      try {
        // Create journal entry for check deposit
        const journalEntryResult = await createCheckDepositEntry(
          check,
          ctx.user.id,
          input.invoiceId
        );

        // Update check
        const updatedCheck = await prisma.check.update({
          where: { id: input.checkId },
          data: {
            invoiceId: input.invoiceId,
            status: 'matched',
            matchedAt: new Date(),
            processed: true,
            journalEntryId: journalEntryResult.id,
          },
        });

        // Mark invoice as PAID
        await prisma.invoice.update({
          where: { id: input.invoiceId },
          data: {
            status: 'PAID',
            paidDate: check.date,
          },
        });

        logger.info('Check manually matched to invoice with journal entry', {
          checkId: input.checkId,
          invoiceId: input.invoiceId,
          journalEntryId: journalEntryResult.id,
        });

        return updatedCheck;
      } catch (error) {
        logger.error('Failed to match check and create journal entry', {
          checkId: input.checkId,
          invoiceId: input.invoiceId,
          error,
        });
        throw error;
      }
    }),

  /**
   * Get all checks for current user
   */
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        offset: z.number().min(0).default(0),
        status: z.enum(['all', 'pending', 'matched', 'processed', 'review_needed']).default('all'),
      })
    )
    .query(async ({ input, ctx }) => {
      const where: any = {
        userId: ctx.user.id,
      };

      if (input.status !== 'all') {
        where.status = input.status;
      }

      const checks = await prisma.check.findMany({
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
              customer: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      });

      return checks;
    }),

  /**
   * Get check by ID
   */
  getById: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .query(async ({ input, ctx }) => {
      const check = await prisma.check.findFirst({
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

      if (!check) {
        throw new Error('Check not found');
      }

      return check;
    }),

  /**
   * Unmatch a check from its invoice
   * Voids the journal entry and reverts invoice status
   */
  unmatchCheck: protectedProcedure
    .input(
      z.object({
        checkId: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const check = await prisma.check.findFirst({
        where: {
          id: input.checkId,
          userId: ctx.user.id,
        },
        include: {
          invoice: true,
        },
      });

      if (!check) {
        throw new Error('Check not found');
      }

      if (!check.invoiceId) {
        throw new Error('Check is not matched to an invoice');
      }

      try {
        // Void journal entry if it exists
        if (check.journalEntryId) {
          await voidJournalEntry(
            check.journalEntryId,
            ctx.user.id,
            'Check unmatched from invoice'
          );
        }

        // Revert invoice status
        if (check.invoice) {
          await prisma.invoice.update({
            where: { id: check.invoice.id },
            data: {
              status: 'SENT', // Revert to sent status
              paidDate: null,
            },
          });
        }

        // Update check to unmatched state
        const updatedCheck = await prisma.check.update({
          where: { id: input.checkId },
          data: {
            invoiceId: null,
            journalEntryId: null,
            status: 'pending',
            matchedAt: null,
            processed: false,
          },
        });

        logger.info('Check unmatched and journal entry voided', {
          checkId: input.checkId,
          invoiceId: check.invoiceId,
          journalEntryId: check.journalEntryId,
        });

        return updatedCheck;
      } catch (error) {
        logger.error('Failed to unmatch check', {
          checkId: input.checkId,
          error,
        });
        throw error;
      }
    }),

  /**
   * Delete check
   */
  delete: protectedProcedure
    .input(
      z.object({
        id: z.string(),
      })
    )
    .mutation(async ({ input, ctx }) => {
      const check = await prisma.check.findFirst({
        where: {
          id: input.id,
          userId: ctx.user.id,
        },
      });

      if (!check) {
        throw new Error('Check not found');
      }

      if (check.processed) {
        throw new Error('Cannot delete processed check');
      }

      await prisma.check.delete({
        where: { id: input.id },
      });

      logger.info('Check deleted', { checkId: input.id });

      return { success: true };
    }),

  /**
   * Get check stats
   */
  stats: protectedProcedure.query(async ({ ctx }) => {
    const [total, matched, pending, totalAmount] = await Promise.all([
      prisma.check.count({
        where: { userId: ctx.user.id },
      }),
      prisma.check.count({
        where: {
          userId: ctx.user.id,
          status: 'matched',
        },
      }),
      prisma.check.count({
        where: {
          userId: ctx.user.id,
          status: 'pending',
        },
      }),
      prisma.check.aggregate({
        where: { userId: ctx.user.id },
        _sum: {
          amount: true,
        },
      }),
    ]);

    return {
      total,
      matched,
      pending,
      totalAmount: totalAmount._sum.amount || 0,
    };
  }),
});

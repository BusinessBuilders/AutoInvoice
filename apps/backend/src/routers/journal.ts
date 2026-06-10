import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { JournalStatus, JournalSourceType } from '@prisma/client';
import { TRPCError } from '@trpc/server';

const journalLineSchema = z.object({
  accountId: z.string(),
  debit: z.number().default(0),
  credit: z.number().default(0),
  customerId: z.string().optional(),
  description: z.string().optional(),
  lineOrder: z.number().int().default(0),
  tags: z.array(z.string()).default([]),
});

const createJournalEntrySchema = z.object({
  entryDate: z.coerce.date(),
  description: z.string().min(1),
  notes: z.string().optional(),
  sourceType: z.nativeEnum(JournalSourceType),
  sourceId: z.string().optional(),
  referenceNumber: z.string().optional(),
  lines: z.array(journalLineSchema),
  tags: z.array(z.string()).default([]),
  customFields: z.record(z.any()).optional(),
});

export const journalRouter = router({
  // List journal entries
  list: protectedProcedure
    .input(
      z.object({
        limit: z.number().min(1).max(100).default(50),
        cursor: z.string().optional(),
        status: z.nativeEnum(JournalStatus).optional(),
        sourceType: z.nativeEnum(JournalSourceType).optional(),
        startDate: z.coerce.date().optional(),
        endDate: z.coerce.date().optional(),
        accountId: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { limit, cursor, status, sourceType, startDate, endDate, accountId } = input;

      const entries = await ctx.prisma.journalEntry.findMany({
        take: limit + 1,
        cursor: cursor ? { id: cursor } : undefined,
        where: {
          userId: ctx.user.id,
          ...(status && { status }),
          ...(sourceType && { sourceType }),
          ...(startDate || endDate
            ? {
                entryDate: {
                  ...(startDate && { gte: startDate }),
                  ...(endDate && { lte: endDate }),
                },
              }
            : {}),
          ...(accountId && {
            lines: {
              some: {
                accountId,
              },
            },
          }),
        },
        include: {
          lines: {
            include: {
              account: true,
              customer: true,
            },
            orderBy: {
              lineOrder: 'asc',
            },
          },
        },
        orderBy: {
          entryDate: 'desc',
        },
      });

      let nextCursor: string | undefined = undefined;
      if (entries.length > limit) {
        const nextItem = entries.pop();
        nextCursor = nextItem?.id;
      }

      return {
        entries,
        nextCursor,
      };
    }),

  // Get journal entry by ID
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const entry = await ctx.prisma.journalEntry.findUnique({
        where: { id: input.id },
        include: {
          lines: {
            include: {
              account: true,
              customer: true,
            },
            orderBy: {
              lineOrder: 'asc',
            },
          },
        },
      });

      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Journal entry not found',
        });
      }

      return entry;
    }),

  // Create manual journal entry
  create: protectedProcedure
    .input(createJournalEntrySchema)
    .mutation(async ({ ctx, input }) => {
      const { lines, ...entryData } = input;

      // Validate that debits equal credits
      const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
      const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Journal entry must balance. Debits: ${totalDebits}, Credits: ${totalCredits}`,
        });
      }

      // Validate each line has either debit or credit, not both
      for (const line of lines) {
        if (line.debit > 0 && line.credit > 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A journal line cannot have both debit and credit amounts',
          });
        }
        if (line.debit === 0 && line.credit === 0) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'A journal line must have either a debit or credit amount',
          });
        }
      }

      // Validate all accounts exist and allow manual entries
      for (const line of lines) {
        const account = await ctx.prisma.account.findUnique({
          where: { id: line.accountId },
        });

        if (!account) {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Account ${line.accountId} not found`,
          });
        }

        if (!account.allowManualEntries && entryData.sourceType === 'MANUAL') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: `Account ${account.name} does not allow manual entries`,
          });
        }
      }

      // Generate entry number for this user
      const lastEntry = await ctx.prisma.journalEntry.findFirst({
        where: { userId: ctx.user.id },
        orderBy: { createdAt: 'desc' },
        select: { entryNumber: true },
      });

      const lastNumber = lastEntry
        ? parseInt(lastEntry.entryNumber.replace(/\D/g, '')) || 0
        : 0;
      const entryNumber = `JE-${String(lastNumber + 1).padStart(6, '0')}`;

      // Create entry with lines
      return ctx.prisma.journalEntry.create({
        data: {
          ...entryData,
          userId: ctx.user.id,
          entryNumber,
          status: 'DRAFT',
          lines: {
            create: lines.map((line, index) => ({
              ...line,
              lineOrder: line.lineOrder || index,
            })) as any,
          },
        },
        include: {
          lines: {
            include: {
              account: true,
              customer: true,
            },
            orderBy: {
              lineOrder: 'asc',
            },
          },
        },
      });
    }),

  // Post a DRAFT entry (makes it POSTED, updates balances)
  post: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.prisma.journalEntry.findUnique({
        where: { id: input.id },
        include: {
          lines: {
            include: {
              account: true,
            },
          },
        },
      });

      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Journal entry not found',
        });
      }

      if (entry.status === 'POSTED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Journal entry is already posted',
        });
      }

      if (entry.status === 'VOIDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot post a voided journal entry',
        });
      }

      // Verify entry is balanced
      const totalDebits = entry.lines.reduce((sum, line) => sum + Number(line.debit), 0);
      const totalCredits = entry.lines.reduce((sum, line) => sum + Number(line.credit), 0);

      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot post unbalanced journal entry',
        });
      }

      // Update account balances
      for (const line of entry.lines) {
        const debit = Number(line.debit);
        const credit = Number(line.credit);
        const account = line.account;

        let balanceChange = 0;
        if (account.balanceType === 'DEBIT') {
          balanceChange = debit - credit;
        } else {
          balanceChange = credit - debit;
        }

        await ctx.prisma.account.update({
          where: { id: line.accountId },
          data: {
            balance: {
              increment: balanceChange,
            },
            balanceAsOf: new Date(),
          },
        });
      }

      // Mark entry as posted
      return ctx.prisma.journalEntry.update({
        where: { id: input.id },
        data: {
          status: 'POSTED',
          postedAt: new Date(),
          postedBy: ctx.userId,
        },
        include: {
          lines: {
            include: {
              account: true,
              customer: true,
            },
            orderBy: {
              lineOrder: 'asc',
            },
          },
        },
      });
    }),

  // Void an entry
  void: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        reason: z.string().min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const entry = await ctx.prisma.journalEntry.findUnique({
        where: { id: input.id },
        include: {
          lines: {
            include: {
              account: true,
            },
          },
        },
      });

      if (!entry) {
        throw new TRPCError({
          code: 'NOT_FOUND',
          message: 'Journal entry not found',
        });
      }

      if (entry.status === 'VOIDED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Journal entry is already voided',
        });
      }

      // If entry was posted, reverse the balance changes
      if (entry.status === 'POSTED') {
        for (const line of entry.lines) {
          const debit = Number(line.debit);
          const credit = Number(line.credit);
          const account = line.account;

          let balanceChange = 0;
          if (account.balanceType === 'DEBIT') {
            balanceChange = -(debit - credit);
          } else {
            balanceChange = -(credit - debit);
          }

          await ctx.prisma.account.update({
            where: { id: line.accountId },
            data: {
              balance: {
                increment: balanceChange,
              },
              balanceAsOf: new Date(),
            },
          });
        }
      }

      // Mark entry as voided
      return ctx.prisma.journalEntry.update({
        where: { id: input.id },
        data: {
          status: 'VOIDED',
          voidedAt: new Date(),
          voidedBy: ctx.userId,
          voidReason: input.reason,
        },
        include: {
          lines: {
            include: {
              account: true,
              customer: true,
            },
            orderBy: {
              lineOrder: 'asc',
            },
          },
        },
      });
    }),

  // Get entries for a source document (invoice/receipt/check)
  getBySource: protectedProcedure
    .input(
      z.object({
        sourceType: z.nativeEnum(JournalSourceType),
        sourceId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const entries = await ctx.prisma.journalEntry.findMany({
        where: {
          sourceType: input.sourceType,
          sourceId: input.sourceId,
        },
        include: {
          lines: {
            include: {
              account: true,
              customer: true,
            },
            orderBy: {
              lineOrder: 'asc',
            },
          },
        },
        orderBy: {
          entryDate: 'desc',
        },
      });

      return entries;
    }),
});

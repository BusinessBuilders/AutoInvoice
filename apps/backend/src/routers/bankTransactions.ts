/**
 * Bank Transactions Router
 *
 * CRUD operations for bank transactions + import + auto-categorization
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { categorizeTransactions } from '../services/accounting/rule-matching';
import { Decimal } from '@prisma/client/runtime/library';
import logger from '../utils/logger';

const createTransactionSchema = z.object({
  companyId: z.string(),
  bankAccountId: z.string(),
  date: z.string().or(z.date()),
  description: z.string(),
  amount: z.number(),
  balance: z.number(),
  taxAccountId: z.string().optional(),
  notes: z.string().optional(),
});

const updateTransactionSchema = z.object({
  id: z.string(),
  taxAccountId: z.string().optional().nullable(),
  needsReview: z.boolean().optional(),
  notes: z.string().optional(),
  isManualCategorization: z.boolean().optional(),
});

const importTransactionSchema = z.object({
  companyId: z.string(),
  bankAccountId: z.string().optional(), // Optional - can auto-create from bankInfo
  bankInfo: z.object({
    bankName: z.string().optional(),
    accountNumber: z.string().optional(), // Last 4 digits
    accountType: z.enum(['checking', 'savings', 'credit_card']).optional(),
  }).optional(),
  transactions: z.array(
    z.object({
      date: z.string(),
      description: z.string(),
      amount: z.number(),
      balance: z.number(),
    })
  ),
  autoCategorize: z.boolean().default(true),
});

// Helper to convert Decimal to number
function decimalToNumber(val: Decimal | number | null): number {
  if (val === null) return 0;
  if (typeof val === 'number') return val;
  return val.toNumber();
}

export const bankTransactionsRouter = router({
  // List transactions with filters
  list: protectedProcedure
    .input(
      z.object({
        bankAccountId: z.string().optional(),
        companyId: z.string(),
        needsReview: z.boolean().optional(),
        taxAccountId: z.string().optional(),
        vendorId: z.string().optional(), // Filter by vendor
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(5000).default(100),
        offset: z.number().min(0).default(0),
        hideSplitChildren: z.boolean().default(true), // Don't show split children by default
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, bankAccountId, needsReview, taxAccountId, vendorId, startDate, endDate, search, limit, offset, hideSplitChildren } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const where: any = {
        companyId,
        ...(bankAccountId && { bankAccountId }),
        ...(needsReview !== undefined && { needsReview }),
        ...(taxAccountId && { taxAccountId }),
        ...(vendorId && { vendorId }),
        ...(search && {
          description: { contains: search, mode: 'insensitive' },
        }),
        // Hide split children (they're shown nested under parent)
        ...(hideSplitChildren && { parentId: null }),
      };

      // Handle date filters
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate);
        if (endDate) where.date.lte = new Date(endDate);
      }

      const [transactions, total] = await Promise.all([
        ctx.prisma.bankTransaction.findMany({
          where,
          include: {
            bankAccount: {
              select: { id: true, name: true, accountNumber: true },
            },
            taxAccount: {
              select: { id: true, code: true, name: true, taxTreatment: true },
            },
            matchedRule: {
              select: { id: true, name: true },
            },
            vendor: {
              select: { id: true, name: true, requiresSplit: true },
            },
            // Include split children for parent transactions
            splits: {
              include: {
                taxAccount: {
                  select: { id: true, code: true, name: true },
                },
              },
              orderBy: { splitIndex: 'asc' },
            },
          },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.bankTransaction.count({ where }),
      ]);

      return {
        transactions,
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total,
      };
    }),

  // Get single transaction
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const transaction = await ctx.prisma.bankTransaction.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          bankAccount: true,
          taxAccount: true,
          matchedRule: true,
        },
      });

      if (!transaction) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      if (transaction.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return transaction;
    }),

  // Create single transaction
  create: protectedProcedure
    .input(createTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const bankAccount = await ctx.prisma.bankAccount.findFirst({
        where: { id: input.bankAccountId, companyId: input.companyId },
      });

      if (!bankAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bank account not found' });
      }

      const transaction = await ctx.prisma.bankTransaction.create({
        data: {
          companyId: input.companyId,
          bankAccountId: input.bankAccountId,
          date: new Date(input.date),
          description: input.description,
          amount: input.amount,
          balance: input.balance,
          taxAccountId: input.taxAccountId,
          notes: input.notes,
          needsReview: !input.taxAccountId,
          importSource: 'manual',
        },
      });

      return transaction;
    }),

  // Update transaction (categorize, add notes, etc.)
  update: protectedProcedure
    .input(updateTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.prisma.bankTransaction.findUnique({
        where: { id },
        include: { company: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      // If categorizing, update needsReview
      const updateData: any = { ...data };
      if (data.taxAccountId) {
        updateData.needsReview = false;
        updateData.isManualCategorization = true;
      }

      const updated = await ctx.prisma.bankTransaction.update({
        where: { id },
        data: updateData,
        include: {
          taxAccount: true,
        },
      });

      return updated;
    }),

  // Bulk update transactions
  bulkUpdate: protectedProcedure
    .input(
      z.object({
        ids: z.array(z.string()),
        taxAccountId: z.string().optional(),
        needsReview: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { ids, taxAccountId, needsReview } = input;

      // Verify all transactions belong to user
      const transactions = await ctx.prisma.bankTransaction.findMany({
        where: { id: { in: ids } },
        include: { company: true },
      });

      for (const t of transactions) {
        if (t.company.userId !== ctx.user.id) {
          throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
        }
      }

      const updateData: any = {};
      if (taxAccountId) {
        updateData.taxAccountId = taxAccountId;
        updateData.needsReview = false;
        updateData.isManualCategorization = true;
      }
      if (needsReview !== undefined) {
        updateData.needsReview = needsReview;
      }

      const result = await ctx.prisma.bankTransaction.updateMany({
        where: { id: { in: ids } },
        data: updateData,
      });

      return { updated: result.count };
    }),

  // Delete transaction
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.bankTransaction.findUnique({
        where: { id: input.id },
        include: { company: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      await ctx.prisma.bankTransaction.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Bulk delete transactions
  bulkDelete: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const { ids } = input;

      // Verify user owns all these transactions
      const transactions = await ctx.prisma.bankTransaction.findMany({
        where: { id: { in: ids } },
        include: { company: true },
      });

      const unauthorized = transactions.filter(t => t.company.userId !== ctx.user.id);
      if (unauthorized.length > 0) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized to delete some transactions' });
      }

      const result = await ctx.prisma.bankTransaction.deleteMany({
        where: { id: { in: ids } },
      });

      return { deleted: result.count };
    }),

  // Check for duplicates before importing
  checkDuplicates: protectedProcedure
    .input(z.object({
      bankAccountId: z.string(),
      transactions: z.array(z.object({
        date: z.string(),
        description: z.string(),
        amount: z.number(),
      })),
    }))
    .query(async ({ ctx, input }) => {
      const { bankAccountId, transactions } = input;

      if (transactions.length === 0) {
        return { duplicates: 0, newTransactions: 0 };
      }

      // Get existing transactions in the date range
      const dates = transactions.map(t => new Date(t.date));
      const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
      const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

      const existing = await ctx.prisma.bankTransaction.findMany({
        where: {
          bankAccountId,
          date: { gte: minDate, lte: maxDate },
        },
        select: { date: true, description: true, amount: true },
      });

      // Create signature set for O(1) lookup
      const existingSet = new Set(
        existing.map(t =>
          `${t.date.toISOString().split('T')[0]}|${t.description}|${Number(t.amount)}`
        )
      );

      // Count duplicates
      let duplicates = 0;
      for (const t of transactions) {
        const signature = `${t.date}|${t.description}|${t.amount}`;
        if (existingSet.has(signature)) {
          duplicates++;
        }
      }

      return {
        duplicates,
        newTransactions: transactions.length - duplicates,
      };
    }),

  // Import transactions from CSV/JSON data
  import: protectedProcedure
    .input(importTransactionSchema)
    .mutation(async ({ ctx, input }) => {
      const { companyId, bankAccountId, bankInfo, transactions, autoCategorize } = input;

      // Generate a unique batch ID for this import
      const importBatchId = `import_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const importSource = bankInfo?.bankName ? 'pdf_vision' : 'json';

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      let finalBankAccountId = bankAccountId;

      // If no bankAccountId provided, try to find or create from bankInfo
      if (!finalBankAccountId && bankInfo?.bankName) {
        // Try to find existing account - first by accountNumber (most specific), then by bankName
        let existing = null;

        // Priority 1: Search by accountNumber if provided (unique per company)
        if (bankInfo.accountNumber) {
          existing = await ctx.prisma.bankAccount.findFirst({
            where: { companyId, accountNumber: bankInfo.accountNumber },
          });
        }

        // Priority 2: If no accountNumber match, try bankName
        if (!existing) {
          existing = await ctx.prisma.bankAccount.findFirst({
            where: {
              companyId,
              bankName: { contains: bankInfo.bankName, mode: 'insensitive' },
            },
          });
        }

        if (existing) {
          finalBankAccountId = existing.id;
        } else {
          // Auto-create the bank account
          const { AccountType, BalanceType } = await import('@prisma/client');

          // Determine account type - check if it looks like a credit card
          const bankNameLower = bankInfo.bankName?.toLowerCase() || '';
          const isCreditCard = bankInfo.accountType === 'credit_card' ||
            bankNameLower.includes('credit') ||
            bankNameLower.includes('card') ||
            bankNameLower.includes('amex') ||
            bankNameLower.includes('american express') ||
            bankNameLower.includes('visa') ||
            bankNameLower.includes('mastercard') ||
            bankNameLower.includes('discover') ||
            bankNameLower.includes('capital one') ||
            bankNameLower.includes('chase sapphire') ||
            bankNameLower.includes('citi');

          const accountType = isCreditCard ? 'credit_card' : (bankInfo.accountType || 'checking');
          const chartAccountType = isCreditCard ? AccountType.LIABILITY : AccountType.ASSET;

          // Generate next account code
          const baseCode = chartAccountType === AccountType.LIABILITY ? 2100 : 1010;
          const existingCodes = await ctx.prisma.account.findMany({
            where: {
              userId: ctx.user.id,
              code: { gte: String(baseCode), lt: String(baseCode + 100) },
            },
            select: { code: true },
            orderBy: { code: 'desc' },
          });
          const code = existingCodes.length === 0
            ? String(baseCode)
            : String(Math.max(...existingCodes.map(a => parseInt(a.code))) + 1);

          // Create Chart of Accounts entry
          const chartName = isCreditCard
            ? `Credit Card - ${bankInfo.bankName}`
            : `${bankInfo.bankName}${bankInfo.accountNumber ? ` (****${bankInfo.accountNumber})` : ''}`;

          const linkedAccount = await ctx.prisma.account.create({
            data: {
              userId: ctx.user.id,
              code,
              name: chartName,
              accountType: chartAccountType,
              balanceType: chartAccountType === AccountType.LIABILITY ? BalanceType.CREDIT : BalanceType.DEBIT,
              balance: 0,
              active: true,
              systemAccount: true,
              allowManualEntries: false,
              description: `Auto-created from statement import`,
            },
          });

          // Create bank account
          const newBankAccount = await ctx.prisma.bankAccount.create({
            data: {
              companyId,
              name: bankInfo.bankName,
              accountNumber: bankInfo.accountNumber,
              bankName: bankInfo.bankName,
              accountType,
              linkedAccountId: linkedAccount.id,
              isPrimary: false,
            },
          });

          finalBankAccountId = newBankAccount.id;
        }
      }

      if (!finalBankAccountId) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'No bank account specified and could not auto-create (missing bank info)' });
      }

      const bankAccount = await ctx.prisma.bankAccount.findFirst({
        where: { id: finalBankAccountId, companyId },
      });

      if (!bankAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bank account not found' });
      }

      // Check for existing transactions to avoid duplicates
      // A transaction is considered duplicate if same bankAccount + date + description + amount
      const existingTransactions = await ctx.prisma.bankTransaction.findMany({
        where: {
          bankAccountId: finalBankAccountId!,
          date: {
            gte: new Date(Math.min(...transactions.map(t => new Date(t.date).getTime()))),
            lte: new Date(Math.max(...transactions.map(t => new Date(t.date).getTime()))),
          },
        },
        select: { date: true, description: true, amount: true },
      });

      // Create a Set of existing transaction signatures for O(1) lookup
      // Normalize: date to YYYY-MM-DD, description uppercase trimmed, amount to 2 decimal places
      const existingSet = new Set(
        existingTransactions.map(t =>
          `${t.date.toISOString().split('T')[0]}|${t.description.toUpperCase().trim()}|${Number(t.amount).toFixed(2)}`
        )
      );

      // Filter out duplicates - normalize incoming transactions the same way
      const newTransactions = transactions.filter(t => {
        const normalizedDate = new Date(t.date).toISOString().split('T')[0];
        const signature = `${normalizedDate}|${t.description.toUpperCase().trim()}|${Number(t.amount).toFixed(2)}`;
        return !existingSet.has(signature);
      });

      const skippedCount = transactions.length - newTransactions.length;
      if (skippedCount > 0) {
        logger.info(`Skipping ${skippedCount} duplicate transactions`);
      }

      // Auto-categorize if requested
      let categoryMap = new Map<string, { taxAccountId: string; ruleId: string; vendorId: string | null }>();
      if (autoCategorize && newTransactions.length > 0) {
        const descriptions = newTransactions.map((t) => t.description);
        const results = await categorizeTransactions(companyId, descriptions);

        for (const desc of Array.from(results.keys())) {
          const result = results.get(desc);
          if (result?.matched && result.taxAccount && result.rule) {
            categoryMap.set(desc, {
              taxAccountId: result.taxAccount.id,
              ruleId: result.rule.id,
              vendorId: result.vendorId || null,
            });
          }
        }
      }

      // Create transactions (only new ones)
      const created = await ctx.prisma.bankTransaction.createMany({
        data: newTransactions.map((t) => {
          const category = categoryMap.get(t.description);
          return {
            companyId,
            bankAccountId: finalBankAccountId!,
            date: new Date(t.date),
            description: t.description,
            amount: t.amount,
            balance: t.balance,
            taxAccountId: category?.taxAccountId || null,
            matchedRuleId: category?.ruleId || null,
            vendorId: category?.vendorId || null,
            needsReview: !category,
            importSource,
            importBatchId,
          };
        }),
      });

      // Count categorized vs uncategorized
      const categorizedCount = categoryMap.size;

      return {
        imported: created.count,
        skipped: skippedCount,
        categorized: Math.min(categorizedCount, created.count),
        uncategorized: created.count - Math.min(categorizedCount, created.count),
      };
    }),

  // Re-run auto-categorization on transactions needing review
  recategorize: protectedProcedure
    .input(
      z.object({
        bankAccountId: z.string().optional(),
        companyId: z.string(),
        onlyNeedsReview: z.boolean().default(true),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId, bankAccountId, onlyNeedsReview } = input;

      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Get transactions to recategorize
      const where: any = {
        companyId,
        ...(bankAccountId && { bankAccountId }),
        ...(onlyNeedsReview && { needsReview: true }),
        isManualCategorization: false, // Don't override manual edits
      };

      const transactions = await ctx.prisma.bankTransaction.findMany({
        where,
        select: { id: true, description: true },
      });

      if (transactions.length === 0) {
        return { updated: 0, total: 0 };
      }

      // Categorize all at once
      const descriptions = transactions.map((t) => t.description);
      const results = await categorizeTransactions(companyId, descriptions);

      // Update each matched transaction
      let updated = 0;
      for (const t of transactions) {
        const result = results.get(t.description);
        if (result?.matched && result.taxAccount && result.rule) {
          await ctx.prisma.bankTransaction.update({
            where: { id: t.id },
            data: {
              taxAccountId: result.taxAccount.id,
              matchedRuleId: result.rule.id,
              vendorId: result.vendorId || undefined, // Also set vendor if rule has one
              needsReview: false,
            },
          });
          updated++;
        }
      }

      return { updated, total: transactions.length };
    }),

  // Get summary statistics
  // Uses CATEGORY-BASED detection (not amount sign) for accurate income/expense reporting
  stats: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, startDate, endDate } = input;

      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const dateFilter: any = {};
      if (startDate) dateFilter.gte = new Date(startDate);
      if (endDate) dateFilter.lte = new Date(endDate);

      // Base filter: company + date range + exclude split children (avoid double-counting)
      const where: any = {
        companyId,
        parentId: null, // Exclude split children - parent amount already includes total
      };
      if (Object.keys(dateFilter).length > 0) {
        where.date = dateFilter;
      }

      const [
        total,
        needsReview,
        categorized,
        // CATEGORY-BASED: Income = transactions categorized to INCOME accounts
        totalIncome,
        // CATEGORY-BASED: Expenses = transactions categorized to EXPENSE accounts
        totalExpenses,
      ] = await Promise.all([
        ctx.prisma.bankTransaction.count({ where }),
        ctx.prisma.bankTransaction.count({ where: { ...where, needsReview: true } }),
        ctx.prisma.bankTransaction.count({ where: { ...where, needsReview: false, taxAccountId: { not: null } } }),
        // Income: Sum amounts where category is INCOME type
        ctx.prisma.bankTransaction.aggregate({
          where: {
            ...where,
            taxAccount: { accountType: 'INCOME' },
          },
          _sum: { amount: true },
        }),
        // Expenses: Sum amounts where category is EXPENSE type (COGS or Operating)
        ctx.prisma.bankTransaction.aggregate({
          where: {
            ...where,
            taxAccount: { accountType: { in: ['EXPENSE_COGS', 'EXPENSE_OPERATING'] } },
          },
          _sum: { amount: true },
        }),
      ]);

      // Income amounts are typically positive (deposits)
      // Expense amounts are typically negative (withdrawals) - take absolute value
      const incomeAmount = Math.abs(decimalToNumber(totalIncome._sum.amount));
      const expenseAmount = Math.abs(decimalToNumber(totalExpenses._sum.amount));

      return {
        total,
        needsReview,
        categorized,
        uncategorized: total - categorized,
        categorizedPercent: total > 0 ? Math.round((categorized / total) * 100) : 0,
        totalIncome: incomeAmount,
        totalExpenses: expenseAmount,
        netIncome: incomeAmount - expenseAmount,
      };
    }),

  // Parse PDF bank statement (returns parsed transactions for preview)
  parsePDF: protectedProcedure
    .input(z.object({
      pdfBase64: z.string(),
    }))
    .mutation(async ({ input }) => {
      const { parseBankStatementPDF } = await import('../services/accounting/pdf-parser');

      const pdfBuffer = Buffer.from(input.pdfBase64, 'base64');
      const result = await parseBankStatementPDF(pdfBuffer);

      return result;
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SPLIT TRANSACTION OPERATIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Split a transaction into multiple categories
  splitTransaction: protectedProcedure
    .input(
      z.object({
        parentId: z.string(),
        splits: z.array(
          z.object({
            taxAccountId: z.string(),
            amount: z.number(), // Positive number (will be made negative for expenses)
            notes: z.string().optional(),
          })
        ).min(2), // At least 2 splits required
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { parentId, splits } = input;

      // Get parent transaction
      const parent = await ctx.prisma.bankTransaction.findUnique({
        where: { id: parentId },
        include: { company: true, splits: true },
      });

      if (!parent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      if (parent.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      // Can't split an already split transaction
      if (parent.isSplit) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Transaction is already split. Unsplit first to re-split.'
        });
      }

      // Can't split a child transaction
      if (parent.parentId) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Cannot split a child transaction. Split the parent instead.'
        });
      }

      // Validate splits sum to parent amount
      const parentAmount = Math.abs(decimalToNumber(parent.amount));
      const splitsSum = splits.reduce((sum, s) => sum + Math.abs(s.amount), 0);

      // Allow for small floating point differences
      if (Math.abs(splitsSum - parentAmount) > 0.01) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Split amounts ($${splitsSum.toFixed(2)}) must equal parent amount ($${parentAmount.toFixed(2)})`,
        });
      }

      // Validate all tax accounts exist
      const taxAccountIds = splits.map(s => s.taxAccountId);
      const taxAccounts = await ctx.prisma.taxAccount.findMany({
        where: { id: { in: taxAccountIds }, companyId: parent.companyId },
      });

      if (taxAccounts.length !== new Set(taxAccountIds).size) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid tax account(s)' });
      }

      // Determine sign (negative for expenses, positive for income)
      const sign = decimalToNumber(parent.amount) < 0 ? -1 : 1;

      // Create split children in a transaction
      const result = await ctx.prisma.$transaction(async (tx) => {
        // Create child transactions
        const children = await Promise.all(
          splits.map((split, index) =>
            tx.bankTransaction.create({
              data: {
                companyId: parent.companyId,
                bankAccountId: parent.bankAccountId,
                date: parent.date,
                description: parent.description,
                amount: sign * Math.abs(split.amount),
                balance: 0, // Balance doesn't apply to splits
                taxAccountId: split.taxAccountId,
                vendorId: parent.vendorId,
                vendorRaw: parent.vendorRaw,
                parentId: parent.id,
                splitIndex: index,
                needsReview: false,
                isManualCategorization: true,
                notes: split.notes,
                importSource: parent.importSource,
                importBatchId: parent.importBatchId,
              },
              include: {
                taxAccount: { select: { id: true, code: true, name: true } },
              },
            })
          )
        );

        // Mark parent as split
        const updatedParent = await tx.bankTransaction.update({
          where: { id: parentId },
          data: {
            isSplit: true,
            taxAccountId: null, // Parent no longer has a single category
            needsReview: false,
          },
          include: {
            splits: {
              include: {
                taxAccount: { select: { id: true, code: true, name: true } },
              },
              orderBy: { splitIndex: 'asc' },
            },
          },
        });

        return { parent: updatedParent, children };
      });

      return result;
    }),

  // Undo a split - delete children and restore parent
  unsplitTransaction: protectedProcedure
    .input(z.object({ parentId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { parentId } = input;

      // Get parent with splits
      const parent = await ctx.prisma.bankTransaction.findUnique({
        where: { id: parentId },
        include: { company: true, splits: true },
      });

      if (!parent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      if (parent.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      if (!parent.isSplit) {
        throw new TRPCError({ code: 'BAD_REQUEST', message: 'Transaction is not split' });
      }

      // Delete children and restore parent
      const result = await ctx.prisma.$transaction(async (tx) => {
        // Delete all child transactions
        await tx.bankTransaction.deleteMany({
          where: { parentId },
        });

        // Restore parent to normal state
        const updatedParent = await tx.bankTransaction.update({
          where: { id: parentId },
          data: {
            isSplit: false,
            needsReview: true, // Mark for review since it's no longer categorized
          },
        });

        return updatedParent;
      });

      return { success: true, parent: result, deletedSplits: parent.splits.length };
    }),

  // Get split details for a transaction
  getSplits: protectedProcedure
    .input(z.object({ parentId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { parentId } = input;

      const parent = await ctx.prisma.bankTransaction.findUnique({
        where: { id: parentId },
        include: {
          company: true,
          vendor: { select: { id: true, name: true } },
          splits: {
            include: {
              taxAccount: { select: { id: true, code: true, name: true, taxTreatment: true } },
            },
            orderBy: { splitIndex: 'asc' },
          },
        },
      });

      if (!parent) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Transaction not found' });
      }

      if (parent.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return {
        parent: {
          id: parent.id,
          date: parent.date,
          description: parent.description,
          amount: decimalToNumber(parent.amount),
          isSplit: parent.isSplit,
          vendor: parent.vendor,
        },
        splits: parent.splits.map(s => ({
          id: s.id,
          amount: decimalToNumber(s.amount),
          taxAccountId: s.taxAccountId,
          taxAccount: s.taxAccount,
          notes: s.notes,
          splitIndex: s.splitIndex,
        })),
      };
    }),

  // List transactions with split children included
  listWithSplits: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        bankAccountId: z.string().optional(),
        needsReview: z.boolean().optional(),
        taxAccountId: z.string().optional(),
        vendorId: z.string().optional(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
        search: z.string().optional(),
        limit: z.number().min(1).max(5000).default(100),
        offset: z.number().min(0).default(0),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, bankAccountId, needsReview, taxAccountId, vendorId, startDate, endDate, search, limit, offset } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const where: any = {
        companyId,
        parentId: null, // Only get parent/root transactions
        ...(bankAccountId && { bankAccountId }),
        ...(needsReview !== undefined && { needsReview }),
        ...(taxAccountId && { taxAccountId }),
        ...(vendorId && { vendorId }),
        ...(search && {
          description: { contains: search, mode: 'insensitive' },
        }),
      };

      // Handle date filters
      if (startDate || endDate) {
        where.date = {};
        if (startDate) where.date.gte = new Date(startDate);
        if (endDate) where.date.lte = new Date(endDate);
      }

      const [transactions, total] = await Promise.all([
        ctx.prisma.bankTransaction.findMany({
          where,
          include: {
            bankAccount: {
              select: { id: true, name: true, accountNumber: true },
            },
            taxAccount: {
              select: { id: true, code: true, name: true, taxTreatment: true },
            },
            matchedRule: {
              select: { id: true, name: true },
            },
            vendor: {
              select: { id: true, name: true, requiresSplit: true },
            },
            splits: {
              include: {
                taxAccount: {
                  select: { id: true, code: true, name: true, taxTreatment: true },
                },
              },
              orderBy: { splitIndex: 'asc' },
            },
          },
          orderBy: [{ date: 'desc' }, { id: 'desc' }],
          take: limit,
          skip: offset,
        }),
        ctx.prisma.bankTransaction.count({ where }),
      ]);

      return {
        transactions: transactions.map(t => ({
          ...t,
          amount: decimalToNumber(t.amount),
          balance: decimalToNumber(t.balance),
          splits: t.splits.map(s => ({
            ...s,
            amount: decimalToNumber(s.amount),
            balance: decimalToNumber(s.balance),
          })),
        })),
        total,
        limit,
        offset,
        hasMore: offset + transactions.length < total,
      };
    }),

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // RULE PATTERN SEARCH
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Search transactions by rule pattern (useful for testing rules / finding missed transactions)
  searchByPattern: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        matchType: z.enum(['CONTAINS', 'STARTS_WITH', 'EXACT', 'REGEX']),
        matchValue: z.string().min(1),
        bankAccountId: z.string().optional(),
        onlyUncategorized: z.boolean().default(false),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, matchType, matchValue, bankAccountId, onlyUncategorized, limit } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Get all transactions (we'll filter in JS for CONTAINS/REGEX support)
      const where: any = {
        companyId,
        ...(bankAccountId && { bankAccountId }),
        ...(onlyUncategorized && { taxAccountId: null }),
        parentId: null, // Don't search split children
      };

      const allTransactions = await ctx.prisma.bankTransaction.findMany({
        where,
        include: {
          taxAccount: {
            select: { id: true, code: true, name: true },
          },
          bankAccount: {
            select: { id: true, name: true, accountType: true },
          },
        },
        orderBy: { date: 'desc' },
      });

      // Filter by pattern
      const normalizedValue = matchValue.toUpperCase().trim();
      const matchingTransactions = allTransactions.filter(t => {
        const desc = t.description.toUpperCase().trim();

        switch (matchType) {
          case 'CONTAINS':
            return desc.includes(normalizedValue);
          case 'STARTS_WITH':
            return desc.startsWith(normalizedValue);
          case 'EXACT':
            return desc === normalizedValue;
          case 'REGEX':
            try {
              const regex = new RegExp(matchValue, 'i');
              return regex.test(t.description);
            } catch {
              return false;
            }
          default:
            return false;
        }
      });

      // Return limited results with stats
      const limited = matchingTransactions.slice(0, limit);

      return {
        matches: limited.map(t => ({
          id: t.id,
          date: t.date,
          description: t.description,
          amount: decimalToNumber(t.amount),
          bankAccount: t.bankAccount,
          taxAccount: t.taxAccount,
          isCategorized: !!t.taxAccountId,
        })),
        totalMatches: matchingTransactions.length,
        categorizedCount: matchingTransactions.filter(t => t.taxAccountId).length,
        uncategorizedCount: matchingTransactions.filter(t => !t.taxAccountId).length,
        showing: limited.length,
      };
    }),

  // Bulk categorize transactions matching a pattern
  bulkCategorizeByPattern: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        matchType: z.enum(['CONTAINS', 'STARTS_WITH', 'EXACT', 'REGEX']),
        matchValue: z.string().min(1),
        taxAccountId: z.string(),
        bankAccountId: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId, matchType, matchValue, taxAccountId, bankAccountId } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Verify tax account exists
      const taxAccount = await ctx.prisma.taxAccount.findFirst({
        where: { id: taxAccountId, companyId },
      });

      if (!taxAccount) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax account not found' });
      }

      // Get all uncategorized transactions
      const where: any = {
        companyId,
        taxAccountId: null, // Only uncategorized
        parentId: null, // Don't touch split children
        ...(bankAccountId && { bankAccountId }),
      };

      const allTransactions = await ctx.prisma.bankTransaction.findMany({
        where,
        select: { id: true, description: true },
      });

      // Filter by pattern
      const normalizedValue = matchValue.toUpperCase().trim();
      const matchingIds = allTransactions.filter(t => {
        const desc = t.description.toUpperCase().trim();

        switch (matchType) {
          case 'CONTAINS':
            return desc.includes(normalizedValue);
          case 'STARTS_WITH':
            return desc.startsWith(normalizedValue);
          case 'EXACT':
            return desc === normalizedValue;
          case 'REGEX':
            try {
              const regex = new RegExp(matchValue, 'i');
              return regex.test(t.description);
            } catch {
              return false;
            }
          default:
            return false;
        }
      }).map(t => t.id);

      if (matchingIds.length === 0) {
        return { updated: 0, message: 'No uncategorized transactions match this pattern' };
      }

      // Bulk update
      const result = await ctx.prisma.bankTransaction.updateMany({
        where: {
          id: { in: matchingIds },
        },
        data: {
          taxAccountId,
          needsReview: false,
          isManualCategorization: true,
        },
      });

      logger.info('Bulk categorized transactions by pattern', {
        companyId,
        matchType,
        matchValue,
        taxAccountId,
        updated: result.count,
      });

      return {
        updated: result.count,
        message: `Categorized ${result.count} transactions to ${taxAccount.code} - ${taxAccount.name}`,
      };
    }),
});

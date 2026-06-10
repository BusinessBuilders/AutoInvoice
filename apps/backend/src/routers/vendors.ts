/**
 * Vendors Router
 *
 * CRUD operations for vendors + auto-matching logic
 * Vendors track WHO you paid (Amazon, Shell) separate from WHAT you bought (category)
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

const createVendorSchema = z.object({
  companyId: z.string(),
  name: z.string().min(1),
  matchPatterns: z.array(z.string()).min(1), // ["AMAZON", "AMZN"]
  defaultBankAccountId: z.string().optional(),
  defaultTaxAccountId: z.string().optional(),
  requiresSplit: z.boolean().default(false),
  notes: z.string().optional(),
});

const updateVendorSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  matchPatterns: z.array(z.string()).optional(),
  defaultBankAccountId: z.string().nullable().optional(),
  defaultTaxAccountId: z.string().nullable().optional(),
  requiresSplit: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().nullable().optional(),
});

/**
 * Normalize a description for matching
 * - Uppercase
 * - Remove extra whitespace
 * - Remove common suffixes like transaction IDs
 */
function normalizeDescription(description: string): string {
  return description
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Check if a pattern matches a description
 * Uses case-insensitive contains matching
 */
function patternMatches(description: string, pattern: string): boolean {
  const normalizedDesc = normalizeDescription(description);
  const normalizedPattern = pattern.toUpperCase().trim();
  return normalizedDesc.includes(normalizedPattern);
}

export const vendorsRouter = router({
  // List all vendors for a company
  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        active: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, active } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const vendors = await ctx.prisma.vendor.findMany({
        where: {
          companyId,
          ...(active !== undefined && { isActive: active }),
        },
        include: {
          defaultBankAccount: {
            select: { id: true, name: true, accountType: true },
          },
          defaultTaxAccount: {
            select: { id: true, code: true, name: true },
          },
          _count: {
            select: { transactions: true },
          },
        },
        orderBy: { name: 'asc' },
      });

      return vendors;
    }),

  // Get single vendor
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const vendor = await ctx.prisma.vendor.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          defaultBankAccount: true,
          defaultTaxAccount: true,
          transactions: {
            take: 10,
            orderBy: { date: 'desc' },
            select: {
              id: true,
              date: true,
              description: true,
              amount: true,
              taxAccount: { select: { name: true } },
            },
          },
        },
      });

      if (!vendor) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
      }

      if (vendor.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return vendor;
    }),

  // Create vendor
  create: protectedProcedure
    .input(createVendorSchema)
    .mutation(async ({ ctx, input }) => {
      const { companyId, name, matchPatterns, defaultBankAccountId, defaultTaxAccountId, requiresSplit, notes } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Check for duplicate vendor name
      const existing = await ctx.prisma.vendor.findUnique({
        where: { companyId_name: { companyId, name } },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Vendor "${name}" already exists`,
        });
      }

      // Validate defaultBankAccountId if provided
      if (defaultBankAccountId) {
        const bankAccount = await ctx.prisma.bankAccount.findFirst({
          where: { id: defaultBankAccountId, companyId },
        });
        if (!bankAccount) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid bank account' });
        }
      }

      // Validate defaultTaxAccountId if provided
      if (defaultTaxAccountId) {
        const taxAccount = await ctx.prisma.taxAccount.findFirst({
          where: { id: defaultTaxAccountId, companyId },
        });
        if (!taxAccount) {
          throw new TRPCError({ code: 'BAD_REQUEST', message: 'Invalid tax account' });
        }
      }

      const vendor = await ctx.prisma.vendor.create({
        data: {
          companyId,
          name,
          matchPatterns,
          defaultBankAccountId,
          defaultTaxAccountId,
          requiresSplit,
          notes,
        },
        include: {
          defaultBankAccount: { select: { id: true, name: true } },
          defaultTaxAccount: { select: { id: true, code: true, name: true } },
        },
      });

      return vendor;
    }),

  // Update vendor
  update: protectedProcedure
    .input(updateVendorSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.prisma.vendor.findUnique({
        where: { id },
        include: { company: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      // Check for duplicate name if changing
      if (data.name && data.name !== existing.name) {
        const duplicate = await ctx.prisma.vendor.findUnique({
          where: { companyId_name: { companyId: existing.companyId, name: data.name } },
        });
        if (duplicate) {
          throw new TRPCError({
            code: 'CONFLICT',
            message: `Vendor "${data.name}" already exists`,
          });
        }
      }

      const updated = await ctx.prisma.vendor.update({
        where: { id },
        data,
        include: {
          defaultBankAccount: { select: { id: true, name: true } },
          defaultTaxAccount: { select: { id: true, code: true, name: true } },
        },
      });

      return updated;
    }),

  // Delete vendor
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.vendor.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          _count: { select: { transactions: true } },
        },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Vendor not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      // Allow deletion but unlink transactions first
      if (existing._count.transactions > 0) {
        await ctx.prisma.bankTransaction.updateMany({
          where: { vendorId: input.id },
          data: { vendorId: null },
        });
      }

      await ctx.prisma.vendor.delete({
        where: { id: input.id },
      });

      return { success: true, unlinkedTransactions: existing._count.transactions };
    }),

  // Match a single transaction description to a vendor
  matchDescription: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        description: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, description } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Get all active vendors for this company
      const vendors = await ctx.prisma.vendor.findMany({
        where: { companyId, isActive: true },
        select: {
          id: true,
          name: true,
          matchPatterns: true,
          requiresSplit: true,
          defaultTaxAccountId: true,
        },
      });

      // Find first matching vendor (by longest pattern match for specificity)
      let bestMatch: typeof vendors[0] | null = null;
      let longestPatternLength = 0;

      for (const vendor of vendors) {
        for (const pattern of vendor.matchPatterns) {
          if (patternMatches(description, pattern)) {
            if (pattern.length > longestPatternLength) {
              longestPatternLength = pattern.length;
              bestMatch = vendor;
            }
          }
        }
      }

      return bestMatch;
    }),

  // Bulk match: Apply vendor matching to multiple transactions
  bulkMatch: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        transactionIds: z.array(z.string()).optional(), // If not provided, match all unmatched
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { companyId, transactionIds } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Get all active vendors
      const vendors = await ctx.prisma.vendor.findMany({
        where: { companyId, isActive: true },
      });

      // Get transactions to match
      const transactions = await ctx.prisma.bankTransaction.findMany({
        where: {
          companyId,
          vendorId: null, // Only unmatched
          ...(transactionIds && { id: { in: transactionIds } }),
        },
        select: { id: true, description: true },
      });

      let matchedCount = 0;
      const updates: { id: string; vendorId: string; needsReview: boolean }[] = [];

      for (const tx of transactions) {
        let bestMatch: typeof vendors[0] | null = null;
        let longestPatternLength = 0;

        for (const vendor of vendors) {
          for (const pattern of vendor.matchPatterns) {
            if (patternMatches(tx.description, pattern)) {
              if (pattern.length > longestPatternLength) {
                longestPatternLength = pattern.length;
                bestMatch = vendor;
              }
            }
          }
        }

        if (bestMatch) {
          updates.push({
            id: tx.id,
            vendorId: bestMatch.id,
            needsReview: bestMatch.requiresSplit, // Flag for review if vendor needs split
          });
          matchedCount++;
        }
      }

      // Apply updates in batch
      for (const update of updates) {
        await ctx.prisma.bankTransaction.update({
          where: { id: update.id },
          data: {
            vendorId: update.vendorId,
            needsReview: update.needsReview,
          },
        });
      }

      return {
        totalTransactions: transactions.length,
        matchedCount,
        unmatchedCount: transactions.length - matchedCount,
      };
    }),

  // Test pattern matching (useful for UI "test your patterns" feature)
  testPatterns: protectedProcedure
    .input(
      z.object({
        patterns: z.array(z.string()),
        testDescriptions: z.array(z.string()),
      })
    )
    .query(({ input }) => {
      const { patterns, testDescriptions } = input;

      const results = testDescriptions.map((description) => {
        const matchedPatterns = patterns.filter((pattern) =>
          patternMatches(description, pattern)
        );
        return {
          description,
          matched: matchedPatterns.length > 0,
          matchedPatterns,
        };
      });

      return results;
    }),

  // Statistics for vendors
  stats: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const vendors = await ctx.prisma.vendor.findMany({
        where: { companyId: input.companyId },
        include: {
          _count: { select: { transactions: true } },
          transactions: {
            select: { amount: true },
          },
        },
      });

      const totalVendors = vendors.length;
      const activeVendors = vendors.filter((v) => v.isActive).length;
      const vendorsRequiringSplit = vendors.filter((v) => v.requiresSplit).length;

      // Calculate total spend by vendor
      const vendorSpending = vendors.map((v) => ({
        id: v.id,
        name: v.name,
        transactionCount: v._count.transactions,
        totalSpend: v.transactions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0),
      }));

      // Sort by spend descending
      vendorSpending.sort((a, b) => b.totalSpend - a.totalSpend);

      return {
        totalVendors,
        activeVendors,
        vendorsRequiringSplit,
        topVendorsBySpend: vendorSpending.slice(0, 10),
      };
    }),
});

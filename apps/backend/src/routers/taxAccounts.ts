/**
 * Tax Accounts Router
 *
 * CRUD operations for S-Corp tax accounts (Chart of Accounts for tax reporting)
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';

// Tax account types matching the schema
const TaxAccountType = z.enum([
  'ASSET',
  'LIABILITY',
  'EQUITY',
  'INCOME',
  'EXPENSE_COGS',
  'EXPENSE_OPERATING',
]);

const createTaxAccountSchema = z.object({
  companyId: z.string(),
  code: z.string().min(1),
  name: z.string().min(1),
  accountType: TaxAccountType,
  taxTreatment: z.string().default('100%'), // 100%, 50%, NON_DEDUCTIBLE, TRANSFER
  scheduleC: z.string().optional(), // Which 1120-S line
  active: z.boolean().default(true),
});

const updateTaxAccountSchema = createTaxAccountSchema.partial().extend({
  id: z.string(),
});

export const taxAccountsRouter = router({
  // List all tax accounts for the current user (across all their companies)
  listAll: protectedProcedure
    .input(
      z.object({
        accountType: TaxAccountType.optional(),
        active: z.boolean().optional(),
        search: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const { accountType, active, search } = input || {};

      // Get all companies owned by this user
      const companies = await ctx.prisma.company.findMany({
        where: { userId: ctx.user.id },
        select: { id: true, name: true },
      });

      if (companies.length === 0) {
        return [];
      }

      const companyIds = companies.map((c) => c.id);

      const accounts = await ctx.prisma.taxAccount.findMany({
        where: {
          companyId: { in: companyIds },
          ...(accountType && { accountType }),
          ...(active !== undefined && { active }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search } },
            ],
          }),
        },
        include: {
          company: { select: { id: true, name: true } },
          _count: {
            select: {
              bankTransactions: true,
              categorizationRules: true,
            },
          },
        },
        orderBy: [{ code: 'asc' }],
      });

      return accounts;
    }),

  // List all tax accounts for a company
  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        accountType: TaxAccountType.optional(),
        active: z.boolean().optional(),
        search: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, accountType, active, search } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const accounts = await ctx.prisma.taxAccount.findMany({
        where: {
          companyId,
          ...(accountType && { accountType }),
          ...(active !== undefined && { active }),
          ...(search && {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { code: { contains: search } },
            ],
          }),
        },
        include: {
          _count: {
            select: {
              bankTransactions: true,
              categorizationRules: true,
            },
          },
        },
        orderBy: [{ code: 'asc' }],
      });

      return accounts;
    }),

  // Get single tax account
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.taxAccount.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          bankTransactions: {
            take: 10,
            orderBy: { date: 'desc' },
          },
          categorizationRules: true,
        },
      });

      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax account not found' });
      }

      // Verify ownership through company
      if (account.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return account;
    }),

  // Create tax account
  create: protectedProcedure
    .input(createTaxAccountSchema)
    .mutation(async ({ ctx, input }) => {
      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // Check for duplicate code
      const existing = await ctx.prisma.taxAccount.findUnique({
        where: {
          companyId_code: {
            companyId: input.companyId,
            code: input.code,
          },
        },
      });

      if (existing) {
        throw new TRPCError({
          code: 'CONFLICT',
          message: `Account code ${input.code} already exists`,
        });
      }

      const account = await ctx.prisma.taxAccount.create({
        data: {
          ...input,
          isSystemAccount: false,
        },
      });

      return account;
    }),

  // Update tax account
  update: protectedProcedure
    .input(updateTaxAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.prisma.taxAccount.findUnique({
        where: { id },
        include: { company: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax account not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      // Don't allow changing system accounts
      if (existing.isSystemAccount) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot modify system accounts',
        });
      }

      const updated = await ctx.prisma.taxAccount.update({
        where: { id },
        data,
      });

      return updated;
    }),

  // Delete tax account
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.taxAccount.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          _count: {
            select: {
              bankTransactions: true,
              categorizationRules: true,
            },
          },
        },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Tax account not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      if (existing.isSystemAccount) {
        throw new TRPCError({
          code: 'FORBIDDEN',
          message: 'Cannot delete system accounts',
        });
      }

      if (existing._count.bankTransactions > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete account with ${existing._count.bankTransactions} transactions. Reassign or delete transactions first.`,
        });
      }

      // Delete associated rules first
      if (existing._count.categorizationRules > 0) {
        await ctx.prisma.categorizationRule.deleteMany({
          where: { taxAccountId: input.id },
        });
      }

      await ctx.prisma.taxAccount.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Get summary by type (for reports)
  summary: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const accounts = await ctx.prisma.taxAccount.groupBy({
        by: ['accountType'],
        where: { companyId: input.companyId, active: true },
        _count: { id: true },
      });

      return accounts;
    }),
});

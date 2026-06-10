/**
 * Tax Reports Router
 *
 * Endpoints for generating accounting reports for S-Corp taxes
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import {
  generateExecutiveSummary,
  generateIncomeStatement,
  generateBalanceSheet,
  generateGeneralLedger,
  generateCategoryBreakdown,
} from '../services/accounting/tax-reports';

const dateRangeSchema = z.object({
  companyId: z.string(),
  startDate: z.string(),
  endDate: z.string(),
});

export const taxReportsRouter = router({
  // Executive Summary - overview of financial position
  executiveSummary: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      return generateExecutiveSummary(
        input.companyId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    }),

  // Income Statement (Profit & Loss)
  incomeStatement: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      return generateIncomeStatement(
        input.companyId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    }),

  // Balance Sheet
  balanceSheet: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        asOfDate: z.string(),
        excludeCreditCards: z.boolean().optional().default(false),
      })
    )
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      return generateBalanceSheet(input.companyId, new Date(input.asOfDate), {
        excludeCreditCards: input.excludeCreditCards,
      });
    }),

  // General Ledger - all transactions by account
  generalLedger: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      return generateGeneralLedger(
        input.companyId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    }),

  // Category Breakdown (for charts)
  categoryBreakdown: protectedProcedure
    .input(dateRangeSchema)
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      return generateCategoryBreakdown(
        input.companyId,
        new Date(input.startDate),
        new Date(input.endDate)
      );
    }),

  // List available report types
  listReportTypes: protectedProcedure.query(() => {
    return [
      {
        id: 'executive-summary',
        name: 'Executive Summary',
        description: 'Overview of financial position, key metrics, and reconciliation proof',
      },
      {
        id: 'income-statement',
        name: 'Income Statement (P&L)',
        description: 'Profit and loss statement with revenue, COGS, and expenses',
      },
      {
        id: 'balance-sheet',
        name: 'Balance Sheet',
        description: 'Assets, liabilities, and equity as of a specific date',
      },
      {
        id: 'general-ledger',
        name: 'General Ledger',
        description: 'Complete transaction listing by account',
      },
      {
        id: 'category-breakdown',
        name: 'Category Breakdown',
        description: 'Income and expense breakdown by category',
      },
      {
        id: 'payroll-taxes',
        name: 'Payroll Taxes Detailed',
        description: 'Quarterly payroll tax breakdown (Form 941 data)',
      },
      {
        id: 'shareholder-analysis',
        name: 'Shareholder vs Employee Analysis',
        description: 'W-2 wages vs personal distributions (K-1)',
      },
      {
        id: 'trial-balance',
        name: 'Trial Balance',
        description: 'Summary of all account balances',
      },
      {
        id: 'reconciliation',
        name: 'Bank Reconciliation',
        description: 'Book balance vs bank balance proof',
      },
      {
        id: 'w2-summary',
        name: 'W-2 Summary',
        description: 'All employees with compensation breakdown',
      },
    ];
  }),
});

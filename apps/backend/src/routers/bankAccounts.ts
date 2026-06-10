/**
 * Bank Accounts Router
 *
 * CRUD operations for bank accounts (checking, savings, credit cards)
 * Auto-creates linked Chart of Accounts entries for proper accounting
 */

import { z } from 'zod';
import { router, protectedProcedure } from '../trpc';
import { TRPCError } from '@trpc/server';
import { AccountType, BalanceType } from '@prisma/client';

const BankAccountType = z.enum(['checking', 'savings', 'credit_card', 'money_market', 'petty_cash']);

const createBankAccountSchema = z.object({
  companyId: z.string(),
  name: z.string().min(1),
  accountNumber: z.string().optional(), // Last 4 digits
  bankName: z.string().optional(),
  accountType: BankAccountType.default('checking'),
  isPrimary: z.boolean().default(false),
  currentBalance: z.number().optional(),
});

const updateBankAccountSchema = z.object({
  id: z.string(),
  name: z.string().min(1).optional(),
  accountNumber: z.string().optional(),
  bankName: z.string().optional(),
  accountType: BankAccountType.optional(),
  isPrimary: z.boolean().optional(),
  active: z.boolean().optional(),
  currentBalance: z.number().optional(),
});

/**
 * Map bank account type to Chart of Accounts type
 */
function getAccountTypeForBankAccount(bankAccountType: string): AccountType {
  switch (bankAccountType) {
    case 'credit_card':
      return AccountType.LIABILITY;
    default:
      return AccountType.ASSET;
  }
}

/**
 * Get next available account code for the type
 */
async function getNextAccountCode(
  prisma: any,
  userId: string,
  accountType: AccountType
): Promise<string> {
  // Code ranges:
  // Assets: 1000-1999
  // Liabilities: 2000-2999
  const baseCode = accountType === AccountType.LIABILITY ? 2100 : 1010;

  const existingCodes = await prisma.account.findMany({
    where: {
      userId,
      code: {
        gte: String(baseCode),
        lt: String(baseCode + 100),
      },
    },
    select: { code: true },
    orderBy: { code: 'desc' },
  });

  if (existingCodes.length === 0) {
    return String(baseCode);
  }

  const maxCode = Math.max(...existingCodes.map((a: { code: string }) => parseInt(a.code)));
  return String(maxCode + 1);
}

export const bankAccountsRouter = router({
  // List all bank accounts for a company
  list: protectedProcedure
    .input(
      z.object({
        companyId: z.string(),
        accountType: BankAccountType.optional(),
        active: z.boolean().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const { companyId, accountType, active } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const accounts = await ctx.prisma.bankAccount.findMany({
        where: {
          companyId,
          ...(accountType && { accountType }),
          ...(active !== undefined && { active }),
        },
        include: {
          linkedAccount: {
            select: { id: true, code: true, name: true, accountType: true },
          },
          _count: {
            select: { transactions: true },
          },
        },
        orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      });

      return accounts;
    }),

  // Get single bank account
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const account = await ctx.prisma.bankAccount.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          linkedAccount: true,
          transactions: {
            take: 10,
            orderBy: { date: 'desc' },
          },
        },
      });

      if (!account) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bank account not found' });
      }

      if (account.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      return account;
    }),

  // Create bank account (with auto-created Chart of Accounts entry)
  create: protectedProcedure
    .input(createBankAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const { companyId, name, accountNumber, bankName, accountType, isPrimary, currentBalance } = input;

      // Verify user owns this company
      const company = await ctx.prisma.company.findFirst({
        where: { id: companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      // If setting as primary, unset other primary accounts
      if (isPrimary) {
        await ctx.prisma.bankAccount.updateMany({
          where: { companyId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      // Auto-create linked Chart of Accounts entry
      const chartAccountType = getAccountTypeForBankAccount(accountType);
      const code = await getNextAccountCode(ctx.prisma, ctx.user.id, chartAccountType);

      // Build account name for Chart of Accounts
      const chartName = accountType === 'credit_card'
        ? `Credit Card - ${bankName || name}`
        : `${bankName || 'Bank'} - ${name}${accountNumber ? ` (****${accountNumber})` : ''}`;

      // Create Chart of Accounts entry
      const linkedAccount = await ctx.prisma.account.create({
        data: {
          userId: ctx.user.id,
          code,
          name: chartName,
          accountType: chartAccountType,
          balanceType: chartAccountType === AccountType.LIABILITY ? BalanceType.CREDIT : BalanceType.DEBIT,
          balance: currentBalance || 0,
          active: true,
          systemAccount: true, // Managed by bank account
          allowManualEntries: false, // Transactions come from imports
          description: `Linked to bank account: ${name}`,
        },
      });

      // Create bank account with link
      const bankAccount = await ctx.prisma.bankAccount.create({
        data: {
          companyId,
          name,
          accountNumber,
          bankName,
          accountType,
          isPrimary,
          currentBalance: currentBalance || 0,
          linkedAccountId: linkedAccount.id,
        },
        include: {
          linkedAccount: true,
        },
      });

      return bankAccount;
    }),

  // Update bank account
  update: protectedProcedure
    .input(updateBankAccountSchema)
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input;

      const existing = await ctx.prisma.bankAccount.findUnique({
        where: { id },
        include: { company: true, linkedAccount: true },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bank account not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      // If setting as primary, unset other primary accounts
      if (data.isPrimary) {
        await ctx.prisma.bankAccount.updateMany({
          where: { companyId: existing.companyId, isPrimary: true, id: { not: id } },
          data: { isPrimary: false },
        });
      }

      // Update linked Chart of Accounts entry if name or bank changes
      if (existing.linkedAccountId && (data.name || data.bankName || data.accountNumber)) {
        const chartName = (data.accountType || existing.accountType) === 'credit_card'
          ? `Credit Card - ${data.bankName || existing.bankName || data.name || existing.name}`
          : `${data.bankName || existing.bankName || 'Bank'} - ${data.name || existing.name}${(data.accountNumber || existing.accountNumber) ? ` (****${data.accountNumber || existing.accountNumber})` : ''}`;

        await ctx.prisma.account.update({
          where: { id: existing.linkedAccountId },
          data: { name: chartName },
        });
      }

      // Update balance in Chart of Accounts if changed
      if (data.currentBalance !== undefined && existing.linkedAccountId) {
        await ctx.prisma.account.update({
          where: { id: existing.linkedAccountId },
          data: { balance: data.currentBalance },
        });
      }

      const updated = await ctx.prisma.bankAccount.update({
        where: { id },
        data,
        include: { linkedAccount: true },
      });

      return updated;
    }),

  // Delete bank account
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const existing = await ctx.prisma.bankAccount.findUnique({
        where: { id: input.id },
        include: {
          company: true,
          linkedAccount: true,
          _count: { select: { transactions: true } },
        },
      });

      if (!existing) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Bank account not found' });
      }

      if (existing.company.userId !== ctx.user.id) {
        throw new TRPCError({ code: 'FORBIDDEN', message: 'Not authorized' });
      }

      if (existing._count.transactions > 0) {
        throw new TRPCError({
          code: 'PRECONDITION_FAILED',
          message: `Cannot delete account with ${existing._count.transactions} transactions. Delete transactions first.`,
        });
      }

      // Delete linked Chart of Accounts entry
      if (existing.linkedAccountId) {
        await ctx.prisma.account.delete({
          where: { id: existing.linkedAccountId },
        });
      }

      await ctx.prisma.bankAccount.delete({
        where: { id: input.id },
      });

      return { success: true };
    }),

  // Get statistics for bank accounts
  stats: protectedProcedure
    .input(z.object({ companyId: z.string() }))
    .query(async ({ ctx, input }) => {
      const company = await ctx.prisma.company.findFirst({
        where: { id: input.companyId, userId: ctx.user.id },
      });

      if (!company) {
        throw new TRPCError({ code: 'NOT_FOUND', message: 'Company not found' });
      }

      const accounts = await ctx.prisma.bankAccount.findMany({
        where: { companyId: input.companyId, active: true },
        include: {
          _count: { select: { transactions: true } },
        },
      });

      const totalBalance = accounts.reduce((sum, a) => sum + Number(a.currentBalance), 0);
      const checkingBalance = accounts
        .filter(a => a.accountType === 'checking' || a.accountType === 'savings')
        .reduce((sum, a) => sum + Number(a.currentBalance), 0);
      const creditCardBalance = accounts
        .filter(a => a.accountType === 'credit_card')
        .reduce((sum, a) => sum + Number(a.currentBalance), 0);

      return {
        totalAccounts: accounts.length,
        checkingAccounts: accounts.filter(a => a.accountType === 'checking').length,
        savingsAccounts: accounts.filter(a => a.accountType === 'savings').length,
        creditCardAccounts: accounts.filter(a => a.accountType === 'credit_card').length,
        totalBalance,
        checkingBalance,
        creditCardBalance, // This should be negative (what you owe)
        netCash: checkingBalance + creditCardBalance, // Cash minus CC debt
      };
    }),
});

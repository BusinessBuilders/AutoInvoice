/**
 * Accounting Reports Service
 *
 * Generates financial reports from posted journal entries:
 * - Profit & Loss (Income Statement)
 * - Balance Sheet (future)
 * - Cash Flow Statement (future)
 * - Trial Balance (future)
 */

import { AccountType, JournalStatus, Prisma } from '@prisma/client';
import { prisma } from '../../utils/db';
import logger from '../../utils/logger';

/**
 * Profit & Loss report structure
 */
export interface ProfitAndLossReport {
  period: {
    start: Date;
    end: Date;
  };
  revenue: {
    accounts: Array<{
      code: string;
      name: string;
      amount: number;
    }>;
    total: number;
  };
  expenses: {
    accounts: Array<{
      code: string;
      name: string;
      amount: number;
    }>;
    total: number;
  };
  netIncome: number;
  profitMargin: number; // Net income as percentage of revenue
}

/**
 * Generates a Profit & Loss (Income Statement) report
 *
 * Shows revenue and expenses for a given period to calculate net income.
 * Only includes POSTED journal entries to ensure accuracy.
 *
 * Calculation rules:
 * - Revenue accounts: Sum of CREDITS (natural balance)
 * - Expense accounts: Sum of DEBITS (natural balance)
 * - Net Income = Total Revenue - Total Expenses
 *
 * @param userId - User ID (currently unused due to lack of multi-tenancy, but included for future)
 * @param startDate - Start of reporting period
 * @param endDate - End of reporting period
 * @returns Profit & Loss report with revenue, expenses, and net income
 */
export async function generateProfitAndLoss(
  userId: string,
  startDate: Date,
  endDate: Date
): Promise<ProfitAndLossReport> {
  try {
    logger.info('Generating P&L report', {
      userId,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    });

    // Query all POSTED journal entries in the date range
    const journalEntries = await prisma.journalEntry.findMany({
      where: {
        status: JournalStatus.POSTED,
        entryDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        lines: {
          include: {
            account: true,
          },
        },
      },
    });

    if (journalEntries.length === 0) {
      logger.info('No posted journal entries found in date range', {
        startDate,
        endDate,
      });
      return createEmptyReport(startDate, endDate);
    }

    // Aggregate account balances by account
    const accountBalances = new Map<
      string,
      {
        code: string;
        name: string;
        accountType: AccountType;
        debits: number;
        credits: number;
      }
    >();

    // Process all journal lines
    journalEntries.forEach((entry) => {
      entry.lines.forEach((line) => {
        const accountId = line.accountId;
        const existing = accountBalances.get(accountId);

        if (existing) {
          existing.debits += Number(line.debit);
          existing.credits += Number(line.credit);
        } else {
          accountBalances.set(accountId, {
            code: line.account.code,
            name: line.account.name,
            accountType: line.account.accountType,
            debits: Number(line.debit),
            credits: Number(line.credit),
          });
        }
      });
    });

    // Separate revenue and expense accounts
    const revenueAccounts: Array<{ code: string; name: string; amount: number }> = [];
    const expenseAccounts: Array<{ code: string; name: string; amount: number }> = [];
    let totalRevenue = 0;
    let totalExpenses = 0;

    accountBalances.forEach((account) => {
      if (account.accountType === AccountType.REVENUE) {
        // Revenue has credit balance (natural balance)
        // Amount = credits - debits
        const amount = account.credits - account.debits;
        if (amount !== 0) {
          revenueAccounts.push({
            code: account.code,
            name: account.name,
            amount,
          });
          totalRevenue += amount;
        }
      } else if (account.accountType === AccountType.EXPENSE) {
        // Expenses have debit balance (natural balance)
        // Amount = debits - credits
        const amount = account.debits - account.credits;
        if (amount !== 0) {
          expenseAccounts.push({
            code: account.code,
            name: account.name,
            amount,
          });
          totalExpenses += amount;
        }
      }
    });

    // Sort by amount (largest first)
    revenueAccounts.sort((a, b) => b.amount - a.amount);
    expenseAccounts.sort((a, b) => b.amount - a.amount);

    const netIncome = totalRevenue - totalExpenses;
    const profitMargin = totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0;

    logger.info('P&L report generated successfully', {
      totalRevenue,
      totalExpenses,
      netIncome,
      profitMargin: profitMargin.toFixed(2) + '%',
      entriesProcessed: journalEntries.length,
    });

    return {
      period: {
        start: startDate,
        end: endDate,
      },
      revenue: {
        accounts: revenueAccounts,
        total: totalRevenue,
      },
      expenses: {
        accounts: expenseAccounts,
        total: totalExpenses,
      },
      netIncome,
      profitMargin,
    };
  } catch (error) {
    logger.error('Failed to generate P&L report', {
      userId,
      startDate,
      endDate,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new Error(
      `Failed to generate P&L report: ${error instanceof Error ? error.message : String(error)}`
    );
  }
}

/**
 * Creates an empty P&L report (used when no entries exist)
 */
function createEmptyReport(startDate: Date, endDate: Date): ProfitAndLossReport {
  return {
    period: {
      start: startDate,
      end: endDate,
    },
    revenue: {
      accounts: [],
      total: 0,
    },
    expenses: {
      accounts: [],
      total: 0,
    },
    netIncome: 0,
    profitMargin: 0,
  };
}

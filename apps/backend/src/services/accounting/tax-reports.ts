/**
 * Tax Reports Service
 *
 * Generates 10 accounting reports for S-Corp tax preparation (Form 1120-S)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Types for reports
export interface ReportPeriod {
  startDate: Date;
  endDate: Date;
}

export interface ExecutiveSummary {
  period: ReportPeriod;
  grossReceipts: number;
  costOfGoodsSold: number;
  grossProfit: number;
  operatingExpenses: number;
  netIncome: number;
  ownerDistributions: number;
  cashBalance: { operating: number; payroll: number; total: number };
  transactionStats: { total: number; categorized: number; needsReview: number };
}

export interface CategoryTotal {
  accountCode: string;
  accountName: string;
  taxTreatment: string;
  total: number;
  transactionCount: number;
}

export interface IncomeStatement {
  period: ReportPeriod;
  income: CategoryTotal[];
  cogs: CategoryTotal[];
  expenses: CategoryTotal[];
  nonDeductible: CategoryTotal[];
  totals: {
    grossReceipts: number;
    costOfGoodsSold: number;
    grossProfit: number;
    operatingExpenses: number;
    nonDeductibleExpenses: number;
    netIncome: number;
  };
}

export interface BalanceSheet {
  period: ReportPeriod;
  assets: CategoryTotal[];
  liabilities: CategoryTotal[];
  equity: CategoryTotal[];
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;
  };
}

export interface TransactionDetail {
  date: Date;
  description: string;
  amount: number;
  balance: number;
  category: string;
  isManual: boolean;
}

export interface GeneralLedgerReport {
  period: ReportPeriod;
  accounts: Array<{
    accountCode: string;
    accountName: string;
    accountType: string;
    transactions: TransactionDetail[];
    openingBalance: number;
    closingBalance: number;
  }>;
}

// Helper: Sum transactions by tax account
async function sumByTaxAccount(
  companyId: string,
  startDate: Date,
  endDate: Date,
  accountTypes: string[]
): Promise<CategoryTotal[]> {
  const results = await prisma.bankTransaction.groupBy({
    by: ['taxAccountId'],
    where: {
      companyId,
      date: { gte: startDate, lte: endDate },
      taxAccount: { accountType: { in: accountTypes as any } },
    },
    _sum: { amount: true },
    _count: { id: true },
  });

  const totals: CategoryTotal[] = [];

  for (const r of results) {
    if (!r.taxAccountId) continue;

    const account = await prisma.taxAccount.findUnique({
      where: { id: r.taxAccountId },
    });

    if (account) {
      totals.push({
        accountCode: account.code,
        accountName: account.name,
        taxTreatment: account.taxTreatment,
        total: r._sum.amount?.toNumber() || 0,
        transactionCount: r._count.id,
      });
    }
  }

  return totals.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

/**
 * Generate Executive Summary Report
 */
export async function generateExecutiveSummary(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<ExecutiveSummary> {
  // Get all income
  const income = await sumByTaxAccount(companyId, startDate, endDate, ['INCOME']);
  const grossReceipts = income.reduce((sum, i) => sum + Math.abs(i.total), 0);

  // Get COGS
  const cogs = await sumByTaxAccount(companyId, startDate, endDate, ['EXPENSE_COGS']);
  const costOfGoodsSold = Math.abs(cogs.reduce((sum, c) => sum + c.total, 0));

  // Get operating expenses
  const expenses = await sumByTaxAccount(companyId, startDate, endDate, ['EXPENSE_OPERATING']);
  const deductibleExpenses = expenses
    .filter((e) => e.taxTreatment !== 'NON_DEDUCTIBLE')
    .reduce((sum, e) => sum + Math.abs(e.total), 0);

  // Get non-deductible (owner distributions)
  const nonDeductible = expenses.filter((e) => e.taxTreatment === 'NON_DEDUCTIBLE');
  const ownerDistributions = nonDeductible.reduce((sum, e) => sum + Math.abs(e.total), 0);

  // Get bank balances
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { companyId },
  });

  const operating = bankAccounts.find((b) => b.accountNumber === '0055');
  const payroll = bankAccounts.find((b) => b.accountNumber === '0056');

  // Get transaction stats
  const totalTransactions = await prisma.bankTransaction.count({
    where: { companyId, date: { gte: startDate, lte: endDate } },
  });
  const categorizedTransactions = await prisma.bankTransaction.count({
    where: { companyId, date: { gte: startDate, lte: endDate }, needsReview: false },
  });

  const grossProfit = grossReceipts - costOfGoodsSold;
  const netIncome = grossProfit - deductibleExpenses;

  return {
    period: { startDate, endDate },
    grossReceipts,
    costOfGoodsSold,
    grossProfit,
    operatingExpenses: deductibleExpenses,
    netIncome,
    ownerDistributions,
    cashBalance: {
      operating: operating?.currentBalance?.toNumber() || 0,
      payroll: payroll?.currentBalance?.toNumber() || 0,
      total: (operating?.currentBalance?.toNumber() || 0) + (payroll?.currentBalance?.toNumber() || 0),
    },
    transactionStats: {
      total: totalTransactions,
      categorized: categorizedTransactions,
      needsReview: totalTransactions - categorizedTransactions,
    },
  };
}

/**
 * Generate Income Statement (P&L)
 */
export async function generateIncomeStatement(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<IncomeStatement> {
  const income = await sumByTaxAccount(companyId, startDate, endDate, ['INCOME']);
  const cogs = await sumByTaxAccount(companyId, startDate, endDate, ['EXPENSE_COGS']);
  const allExpenses = await sumByTaxAccount(companyId, startDate, endDate, ['EXPENSE_OPERATING']);

  const deductibleExpenses = allExpenses.filter((e) => e.taxTreatment !== 'NON_DEDUCTIBLE');
  const nonDeductible = allExpenses.filter((e) => e.taxTreatment === 'NON_DEDUCTIBLE');

  const grossReceipts = income.reduce((sum, i) => sum + Math.abs(i.total), 0);
  const costOfGoodsSold = Math.abs(cogs.reduce((sum, c) => sum + c.total, 0));
  const operatingExpenses = deductibleExpenses.reduce((sum, e) => sum + Math.abs(e.total), 0);
  const nonDeductibleExpenses = nonDeductible.reduce((sum, e) => sum + Math.abs(e.total), 0);

  return {
    period: { startDate, endDate },
    income,
    cogs,
    expenses: deductibleExpenses,
    nonDeductible,
    totals: {
      grossReceipts,
      costOfGoodsSold,
      grossProfit: grossReceipts - costOfGoodsSold,
      operatingExpenses,
      nonDeductibleExpenses,
      netIncome: grossReceipts - costOfGoodsSold - operatingExpenses,
    },
  };
}

/**
 * Generate Balance Sheet
 */
export async function generateBalanceSheet(
  companyId: string,
  endDate: Date
): Promise<BalanceSheet> {
  const assets = await sumByTaxAccount(companyId, new Date('1900-01-01'), endDate, ['ASSET']);
  const liabilities = await sumByTaxAccount(companyId, new Date('1900-01-01'), endDate, ['LIABILITY']);
  const equity = await sumByTaxAccount(companyId, new Date('1900-01-01'), endDate, ['EQUITY']);

  return {
    period: { startDate: new Date('1900-01-01'), endDate },
    assets,
    liabilities,
    equity,
    totals: {
      totalAssets: assets.reduce((sum, a) => sum + a.total, 0),
      totalLiabilities: liabilities.reduce((sum, l) => sum + Math.abs(l.total), 0),
      totalEquity: equity.reduce((sum, e) => sum + e.total, 0),
    },
  };
}

/**
 * Generate General Ledger Report (all transactions by account)
 */
export async function generateGeneralLedger(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<GeneralLedgerReport> {
  const taxAccounts = await prisma.taxAccount.findMany({
    where: { companyId, active: true },
    orderBy: { code: 'asc' },
  });

  const accounts = [];

  for (const account of taxAccounts) {
    const transactions = await prisma.bankTransaction.findMany({
      where: {
        companyId,
        taxAccountId: account.id,
        date: { gte: startDate, lte: endDate },
      },
      orderBy: { date: 'asc' },
    });

    if (transactions.length === 0) continue;

    let runningBalance = 0;
    const details: TransactionDetail[] = transactions.map((t) => {
      runningBalance += t.amount.toNumber();
      return {
        date: t.date,
        description: t.description,
        amount: t.amount.toNumber(),
        balance: runningBalance,
        category: account.name,
        isManual: t.isManualCategorization,
      };
    });

    accounts.push({
      accountCode: account.code,
      accountName: account.name,
      accountType: account.accountType,
      transactions: details,
      openingBalance: 0,
      closingBalance: runningBalance,
    });
  }

  return {
    period: { startDate, endDate },
    accounts,
  };
}

/**
 * Generate Category Breakdown (for pie charts, etc.)
 */
export async function generateCategoryBreakdown(
  companyId: string,
  startDate: Date,
  endDate: Date
): Promise<{ expenses: CategoryTotal[]; income: CategoryTotal[] }> {
  const income = await sumByTaxAccount(companyId, startDate, endDate, ['INCOME']);
  const expenses = await sumByTaxAccount(companyId, startDate, endDate, [
    'EXPENSE_COGS',
    'EXPENSE_OPERATING',
  ]);

  return {
    income: income.map((i) => ({ ...i, total: Math.abs(i.total) })),
    expenses: expenses.map((e) => ({ ...e, total: Math.abs(e.total) })),
  };
}

export default {
  generateExecutiveSummary,
  generateIncomeStatement,
  generateBalanceSheet,
  generateGeneralLedger,
  generateCategoryBreakdown,
};

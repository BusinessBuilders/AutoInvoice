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

export interface BalanceSheetItem {
  code: string;
  name: string;
  balance: number;
  source: 'bank_account' | 'transaction_sum';  // Where the balance came from
}

export interface BalanceSheet {
  period: ReportPeriod;
  assets: BalanceSheetItem[];
  liabilities: BalanceSheetItem[];
  totals: {
    totalAssets: number;
    totalLiabilities: number;
    totalEquity: number;        // Calculated: Assets - Liabilities
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

// Helper: Sum transactions by tax account (using absolute values)
async function sumByTaxAccount(
  companyId: string,
  startDate: Date,
  endDate: Date,
  accountTypes: string[]
): Promise<CategoryTotal[]> {
  // Get all transactions with their tax accounts
  const transactions = await prisma.bankTransaction.findMany({
    where: {
      companyId,
      date: { gte: startDate, lte: endDate },
      taxAccount: { accountType: { in: accountTypes as any } },
    },
    include: { taxAccount: true },
  });

  // Group by taxAccountId and sum absolute values
  const grouped = new Map<string, { account: any; total: number; count: number }>();

  for (const t of transactions) {
    if (!t.taxAccountId || !t.taxAccount) continue;

    const existing = grouped.get(t.taxAccountId);
    if (existing) {
      existing.total += Math.abs(t.amount.toNumber());
      existing.count += 1;
    } else {
      grouped.set(t.taxAccountId, {
        account: t.taxAccount,
        total: Math.abs(t.amount.toNumber()),
        count: 1,
      });
    }
  }

  const totals: CategoryTotal[] = [];
  for (const [, data] of grouped) {
    totals.push({
      accountCode: data.account.code,
      accountName: data.account.name,
      taxTreatment: data.account.taxTreatment,
      total: data.total,
      transactionCount: data.count,
    });
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

export interface BalanceSheetOptions {
  excludeCreditCards?: boolean;
}

/**
 * Generate Balance Sheet
 *
 * Shows point-in-time financial position using ACTUAL balances:
 * - ASSETS: Bank account balances + other assets (vehicles, etc.)
 * - LIABILITIES: Credit card balances (optional)
 * - EQUITY: Calculated as Assets - Liabilities
 */
export async function generateBalanceSheet(
  companyId: string,
  endDate: Date,
  options: BalanceSheetOptions = {}
): Promise<BalanceSheet> {
  const { excludeCreditCards = false } = options;

  const assets: BalanceSheetItem[] = [];
  const liabilities: BalanceSheetItem[] = [];

  // 1. Get actual bank account balances (checking accounts = assets)
  const bankAccounts = await prisma.bankAccount.findMany({
    where: { companyId },
  });

  for (const account of bankAccounts) {
    const balance = account.currentBalance?.toNumber() || 0;
    if (balance === 0) continue;  // Skip zero-balance accounts

    if (account.accountType === 'checking' || account.accountType === 'savings') {
      assets.push({
        code: account.accountNumber || '1010',
        name: account.name,
        balance: balance,
        source: 'bank_account',
      });
    } else if (account.accountType === 'credit_card' && !excludeCreditCards) {
      // Credit cards are liabilities (show as positive liability)
      liabilities.push({
        code: account.accountNumber || '2010',
        name: account.name,
        balance: Math.abs(balance),
        source: 'bank_account',
      });
    }
  }

  // 2. Get other assets from transaction sums (vehicles, equipment, etc.)
  //    These are non-cash assets tracked via expense categorization
  const otherAssets = await sumByTaxAccount(companyId, new Date('1900-01-01'), endDate, ['ASSET']);
  for (const asset of otherAssets) {
    // Skip cash accounts (already from BankAccount) and TRANSFER
    if (asset.taxTreatment === 'TRANSFER') continue;
    if (asset.accountCode.startsWith('10')) continue;  // 10xx are cash accounts

    assets.push({
      code: asset.accountCode,
      name: asset.accountName,
      balance: Math.abs(asset.total),
      source: 'transaction_sum',
    });
  }

  // Sort by code
  assets.sort((a, b) => a.code.localeCompare(b.code));
  liabilities.sort((a, b) => a.code.localeCompare(b.code));

  const totalAssets = assets.reduce((sum, a) => sum + a.balance, 0);
  const totalLiabilities = liabilities.reduce((sum, l) => sum + l.balance, 0);
  const totalEquity = totalAssets - totalLiabilities;

  return {
    period: { startDate: new Date('1900-01-01'), endDate },
    assets,
    liabilities,
    totals: {
      totalAssets,
      totalLiabilities,
      totalEquity,
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

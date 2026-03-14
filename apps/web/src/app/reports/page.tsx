'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

// Transaction type for the ledger
interface LedgerTransaction {
  date: string;
  description: string;
  amount: string;
  taxAccount?: { name: string; code: string } | null;
  vendor?: { name: string } | null;
  bankAccount?: { name: string } | null;
}

// Helper to convert data to CSV format
function arrayToCSV(data: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map(col => col.label).join(',');
  const rows = data.map(row =>
    columns.map(col => {
      const value = row[col.key];
      if (value === null || value === undefined) return '';
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma/quote/newline
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );
  return [header, ...rows].join('\n');
}

function downloadCSV(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Format currency
function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
}

// Default tax adjustments for common categories
const DEFAULT_ADJUSTMENTS: Record<string, number> = {
  '6250': 50,  // Meals & Entertainment - 50% deductible
};

export default function ReportsPage() {
  // Default to LAST year (for tax returns)
  const currentYear = new Date().getFullYear();
  const [exportYear, setExportYear] = useState(currentYear - 1); // Default to last year for tax prep
  const [isExporting, setIsExporting] = useState<string | null>(null);
  const [showPdfPreview, setShowPdfPreview] = useState(false);
  const [ledgerData, setLedgerData] = useState<LedgerTransaction[]>([]);
  const printRef = useRef<HTMLDivElement>(null);

  // Tax Prep Mode state
  const [showTaxPrep, setShowTaxPrep] = useState(false);
  const [taxAdjustments, setTaxAdjustments] = useState<Record<string, number>>(DEFAULT_ADJUSTMENTS);
  const [expenseCategories, setExpenseCategories] = useState<Array<{accountCode: string; accountName: string; total: number}>>([]);

  // Get adjustment percentage for an account (default 100%)
  const getAdjustment = (accountCode: string) => taxAdjustments[accountCode] ?? 100;

  // Fetch general ledger data for export
  const startDate = `${exportYear}-01-01`;
  const endDate = `${exportYear}-12-31`;

  // Company ID - hardcoded for now (matches general-ledger page)
  const companyId = 'donovan-farms';

  const generalLedgerQuery = trpc.bankTransactions.list.useQuery({
    companyId,
    startDate,
    endDate,
    limit: 5000, // Backend max is 5000
  }, {
    enabled: false, // Don't auto-fetch, only on demand
  });

  // P&L query for export
  const incomeStatementQuery = trpc.taxReports.incomeStatement.useQuery({
    companyId,
    startDate,
    endDate,
  }, {
    enabled: false,
  });

  // Balance Sheet query for export
  const balanceSheetQuery = trpc.taxReports.balanceSheet.useQuery({
    companyId,
    asOfDate: endDate,
  }, {
    enabled: false,
  });

  // Owner distribution category codes (personal expenses)
  const OWNER_DISTRIBUTION_CODES = ['6100', '6110', '6120', '3030'];

  const handleExportGeneralLedger = async () => {
    setIsExporting('general-ledger');
    try {
      console.log(`Fetching ledger for ${exportYear}...`);
      const result = await generalLedgerQuery.refetch();
      console.log('Result:', result);

      if (result.error) {
        alert(`Error fetching data: ${result.error.message}`);
        return;
      }

      if (result.data?.transactions) {
        console.log(`Got ${result.data.transactions.length} transactions`);
        const csvData = result.data.transactions.map(t => ({
          date: t.date.split('T')[0],
          description: t.description,
          amount: Number(t.amount).toFixed(2),
          category: t.taxAccount?.name || 'Uncategorized',
          categoryCode: t.taxAccount?.code || '',
          vendor: t.vendor?.name || '',
          account: t.bankAccount?.name || '',
          type: Number(t.amount) >= 0 ? 'Credit' : 'Debit',
        }));

        const csv = arrayToCSV(csvData, [
          { key: 'date', label: 'Date' },
          { key: 'description', label: 'Description' },
          { key: 'amount', label: 'Amount' },
          { key: 'category', label: 'Category' },
          { key: 'categoryCode', label: 'Category Code' },
          { key: 'vendor', label: 'Vendor' },
          { key: 'account', label: 'Bank Account' },
          { key: 'type', label: 'Type' },
        ]);

        downloadCSV(csv, `general-ledger-${exportYear}.csv`);
        console.log('Download triggered');
      } else {
        alert(`No transactions found for ${exportYear}`);
      }
    } catch (err) {
      console.error('Export error:', err);
      alert(`Export failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setIsExporting(null);
    }
  };

  const handleViewPdf = async () => {
    setIsExporting('pdf');
    try {
      const result = await generalLedgerQuery.refetch();
      if (result.data?.transactions) {
        setLedgerData(result.data.transactions);
        setShowPdfPreview(true);
      }
    } finally {
      setIsExporting(null);
    }
  };

  const handlePrint = () => {
    window.print();
  };

  // Load expense categories for Tax Prep Mode
  const handleOpenTaxPrep = async () => {
    setIsExporting('loading-categories');
    try {
      const result = await incomeStatementQuery.refetch();
      if (result.data) {
        // Combine COGS and operating expenses for adjustment
        const allExpenses = [...result.data.cogs, ...result.data.expenses];
        setExpenseCategories(allExpenses);
        setShowTaxPrep(true);
      }
    } finally {
      setIsExporting(null);
    }
  };

  // Export P&L to CSV (with tax adjustments applied)
  const handleExportPL = async () => {
    setIsExporting('pl');
    try {
      const result = await incomeStatementQuery.refetch();
      if (result.data) {
        const rows: Record<string, unknown>[] = [];

        // Add header showing if adjustments are applied
        const hasAdjustments = Object.keys(taxAdjustments).length > 0;
        if (hasAdjustments) {
          rows.push({ section: 'TAX-ADJUSTED PROFIT & LOSS', account: '', code: '', amount: '', adjustment: '' });
          rows.push({ section: '', account: '', code: '', amount: '', adjustment: '' });
        }

        // Add Income section
        rows.push({ section: 'INCOME', account: '', code: '', amount: '', adjustment: '' });
        result.data.income.forEach(item => {
          rows.push({
            section: '',
            account: item.accountName,
            code: item.accountCode,
            amount: Math.abs(Number(item.total)).toFixed(2),
            adjustment: '100%',
          });
        });
        rows.push({ section: '', account: 'Total Income', code: '', amount: result.data.totals.grossReceipts.toFixed(2), adjustment: '' });
        rows.push({ section: '', account: '', code: '', amount: '', adjustment: '' });

        // Add COGS section with adjustments
        rows.push({ section: 'COST OF GOODS SOLD', account: '', code: '', amount: '', adjustment: '' });
        let adjustedCOGS = 0;
        result.data.cogs.forEach(item => {
          const pct = getAdjustment(item.accountCode);
          const original = Math.abs(Number(item.total));
          const adjusted = original * (pct / 100);
          adjustedCOGS += adjusted;
          rows.push({
            section: '',
            account: item.accountName,
            code: item.accountCode,
            amount: adjusted.toFixed(2),
            adjustment: pct !== 100 ? `${pct}%` : '100%',
          });
        });
        rows.push({ section: '', account: 'Total COGS', code: '', amount: adjustedCOGS.toFixed(2), adjustment: '' });
        rows.push({ section: '', account: '', code: '', amount: '', adjustment: '' });

        // Gross Profit (adjusted)
        const adjustedGrossProfit = result.data.totals.grossReceipts - adjustedCOGS;
        rows.push({ section: '', account: 'GROSS PROFIT', code: '', amount: adjustedGrossProfit.toFixed(2), adjustment: '' });
        rows.push({ section: '', account: '', code: '', amount: '', adjustment: '' });

        // Add Operating Expenses section with adjustments
        rows.push({ section: 'OPERATING EXPENSES', account: '', code: '', amount: '', adjustment: '' });
        let adjustedOpEx = 0;
        result.data.expenses.forEach(item => {
          const pct = getAdjustment(item.accountCode);
          const original = Math.abs(Number(item.total));
          const adjusted = original * (pct / 100);
          adjustedOpEx += adjusted;
          rows.push({
            section: '',
            account: item.accountName,
            code: item.accountCode,
            amount: adjusted.toFixed(2),
            adjustment: pct !== 100 ? `${pct}%` : '100%',
          });
        });
        rows.push({ section: '', account: 'Total Operating Expenses', code: '', amount: adjustedOpEx.toFixed(2), adjustment: '' });
        rows.push({ section: '', account: '', code: '', amount: '', adjustment: '' });

        // Net Income (adjusted)
        const adjustedNetIncome = adjustedGrossProfit - adjustedOpEx;
        rows.push({ section: '', account: 'NET INCOME (Tax-Adjusted)', code: '', amount: adjustedNetIncome.toFixed(2), adjustment: '' });

        const csv = arrayToCSV(rows, [
          { key: 'section', label: 'Section' },
          { key: 'account', label: 'Account' },
          { key: 'code', label: 'Code' },
          { key: 'amount', label: 'Adjusted Amount' },
          { key: 'adjustment', label: '% Claimed' },
        ]);

        downloadCSV(csv, `profit-loss-tax-adjusted-${exportYear}.csv`);
      }
    } finally {
      setIsExporting(null);
    }
  };

  // Export Balance Sheet to CSV
  const handleExportBalanceSheet = async () => {
    setIsExporting('balance');
    try {
      const result = await balanceSheetQuery.refetch();
      if (result.data) {
        const rows: Record<string, unknown>[] = [];

        // Assets
        rows.push({ section: 'ASSETS', account: '', amount: '' });
        result.data.assets.forEach(item => {
          rows.push({
            section: '',
            account: item.name,
            amount: Number(item.balance).toFixed(2),
          });
        });
        rows.push({ section: '', account: 'Total Assets', amount: result.data.totals.totalAssets.toFixed(2) });
        rows.push({ section: '', account: '', amount: '' });

        // Liabilities
        rows.push({ section: 'LIABILITIES', account: '', amount: '' });
        result.data.liabilities.forEach(item => {
          rows.push({
            section: '',
            account: item.name,
            amount: Number(item.balance).toFixed(2),
          });
        });
        rows.push({ section: '', account: 'Total Liabilities', amount: result.data.totals.totalLiabilities.toFixed(2) });
        rows.push({ section: '', account: '', amount: '' });

        // Equity
        rows.push({ section: 'EQUITY', account: '', amount: '' });
        rows.push({ section: '', account: 'Owners Equity', amount: result.data.totals.totalEquity.toFixed(2) });
        rows.push({ section: '', account: '', amount: '' });

        // Total
        rows.push({ section: '', account: 'TOTAL LIABILITIES + EQUITY', amount: (result.data.totals.totalLiabilities + result.data.totals.totalEquity).toFixed(2) });

        const csv = arrayToCSV(rows, [
          { key: 'section', label: 'Section' },
          { key: 'account', label: 'Account' },
          { key: 'amount', label: 'Amount' },
        ]);

        downloadCSV(csv, `balance-sheet-${exportYear}.csv`);
      }
    } finally {
      setIsExporting(null);
    }
  };

  // Export Owner's Distributions (personal expenses through business)
  const handleExportOwnerDistributions = async () => {
    setIsExporting('distributions');
    try {
      const result = await generalLedgerQuery.refetch();
      if (result.data?.transactions) {
        // Filter for owner distribution categories
        const distributions = result.data.transactions.filter(t =>
          OWNER_DISTRIBUTION_CODES.includes(t.taxAccount?.code || '')
        );

        if (distributions.length === 0) {
          alert(`No owner distributions found for ${exportYear}.\n\nLook for transactions categorized as:\n- Groceries - Personal (6100)\n- Liquor - Personal (6110)\n- Personal Shopping (6120)\n- Owner Distributions (3030)`);
          return;
        }

        const csvData = distributions.map(t => ({
          date: t.date.split('T')[0],
          description: t.description,
          amount: Math.abs(Number(t.amount)).toFixed(2),
          category: t.taxAccount?.name || 'Uncategorized',
          categoryCode: t.taxAccount?.code || '',
          vendor: t.vendor?.name || '',
          account: t.bankAccount?.name || '',
        }));

        // Add total row
        const total = distributions.reduce((sum, t) => sum + Math.abs(Number(t.amount)), 0);

        const csv = arrayToCSV(csvData, [
          { key: 'date', label: 'Date' },
          { key: 'description', label: 'Description' },
          { key: 'amount', label: 'Amount' },
          { key: 'category', label: 'Category' },
          { key: 'categoryCode', label: 'Code' },
          { key: 'vendor', label: 'Vendor' },
          { key: 'account', label: 'Bank Account' },
        ]);

        // Add summary at end
        const csvWithTotal = csv + `\n\nTOTAL OWNER DISTRIBUTIONS,,,${total.toFixed(2)},,,"For ${exportYear}"`;

        downloadCSV(csvWithTotal, `owner-distributions-${exportYear}.csv`);
      }
    } finally {
      setIsExporting(null);
    }
  };

  // Calculate totals for the ledger
  const totals = ledgerData.reduce(
    (acc, t) => {
      const amount = Number(t.amount);
      if (amount >= 0) {
        acc.credits += amount;
      } else {
        acc.debits += Math.abs(amount);
      }
      return acc;
    },
    { credits: 0, debits: 0 }
  );

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Back Navigation */}
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Financial Reports</h1>
          <p className="text-gray-600 mt-1">View your business financial reports and insights</p>
        </div>

        {/* Quick Exports Section - For Accountant */}
        <div className="mb-8 bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-bold text-gray-900">Quick Exports for Accountant</h2>
              <p className="text-sm text-gray-600">
                Download CSV files for <span className="font-bold text-blue-600">{exportYear}</span> tax preparation
              </p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Tax Year:</label>
              <select
                value={exportYear}
                onChange={(e) => {
                  setExportYear(Number(e.target.value));
                  // Clear Tax Prep data when year changes - must reload
                  setExpenseCategories([]);
                  setShowTaxPrep(false);
                }}
                className="border-2 border-blue-300 rounded px-3 py-1.5 text-sm font-bold bg-blue-50"
              >
                {[currentYear - 1, currentYear - 2, currentYear - 3, currentYear].map(year => (
                  <option key={year} value={year}>{year}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-3">
            {/* General Ledger CSV Export */}
            <button
              onClick={handleExportGeneralLedger}
              disabled={isExporting === 'general-ledger'}
              className="flex items-center gap-3 p-4 border-2 border-dashed border-purple-300 rounded-lg hover:border-purple-500 hover:bg-purple-50 transition-colors disabled:opacity-50"
            >
              <div className="p-2 bg-purple-100 rounded-lg">
                <svg className="w-5 h-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">
                  {isExporting === 'general-ledger' ? 'Exporting...' : 'Ledger CSV'}
                </div>
                <div className="text-xs text-gray-500">Download spreadsheet</div>
              </div>
            </button>

            {/* General Ledger PDF Preview */}
            <button
              onClick={handleViewPdf}
              disabled={isExporting === 'pdf'}
              className="flex items-center gap-3 p-4 border-2 border-dashed border-indigo-300 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-colors disabled:opacity-50"
            >
              <div className="p-2 bg-indigo-100 rounded-lg">
                <svg className="w-5 h-5 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">
                  {isExporting === 'pdf' ? 'Loading...' : 'Ledger PDF'}
                </div>
                <div className="text-xs text-gray-500">View & print report</div>
              </div>
            </button>

            {/* P&L CSV Export */}
            <button
              onClick={handleExportPL}
              disabled={isExporting === 'pl'}
              className="flex items-center gap-3 p-4 border-2 border-dashed border-green-300 rounded-lg hover:border-green-500 hover:bg-green-50 transition-colors disabled:opacity-50"
            >
              <div className="p-2 bg-green-100 rounded-lg">
                <svg className="w-5 h-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">
                  {isExporting === 'pl' ? 'Exporting...' : 'P&L CSV'}
                </div>
                <div className="text-xs text-gray-500">Income Statement</div>
              </div>
            </button>

            {/* Balance Sheet CSV Export */}
            <button
              onClick={handleExportBalanceSheet}
              disabled={isExporting === 'balance'}
              className="flex items-center gap-3 p-4 border-2 border-dashed border-cyan-300 rounded-lg hover:border-cyan-500 hover:bg-cyan-50 transition-colors disabled:opacity-50"
            >
              <div className="p-2 bg-cyan-100 rounded-lg">
                <svg className="w-5 h-5 text-cyan-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">
                  {isExporting === 'balance' ? 'Exporting...' : 'Balance Sheet CSV'}
                </div>
                <div className="text-xs text-gray-500">Assets & Liabilities</div>
              </div>
            </button>

            {/* Owner Distributions Export */}
            <button
              onClick={handleExportOwnerDistributions}
              disabled={isExporting === 'distributions'}
              className="flex items-center gap-3 p-4 border-2 border-dashed border-pink-300 rounded-lg hover:border-pink-500 hover:bg-pink-50 transition-colors disabled:opacity-50"
            >
              <div className="p-2 bg-pink-100 rounded-lg">
                <svg className="w-5 h-5 text-pink-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">
                  {isExporting === 'distributions' ? 'Exporting...' : 'Owner Draws'}
                </div>
                <div className="text-xs text-gray-500">Personal expenses</div>
              </div>
            </button>

            {/* Tax Reports Link - View Full Reports */}
            <Link
              href={`/accounting/reports?startDate=${startDate}&endDate=${endDate}`}
              className="flex items-center gap-3 p-4 border-2 border-dashed border-red-300 rounded-lg hover:border-red-500 hover:bg-red-50 transition-colors"
            >
              <div className="p-2 bg-red-100 rounded-lg">
                <svg className="w-5 h-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                </svg>
              </div>
              <div className="text-left">
                <div className="font-medium text-gray-900">View All Reports</div>
                <div className="text-xs text-gray-500">Tax Prep Mode & Print</div>
              </div>
            </Link>
          </div>

          {/* Tax Prep Mode Toggle */}
          <div className="mt-4 pt-4 border-t">
            <button
              onClick={handleOpenTaxPrep}
              disabled={isExporting === 'loading-categories'}
              className="text-sm text-orange-600 hover:text-orange-700 font-medium flex items-center gap-2"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
              {isExporting === 'loading-categories' ? 'Loading...' : (showTaxPrep ? 'Hide' : 'Show')} Tax Prep Mode - Adjust Expense Percentages
            </button>
          </div>

          {/* Tax Prep Mode Panel */}
          {showTaxPrep && expenseCategories.length > 0 && (
            <div className="mt-4 p-4 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="font-medium text-orange-800">
                    Tax Prep: Adjust Deduction Percentages
                  </h3>
                  <p className="text-lg font-bold text-orange-900">
                    Year: {exportYear} (Jan 1 - Dec 31)
                  </p>
                </div>
                <button
                  onClick={() => setShowTaxPrep(false)}
                  className="text-orange-600 hover:text-orange-700 text-sm"
                >
                  Close
                </button>
              </div>
              <p className="text-sm text-orange-700 mb-4">
                Set the percentage of each expense category you want to claim for <strong>{exportYear}</strong> tax return.
                Default is 100%. The P&L CSV will use these adjusted amounts.
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 max-h-64 overflow-y-auto">
                {expenseCategories.map(cat => (
                  <div key={cat.accountCode} className="flex items-center gap-2 bg-white p-2 rounded border">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate" title={cat.accountName}>
                        {cat.accountName}
                      </div>
                      <div className="text-xs text-gray-500">
                        ${Math.abs(cat.total).toLocaleString()} total
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={getAdjustment(cat.accountCode)}
                        onChange={(e) => {
                          const value = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                          setTaxAdjustments(prev => ({
                            ...prev,
                            [cat.accountCode]: value,
                          }));
                        }}
                        className="w-16 px-2 py-1 text-sm border rounded text-right"
                      />
                      <span className="text-sm text-gray-500">%</span>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4 flex items-center justify-between">
                <div className="text-sm text-orange-700">
                  Adjusted expenses will be calculated when you export P&L CSV
                </div>
                <button
                  onClick={() => setTaxAdjustments(DEFAULT_ADJUSTMENTS)}
                  className="text-sm text-orange-600 hover:text-orange-700 underline"
                >
                  Reset to Defaults
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Report Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Profit & Loss Report */}
          <Link
            href="/reports/profit-loss"
            className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-green-100 rounded-lg group-hover:bg-green-200 transition-colors">
                <svg
                  className="w-6 h-6 text-green-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 7h6m0 10v-3m-3 3h.01M9 17h.01M9 14h.01M12 14h.01M15 11h.01M12 11h.01M9 11h.01M7 21h10a2 2 0 002-2V5a2 2 0 00-2-2H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Profit & Loss Statement
                </h3>
                <p className="text-sm text-gray-600">
                  Income statement showing revenue, expenses, and net income for any date range
                </p>
                <div className="mt-4 flex items-center text-blue-600 font-medium">
                  View Report
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Balance Sheet */}
          <Link
            href="/accounting/reports?type=balance-sheet"
            className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-cyan-100 rounded-lg group-hover:bg-cyan-200 transition-colors">
                <svg
                  className="w-6 h-6 text-cyan-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Balance Sheet
                </h3>
                <p className="text-sm text-gray-600">
                  Assets, liabilities, and equity snapshot showing your financial position
                </p>
                <div className="mt-4 flex items-center text-cyan-600 font-medium">
                  View Report
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Chart of Accounts */}
          <Link
            href="/accounts"
            className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-lg group-hover:bg-blue-200 transition-colors">
                <svg
                  className="w-6 h-6 text-blue-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M3 10h18M3 14h18m-9-4v8m-7 0h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Chart of Accounts
                </h3>
                <p className="text-sm text-gray-600">
                  Manage your complete chart of accounts with assets, liabilities, equity, revenue, and expenses
                </p>
                <div className="mt-4 flex items-center text-blue-600 font-medium">
                  Manage Accounts
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Expense Tracking */}
          <Link
            href="/receipts"
            className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-orange-100 rounded-lg group-hover:bg-orange-200 transition-colors">
                <svg
                  className="w-6 h-6 text-orange-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Expense Tracking
                </h3>
                <p className="text-sm text-gray-600">
                  Track and categorize business expenses from receipts with AI-powered OCR
                </p>
                <div className="mt-4 flex items-center text-blue-600 font-medium">
                  View Expenses
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>

          {/* Customer Statements */}
          <Link
            href="/reports/customer-statement"
            className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-indigo-100 rounded-lg group-hover:bg-indigo-200 transition-colors">
                <svg
                  className="w-6 h-6 text-indigo-600"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-lg font-bold text-gray-900 mb-2">
                  Customer Statements
                </h3>
                <p className="text-sm text-gray-600">
                  View unpaid invoices and send statements to customers
                </p>
                <div className="mt-4 flex items-center text-blue-600 font-medium">
                  Manage Statements
                  <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </div>
          </Link>
        </div>

        {/* Bank Transaction / Tax Reports Section */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Bank Transactions & Tax Reports</h2>
          <p className="text-gray-600 mb-6">Import bank statements, categorize transactions, and generate tax-ready reports</p>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* General Ledger */}
            <Link
              href="/accounting/general-ledger"
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-purple-100 rounded-lg group-hover:bg-purple-200 transition-colors">
                  <svg
                    className="w-6 h-6 text-purple-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    General Ledger
                  </h3>
                  <p className="text-sm text-gray-600">
                    View and categorize bank transactions. Change categories here and they reflect in all reports.
                  </p>
                  <div className="mt-4 flex items-center text-purple-600 font-medium">
                    Manage Transactions
                    <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Bank Accounts */}
            <Link
              href="/accounting/bank-accounts"
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-emerald-100 rounded-lg group-hover:bg-emerald-200 transition-colors">
                  <svg
                    className="w-6 h-6 text-emerald-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Bank Accounts
                  </h3>
                  <p className="text-sm text-gray-600">
                    Manage checking, savings, and credit card accounts linked to Chart of Accounts.
                  </p>
                  <div className="mt-4 flex items-center text-emerald-600 font-medium">
                    Manage Accounts
                    <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Import Transactions */}
            <Link
              href="/accounting/import"
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-teal-100 rounded-lg group-hover:bg-teal-200 transition-colors">
                  <svg
                    className="w-6 h-6 text-teal-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Import Bank Data
                  </h3>
                  <p className="text-sm text-gray-600">
                    Import bank statements from CSV/JSON. Auto-categorize using saved rules.
                  </p>
                  <div className="mt-4 flex items-center text-teal-600 font-medium">
                    Import Transactions
                    <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>

            {/* Tax Reports */}
            <Link
              href="/accounting/reports"
              className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow p-6 group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-red-100 rounded-lg group-hover:bg-red-200 transition-colors">
                  <svg
                    className="w-6 h-6 text-red-600"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-900 mb-2">
                    Tax Reports (S-Corp)
                  </h3>
                  <p className="text-sm text-gray-600">
                    Generate Executive Summary, Income Statement, Balance Sheet for Form 1120-S
                  </p>
                  <div className="mt-4 flex items-center text-red-600 font-medium">
                    Generate Reports
                    <svg className="w-4 h-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Coming Soon Section */}
        <div className="mt-12">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Coming Soon</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Job Profitability */}
            <div className="bg-gray-50 rounded-lg shadow p-6 opacity-60">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gray-200 rounded-lg">
                  <svg
                    className="w-6 h-6 text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-700 mb-2">
                    Job Profitability
                  </h3>
                  <p className="text-sm text-gray-500">
                    Analyze profit margins by customer and job type to identify most profitable work
                  </p>
                  <div className="mt-4 text-gray-400 text-sm font-medium">
                    Coming in Phase 2
                  </div>
                </div>
              </div>
            </div>

            {/* Cash Flow Statement */}
            <div className="bg-gray-50 rounded-lg shadow p-6 opacity-60">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gray-200 rounded-lg">
                  <svg
                    className="w-6 h-6 text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 16V4m0 0L3 8m4-4l4 4m6 0v12m0 0l4-4m-4 4l-4-4"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-700 mb-2">
                    Cash Flow Statement
                  </h3>
                  <p className="text-sm text-gray-500">
                    Track cash inflows and outflows from operations, investing, and financing
                  </p>
                  <div className="mt-4 text-gray-400 text-sm font-medium">
                    Coming in Phase 2
                  </div>
                </div>
              </div>
            </div>

            {/* PDF Bank Import */}
            <div className="bg-gray-50 rounded-lg shadow p-6 opacity-60">
              <div className="flex items-start gap-4">
                <div className="p-3 bg-gray-200 rounded-lg">
                  <svg
                    className="w-6 h-6 text-gray-500"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-gray-700 mb-2">
                    PDF Bank Import
                  </h3>
                  <p className="text-sm text-gray-500">
                    Upload PDF bank statements with OCR extraction
                  </p>
                  <div className="mt-4 text-gray-400 text-sm font-medium">
                    Coming in Phase 2
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights */}
        <div className="mt-12 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-lg font-bold text-blue-900 mb-3">
            ✨ Phase 1 Complete - Accounting Foundation
          </h3>
          <ul className="space-y-2 text-blue-800">
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Double-entry bookkeeping with automated journal entries</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Revenue recognition when invoices are sent</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Expense categorization with automatic journal entries</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Multi-tenant data isolation for enterprise security</span>
            </li>
            <li className="flex items-start gap-2">
              <svg className="w-5 h-5 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span>Real-time financial dashboard with profit metrics</span>
            </li>
          </ul>
        </div>
      </div>

      {/* PDF Preview Modal */}
      {showPdfPreview && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center print:bg-white print:static">
          <div className="bg-white w-full h-full overflow-auto print:overflow-visible" ref={printRef}>
            {/* Modal Header - Hidden when printing */}
            <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between print:hidden">
              <h2 className="text-xl font-bold">General Ledger - {exportYear}</h2>
              <div className="flex gap-2">
                <button
                  onClick={handlePrint}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Print / Save PDF
                </button>
                <button
                  onClick={() => setShowPdfPreview(false)}
                  className="px-4 py-2 bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                >
                  Close
                </button>
              </div>
            </div>

            {/* Print Content */}
            <div className="p-8 max-w-[1100px] mx-auto">
              {/* Report Header */}
              <div className="text-center mb-8">
                <h1 className="text-2xl font-bold">General Ledger</h1>
                <p className="text-gray-600">
                  For the period January 1, {exportYear} to December 31, {exportYear}
                </p>
                <p className="text-sm text-gray-500 mt-1">
                  Generated: {new Date().toLocaleDateString()}
                </p>
              </div>

              {/* Summary */}
              <div className="grid grid-cols-3 gap-4 mb-8 print:mb-4">
                <div className="bg-green-50 p-4 rounded-lg print:border">
                  <div className="text-sm text-green-600 font-medium">Total Credits (Income)</div>
                  <div className="text-xl font-bold text-green-700">{formatCurrency(totals.credits)}</div>
                </div>
                <div className="bg-red-50 p-4 rounded-lg print:border">
                  <div className="text-sm text-red-600 font-medium">Total Debits (Expenses)</div>
                  <div className="text-xl font-bold text-red-700">{formatCurrency(totals.debits)}</div>
                </div>
                <div className="bg-blue-50 p-4 rounded-lg print:border">
                  <div className="text-sm text-blue-600 font-medium">Net Change</div>
                  <div className="text-xl font-bold text-blue-700">
                    {formatCurrency(totals.credits - totals.debits)}
                  </div>
                </div>
              </div>

              {/* Transaction Count */}
              <p className="text-sm text-gray-500 mb-4">
                Total Transactions: {ledgerData.length}
              </p>

              {/* Transactions Table */}
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="bg-gray-100">
                    <th className="border px-3 py-2 text-left">Date</th>
                    <th className="border px-3 py-2 text-left">Description</th>
                    <th className="border px-3 py-2 text-left">Category</th>
                    <th className="border px-3 py-2 text-left">Vendor</th>
                    <th className="border px-3 py-2 text-left">Account</th>
                    <th className="border px-3 py-2 text-right">Debit</th>
                    <th className="border px-3 py-2 text-right">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {ledgerData.map((t, idx) => {
                    const amount = Number(t.amount);
                    return (
                      <tr key={idx} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="border px-3 py-1">{t.date.split('T')[0]}</td>
                        <td className="border px-3 py-1 max-w-[200px] truncate" title={t.description}>
                          {t.description}
                        </td>
                        <td className="border px-3 py-1">{t.taxAccount?.name || 'Uncategorized'}</td>
                        <td className="border px-3 py-1">{t.vendor?.name || '-'}</td>
                        <td className="border px-3 py-1">{t.bankAccount?.name || '-'}</td>
                        <td className="border px-3 py-1 text-right text-red-600">
                          {amount < 0 ? formatCurrency(Math.abs(amount)) : ''}
                        </td>
                        <td className="border px-3 py-1 text-right text-green-600">
                          {amount >= 0 ? formatCurrency(amount) : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-200 font-bold">
                    <td className="border px-3 py-2" colSpan={5}>TOTALS</td>
                    <td className="border px-3 py-2 text-right text-red-600">
                      {formatCurrency(totals.debits)}
                    </td>
                    <td className="border px-3 py-2 text-right text-green-600">
                      {formatCurrency(totals.credits)}
                    </td>
                  </tr>
                </tfoot>
              </table>

              {/* Footer */}
              <div className="mt-8 pt-4 border-t text-center text-xs text-gray-500">
                <p>Donovan Farms LLC - General Ledger Report</p>
                <p>Page 1</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

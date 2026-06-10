'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

// CSV Export helper for General Ledger
const exportToCSV = (data: Array<Record<string, string | number>>, filename: string) => {
  if (!data.length) return;
  const headers = Object.keys(data[0]);
  const csvContent = [
    headers.join(','),
    ...data.map(row => headers.map(h => {
      const val = row[h] ?? '';
      return typeof val === 'string' && val.includes(',') ? `"${val}"` : val;
    }).join(','))
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

// Format currency
const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);
};

// Format date
const formatDate = (date: Date | string) => {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
};

type ReportType = 'executive-summary' | 'income-statement' | 'balance-sheet' | 'general-ledger' | 'category-breakdown';

const validReportTypes: ReportType[] = ['executive-summary', 'income-statement', 'balance-sheet', 'general-ledger', 'category-breakdown'];

export default function ReportsPage() {
  const { requireAuth, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const typeParam = searchParams.get('type');
  const initialType = typeParam && validReportTypes.includes(typeParam as ReportType)
    ? (typeParam as ReportType)
    : 'executive-summary';

  const [companyId] = useState('donovan-farms');
  const [reportType, setReportType] = useState<ReportType>(initialType);
  const [dateRange, setDateRange] = useState({
    startDate: '2023-04-01',
    endDate: '2023-12-31',
  });

  // Tax Prep Mode - allows adjusting % claimed for expense categories
  const [taxPrepMode, setTaxPrepMode] = useState(false);
  const [taxAdjustments, setTaxAdjustments] = useState<Record<string, number>>({});

  // Get adjustment % for an account (default 100%)
  const getAdjustment = (accountCode: string) => taxAdjustments[accountCode] ?? 100;

  // Calculate adjusted total for expenses
  const calculateAdjustedExpenseTotal = (expenses: Array<{ accountCode: string; total: number }>) => {
    return expenses.reduce((sum, item) => {
      const pct = getAdjustment(item.accountCode);
      return sum + (Math.abs(item.total) * pct) / 100;
    }, 0);
  };

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  // Fetch report data based on selected type
  const { data: executiveSummary, isLoading: loadingExec } = trpc.taxReports.executiveSummary.useQuery(
    { companyId, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: reportType === 'executive-summary' }
  );

  const { data: incomeStatement, isLoading: loadingIncome } = trpc.taxReports.incomeStatement.useQuery(
    { companyId, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: reportType === 'income-statement' }
  );

  const { data: balanceSheet, isLoading: loadingBalance } = trpc.taxReports.balanceSheet.useQuery(
    { companyId, asOfDate: dateRange.endDate },
    { enabled: reportType === 'balance-sheet' }
  );

  const { data: generalLedger, isLoading: loadingGL } = trpc.taxReports.generalLedger.useQuery(
    { companyId, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: reportType === 'general-ledger' }
  );

  const { data: categoryBreakdown, isLoading: loadingCategory } = trpc.taxReports.categoryBreakdown.useQuery(
    { companyId, startDate: dateRange.startDate, endDate: dateRange.endDate },
    { enabled: reportType === 'category-breakdown' }
  );

  const isLoading = loadingExec || loadingIncome || loadingBalance || loadingGL || loadingCategory;

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center space-x-4 mb-2">
            <Link href="/accounting/general-ledger" className="text-gray-500 hover:text-gray-700">
              &larr; General Ledger
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Tax Reports</h1>
          <p className="mt-1 text-gray-600">
            Generate accounting reports for Form 1120-S
          </p>
        </div>

        {/* Controls */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Report Type</label>
              <select
                value={reportType}
                onChange={(e) => setReportType(e.target.value as ReportType)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="executive-summary">Executive Summary</option>
                <option value="income-statement">Income Statement (P&L)</option>
                <option value="balance-sheet">Balance Sheet</option>
                <option value="general-ledger">General Ledger</option>
                <option value="category-breakdown">Category Breakdown</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => window.print()}
                className="w-full px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
              >
                🖨️ Print Report
              </button>
            </div>
          </div>
        </div>

        {/* Report Content */}
        <div className="bg-white rounded-lg shadow p-6 print:shadow-none">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              <span className="ml-3 text-gray-600">Generating report...</span>
            </div>
          ) : (
            <>
              {/* Executive Summary */}
              {reportType === 'executive-summary' && executiveSummary && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    Executive Summary
                    <span className="text-sm font-normal text-gray-500 ml-4">
                      {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
                    </span>
                  </h2>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-6 mb-8">
                    <div className="bg-green-50 rounded-lg p-4">
                      <div className="text-sm text-green-600">Gross Receipts</div>
                      <div className="text-2xl font-bold text-green-700">
                        {formatCurrency(executiveSummary.grossReceipts)}
                      </div>
                    </div>
                    <div className="bg-red-50 rounded-lg p-4">
                      <div className="text-sm text-red-600">Cost of Goods Sold</div>
                      <div className="text-2xl font-bold text-red-700">
                        {formatCurrency(executiveSummary.costOfGoodsSold)}
                      </div>
                    </div>
                    <div className="bg-blue-50 rounded-lg p-4">
                      <div className="text-sm text-blue-600">Gross Profit</div>
                      <div className="text-2xl font-bold text-blue-700">
                        {formatCurrency(executiveSummary.grossProfit)}
                      </div>
                    </div>
                    <div className="bg-orange-50 rounded-lg p-4">
                      <div className="text-sm text-orange-600">Operating Expenses</div>
                      <div className="text-2xl font-bold text-orange-700">
                        {formatCurrency(executiveSummary.operatingExpenses)}
                      </div>
                    </div>
                    <div className={`rounded-lg p-4 ${executiveSummary.netIncome >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
                      <div className={`text-sm ${executiveSummary.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        Net Income
                      </div>
                      <div className={`text-2xl font-bold ${executiveSummary.netIncome >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                        {formatCurrency(executiveSummary.netIncome)}
                      </div>
                    </div>
                    <div className="bg-purple-50 rounded-lg p-4">
                      <div className="text-sm text-purple-600">Owner Distributions</div>
                      <div className="text-2xl font-bold text-purple-700">
                        {formatCurrency(executiveSummary.ownerDistributions)}
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-3">Cash Balances</h3>
                      <table className="w-full">
                        <tbody>
                          <tr>
                            <td className="py-1 text-gray-600">Operating Account (x0055)</td>
                            <td className="py-1 text-right font-medium">{formatCurrency(executiveSummary.cashBalance.operating)}</td>
                          </tr>
                          <tr>
                            <td className="py-1 text-gray-600">Payroll Account (x0056)</td>
                            <td className="py-1 text-right font-medium">{formatCurrency(executiveSummary.cashBalance.payroll)}</td>
                          </tr>
                          <tr className="border-t">
                            <td className="py-2 font-medium">Total Cash</td>
                            <td className="py-2 text-right font-bold">{formatCurrency(executiveSummary.cashBalance.total)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="border rounded-lg p-4">
                      <h3 className="font-medium text-gray-900 mb-3">Transaction Status</h3>
                      <table className="w-full">
                        <tbody>
                          <tr>
                            <td className="py-1 text-gray-600">Total Transactions</td>
                            <td className="py-1 text-right font-medium">{executiveSummary.transactionStats.total}</td>
                          </tr>
                          <tr>
                            <td className="py-1 text-gray-600">Categorized</td>
                            <td className="py-1 text-right font-medium text-green-600">{executiveSummary.transactionStats.categorized}</td>
                          </tr>
                          <tr>
                            <td className="py-1 text-gray-600">Needs Review</td>
                            <td className="py-1 text-right font-medium text-yellow-600">{executiveSummary.transactionStats.needsReview}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* Income Statement */}
              {reportType === 'income-statement' && incomeStatement && (
                <div id="income-statement-report">
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">
                        Income Statement (P&L)
                        {taxPrepMode && <span className="ml-2 text-sm bg-yellow-100 text-yellow-800 px-2 py-1 rounded">Tax Prep Mode</span>}
                      </h2>
                      <span className="text-sm text-gray-500">
                        {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTaxPrepMode(!taxPrepMode)}
                        className={`px-3 py-1 text-sm rounded ${taxPrepMode ? 'bg-yellow-500 text-white' : 'bg-gray-200 text-gray-700'}`}
                      >
                        {taxPrepMode ? 'Exit Tax Prep' : 'Tax Prep Mode'}
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Print / PDF
                      </button>
                    </div>
                  </div>

                  <table className="w-full">
                    {taxPrepMode && (
                      <thead>
                        <tr className="text-xs text-gray-500 border-b">
                          <th className="py-2 px-4 text-left">Account</th>
                          <th className="py-2 px-4 text-right">Actual</th>
                          <th className="py-2 px-4 text-center w-24">Claim %</th>
                          <th className="py-2 px-4 text-right">Adjusted</th>
                        </tr>
                      </thead>
                    )}
                    <tbody>
                      {/* Income */}
                      <tr className="bg-green-50">
                        <td colSpan={taxPrepMode ? 4 : 2} className="py-2 px-4 font-bold text-green-700">INCOME</td>
                      </tr>
                      {incomeStatement.income.map((item) => (
                        <tr key={item.accountCode}>
                          <td className="py-1 px-4 text-gray-600">{item.accountCode} - {item.accountName}</td>
                          <td className="py-1 px-4 text-right">{formatCurrency(Math.abs(item.total))}</td>
                          {taxPrepMode && <td colSpan={2}></td>}
                        </tr>
                      ))}
                      <tr className="border-t font-medium">
                        <td className="py-2 px-4">Gross Receipts</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(incomeStatement.totals.grossReceipts)}</td>
                        {taxPrepMode && <td colSpan={2}></td>}
                      </tr>

                      {/* COGS */}
                      <tr className="bg-orange-50">
                        <td colSpan={taxPrepMode ? 4 : 2} className="py-2 px-4 font-bold text-orange-700 mt-4">COST OF GOODS SOLD</td>
                      </tr>
                      {incomeStatement.cogs.map((item) => (
                        <tr key={item.accountCode}>
                          <td className="py-1 px-4 text-gray-600">{item.accountCode} - {item.accountName}</td>
                          <td className="py-1 px-4 text-right">{formatCurrency(Math.abs(item.total))}</td>
                          {taxPrepMode && <td colSpan={2}></td>}
                        </tr>
                      ))}
                      <tr className="border-t font-medium">
                        <td className="py-2 px-4">Total COGS</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(incomeStatement.totals.costOfGoodsSold)}</td>
                        {taxPrepMode && <td colSpan={2}></td>}
                      </tr>
                      <tr className="bg-blue-50 font-bold">
                        <td className="py-2 px-4">GROSS PROFIT</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(incomeStatement.totals.grossProfit)}</td>
                        {taxPrepMode && <td colSpan={2}></td>}
                      </tr>

                      {/* Operating Expenses - with Tax Prep adjustments */}
                      <tr className="bg-red-50">
                        <td colSpan={taxPrepMode ? 4 : 2} className="py-2 px-4 font-bold text-red-700 mt-4">OPERATING EXPENSES</td>
                      </tr>
                      {incomeStatement.expenses.map((item) => {
                        const actualAmount = Math.abs(item.total);
                        const pct = getAdjustment(item.accountCode);
                        const adjustedAmount = (actualAmount * pct) / 100;
                        return (
                          <tr key={item.accountCode}>
                            <td className="py-1 px-4 text-gray-600">
                              {item.accountCode} - {item.accountName}
                              {!taxPrepMode && item.taxTreatment !== '100%' && (
                                <span className="text-xs text-gray-400 ml-2">({item.taxTreatment})</span>
                              )}
                            </td>
                            <td className="py-1 px-4 text-right">{formatCurrency(actualAmount)}</td>
                            {taxPrepMode && (
                              <>
                                <td className="py-1 px-4 text-center">
                                  <input
                                    type="number"
                                    min="0"
                                    max="100"
                                    value={pct}
                                    onChange={(e) => setTaxAdjustments(prev => ({
                                      ...prev,
                                      [item.accountCode]: Math.min(100, Math.max(0, parseInt(e.target.value) || 0))
                                    }))}
                                    className="w-16 px-2 py-1 text-center border rounded text-sm"
                                  />
                                  <span className="text-xs text-gray-400 ml-1">%</span>
                                </td>
                                <td className={`py-1 px-4 text-right ${pct < 100 ? 'text-yellow-600 font-medium' : ''}`}>
                                  {formatCurrency(adjustedAmount)}
                                  {pct < 100 && <span className="text-xs ml-1">*</span>}
                                </td>
                              </>
                            )}
                          </tr>
                        );
                      })}
                      <tr className="border-t font-medium">
                        <td className="py-2 px-4">Total Operating Expenses</td>
                        <td className="py-2 px-4 text-right">{formatCurrency(incomeStatement.totals.operatingExpenses)}</td>
                        {taxPrepMode && (
                          <>
                            <td></td>
                            <td className="py-2 px-4 text-right text-yellow-600 font-bold">
                              {formatCurrency(calculateAdjustedExpenseTotal(incomeStatement.expenses))}
                            </td>
                          </>
                        )}
                      </tr>

                      {/* Net Income */}
                      {(() => {
                        const adjustedExpenses = taxPrepMode
                          ? calculateAdjustedExpenseTotal(incomeStatement.expenses)
                          : incomeStatement.totals.operatingExpenses;
                        const adjustedNetIncome = incomeStatement.totals.grossProfit - adjustedExpenses;
                        return (
                          <tr className={`font-bold text-lg ${adjustedNetIncome >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                            <td className="py-3 px-4">NET INCOME {taxPrepMode && '(Adjusted)'}</td>
                            <td className="py-3 px-4 text-right">
                              {!taxPrepMode && formatCurrency(incomeStatement.totals.netIncome)}
                              {taxPrepMode && <span className="text-gray-400 line-through">{formatCurrency(incomeStatement.totals.netIncome)}</span>}
                            </td>
                            {taxPrepMode && (
                              <>
                                <td></td>
                                <td className="py-3 px-4 text-right">{formatCurrency(adjustedNetIncome)}</td>
                              </>
                            )}
                          </tr>
                        );
                      })()}

                      {/* Non-Deductible */}
                      {incomeStatement.nonDeductible.length > 0 && (
                        <>
                          <tr className="bg-gray-100">
                            <td colSpan={taxPrepMode ? 4 : 2} className="py-2 px-4 font-bold text-gray-500 mt-4">
                              NON-DEDUCTIBLE (Owner Distributions)
                            </td>
                          </tr>
                          {incomeStatement.nonDeductible.map((item) => (
                            <tr key={item.accountCode} className="text-gray-500">
                              <td className="py-1 px-4">{item.accountCode} - {item.accountName}</td>
                              <td className="py-1 px-4 text-right">{formatCurrency(Math.abs(item.total))}</td>
                              {taxPrepMode && <td colSpan={2}></td>}
                            </tr>
                          ))}
                          <tr className="border-t text-gray-500">
                            <td className="py-2 px-4 font-medium">Total Non-Deductible</td>
                            <td className="py-2 px-4 text-right font-medium">
                              {formatCurrency(incomeStatement.totals.nonDeductibleExpenses)}
                            </td>
                            {taxPrepMode && <td colSpan={2}></td>}
                          </tr>
                        </>
                      )}
                    </tbody>
                  </table>

                  {/* Tax Prep Notes */}
                  {taxPrepMode && Object.keys(taxAdjustments).length > 0 && (
                    <div className="mt-6 p-4 bg-yellow-50 rounded-lg text-sm">
                      <h4 className="font-bold text-yellow-800 mb-2">Tax Adjustment Notes (for audit trail):</h4>
                      <ul className="space-y-1">
                        {incomeStatement.expenses
                          .filter(item => (taxAdjustments[item.accountCode] ?? 100) < 100)
                          .map(item => {
                            const pct = taxAdjustments[item.accountCode];
                            const actual = Math.abs(item.total);
                            const adjusted = (actual * pct) / 100;
                            return (
                              <li key={item.accountCode} className="text-yellow-700">
                                <strong>{item.accountName}:</strong> Actual {formatCurrency(actual)} × {pct}% = {formatCurrency(adjusted)} claimed
                              </li>
                            );
                          })}
                      </ul>
                    </div>
                  )}
                </div>
              )}

              {/* Category Breakdown */}
              {reportType === 'category-breakdown' && categoryBreakdown && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    Category Breakdown
                    <span className="text-sm font-normal text-gray-500 ml-4">
                      {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
                    </span>
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Income */}
                    <div>
                      <h3 className="text-lg font-medium text-green-700 mb-4">Income by Category</h3>
                      <table className="w-full">
                        <thead className="bg-green-50">
                          <tr>
                            <th className="py-2 px-3 text-left text-sm">Category</th>
                            <th className="py-2 px-3 text-right text-sm">Amount</th>
                            <th className="py-2 px-3 text-right text-sm">#</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryBreakdown.income.map((item) => (
                            <tr key={item.accountCode} className="border-b">
                              <td className="py-2 px-3">{item.accountName}</td>
                              <td className="py-2 px-3 text-right font-medium text-green-600">
                                {formatCurrency(item.total)}
                              </td>
                              <td className="py-2 px-3 text-right text-gray-500">
                                {item.transactionCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Expenses */}
                    <div>
                      <h3 className="text-lg font-medium text-red-700 mb-4">Expenses by Category</h3>
                      <table className="w-full">
                        <thead className="bg-red-50">
                          <tr>
                            <th className="py-2 px-3 text-left text-sm">Category</th>
                            <th className="py-2 px-3 text-right text-sm">Amount</th>
                            <th className="py-2 px-3 text-right text-sm">#</th>
                          </tr>
                        </thead>
                        <tbody>
                          {categoryBreakdown.expenses.map((item) => (
                            <tr key={item.accountCode} className="border-b">
                              <td className="py-2 px-3">
                                {item.accountName}
                                {item.taxTreatment === 'NON_DEDUCTIBLE' && (
                                  <span className="text-xs text-gray-400 ml-1">(Personal)</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-right font-medium text-red-600">
                                {formatCurrency(item.total)}
                              </td>
                              <td className="py-2 px-3 text-right text-gray-500">
                                {item.transactionCount}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}

              {/* General Ledger */}
              {reportType === 'general-ledger' && generalLedger && (
                <div>
                  <div className="flex justify-between items-start mb-6">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">General Ledger</h2>
                      <span className="text-sm text-gray-500">
                        {formatDate(dateRange.startDate)} - {formatDate(dateRange.endDate)}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          // Flatten all transactions for CSV export
                          const allTransactions = generalLedger.accounts.flatMap(account =>
                            account.transactions.map(t => ({
                              Account: `${account.accountCode} - ${account.accountName}`,
                              Date: new Date(t.date).toLocaleDateString(),
                              Description: t.description,
                              Amount: t.amount,
                              Balance: t.balance,
                            }))
                          );
                          exportToCSV(allTransactions, `general-ledger-${dateRange.startDate}-to-${dateRange.endDate}.csv`);
                        }}
                        className="px-3 py-1 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                      >
                        Export CSV
                      </button>
                      <button
                        onClick={() => window.print()}
                        className="px-3 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                      >
                        Print / PDF
                      </button>
                    </div>
                  </div>

                  {generalLedger.accounts.length === 0 ? (
                    <p className="text-gray-500 py-8 text-center">
                      No transactions found for this period. Import bank transactions first.
                    </p>
                  ) : (
                    generalLedger.accounts.map((account) => (
                      <div key={account.accountCode} className="mb-8">
                        <h3 className="text-lg font-medium text-gray-900 mb-2 bg-gray-100 py-2 px-4 rounded">
                          {account.accountCode} - {account.accountName}
                          <span className="text-sm font-normal text-gray-500 ml-4">
                            ({account.transactions.length} transactions)
                          </span>
                        </h3>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b">
                              <th className="py-2 text-left">Date</th>
                              <th className="py-2 text-left">Description</th>
                              <th className="py-2 text-right">Amount</th>
                              <th className="py-2 text-right">Balance</th>
                            </tr>
                          </thead>
                          <tbody>
                            {account.transactions.slice(0, 20).map((t, i) => (
                              <tr key={i} className="border-b">
                                <td className="py-1">{formatDate(t.date)}</td>
                                <td className="py-1 truncate max-w-xs">{t.description}</td>
                                <td className={`py-1 text-right ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                  {formatCurrency(t.amount)}
                                </td>
                                <td className="py-1 text-right">{formatCurrency(t.balance)}</td>
                              </tr>
                            ))}
                            {account.transactions.length > 20 && (
                              <tr>
                                <td colSpan={4} className="py-2 text-center text-gray-500">
                                  ... and {account.transactions.length - 20} more transactions
                                </td>
                              </tr>
                            )}
                          </tbody>
                          <tfoot className="bg-gray-50">
                            <tr>
                              <td colSpan={2} className="py-2 font-medium">Account Total</td>
                              <td className="py-2 text-right font-bold">{formatCurrency(account.closingBalance)}</td>
                              <td></td>
                            </tr>
                          </tfoot>
                        </table>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* Balance Sheet */}
              {reportType === 'balance-sheet' && balanceSheet && (
                <div>
                  <h2 className="text-2xl font-bold text-gray-900 mb-6">
                    Balance Sheet
                    <span className="text-sm font-normal text-gray-500 ml-4">
                      As of {formatDate(dateRange.endDate)}
                    </span>
                  </h2>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    {/* Assets */}
                    <div>
                      <h3 className="text-lg font-medium bg-blue-50 py-2 px-4 rounded text-blue-700">ASSETS</h3>
                      <table className="w-full">
                        <tbody>
                          {balanceSheet.assets.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="py-4 text-center text-gray-500">No assets found</td>
                            </tr>
                          ) : (
                            balanceSheet.assets.map((item) => (
                              <tr key={item.code} className="border-b">
                                <td className="py-2">
                                  {item.code} - {item.name}
                                  {item.source === 'bank_account' && (
                                    <span className="ml-2 text-xs text-blue-500">(Bank)</span>
                                  )}
                                </td>
                                <td className="py-2 text-right">{formatCurrency(item.balance)}</td>
                              </tr>
                            ))
                          )}
                          <tr className="font-bold bg-blue-50">
                            <td className="py-2 px-2">Total Assets</td>
                            <td className="py-2 text-right px-2">{formatCurrency(balanceSheet.totals.totalAssets)}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>

                    {/* Liabilities & Equity */}
                    <div>
                      <h3 className="text-lg font-medium bg-red-50 py-2 px-4 rounded text-red-700">LIABILITIES</h3>
                      <table className="w-full mb-4">
                        <tbody>
                          {balanceSheet.liabilities.length === 0 ? (
                            <tr>
                              <td colSpan={2} className="py-4 text-center text-gray-500">No liabilities</td>
                            </tr>
                          ) : (
                            balanceSheet.liabilities.map((item) => (
                              <tr key={item.code} className="border-b">
                                <td className="py-2">{item.code} - {item.name}</td>
                                <td className="py-2 text-right">{formatCurrency(item.balance)}</td>
                              </tr>
                            ))
                          )}
                          <tr className="font-bold bg-red-50">
                            <td className="py-2 px-2">Total Liabilities</td>
                            <td className="py-2 text-right px-2">{formatCurrency(balanceSheet.totals.totalLiabilities)}</td>
                          </tr>
                        </tbody>
                      </table>

                      <h3 className="text-lg font-medium bg-purple-50 py-2 px-4 rounded text-purple-700">EQUITY</h3>
                      <table className="w-full">
                        <tbody>
                          <tr className="font-bold bg-purple-50">
                            <td className="py-2 px-2">Owner&apos;s Equity</td>
                            <td className="py-2 text-right px-2">{formatCurrency(balanceSheet.totals.totalEquity)}</td>
                          </tr>
                          <tr className="text-xs text-gray-500">
                            <td colSpan={2} className="py-1 px-2">
                              (Calculated: Assets − Liabilities)
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';

export default function FinancialOverview() {
  const currentDate = new Date();
  const monthStart = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
  const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0, 23, 59, 59, 999);

  // Fetch P&L for current month
  const { data: plData, isLoading: plLoading } = trpc.reporting.profitAndLoss.useQuery({
    startDate: monthStart,
    endDate: monthEnd,
  });

  // Fetch uncategorized receipts count
  const { data: receiptsData } = trpc.receipt.list.useQuery({
    limit: 100,
    offset: 0,
    status: 'all',
  });

  // Fetch invoice stats for AR
  const { data: invoiceStats } = trpc.invoice.stats.useQuery();

  const uncategorizedCount = (receiptsData as any[])?.filter((r) => !r.expenseCategoryId).length || 0;
  const pendingInvoices = invoiceStats?.sent || 0;

  if (plLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-center h-64">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  const totalRevenue = plData?.revenue?.total || 0;
  const totalExpenses = plData?.expenses?.total || 0;
  const netIncome = plData?.netIncome || (totalRevenue - totalExpenses);
  const profitMargin = plData?.profitMargin || (totalRevenue > 0 ? (netIncome / totalRevenue) * 100 : 0);

  // Calculate AR from invoice stats
  const accountsReceivable = invoiceStats
    ? (invoiceStats.sent * 100) // Rough estimate, could be improved with actual invoice totals
    : 0;

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(amount);
  };

  // Get current month name
  const monthName = currentDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-500 to-blue-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="text-3xl mr-3">💰</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Financial Overview</h2>
              <p className="text-sm text-green-100">{monthName}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Main Metrics */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Revenue */}
          <div className="p-4 bg-green-50 rounded-lg border border-green-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-green-600 uppercase">Revenue</span>
              <div className="text-lg">📈</div>
            </div>
            <p className="text-2xl font-bold text-green-700">
              {formatCurrency(totalRevenue)}
            </p>
            <p className="text-xs text-green-600 mt-1">Total income this month</p>
          </div>

          {/* Expenses */}
          <div className="p-4 bg-red-50 rounded-lg border border-red-200">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-red-600 uppercase">Expenses</span>
              <div className="text-lg">📉</div>
            </div>
            <p className="text-2xl font-bold text-red-700">
              {formatCurrency(totalExpenses)}
            </p>
            <p className="text-xs text-red-600 mt-1">Total spending this month</p>
          </div>

          {/* Net Income */}
          <div className={`p-4 rounded-lg border ${
            netIncome >= 0
              ? 'bg-blue-50 border-blue-200'
              : 'bg-orange-50 border-orange-200'
          }`}>
            <div className="flex items-center justify-between mb-2">
              <span className={`text-xs font-medium uppercase ${
                netIncome >= 0 ? 'text-blue-600' : 'text-orange-600'
              }`}>Net Income</span>
              <div className="text-lg">{netIncome >= 0 ? '✅' : '⚠️'}</div>
            </div>
            <p className={`text-2xl font-bold ${
              netIncome >= 0 ? 'text-blue-700' : 'text-orange-700'
            }`}>
              {formatCurrency(netIncome)}
            </p>
            <p className={`text-xs mt-1 ${
              netIncome >= 0 ? 'text-blue-600' : 'text-orange-600'
            }`}>
              Profit margin: {profitMargin.toFixed(1)}%
            </p>
          </div>
        </div>

        {/* Profit Margin Bar */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-gray-700">Profit Margin</span>
            <span className="text-sm font-bold text-gray-900">{profitMargin.toFixed(1)}%</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-3 overflow-hidden">
            <div
              className={`h-full transition-all duration-500 ${
                profitMargin >= 50
                  ? 'bg-green-500'
                  : profitMargin >= 25
                  ? 'bg-blue-500'
                  : profitMargin >= 0
                  ? 'bg-yellow-500'
                  : 'bg-red-500'
              }`}
              style={{ width: `${Math.min(Math.max(profitMargin, 0), 100)}%` }}
            />
          </div>
        </div>

        {/* Quick Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {/* Uncategorized Receipts */}
          <Link
            href="/receipts"
            className="p-3 bg-orange-50 rounded-lg border border-orange-200 hover:bg-orange-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="text-2xl mr-2">⚠️</div>
                <div>
                  <p className="text-xs font-medium text-orange-600 uppercase">Uncategorized</p>
                  <p className="text-lg font-bold text-orange-700">{uncategorizedCount}</p>
                </div>
              </div>
              <div className="text-orange-400">→</div>
            </div>
          </Link>

          {/* Pending Invoices */}
          <Link
            href="/invoices"
            className="p-3 bg-yellow-50 rounded-lg border border-yellow-200 hover:bg-yellow-100 transition-colors cursor-pointer"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="text-2xl mr-2">⏰</div>
                <div>
                  <p className="text-xs font-medium text-yellow-600 uppercase">Pending</p>
                  <p className="text-lg font-bold text-yellow-700">{pendingInvoices}</p>
                </div>
              </div>
              <div className="text-yellow-400">→</div>
            </div>
          </Link>

          {/* Accounts Receivable */}
          <div className="p-3 bg-purple-50 rounded-lg border border-purple-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center">
                <div className="text-2xl mr-2">💵</div>
                <div>
                  <p className="text-xs font-medium text-purple-600 uppercase">A/R Balance</p>
                  <p className="text-lg font-bold text-purple-700">
                    {formatCurrency(accountsReceivable)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Action Links */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Link
            href="/reports/profit-loss"
            className="px-4 py-2 text-sm font-medium text-center text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
          >
            📊 View Full P&L Report
          </Link>
          <Link
            href="/accounts"
            className="px-4 py-2 text-sm font-medium text-center text-purple-700 bg-purple-50 border border-purple-200 rounded-lg hover:bg-purple-100 transition-colors"
          >
            🏦 Manage Accounts
          </Link>
          <Link
            href="/receipts"
            className="px-4 py-2 text-sm font-medium text-center text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
          >
            🏷️ Categorize Receipts
          </Link>
        </div>

        {/* Top Expense Categories Preview */}
        {plData && plData.expenses?.accounts && plData.expenses.accounts.length > 0 && (
          <div className="mt-6 pt-6 border-t border-gray-200">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">Top Expense Categories</h3>
            <div className="space-y-2">
              {plData.expenses.accounts.slice(0, 5).map((expense: any, index: number) => (
                <div key={index} className="flex items-center justify-between">
                  <div className="flex items-center flex-1 min-w-0">
                    <div className="w-32 truncate">
                      <span className="text-sm text-gray-700">{expense.name}</span>
                    </div>
                    <div className="flex-1 mx-3">
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div
                          className="bg-red-500 h-2 rounded-full"
                          style={{
                            width: `${Math.min((expense.amount / totalExpenses) * 100, 100)}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                  <span className="text-sm font-semibold text-gray-900 ml-2">
                    {formatCurrency(expense.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

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

export default function IncomePage() {
  const { requireAuth, isLoading: authLoading } = useAuth();
  const [companyId, setCompanyId] = useState<string>('');
  const [dateRange, setDateRange] = useState({
    startDate: '',
    endDate: '',
  });

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  useEffect(() => {
    setCompanyId('donovan-farms');
  }, []);

  // Get INCOME-type tax accounts
  const { data: incomeAccounts } = trpc.taxAccounts.list.useQuery(
    { companyId, accountType: 'INCOME', active: true },
    { enabled: !!companyId }
  );

  // Get all transactions (we'll filter client-side for now to show income)
  const { data: transactionsData } = trpc.bankTransactions.list.useQuery(
    {
      companyId,
      startDate: dateRange.startDate || undefined,
      endDate: dateRange.endDate || undefined,
      limit: 500,
    },
    { enabled: !!companyId }
  );

  // Filter to only INCOME transactions
  const incomeAccountIds = new Set(incomeAccounts?.map((a) => a.id) || []);
  const incomeTransactions = (transactionsData?.transactions || []).filter(
    (t: any) => t.taxAccountId && incomeAccountIds.has(t.taxAccountId)
  );

  // Calculate totals
  const totalIncome = incomeTransactions.reduce(
    (sum: number, t: any) => sum + Math.abs(Number(t.amount)),
    0
  );

  // Group by account for breakdown
  const incomeByAccount = incomeTransactions.reduce((acc: any, t: any) => {
    const accountId = t.taxAccountId;
    if (!acc[accountId]) {
      acc[accountId] = {
        account: t.taxAccount,
        transactions: [],
        total: 0,
      };
    }
    acc[accountId].transactions.push(t);
    acc[accountId].total += Math.abs(Number(t.amount));
    return acc;
  }, {});

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-green-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center space-x-4 mb-2">
            <Link href="/accounting/general-ledger" className="text-gray-500 hover:text-gray-700">
              &larr; General Ledger
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">💰 Income Transactions</h1>
          <p className="mt-1 text-gray-600">
            Only transactions categorized to <strong>INCOME-type</strong> accounts appear here.
            This is what counts toward your Total Income in stats.
          </p>
        </div>

        {/* Info Box */}
        <div className="mb-6 bg-green-50 border border-green-200 rounded-lg p-4">
          <h3 className="font-medium text-green-900 mb-2">📊 How Income is Calculated</h3>
          <ul className="text-sm text-green-800 space-y-1">
            <li>✅ Only transactions with <code className="bg-green-100 px-1 rounded">taxAccount.accountType = 'INCOME'</code> are counted</li>
            <li>✅ Credit card payments, refunds, and transfers are <strong>excluded</strong> (they use ASSET/LIABILITY accounts)</li>
            <li>✅ Uncategorized transactions are <strong>not counted</strong> until you assign them an INCOME category</li>
            <li>✅ Split transaction children are excluded (parent amount already includes total)</li>
          </ul>
        </div>

        {/* Date Filters */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={dateRange.startDate}
                onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={dateRange.endDate}
                onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-green-500 focus:border-green-500"
              />
            </div>
            <div className="flex items-end">
              <button
                onClick={() => setDateRange({ startDate: '', endDate: '' })}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 border border-gray-300 rounded-lg"
              >
                Clear Dates
              </button>
            </div>
          </div>
        </div>

        {/* Summary Cards */}
        <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Total Income</div>
            <div className="text-3xl font-bold text-green-600">{formatCurrency(totalIncome)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Income Transactions</div>
            <div className="text-3xl font-bold text-gray-900">{incomeTransactions.length}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-6">
            <div className="text-sm text-gray-500">Income Accounts</div>
            <div className="text-3xl font-bold text-gray-900">{incomeAccounts?.length || 0}</div>
          </div>
        </div>

        {/* Income Accounts List */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <h3 className="font-medium text-gray-900 mb-3">📋 Your INCOME-Type Accounts</h3>
          {incomeAccounts && incomeAccounts.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {incomeAccounts.map((acc) => (
                <span
                  key={acc.id}
                  className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800"
                >
                  {acc.code} - {acc.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-yellow-600">
              ⚠️ No INCOME-type accounts found! You need to create accounts with <code>accountType: INCOME</code>
            </p>
          )}
        </div>

        {/* Income by Account Breakdown */}
        {Object.keys(incomeByAccount).length > 0 && (
          <div className="mb-6 bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 bg-gray-50 border-b">
              <h3 className="font-medium text-gray-900">Income by Category</h3>
            </div>
            <div className="divide-y">
              {Object.values(incomeByAccount).map((group: any) => (
                <div key={group.account.id} className="px-4 py-3 flex justify-between items-center">
                  <div>
                    <span className="font-medium">{group.account.code} - {group.account.name}</span>
                    <span className="ml-2 text-sm text-gray-500">({group.transactions.length} transactions)</span>
                  </div>
                  <div className="text-lg font-bold text-green-600">{formatCurrency(group.total)}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="px-4 py-3 bg-gray-50 border-b">
            <h3 className="font-medium text-gray-900">Income Transactions Detail</h3>
          </div>
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Description</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Category</th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Amount</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {incomeTransactions.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-gray-500">
                    No income transactions found.
                    {incomeAccounts?.length === 0 && (
                      <span className="block mt-2 text-yellow-600">
                        You need INCOME-type accounts first!
                      </span>
                    )}
                    {incomeAccounts && incomeAccounts.length > 0 && (
                      <span className="block mt-2">
                        Categorize transactions to an INCOME account in the General Ledger.
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
                incomeTransactions.map((t: any) => (
                  <tr key={t.id}>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {formatDate(t.date)}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900">
                      {t.description}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        {t.taxAccount?.code} - {t.taxAccount?.name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm font-medium text-right text-green-600">
                      {formatCurrency(Math.abs(Number(t.amount)))}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {incomeTransactions.length > 0 && (
              <tfoot className="bg-green-50">
                <tr>
                  <td colSpan={3} className="px-4 py-3 text-sm font-bold text-gray-900">
                    Total Income
                  </td>
                  <td className="px-4 py-3 text-lg font-bold text-right text-green-600">
                    {formatCurrency(totalIncome)}
                  </td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>

        {/* Quick Links */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/accounting/general-ledger"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            📒 General Ledger
          </Link>
          <Link
            href="/accounting/reports"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            📊 Tax Reports
          </Link>
          <Link
            href="/reports/profit-loss"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            📈 P&L Statement
          </Link>
        </div>
      </div>
    </div>
  );
}

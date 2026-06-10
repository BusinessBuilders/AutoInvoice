'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';

type TaxAccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'INCOME' | 'EXPENSE_COGS' | 'EXPENSE_OPERATING';

interface TaxAccount {
  id: string;
  code: string;
  name: string;
  accountType: TaxAccountType;
  taxTreatment: string;
  scheduleC?: string | null;
  active: boolean;
  isSystemAccount: boolean;
  company?: { id: string; name: string };
  _count?: {
    bankTransactions: number;
    categorizationRules: number;
  };
}

// Type configuration for display
const taxAccountTypeConfig: Record<TaxAccountType, { label: string; icon: string; bgColor: string; textColor: string; borderColor: string }> = {
  INCOME: { label: 'Income', icon: '💰', bgColor: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200' },
  EXPENSE_COGS: { label: 'Cost of Goods Sold', icon: '📦', bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200' },
  EXPENSE_OPERATING: { label: 'Operating Expenses', icon: '📊', bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200' },
  ASSET: { label: 'Assets', icon: '💼', bgColor: 'bg-blue-50', textColor: 'text-blue-700', borderColor: 'border-blue-200' },
  LIABILITY: { label: 'Liabilities', icon: '💳', bgColor: 'bg-purple-50', textColor: 'text-purple-700', borderColor: 'border-purple-200' },
  EQUITY: { label: 'Equity', icon: '🏦', bgColor: 'bg-indigo-50', textColor: 'text-indigo-700', borderColor: 'border-indigo-200' },
};

// Display order for account types
const accountTypeOrder: TaxAccountType[] = ['INCOME', 'EXPENSE_COGS', 'EXPENSE_OPERATING', 'ASSET', 'LIABILITY', 'EQUITY'];

export default function AccountsPage() {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<TaxAccountType | 'all'>('all');

  // Fetch Tax Accounts (the real Chart of Accounts for your business)
  const { data: taxAccountsData, isLoading } = trpc.taxAccounts.listAll.useQuery({
    search: search || undefined,
  });

  const taxAccounts = (taxAccountsData || []) as TaxAccount[];

  // Filter by type if selected
  const filteredAccounts = typeFilter === 'all'
    ? taxAccounts
    : taxAccounts.filter(a => a.accountType === typeFilter);

  // Group accounts by type
  const groupedAccounts = filteredAccounts.reduce((groups, account) => {
    if (!groups[account.accountType]) {
      groups[account.accountType] = [];
    }
    groups[account.accountType].push(account);
    return groups;
  }, {} as Record<TaxAccountType, TaxAccount[]>);

  // Calculate stats
  const getStatsByType = (type: TaxAccountType) => {
    const typeAccounts = taxAccounts.filter(a => a.accountType === type);
    const count = typeAccounts.length;
    const transactions = typeAccounts.reduce((sum, acc) => sum + (acc._count?.bankTransactions || 0), 0);
    return { count, transactions };
  };

  // Get tax treatment badge color
  const getTreatmentBadge = (treatment: string) => {
    switch (treatment) {
      case '100%': return 'bg-emerald-100 text-emerald-800';
      case '50%': return 'bg-yellow-100 text-yellow-800';
      case 'NON_DEDUCTIBLE': return 'bg-red-100 text-red-800';
      case 'TRANSFER': return 'bg-gray-100 text-gray-600';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatTreatment = (treatment: string) => {
    switch (treatment) {
      case 'NON_DEDUCTIBLE': return 'Not Deductible';
      case 'TRANSFER': return 'Transfer';
      default: return treatment;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Navigation */}
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div className="md:flex md:items-center md:justify-between mb-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900">Chart of Accounts</h1>
            <p className="mt-1 text-sm text-gray-500">
              IRS tax categories for bank transaction categorization and tax reporting
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4 gap-3">
            <Link
              href="/accounting/general-ledger"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              📒 General Ledger
            </Link>
            <Link
              href="/accounting/rules"
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              ⚙️ Rules
            </Link>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6 mb-6">
          {accountTypeOrder.map((type) => {
            const stats = getStatsByType(type);
            const config = taxAccountTypeConfig[type];
            if (stats.count === 0) return null;
            return (
              <div
                key={type}
                className={`${config.bgColor} border-2 ${config.borderColor} rounded-lg p-3 cursor-pointer transition-all hover:shadow-md ${
                  typeFilter === type ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                }`}
                onClick={() => setTypeFilter(typeFilter === type ? 'all' : type)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-medium text-gray-600 truncate">{config.label}</p>
                    <p className={`text-xl font-bold ${config.textColor}`}>{stats.count}</p>
                  </div>
                  <div className="text-2xl">{config.icon}</div>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {stats.transactions} txns
                </p>
              </div>
            );
          })}
        </div>

        {/* Search */}
        <div className="mb-6 flex gap-4">
          <input
            type="text"
            placeholder="Search accounts by code or name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          {typeFilter !== 'all' && (
            <button
              onClick={() => setTypeFilter('all')}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Clear Filter
            </button>
          )}
        </div>

        {/* Account List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-500">Loading accounts...</p>
          </div>
        ) : filteredAccounts.length > 0 ? (
          <div className="space-y-6">
            {accountTypeOrder.map((type) => {
              const typeAccounts = groupedAccounts[type] || [];
              if (typeAccounts.length === 0) return null;

              const config = taxAccountTypeConfig[type];
              const stats = getStatsByType(type);

              return (
                <div key={type} className="bg-white rounded-lg shadow-md overflow-hidden">
                  <div className={`${config.bgColor} border-b-2 ${config.borderColor} px-6 py-4`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl">{config.icon}</span>
                        <div>
                          <h2 className={`text-xl font-bold ${config.textColor}`}>
                            {config.label}
                          </h2>
                          <p className="text-sm text-gray-600">
                            {stats.count} account{stats.count !== 1 ? 's' : ''} • {stats.transactions} transactions
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Table View */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Code</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Name</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Tax Treatment</th>
                          <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">IRS Schedule</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Transactions</th>
                          <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Rules</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {typeAccounts.map((account) => (
                          <tr key={account.id} className="hover:bg-gray-50">
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className="font-mono font-bold text-gray-900">{account.code}</span>
                            </td>
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-gray-900">{account.name}</span>
                                {!account.active && (
                                  <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded">
                                    Inactive
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span className={`inline-flex px-2 py-0.5 text-xs font-medium rounded ${getTreatmentBadge(account.taxTreatment)}`}>
                                {formatTreatment(account.taxTreatment)}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-600">
                              {account.scheduleC || '-'}
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="text-sm font-medium text-gray-900">
                                {account._count?.bankTransactions || 0}
                              </span>
                            </td>
                            <td className="px-4 py-3 whitespace-nowrap text-right">
                              <span className="text-sm text-gray-600">
                                {account._count?.categorizationRules || 0}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
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
            <h3 className="mt-2 text-sm font-medium text-gray-900">No accounts found</h3>
            <p className="mt-1 text-sm text-gray-500">
              {search ? 'No accounts match your search.' : 'Set up your tax categories in the General Ledger.'}
            </p>
            <div className="mt-6">
              <Link
                href="/accounting/general-ledger"
                className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                Go to General Ledger
              </Link>
            </div>
          </div>
        )}

        {/* Legend */}
        <div className="mt-8 bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Tax Treatment Legend</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-emerald-100 text-emerald-800">100%</span>
              <span className="text-sm text-gray-600">Fully Deductible</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-yellow-100 text-yellow-800">50%</span>
              <span className="text-sm text-gray-600">50% Deductible (Meals)</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-red-100 text-red-800">Not Deductible</span>
              <span className="text-sm text-gray-600">Personal / Non-Business</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="inline-flex px-2 py-0.5 text-xs font-medium rounded bg-gray-100 text-gray-600">Transfer</span>
              <span className="text-sm text-gray-600">Internal Transfer</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

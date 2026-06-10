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

type AccountType = 'checking' | 'savings' | 'credit_card' | 'money_market' | 'petty_cash';

interface FormData {
  name: string;
  bankName: string;
  accountNumber: string;
  accountType: AccountType;
  isPrimary: boolean;
  currentBalance: string;
}

const emptyForm: FormData = {
  name: '',
  bankName: '',
  accountNumber: '',
  accountType: 'checking',
  isPrimary: false,
  currentBalance: '',
};

const accountTypeLabels: Record<AccountType, { label: string; icon: string; color: string }> = {
  checking: { label: 'Checking', icon: '🏦', color: 'blue' },
  savings: { label: 'Savings', icon: '💰', color: 'green' },
  credit_card: { label: 'Credit Card', icon: '💳', color: 'purple' },
  money_market: { label: 'Money Market', icon: '📈', color: 'cyan' },
  petty_cash: { label: 'Petty Cash', icon: '💵', color: 'yellow' },
};

export default function BankAccountsPage() {
  const { requireAuth, isLoading: authLoading } = useAuth();
  const [companyId] = useState('donovan-farms');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<FormData>(emptyForm);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  // Queries
  const { data: accounts, isLoading, refetch } = trpc.bankAccounts.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  const { data: stats } = trpc.bankAccounts.stats.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Mutations
  const createMutation = trpc.bankAccounts.create.useMutation({
    onSuccess: () => {
      setShowModal(false);
      setFormData(emptyForm);
      refetch();
    },
  });

  const updateMutation = trpc.bankAccounts.update.useMutation({
    onSuccess: () => {
      setShowModal(false);
      setEditingId(null);
      setFormData(emptyForm);
      refetch();
    },
  });

  const deleteMutation = trpc.bankAccounts.delete.useMutation({
    onSuccess: () => {
      setDeleteConfirm(null);
      refetch();
    },
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const balance = formData.currentBalance ? parseFloat(formData.currentBalance) : 0;

    if (editingId) {
      await updateMutation.mutateAsync({
        id: editingId,
        name: formData.name,
        bankName: formData.bankName || undefined,
        accountNumber: formData.accountNumber || undefined,
        accountType: formData.accountType,
        isPrimary: formData.isPrimary,
        currentBalance: balance,
      });
    } else {
      await createMutation.mutateAsync({
        companyId,
        name: formData.name,
        bankName: formData.bankName || undefined,
        accountNumber: formData.accountNumber || undefined,
        accountType: formData.accountType,
        isPrimary: formData.isPrimary,
        currentBalance: balance,
      });
    }
  };

  const handleEdit = (account: any) => {
    setEditingId(account.id);
    setFormData({
      name: account.name,
      bankName: account.bankName || '',
      accountNumber: account.accountNumber || '',
      accountType: account.accountType,
      isPrimary: account.isPrimary,
      currentBalance: account.currentBalance?.toString() || '',
    });
    setShowModal(true);
  };

  const handleDelete = async (id: string) => {
    await deleteMutation.mutateAsync({ id });
  };

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
            <Link href="/reports" className="text-gray-500 hover:text-gray-700">
              &larr; Reports
            </Link>
          </div>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Bank Accounts</h1>
              <p className="mt-1 text-gray-600">
                Manage checking, savings, and credit card accounts
              </p>
            </div>
            <button
              onClick={() => {
                setEditingId(null);
                setFormData(emptyForm);
                setShowModal(true);
              }}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Add Account
            </button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Total Accounts</div>
              <div className="text-2xl font-bold text-gray-900">{stats.totalAccounts}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Bank Balance</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.checkingBalance)}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Credit Card Debt</div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(Math.abs(stats.creditCardBalance))}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Net Cash</div>
              <div className={`text-2xl font-bold ${stats.netCash >= 0 ? 'text-blue-600' : 'text-red-600'}`}>
                {formatCurrency(stats.netCash)}
              </div>
            </div>
          </div>
        )}

        {/* Accounts List */}
        <div className="bg-white rounded-lg shadow">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading accounts...</div>
          ) : !accounts || accounts.length === 0 ? (
            <div className="p-8 text-center">
              <div className="text-gray-400 text-5xl mb-4">🏦</div>
              <p className="text-gray-600 mb-4">No bank accounts yet</p>
              <button
                onClick={() => setShowModal(true)}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Add Your First Account
              </button>
            </div>
          ) : (
            <div className="divide-y divide-gray-200">
              {accounts.map((account: any) => {
                const typeInfo = accountTypeLabels[account.accountType as AccountType] || accountTypeLabels.checking;
                return (
                  <div
                    key={account.id}
                    className="p-4 hover:bg-gray-50 flex items-center justify-between"
                  >
                    <div className="flex items-center gap-4">
                      <div className={`text-3xl`}>{typeInfo.icon}</div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{account.name}</span>
                          {account.isPrimary && (
                            <span className="px-2 py-0.5 text-xs bg-blue-100 text-blue-700 rounded-full">
                              Primary
                            </span>
                          )}
                          {!account.active && (
                            <span className="px-2 py-0.5 text-xs bg-gray-100 text-gray-500 rounded-full">
                              Inactive
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-gray-500">
                          {account.bankName && `${account.bankName} • `}
                          {typeInfo.label}
                          {account.accountNumber && ` • ****${account.accountNumber}`}
                        </div>
                        {account.linkedAccount && (
                          <div className="text-xs text-gray-400 mt-1">
                            Linked to: {account.linkedAccount.code} - {account.linkedAccount.name}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-6">
                      <div className="text-right">
                        <div className={`text-lg font-semibold ${
                          account.accountType === 'credit_card'
                            ? (Number(account.currentBalance) > 0 ? 'text-red-600' : 'text-gray-900')
                            : 'text-gray-900'
                        }`}>
                          {formatCurrency(Number(account.currentBalance) || 0)}
                        </div>
                        <div className="text-xs text-gray-400">
                          {account._count?.transactions || 0} transactions
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <Link
                          href={`/accounting/general-ledger?bankAccountId=${account.id}`}
                          className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                          title="View Transactions"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
                          </svg>
                        </Link>
                        <Link
                          href={`/accounting/import?bankAccountId=${account.id}`}
                          className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded"
                          title="Import Statement"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                          </svg>
                        </Link>
                        <button
                          onClick={() => handleEdit(account)}
                          className="p-2 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded"
                          title="Edit"
                        >
                          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        {deleteConfirm === account.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(account.id)}
                              className="p-2 text-white bg-red-600 hover:bg-red-700 rounded text-xs"
                              disabled={deleteMutation.isPending}
                            >
                              {deleteMutation.isPending ? '...' : 'Confirm'}
                            </button>
                            <button
                              onClick={() => setDeleteConfirm(null)}
                              className="p-2 text-gray-500 hover:bg-gray-100 rounded text-xs"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirm(account.id)}
                            className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded"
                            title="Delete"
                          >
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Quick Links */}
        <div className="mt-6 flex gap-4">
          <Link
            href="/accounting/general-ledger"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            View All Transactions →
          </Link>
          <Link
            href="/accounting/import"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Import Statement →
          </Link>
          <Link
            href="/accounts"
            className="text-blue-600 hover:text-blue-700 text-sm"
          >
            Chart of Accounts →
          </Link>
        </div>
      </div>

      {/* Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">
                {editingId ? 'Edit Bank Account' : 'Add Bank Account'}
              </h2>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Type
                  </label>
                  <select
                    value={formData.accountType}
                    onChange={(e) => setFormData({ ...formData, accountType: e.target.value as AccountType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="checking">🏦 Checking Account</option>
                    <option value="savings">💰 Savings Account</option>
                    <option value="credit_card">💳 Credit Card</option>
                    <option value="money_market">📈 Money Market</option>
                    <option value="petty_cash">💵 Petty Cash</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Business Checking, Chase Visa"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Bank/Institution Name
                  </label>
                  <input
                    type="text"
                    value={formData.bankName}
                    onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Chase, Bank of America, Wells Fargo"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Last 4 Digits
                  </label>
                  <input
                    type="text"
                    value={formData.accountNumber}
                    onChange={(e) => setFormData({ ...formData, accountNumber: e.target.value.replace(/\D/g, '').slice(0, 4) })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., 1234"
                    maxLength={4}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Current Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.currentBalance}
                    onChange={(e) => setFormData({ ...formData, currentBalance: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="0.00"
                  />
                  {formData.accountType === 'credit_card' && (
                    <p className="text-xs text-gray-500 mt-1">
                      Enter as positive number for amount owed
                    </p>
                  )}
                </div>

                <div className="flex items-center">
                  <input
                    type="checkbox"
                    id="isPrimary"
                    checked={formData.isPrimary}
                    onChange={(e) => setFormData({ ...formData, isPrimary: e.target.checked })}
                    className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                  />
                  <label htmlFor="isPrimary" className="ml-2 text-sm text-gray-700">
                    Primary account (used for default imports)
                  </label>
                </div>

                {!editingId && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                    <p className="text-sm text-blue-700">
                      <strong>Auto-link:</strong> A corresponding {formData.accountType === 'credit_card' ? 'Liability' : 'Asset'} account will be created in your Chart of Accounts.
                    </p>
                  </div>
                )}

                <div className="flex justify-end gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => {
                      setShowModal(false);
                      setEditingId(null);
                      setFormData(emptyForm);
                    }}
                    className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Saving...'
                      : editingId
                      ? 'Update Account'
                      : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

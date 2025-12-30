'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';

type AccountType = 'ASSET' | 'LIABILITY' | 'EQUITY' | 'REVENUE' | 'EXPENSE';
type BalanceType = 'DEBIT' | 'CREDIT';

interface Account {
  id: string;
  code: string;
  name: string;
  accountType: AccountType;
  balanceType: BalanceType;
  balance: string;
  parentId?: string | null;
  parent?: Account | null;
  children?: Account[];
  level: number;
  active: boolean;
  systemAccount: boolean;
  description?: string | null;
  _count?: {
    journalLines: number;
  };
}

export default function AccountsPage() {
  const [accountTypeFilter, setAccountTypeFilter] = useState<AccountType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [accountToDelete, setAccountToDelete] = useState<{ id: string; code: string; name: string } | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    accountType: 'ASSET' as AccountType,
    balanceType: 'DEBIT' as BalanceType,
    parentId: '',
    description: '',
  });

  const { data: accountsData, isLoading, refetch } = trpc.accounts.list.useQuery({
    accountType: accountTypeFilter !== 'all' ? accountTypeFilter : undefined,
    search: search || undefined,
  });

  const createMutation = trpc.accounts.create.useMutation();
  const updateMutation = trpc.accounts.update.useMutation();
  const deleteMutation = trpc.accounts.delete.useMutation();

  const accounts = accountsData || [];

  // Account type configuration
  const accountTypeConfig = {
    ASSET: { label: 'Assets', color: 'blue', icon: '💼', bgColor: 'bg-blue-50', textColor: 'text-blue-700', borderColor: 'border-blue-200' },
    LIABILITY: { label: 'Liabilities', color: 'red', icon: '💳', bgColor: 'bg-red-50', textColor: 'text-red-700', borderColor: 'border-red-200' },
    EQUITY: { label: 'Equity', color: 'purple', icon: '🏦', bgColor: 'bg-purple-50', textColor: 'text-purple-700', borderColor: 'border-purple-200' },
    REVENUE: { label: 'Revenue', color: 'green', icon: '💰', bgColor: 'bg-green-50', textColor: 'text-green-700', borderColor: 'border-green-200' },
    EXPENSE: { label: 'Expenses', color: 'orange', icon: '📊', bgColor: 'bg-orange-50', textColor: 'text-orange-700', borderColor: 'border-orange-200' },
  };

  // Calculate stats by account type
  const getStatsByType = (type: AccountType) => {
    const typeAccounts = accounts.filter(a => a.accountType === type);
    const count = typeAccounts.length;
    const balance = typeAccounts.reduce((sum, acc) => sum + parseFloat(acc.balance || '0'), 0);
    return { count, balance };
  };

  const openCreateModal = () => {
    setEditingAccount(null);
    setFormData({
      code: '',
      name: '',
      accountType: 'ASSET',
      balanceType: 'DEBIT',
      parentId: '',
      description: '',
    });
    setShowModal(true);
  };

  const openEditModal = (account: Account) => {
    setEditingAccount(account);
    setFormData({
      code: account.code,
      name: account.name,
      accountType: account.accountType,
      balanceType: account.balanceType,
      parentId: account.parentId || '',
      description: account.description || '',
    });
    setShowModal(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (editingAccount) {
        await updateMutation.mutateAsync({
          id: editingAccount.id,
          name: formData.name,
          parentId: formData.parentId || undefined,
          description: formData.description || undefined,
        });
      } else {
        await createMutation.mutateAsync({
          code: formData.code,
          name: formData.name,
          accountType: formData.accountType,
          balanceType: formData.balanceType,
          parentId: formData.parentId || undefined,
          description: formData.description || undefined,
        });
      }

      await refetch();
      setShowModal(false);
      setFormData({
        code: '',
        name: '',
        accountType: 'ASSET',
        balanceType: 'DEBIT',
        parentId: '',
        description: '',
      });
    } catch (error: any) {
      alert(error.message || 'Failed to save account');
    }
  };

  const handleDeleteClick = (account: Account) => {
    setAccountToDelete({ id: account.id, code: account.code, name: account.name });
    setShowDeleteConfirm(true);
  };

  const handleDelete = async () => {
    if (!accountToDelete) return;

    try {
      await deleteMutation.mutateAsync({ id: accountToDelete.id });
      await refetch();
      setShowDeleteConfirm(false);
      setAccountToDelete(null);
    } catch (error: any) {
      alert(error.message || 'Failed to delete account');
    }
  };

  // Group accounts by type
  const groupedAccounts = accounts.reduce((groups, account) => {
    if (!groups[account.accountType]) {
      groups[account.accountType] = [];
    }
    groups[account.accountType].push(account);
    return groups;
  }, {} as Record<AccountType, Account[]>);

  // Render account with indentation based on level
  const renderAccount = (account: Account) => {
    const config = accountTypeConfig[account.accountType];
    const indent = account.level * 24;

    return (
      <div
        key={account.id}
        className={`border-l-4 ${config.borderColor} ${config.bgColor} p-4 mb-2 rounded-r-lg hover:shadow-md transition-shadow`}
      >
        <div className="flex items-center justify-between">
          <div className="flex-1" style={{ paddingLeft: `${indent}px` }}>
            <div className="flex items-center gap-3">
              <span className="text-2xl">{config.icon}</span>
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono font-semibold text-gray-900">{account.code}</span>
                  <span className="text-gray-400">-</span>
                  <span className="font-medium text-gray-900">{account.name}</span>
                  {account.systemAccount && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-blue-100 text-blue-800 rounded">
                      System
                    </span>
                  )}
                  {!account.active && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-gray-200 text-gray-600 rounded">
                      Inactive
                    </span>
                  )}
                </div>
                {account.description && (
                  <p className="text-sm text-gray-600 mt-1">{account.description}</p>
                )}
                <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                  <span>Balance: {account.balanceType}</span>
                  {account._count && account._count.journalLines > 0 && (
                    <span>{account._count.journalLines} transactions</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <span className={`text-xl font-bold ${config.textColor}`}>
              ${parseFloat(account.balance || '0').toFixed(2)}
            </span>
            <div className="flex gap-2">
              <button
                onClick={() => openEditModal(account)}
                disabled={account.systemAccount}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  account.systemAccount
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                }`}
                title={account.systemAccount ? 'Cannot edit system accounts' : 'Edit account'}
              >
                Edit
              </button>
              <button
                onClick={() => handleDeleteClick(account)}
                disabled={account.systemAccount || (account._count?.journalLines || 0) > 0}
                className={`px-3 py-1 text-sm font-medium rounded-md transition-colors ${
                  account.systemAccount || (account._count?.journalLines || 0) > 0
                    ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                    : 'bg-red-100 text-red-700 hover:bg-red-200'
                }`}
                title={
                  account.systemAccount
                    ? 'Cannot delete system accounts'
                    : (account._count?.journalLines || 0) > 0
                    ? 'Cannot delete accounts with transactions'
                    : 'Delete account'
                }
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    );
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
              Manage your accounting structure and financial categories
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <button
              onClick={openCreateModal}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              + New Account
            </button>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-5 mb-6">
          {(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as AccountType[]).map((type) => {
            const stats = getStatsByType(type);
            const config = accountTypeConfig[type];
            return (
              <div
                key={type}
                className={`${config.bgColor} border-2 ${config.borderColor} rounded-lg p-4 cursor-pointer transition-all hover:shadow-md ${
                  accountTypeFilter === type ? 'ring-2 ring-offset-2 ring-blue-500' : ''
                }`}
                onClick={() => setAccountTypeFilter(accountTypeFilter === type ? 'all' : type)}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-600">{config.label}</p>
                    <p className={`text-2xl font-bold ${config.textColor}`}>{stats.count}</p>
                  </div>
                  <div className="text-3xl">{config.icon}</div>
                </div>
                <p className={`text-sm font-semibold ${config.textColor} mt-2`}>
                  ${stats.balance.toFixed(2)}
                </p>
              </div>
            );
          })}
        </div>

        {/* Search and Filters */}
        <div className="mb-6 flex gap-4">
          <input
            type="text"
            placeholder="Search accounts by code, name, or description..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
          {accountTypeFilter !== 'all' && (
            <button
              onClick={() => setAccountTypeFilter('all')}
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
        ) : accounts.length > 0 ? (
          <div className="space-y-6">
            {(['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'] as AccountType[]).map((type) => {
              const typeAccounts = groupedAccounts[type] || [];
              if (typeAccounts.length === 0) return null;

              const config = accountTypeConfig[type];
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
                            {stats.count} account{stats.count !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-sm text-gray-600">Total Balance</p>
                        <p className={`text-2xl font-bold ${config.textColor}`}>
                          ${stats.balance.toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    {typeAccounts.map((account) => renderAccount(account))}
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
              {search || accountTypeFilter !== 'all'
                ? 'No accounts match your filters.'
                : 'Get started by creating your first account.'}
            </p>
            {!search && accountTypeFilter === 'all' && (
              <div className="mt-6">
                <button
                  onClick={openCreateModal}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  + Create Account
                </button>
              </div>
            )}
          </div>
        )}

        {/* Create/Edit Modal */}
        {showModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg max-w-md w-full max-h-[90vh] overflow-y-auto">
              <div className="px-6 py-4 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingAccount ? 'Edit Account' : 'Create New Account'}
                </h3>
              </div>

              <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Code *
                  </label>
                  <input
                    type="text"
                    required
                    disabled={!!editingAccount}
                    value={formData.code}
                    onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                    placeholder="e.g., 1000"
                  />
                  {editingAccount && (
                    <p className="mt-1 text-xs text-gray-500">Account code cannot be changed</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., Cash"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Account Type *
                  </label>
                  <select
                    required
                    disabled={!!editingAccount}
                    value={formData.accountType}
                    onChange={(e) => setFormData({ ...formData, accountType: e.target.value as AccountType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    {Object.entries(accountTypeConfig).map(([type, config]) => (
                      <option key={type} value={type}>
                        {config.icon} {config.label}
                      </option>
                    ))}
                  </select>
                  {editingAccount && (
                    <p className="mt-1 text-xs text-gray-500">Account type cannot be changed</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Balance Type *
                  </label>
                  <select
                    required
                    disabled={!!editingAccount}
                    value={formData.balanceType}
                    onChange={(e) => setFormData({ ...formData, balanceType: e.target.value as BalanceType })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100 disabled:cursor-not-allowed"
                  >
                    <option value="DEBIT">Debit (normal balance increases with debits)</option>
                    <option value="CREDIT">Credit (normal balance increases with credits)</option>
                  </select>
                  {editingAccount && (
                    <p className="mt-1 text-xs text-gray-500">Balance type cannot be changed</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Parent Account (optional)
                  </label>
                  <select
                    value={formData.parentId}
                    onChange={(e) => setFormData({ ...formData, parentId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">None (Top Level)</option>
                    {accounts
                      .filter(a =>
                        (!editingAccount || a.id !== editingAccount.id) &&
                        (!editingAccount || a.accountType === editingAccount.accountType)
                      )
                      .map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.code} - {account.name}
                        </option>
                      ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Description (optional)
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-blue-500 focus:border-blue-500"
                    rows={3}
                    placeholder="Additional details about this account..."
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowModal(false)}
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={createMutation.isPending || updateMutation.isPending}
                    className="flex-1 px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                  >
                    {createMutation.isPending || updateMutation.isPending
                      ? 'Saving...'
                      : editingAccount
                      ? 'Update Account'
                      : 'Create Account'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Delete Confirmation */}
        {showDeleteConfirm && accountToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Account?</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete account <strong>{accountToDelete.code} - {accountToDelete.name}</strong>?
                This will mark it as inactive and it cannot be used for new transactions.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setAccountToDelete(null);
                  }}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Account'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

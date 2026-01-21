'use client';

import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { SearchableSelect, type SelectOption } from '@/components/ui/SearchableSelect';

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

type MatchType = 'CONTAINS' | 'STARTS_WITH' | 'EXACT' | 'REGEX';

interface RuleFormData {
  name: string;
  matchType: MatchType;
  matchValue: string;
  taxAccountId: string;
  vendorId?: string; // Optional: also assign vendor when rule matches
  priority: number;
  enabled: boolean;
}

// Helper to suggest a rule from transaction description
function suggestRule(description: string): { matchValue: string; suggestedName: string } {
  // Clean up description - remove common noise
  const cleaned = description
    .replace(/\d{2}\/\d{2}/g, '') // Remove dates like 12/25
    .replace(/\$[\d,.]+/g, '')    // Remove amounts
    .replace(/\s+/g, ' ')         // Normalize whitespace
    .replace(/\d{4,}/g, '')       // Remove long numbers (transaction IDs)
    .trim();

  // Extract the most distinctive part (first 2-3 words usually identify vendor)
  const words = cleaned.split(' ').filter(w => w.length > 2);
  const keyWords = words.slice(0, Math.min(3, words.length));
  const matchValue = keyWords.join(' ').toUpperCase();

  // Generate a human-friendly name
  const suggestedName = keyWords
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

  return { matchValue, suggestedName: suggestedName || 'New Rule' };
}

export default function GeneralLedgerPage() {
  const { requireAuth, isLoading: authLoading } = useAuth();
  const [companyId, setCompanyId] = useState<string>('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filters, setFilters] = useState({
    needsReview: undefined as boolean | undefined,
    startDate: '',
    endDate: '',
    search: '',
    taxAccountId: '',
    bankAccountId: '',
    vendorId: '',
  });
  const [bulkCategoryId, setBulkCategoryId] = useState('');

  // Create Rule Modal state
  const [showRuleModal, setShowRuleModal] = useState(false);
  const [ruleFormData, setRuleFormData] = useState<RuleFormData>({
    name: '',
    matchType: 'CONTAINS',
    matchValue: '',
    taxAccountId: '',
    vendorId: '',
    priority: 50,
    enabled: true,
  });
  const [testDescription, setTestDescription] = useState('');

  // Split Modal state
  const [showSplitModal, setShowSplitModal] = useState(false);
  const [splitTransaction, setSplitTransaction] = useState<any>(null);
  const [splitRows, setSplitRows] = useState<{ taxAccountId: string; amount: string; notes: string }[]>([
    { taxAccountId: '', amount: '', notes: '' },
    { taxAccountId: '', amount: '', notes: '' },
  ]);

  // Rule Search Modal state
  const [showRuleSearchModal, setShowRuleSearchModal] = useState(false);
  const [ruleSearchParams, setRuleSearchParams] = useState({
    matchType: 'CONTAINS' as MatchType,
    matchValue: '',
    onlyUncategorized: false,
  });
  const [bulkPatternCategoryId, setBulkPatternCategoryId] = useState('');

  // Personal quick-categorize dropdown
  const [personalMenuOpen, setPersonalMenuOpen] = useState<string | null>(null);

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  // Company ID is hard-coded for now (Donovan Farms)
  // In the future, this could come from a company selector

  // Use Donovan Farms as default
  useEffect(() => {
    setCompanyId('donovan-farms');
  }, []);

  // Get transactions
  const { data: transactionsData, refetch: refetchTransactions } = trpc.bankTransactions.list.useQuery(
    {
      companyId,
      needsReview: filters.needsReview,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
      search: filters.search || undefined,
      taxAccountId: filters.taxAccountId || undefined,
      bankAccountId: filters.bankAccountId || undefined,
      vendorId: filters.vendorId || undefined,
      limit: 2000,
    },
    { enabled: !!companyId }
  );

  // Get stats
  const { data: stats } = trpc.bankTransactions.stats.useQuery(
    {
      companyId,
      startDate: filters.startDate || undefined,
      endDate: filters.endDate || undefined,
    },
    { enabled: !!companyId }
  );

  // Get tax accounts for dropdown
  const { data: taxAccounts } = trpc.taxAccounts.list.useQuery(
    { companyId, active: true },
    { enabled: !!companyId }
  );

  // Memoized category options for searchable select
  const categoryOptions: SelectOption[] = useMemo(() => {
    if (!taxAccounts) return [];
    return taxAccounts.map((acc) => ({
      value: acc.id,
      label: `${acc.code} - ${acc.name}`,
      code: acc.code,
    }));
  }, [taxAccounts]);

  // Get bank accounts for dropdown filter
  const { data: bankAccounts } = trpc.bankAccounts.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Get vendors for dropdown filter
  const { data: vendors } = trpc.vendors.list.useQuery(
    { companyId, active: true },
    { enabled: !!companyId }
  );

  // Rule pattern search query
  const { data: ruleSearchResults, isLoading: ruleSearchLoading, refetch: refetchRuleSearch } = trpc.bankTransactions.searchByPattern.useQuery(
    {
      companyId,
      matchType: ruleSearchParams.matchType,
      matchValue: ruleSearchParams.matchValue,
      onlyUncategorized: ruleSearchParams.onlyUncategorized,
    },
    { enabled: showRuleSearchModal && !!companyId && ruleSearchParams.matchValue.length > 0 }
  );

  // Update transaction mutation
  const updateMutation = trpc.bankTransactions.update.useMutation({
    onSuccess: () => refetchTransactions(),
  });

  // Bulk update mutation
  const bulkUpdateMutation = trpc.bankTransactions.bulkUpdate.useMutation({
    onSuccess: () => {
      refetchTransactions();
      setSelectedIds(new Set());
      setBulkCategoryId('');
    },
  });

  // Bulk delete mutation
  const bulkDeleteMutation = trpc.bankTransactions.bulkDelete.useMutation({
    onSuccess: (result) => {
      refetchTransactions();
      setSelectedIds(new Set());
      alert(`Deleted ${result.deleted} transaction(s)`);
    },
  });

  // Recategorize mutation
  const recategorizeMutation = trpc.bankTransactions.recategorize.useMutation({
    onSuccess: () => refetchTransactions(),
  });

  // Delete mutation
  const deleteMutation = trpc.bankTransactions.delete.useMutation({
    onSuccess: () => refetchTransactions(),
  });

  // Bulk categorize by pattern mutation
  const bulkCategorizeByPatternMutation = trpc.bankTransactions.bulkCategorizeByPattern.useMutation({
    onSuccess: (result) => {
      refetchTransactions();
      refetchRuleSearch();
      setBulkPatternCategoryId('');
      alert(result.message);
    },
  });

  // Create rule mutation
  const createRuleMutation = trpc.categorizationRules.create.useMutation({
    onSuccess: () => {
      setShowRuleModal(false);
      setRuleFormData({
        name: '',
        matchType: 'CONTAINS',
        matchValue: '',
        taxAccountId: '',
        vendorId: '',
        priority: 50,
        enabled: true,
      });
      setTestDescription('');
      // Optionally trigger re-categorization
      refetchTransactions();
    },
  });

  // Split transaction mutation
  const splitMutation = trpc.bankTransactions.splitTransaction.useMutation({
    onSuccess: () => {
      refetchTransactions();
      setShowSplitModal(false);
      setSplitTransaction(null);
      setSplitRows([
        { taxAccountId: '', amount: '', notes: '' },
        { taxAccountId: '', amount: '', notes: '' },
      ]);
    },
  });

  // Unsplit transaction mutation
  const unsplitMutation = trpc.bankTransactions.unsplitTransaction.useMutation({
    onSuccess: () => refetchTransactions(),
  });

  // Test rule query
  const { data: testResult } = trpc.categorizationRules.test.useQuery(
    {
      description: testDescription,
      matchType: ruleFormData.matchType,
      matchValue: ruleFormData.matchValue,
    },
    { enabled: !!testDescription && !!ruleFormData.matchValue }
  );

  const transactions = transactionsData?.transactions || [];

  // Open rule modal with pre-filled data from transaction
  const openCreateRuleModal = (description: string, currentTaxAccountId: string | null, currentVendorId: string | null = null) => {
    const { matchValue, suggestedName } = suggestRule(description);
    setRuleFormData({
      name: suggestedName,
      matchType: 'CONTAINS',
      matchValue,
      taxAccountId: currentTaxAccountId || '',
      vendorId: currentVendorId || '',
      priority: 50,
      enabled: true,
    });
    setTestDescription(description);
    setShowRuleModal(true);
  };

  // Handle rule form submit
  const handleRuleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createRuleMutation.mutate({
      ...ruleFormData,
      companyId,
      vendorId: ruleFormData.vendorId || undefined, // Only include if set
    });
  };

  // Open split modal for a transaction
  const openSplitModal = (transaction: any) => {
    setSplitTransaction(transaction);
    // Initialize with 2 empty rows
    setSplitRows([
      { taxAccountId: transaction.taxAccountId || '', amount: '', notes: '' },
      { taxAccountId: '', amount: '', notes: '' },
    ]);
    setShowSplitModal(true);
  };

  // Close split modal
  const closeSplitModal = () => {
    setShowSplitModal(false);
    setSplitTransaction(null);
    setSplitRows([
      { taxAccountId: '', amount: '', notes: '' },
      { taxAccountId: '', amount: '', notes: '' },
    ]);
  };

  // Add split row
  const addSplitRow = () => {
    setSplitRows([...splitRows, { taxAccountId: '', amount: '', notes: '' }]);
  };

  // Remove split row
  const removeSplitRow = (index: number) => {
    if (splitRows.length <= 2) return; // Must have at least 2 splits
    setSplitRows(splitRows.filter((_, i) => i !== index));
  };

  // Update split row
  const updateSplitRow = (index: number, field: string, value: string) => {
    const updated = [...splitRows];
    updated[index] = { ...updated[index], [field]: value };
    setSplitRows(updated);
  };

  // Calculate remaining amount for splits
  const getSplitTotal = () => {
    return splitRows.reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);
  };

  // Handle split form submit
  const handleSplitSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!splitTransaction) return;

    // Validate all rows have category and amount
    const validSplits = splitRows.filter((r) => r.taxAccountId && r.amount);
    if (validSplits.length < 2) {
      alert('You need at least 2 split lines with category and amount');
      return;
    }

    // Validate total equals original amount
    const total = getSplitTotal();
    const originalAmount = Math.abs(Number(splitTransaction.amount));
    if (Math.abs(total - originalAmount) > 0.01) {
      alert(`Split total (${formatCurrency(total)}) must equal original amount (${formatCurrency(originalAmount)})`);
      return;
    }

    splitMutation.mutate({
      parentId: splitTransaction.id,
      splits: validSplits.map((r) => ({
        taxAccountId: r.taxAccountId,
        amount: parseFloat(r.amount),
        notes: r.notes || undefined,
      })),
    });
  };

  // Unsplit a transaction
  const handleUnsplit = (parentId: string) => {
    if (confirm('Remove all split lines and restore the original transaction?')) {
      unsplitMutation.mutate({ parentId });
    }
  };

  // Delete transaction
  const deleteTransaction = (id: string, description: string) => {
    if (confirm(`Delete transaction: "${description.slice(0, 50)}..."?`)) {
      deleteMutation.mutate({ id });
    }
  };

  // Toggle selection
  const toggleSelect = (id: string) => {
    const newSet = new Set(selectedIds);
    if (newSet.has(id)) {
      newSet.delete(id);
    } else {
      newSet.add(id);
    }
    setSelectedIds(newSet);
  };

  // Select all
  const selectAll = () => {
    if (selectedIds.size === transactions.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(transactions.map((t) => t.id)));
    }
  };

  // Categorize single transaction
  const categorize = (transactionId: string, taxAccountId: string) => {
    updateMutation.mutate({ id: transactionId, taxAccountId });
  };

  // Bulk categorize
  const bulkCategorize = () => {
    if (selectedIds.size === 0 || !bulkCategoryId) return;
    bulkUpdateMutation.mutate({
      ids: Array.from(selectedIds),
      taxAccountId: bulkCategoryId,
    });
  };

  // Bulk delete
  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (selectedIds.size > 500) {
      alert(`Cannot delete more than 500 transactions at once. You selected ${selectedIds.size}.\n\nPlease filter by date range and delete in smaller batches.`);
      return;
    }
    if (!confirm(`Delete ${selectedIds.size} transaction(s)? This cannot be undone.`)) return;
    bulkDeleteMutation.mutate({
      ids: Array.from(selectedIds),
    });
  };

  // Run auto-categorization
  const runAutoCategorize = () => {
    recategorizeMutation.mutate({
      companyId,
      onlyNeedsReview: true,
    });
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
        <div className="mb-6 flex justify-between items-start">
          <div>
            <div className="flex items-center space-x-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700">
                &larr; Dashboard
              </Link>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mt-2">General Ledger</h1>
            <p className="mt-1 text-gray-600">
              Review and categorize bank transactions
            </p>
          </div>
          <div className="flex space-x-3">
            <button
              onClick={() => setShowRuleSearchModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
            >
              🔍 Search Pattern
            </button>
            <Link
              href="/accounting/rules"
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              ⚙️ Rules
            </Link>
            <button
              onClick={runAutoCategorize}
              disabled={recategorizeMutation.isPending}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              {recategorizeMutation.isPending ? 'Running...' : '🤖 Auto-Categorize'}
            </button>
            <Link
              href="/accounting/import"
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              📥 Import Transactions
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="mb-6 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Total Transactions</div>
              <div className="text-2xl font-bold">{stats.total}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Categorized</div>
              <div className="text-2xl font-bold text-green-600">
                {stats.categorized} ({stats.categorizedPercent}%)
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Needs Review</div>
              <div className="text-2xl font-bold text-yellow-600">{stats.needsReview}</div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Total Income</div>
              <div className="text-2xl font-bold text-green-600">
                {formatCurrency(stats.totalIncome)}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Total Expenses</div>
              <div className="text-2xl font-bold text-red-600">
                {formatCurrency(stats.totalExpenses)}
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="text-sm text-gray-500">Net Income</div>
              <div className={`text-2xl font-bold ${stats.netIncome >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatCurrency(stats.netIncome)}
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="mb-6 bg-white rounded-lg shadow p-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bank Account</label>
              <select
                value={filters.bankAccountId}
                onChange={(e) => setFilters({ ...filters, bankAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Accounts</option>
                {bankAccounts?.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountType === 'credit_card' ? '💳' : '🏦'} {acc.name}
                    {acc.accountNumber ? ` (****${acc.accountNumber})` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Vendor</label>
              <select
                value={filters.vendorId}
                onChange={(e) => setFilters({ ...filters, vendorId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Vendors</option>
                {vendors?.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    🏪 {v.name}
                    {v.requiresSplit ? ' ⚠️' : ''}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <select
                value={filters.taxAccountId}
                onChange={(e) => setFilters({ ...filters, taxAccountId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">All Categories</option>
                {taxAccounts?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <select
                value={filters.needsReview === undefined ? 'all' : filters.needsReview ? 'review' : 'done'}
                onChange={(e) =>
                  setFilters({
                    ...filters,
                    needsReview: e.target.value === 'all' ? undefined : e.target.value === 'review',
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="all">All Transactions</option>
                <option value="review">Needs Review</option>
                <option value="done">Categorized</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={filters.startDate}
                onChange={(e) => setFilters({ ...filters, startDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={filters.endDate}
                onChange={(e) => setFilters({ ...filters, endDate: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Search</label>
              <input
                type="text"
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                placeholder="Search descriptions..."
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>

        {/* Bulk Actions */}
        {selectedIds.size > 0 && (
          <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-center justify-between">
            <span className="text-blue-800 font-medium">
              {selectedIds.size} transaction(s) selected
            </span>
            <div className="flex items-center space-x-3">
              <select
                value={bulkCategoryId}
                onChange={(e) => setBulkCategoryId(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">Select category...</option>
                {taxAccounts?.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.code} - {acc.name}
                  </option>
                ))}
              </select>
              <button
                onClick={bulkCategorize}
                disabled={!bulkCategoryId || bulkUpdateMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {bulkUpdateMutation.isPending ? 'Applying...' : 'Apply to Selected'}
              </button>
              <button
                onClick={bulkDelete}
                disabled={bulkDeleteMutation.isPending}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 disabled:opacity-50"
              >
                {bulkDeleteMutation.isPending ? 'Deleting...' : '🗑️ Delete Selected'}
              </button>
              <button
                onClick={() => setSelectedIds(new Set())}
                className="px-4 py-2 text-gray-600 hover:text-gray-800"
              >
                Clear
              </button>
            </div>
          </div>
        )}

        {/* Transactions Table */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left">
                  <input
                    type="checkbox"
                    checked={selectedIds.size === transactions.length && transactions.length > 0}
                    onChange={selectAll}
                    className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Description
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Vendor
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Amount
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Category
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Status
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {transactions.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                    No transactions found. Import bank transactions to get started.
                  </td>
                </tr>
              ) : (
                transactions.map((t: any) => (
                  <tr key={t.id} className={t.needsReview ? 'bg-yellow-50' : ''}>
                    <td className="px-4 py-3">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(t.id)}
                        onChange={() => toggleSelect(t.id)}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-900 whitespace-nowrap">
                      {formatDate(t.date)}
                    </td>
                    <td
                      className="px-4 py-3 text-sm text-gray-900 max-w-md"
                      title={t.description}
                    >
                      <span className="block break-words">{t.description}</span>
                    </td>
                    <td className="px-4 py-3 text-sm whitespace-nowrap">
                      {t.vendor ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          🏪 {t.vendor.name}
                          {t.vendor.requiresSplit && !t.isSplit && (
                            <span className="ml-1 text-yellow-600" title="Usually needs split">⚠️</span>
                          )}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className={`px-4 py-3 text-sm font-medium text-right whitespace-nowrap ${
                      Number(t.amount) >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {formatCurrency(Number(t.amount))}
                    </td>
                    <td className="px-4 py-3">
                      <SearchableSelect
                        options={categoryOptions}
                        value={t.taxAccountId || ''}
                        onChange={(value) => categorize(t.id, value)}
                        placeholder="-- Select --"
                        className={t.needsReview ? '[&_input]:border-yellow-400 [&_input]:bg-yellow-50' : ''}
                      />
                    </td>
                    <td className="px-4 py-3 text-center">
                      {t.isSplit ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                          🔀 Split
                        </span>
                      ) : t.needsReview ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          ⚠️ Review
                        </span>
                      ) : t.matchedRule ? (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                          🤖 Auto
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          ✓ Done
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        {t.isSplit ? (
                          <button
                            onClick={() => handleUnsplit(t.id)}
                            disabled={unsplitMutation.isPending}
                            className="text-orange-500 hover:text-orange-700 disabled:opacity-50"
                            title="Unsplit transaction"
                          >
                            ↩️
                          </button>
                        ) : (
                          <button
                            onClick={() => openSplitModal(t)}
                            className="text-purple-500 hover:text-purple-700"
                            title="Split transaction into multiple categories"
                          >
                            🔀
                          </button>
                        )}
                        {/* Personal quick-categorize button */}
                        <div className="relative">
                          <button
                            onClick={() => setPersonalMenuOpen(personalMenuOpen === t.id ? null : t.id)}
                            className="text-green-600 hover:text-green-800"
                            title="Mark as personal expense"
                          >
                            🏠
                          </button>
                          {personalMenuOpen === t.id && (
                            <div className="absolute right-0 top-6 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 min-w-[160px]">
                              {taxAccounts?.filter((ta: any) =>
                                ['6100', '6110', '6120', '3030'].includes(ta.code)
                              ).map((ta: any) => (
                                <button
                                  key={ta.id}
                                  onClick={() => {
                                    updateMutation.mutate(
                                      { id: t.id, taxAccountId: ta.id },
                                      { onSuccess: () => setPersonalMenuOpen(null) }
                                    );
                                  }}
                                  className="block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-100"
                                >
                                  {ta.name}
                                </button>
                              ))}
                              <button
                                onClick={() => setPersonalMenuOpen(null)}
                                className="block w-full text-left px-3 py-1.5 text-sm text-gray-400 hover:bg-gray-100 border-t"
                              >
                                Cancel
                              </button>
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => openCreateRuleModal(t.description, t.taxAccountId)}
                          className="text-blue-500 hover:text-blue-700"
                          title="Create rule from this transaction"
                        >
                          📋
                        </button>
                        <button
                          onClick={() => deleteTransaction(t.id, t.description)}
                          disabled={deleteMutation.isPending}
                          className="text-red-500 hover:text-red-700 disabled:opacity-50"
                          title="Delete transaction"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination info */}
          {transactionsData && (
            <div className="bg-gray-50 px-4 py-3 flex items-center justify-between border-t border-gray-200">
              <div className="text-sm text-gray-700">
                Showing <span className="font-medium">{transactions.length}</span> of{' '}
                <span className="font-medium">{transactionsData.total}</span> transactions
              </div>
              {transactionsData.hasMore && (
                <div className="text-sm text-gray-500">
                  (More transactions available - adjust filters to see all)
                </div>
              )}
            </div>
          )}
        </div>

        {/* Quick Navigation */}
        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/accounting/income"
            className="px-4 py-2 bg-green-50 border border-green-300 rounded-lg hover:bg-green-100 text-green-700 text-sm font-medium"
          >
            💰 View Income
          </Link>
          <Link
            href="/accounting/vendors"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            🏪 Manage Vendors
          </Link>
          <Link
            href="/accounting/reports"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            📊 View Tax Reports
          </Link>
          <Link
            href="/reports/profit-loss"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            📈 P&L Statement
          </Link>
          <Link
            href="/reports"
            className="px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 text-gray-700 text-sm"
          >
            📑 All Reports
          </Link>
        </div>

        {/* Quick Help */}
        <div className="mt-6 bg-gray-100 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Quick Tips</h3>
          <ul className="text-sm text-gray-600 space-y-1">
            <li>🤖 <strong>Auto-Categorize</strong> runs your saved rules against transactions needing review</li>
            <li>✏️ Select a category from the dropdown to manually categorize a transaction</li>
            <li>☑️ Select multiple transactions and use bulk actions to categorize them together</li>
            <li>🔀 <strong>Split</strong> a transaction into multiple categories (e.g., Amazon order with office supplies + hardware)</li>
            <li>🔍 Use filters to find specific transactions by date, status, or description</li>
            <li>📋 Click the <strong>clipboard icon</strong> to create a rule from any transaction</li>
            <li>🏪 Set up <strong>Vendors</strong> to auto-detect who you paid based on transaction descriptions</li>
            <li>📊 <strong>Category changes here automatically update all reports</strong></li>
          </ul>
        </div>
      </div>

      {/* Create Rule Modal */}
      {showRuleModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-lg shadow-xl">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              Create Categorization Rule
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              This rule will automatically categorize future transactions with similar descriptions.
            </p>
            <form onSubmit={handleRuleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={ruleFormData.name}
                  onChange={(e) => setRuleFormData({ ...ruleFormData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="e.g., Shell Gas Stations"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
                  <select
                    value={ruleFormData.matchType}
                    onChange={(e) =>
                      setRuleFormData({ ...ruleFormData, matchType: e.target.value as MatchType })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="CONTAINS">Contains</option>
                    <option value="STARTS_WITH">Starts With</option>
                    <option value="EXACT">Exact Match</option>
                    <option value="REGEX">Regex</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Match Value</label>
                  <input
                    type="text"
                    value={ruleFormData.matchValue}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, matchValue: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="e.g., SHELL"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                  <select
                    value={ruleFormData.taxAccountId}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, taxAccountId: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    required
                  >
                    <option value="">Select category...</option>
                    {taxAccounts?.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.code} - {acc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vendor <span className="text-gray-400">(optional)</span>
                  </label>
                  <select
                    value={ruleFormData.vendorId || ''}
                    onChange={(e) => setRuleFormData({ ...ruleFormData, vendorId: e.target.value || undefined })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">No vendor</option>
                    {vendors?.map((v: any) => (
                      <option key={v.id} value={v.id}>
                        {v.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Priority (0-100)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={ruleFormData.priority}
                    onChange={(e) =>
                      setRuleFormData({ ...ruleFormData, priority: parseInt(e.target.value) || 50 })
                    }
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={ruleFormData.enabled}
                      onChange={(e) => setRuleFormData({ ...ruleFormData, enabled: e.target.checked })}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm text-gray-700">Enabled</span>
                  </label>
                </div>
              </div>

              {/* Test Pattern Result */}
              {testDescription && ruleFormData.matchValue && testResult && (
                <div
                  className={`p-3 rounded-lg text-sm ${
                    testResult.matches
                      ? 'bg-green-50 text-green-800 border border-green-200'
                      : 'bg-red-50 text-red-800 border border-red-200'
                  }`}
                >
                  {testResult.matches
                    ? `✓ Matches! Confidence: ${testResult.confidence}%`
                    : '✗ Does not match the test description'}
                </div>
              )}

              <div className="text-xs text-gray-500 bg-gray-50 rounded p-2">
                <strong>Test Description:</strong> {testDescription.slice(0, 100)}...
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={createRuleMutation.isPending || !ruleFormData.taxAccountId}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium"
                >
                  {createRuleMutation.isPending ? 'Creating...' : 'Create Rule'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowRuleModal(false);
                    setTestDescription('');
                  }}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Split Transaction Modal */}
      {showSplitModal && splitTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-2xl shadow-xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              🔀 Split Transaction
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Divide this transaction into multiple expense categories. The split amounts must equal the original total.
            </p>

            {/* Original Transaction Info */}
            <div className="bg-gray-50 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-xs text-gray-500">Date</div>
                  <div className="font-medium">{formatDate(splitTransaction.date)}</div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Original Amount</div>
                  <div className={`font-bold text-lg ${Number(splitTransaction.amount) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(Math.abs(Number(splitTransaction.amount)))}
                  </div>
                </div>
              </div>
              <div className="mt-2">
                <div className="text-xs text-gray-500">Description</div>
                <div className="text-sm">{splitTransaction.description}</div>
              </div>
            </div>

            <form onSubmit={handleSplitSubmit} className="space-y-4">
              {/* Split Rows */}
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <label className="block text-sm font-medium text-gray-700">Split Lines</label>
                  <button
                    type="button"
                    onClick={addSplitRow}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Add Line
                  </button>
                </div>

                {splitRows.map((row, index) => (
                  <div key={index} className="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Category</label>
                      <select
                        value={row.taxAccountId}
                        onChange={(e) => updateSplitRow(index, 'taxAccountId', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                        required
                      >
                        <option value="">Select...</option>
                        {taxAccounts?.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.code} - {acc.name}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="w-32">
                      <label className="block text-xs text-gray-500 mb-1">Amount</label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={row.amount}
                        onChange={(e) => updateSplitRow(index, 'amount', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                        placeholder="0.00"
                        required
                      />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Notes (optional)</label>
                      <input
                        type="text"
                        value={row.notes}
                        onChange={(e) => updateSplitRow(index, 'notes', e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-purple-500 focus:border-purple-500 text-sm"
                        placeholder="e.g., Office supplies"
                      />
                    </div>
                    <div className="pt-6">
                      <button
                        type="button"
                        onClick={() => removeSplitRow(index)}
                        disabled={splitRows.length <= 2}
                        className="text-red-500 hover:text-red-700 disabled:text-gray-300 disabled:cursor-not-allowed"
                        title={splitRows.length <= 2 ? 'Minimum 2 splits required' : 'Remove line'}
                      >
                        ✕
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Split Summary */}
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-purple-700">Split Total</div>
                    <div className="text-xl font-bold text-purple-900">
                      {formatCurrency(getSplitTotal())}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-purple-700">Remaining</div>
                    <div className={`text-xl font-bold ${
                      Math.abs(Math.abs(Number(splitTransaction.amount)) - getSplitTotal()) < 0.01
                        ? 'text-green-600'
                        : 'text-red-600'
                    }`}>
                      {formatCurrency(Math.abs(Number(splitTransaction.amount)) - getSplitTotal())}
                    </div>
                  </div>
                </div>
                {Math.abs(Math.abs(Number(splitTransaction.amount)) - getSplitTotal()) >= 0.01 && (
                  <p className="text-xs text-red-600 mt-2">
                    ⚠️ Split total must equal the original amount of {formatCurrency(Math.abs(Number(splitTransaction.amount)))}
                  </p>
                )}
              </div>

              <div className="flex gap-3 pt-4 border-t border-gray-200">
                <button
                  type="submit"
                  disabled={
                    splitMutation.isPending ||
                    splitRows.filter((r) => r.taxAccountId && r.amount).length < 2 ||
                    Math.abs(Math.abs(Number(splitTransaction.amount)) - getSplitTotal()) >= 0.01
                  }
                  className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium"
                >
                  {splitMutation.isPending ? 'Splitting...' : '🔀 Split Transaction'}
                </button>
                <button
                  type="button"
                  onClick={closeSplitModal}
                  className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Rule Search Modal */}
      {showRuleSearchModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-3xl shadow-xl max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => {
                setShowRuleSearchModal(false);
                setRuleSearchParams({ matchType: 'CONTAINS', matchValue: '', onlyUncategorized: false });
                setBulkPatternCategoryId('');
              }}
              className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 text-2xl leading-none"
            >
              ×
            </button>
            <h2 className="text-xl font-bold text-gray-900 mb-2">
              🔍 Search Transactions by Pattern
            </h2>
            <p className="text-sm text-gray-600 mb-4">
              Test a rule pattern against all transactions to find matches. Great for finding missed categorizations!
            </p>

            <div className="grid grid-cols-3 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Match Type</label>
                <select
                  value={ruleSearchParams.matchType}
                  onChange={(e) => setRuleSearchParams({ ...ruleSearchParams, matchType: e.target.value as MatchType })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="CONTAINS">Contains</option>
                  <option value="STARTS_WITH">Starts With</option>
                  <option value="EXACT">Exact Match</option>
                  <option value="REGEX">Regex</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Pattern</label>
                <input
                  type="text"
                  value={ruleSearchParams.matchValue}
                  onChange={(e) => setRuleSearchParams({ ...ruleSearchParams, matchValue: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="e.g., AMAZON, SHELL, etc."
                />
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={ruleSearchParams.onlyUncategorized}
                    onChange={(e) => setRuleSearchParams({ ...ruleSearchParams, onlyUncategorized: e.target.checked })}
                    className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span className="text-sm text-gray-700">Only uncategorized</span>
                </label>
              </div>
            </div>

            {/* Results */}
            {ruleSearchLoading && (
              <div className="text-center py-8">
                <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
                <p className="mt-2 text-gray-600">Searching...</p>
              </div>
            )}

            {ruleSearchResults && !ruleSearchLoading && (
              <>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="bg-indigo-50 rounded-lg p-3">
                    <div className="text-sm text-indigo-600">Total Matches</div>
                    <div className="text-2xl font-bold text-indigo-700">{ruleSearchResults.totalMatches}</div>
                  </div>
                  <div className="bg-green-50 rounded-lg p-3">
                    <div className="text-sm text-green-600">Already Categorized</div>
                    <div className="text-2xl font-bold text-green-700">{ruleSearchResults.categorizedCount}</div>
                  </div>
                  <div className="bg-yellow-50 rounded-lg p-3">
                    <div className="text-sm text-yellow-600">Needs Category</div>
                    <div className="text-2xl font-bold text-yellow-700">{ruleSearchResults.uncategorizedCount}</div>
                  </div>
                </div>

                {/* Bulk Categorize Section */}
                {ruleSearchResults.uncategorizedCount > 0 && (
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                    <h3 className="text-sm font-semibold text-blue-800 mb-2">
                      Quick Categorize {ruleSearchResults.uncategorizedCount} Uncategorized
                    </h3>
                    <div className="flex gap-3 items-end">
                      <div className="flex-1">
                        <label className="block text-xs text-blue-600 mb-1">Apply this category to all matches</label>
                        <select
                          value={bulkPatternCategoryId}
                          onChange={(e) => setBulkPatternCategoryId(e.target.value)}
                          className="w-full px-3 py-2 border border-blue-300 rounded-lg text-sm focus:ring-blue-500 focus:border-blue-500"
                        >
                          <option value="">Select category...</option>
                          {taxAccounts?.map((acc) => (
                            <option key={acc.id} value={acc.id}>
                              {acc.code} - {acc.name}
                            </option>
                          ))}
                        </select>
                      </div>
                      <button
                        type="button"
                        disabled={!bulkPatternCategoryId || bulkCategorizeByPatternMutation.isPending}
                        onClick={() => {
                          if (confirm(`Apply this category to ${ruleSearchResults.uncategorizedCount} uncategorized transactions?`)) {
                            bulkCategorizeByPatternMutation.mutate({
                              companyId,
                              matchType: ruleSearchParams.matchType,
                              matchValue: ruleSearchParams.matchValue,
                              taxAccountId: bulkPatternCategoryId,
                            });
                          }
                        }}
                        className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap text-sm font-medium"
                      >
                        {bulkCategorizeByPatternMutation.isPending ? 'Applying...' : `Apply to ${ruleSearchResults.uncategorizedCount}`}
                      </button>
                    </div>
                  </div>
                )}

                {ruleSearchResults.matches.length > 0 ? (
                  <div className="border rounded-lg overflow-hidden max-h-80 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 sticky top-0">
                        <tr>
                          <th className="px-3 py-2 text-left">Date</th>
                          <th className="px-3 py-2 text-left">Description</th>
                          <th className="px-3 py-2 text-right">Amount</th>
                          <th className="px-3 py-2 text-left">Category (click to change)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {ruleSearchResults.matches.map((m) => (
                          <tr key={m.id} className={`border-t ${!m.isCategorized ? 'bg-yellow-50' : 'hover:bg-gray-50'}`}>
                            <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.date)}</td>
                            <td className="px-2 py-2 max-w-[180px] sm:max-w-[250px] md:max-w-xs">
                              {m.description.length > 45 ? (
                                <details className="cursor-pointer group">
                                  <summary className="text-xs leading-tight list-none hover:text-indigo-600">
                                    {m.description.slice(0, 40)}... <span className="text-indigo-500 text-[10px]">▼</span>
                                  </summary>
                                  <div className="text-xs mt-1 p-2 bg-gray-100 rounded break-words whitespace-normal border-l-2 border-indigo-300">
                                    {m.description}
                                  </div>
                                </details>
                              ) : (
                                <span className="text-xs">{m.description}</span>
                              )}
                            </td>
                            <td className={`px-3 py-2 text-right ${m.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                              {formatCurrency(m.amount)}
                            </td>
                            <td className="px-3 py-1">
                              <select
                                value={m.taxAccount?.id || ''}
                                onChange={(e) => {
                                  updateMutation.mutate({
                                    id: m.id,
                                    taxAccountId: e.target.value || null,
                                    isManualCategorization: true,
                                  }, {
                                    onSuccess: () => refetchRuleSearch(),
                                  });
                                }}
                                className={`w-full px-2 py-1 text-xs border rounded ${
                                  m.taxAccount
                                    ? 'border-green-300 bg-green-50 text-green-800'
                                    : 'border-yellow-300 bg-yellow-50 text-yellow-800'
                                }`}
                              >
                                <option value="">⚠️ Uncategorized</option>
                                {taxAccounts?.map((acc) => (
                                  <option key={acc.id} value={acc.id}>
                                    {acc.code} - {acc.name}
                                  </option>
                                ))}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    {ruleSearchParams.matchValue ? 'No transactions match this pattern' : 'Enter a pattern to search'}
                  </div>
                )}

                {ruleSearchResults.totalMatches > ruleSearchResults.showing && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    Showing {ruleSearchResults.showing} of {ruleSearchResults.totalMatches} matches
                  </p>
                )}
              </>
            )}

            <div className="flex gap-3 pt-4 mt-4 border-t border-gray-200">
              <button
                type="button"
                onClick={() => {
                  setShowRuleSearchModal(false);
                  setRuleSearchParams({ matchType: 'CONTAINS', matchValue: '', onlyUncategorized: false });
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

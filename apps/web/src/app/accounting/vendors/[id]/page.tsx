'use client';

import { useState, useEffect, useMemo } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { SearchableSelect, type SelectOption } from '@/components/ui/SearchableSelect';

interface SplitEntry {
  taxAccountId: string;
  amount: number;
  description?: string;
}

export default function VendorDetailPage() {
  const params = useParams();
  const vendorId = params.id as string;
  const { requireAuth, isLoading: authLoading } = useAuth();
  const [companyId] = useState('donovan-farms');

  // Split modal state
  const [splitModalOpen, setSplitModalOpen] = useState(false);
  const [splitTransaction, setSplitTransaction] = useState<any>(null);
  const [splits, setSplits] = useState<SplitEntry[]>([]);

  // Filter state
  const [showOnlyPending, setShowOnlyPending] = useState(true);

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  // Get vendor details
  const { data: vendor, isLoading: vendorLoading } = trpc.vendors.get.useQuery(
    { id: vendorId },
    { enabled: !!vendorId }
  );

  // Get transactions for this vendor
  const { data: transactionsData, refetch: refetchTransactions } = trpc.bankTransactions.list.useQuery(
    {
      companyId,
      vendorId,
      hideSplitChildren: true, // Show parent transactions, not the split children
    },
    { enabled: !!companyId && !!vendorId }
  );

  // Get tax accounts for category dropdown
  const { data: taxAccounts } = trpc.taxAccounts.list.useQuery(
    { companyId, active: true },
    { enabled: !!companyId }
  );

  // Build category options for searchable select
  const categoryOptions: SelectOption[] = useMemo(() => {
    if (!taxAccounts) return [];
    return taxAccounts.map((acc: any) => ({
      value: acc.id,
      label: `${acc.code} - ${acc.name}`,
      code: acc.code,
    }));
  }, [taxAccounts]);

  // Split transaction mutation
  const splitMutation = trpc.bankTransactions.splitTransaction.useMutation({
    onSuccess: () => {
      setSplitModalOpen(false);
      setSplitTransaction(null);
      setSplits([]);
      refetchTransactions();
    },
    onError: (error) => {
      alert(`Error splitting: ${error.message}`);
    },
  });

  // Unsplit transaction mutation
  const unsplitMutation = trpc.bankTransactions.unsplitTransaction.useMutation({
    onSuccess: () => {
      refetchTransactions();
    },
    onError: (error) => {
      alert(`Error unsplitting: ${error.message}`);
    },
  });

  // Filter transactions based on pending status
  const transactions = useMemo(() => {
    if (!transactionsData?.transactions) return [];
    if (!showOnlyPending) return transactionsData.transactions;

    // Show transactions that need review:
    // - Has the vendor's default pending allocation category
    // - Or requires split but not yet split
    // - Or no category assigned yet
    return transactionsData.transactions.filter((tx: any) => {
      const isPendingCategory = vendor?.defaultTaxAccountId && tx.taxAccountId === vendor.defaultTaxAccountId;
      const needsSplit = vendor?.requiresSplit && !tx.isSplit;
      const noCategory = !tx.taxAccountId;
      return isPendingCategory || needsSplit || noCategory;
    });
  }, [transactionsData, showOnlyPending, vendor]);

  // Calculate stats
  const stats = useMemo(() => {
    if (!transactionsData?.transactions) return { total: 0, pending: 0, allocated: 0, totalAmount: 0 };

    const all = transactionsData.transactions;
    const pending = all.filter((tx: any) => {
      const isPendingCategory = vendor?.defaultTaxAccountId && tx.taxAccountId === vendor.defaultTaxAccountId;
      const needsSplit = vendor?.requiresSplit && !tx.isSplit;
      const noCategory = !tx.taxAccountId;
      return isPendingCategory || needsSplit || noCategory;
    });
    const totalAmount = all.reduce((sum: number, tx: any) => sum + Math.abs(tx.amount), 0);

    return {
      total: all.length,
      pending: pending.length,
      allocated: all.length - pending.length,
      totalAmount,
    };
  }, [transactionsData, vendor]);

  // Open split modal
  const openSplitModal = (tx: any) => {
    setSplitTransaction(tx);
    // Initialize with one empty split
    setSplits([{ taxAccountId: '', amount: Math.abs(tx.amount), description: '' }]);
    setSplitModalOpen(true);
  };

  // Add split row
  const addSplitRow = () => {
    setSplits([...splits, { taxAccountId: '', amount: 0, description: '' }]);
  };

  // Remove split row
  const removeSplitRow = (index: number) => {
    if (splits.length > 1) {
      setSplits(splits.filter((_, i) => i !== index));
    }
  };

  // Update split row
  const updateSplit = (index: number, field: keyof SplitEntry, value: string | number) => {
    setSplits(splits.map((s, i) => (i === index ? { ...s, [field]: value } : s)));
  };

  // Calculate remaining amount
  const remainingAmount = useMemo(() => {
    if (!splitTransaction) return 0;
    const allocated = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
    return Math.abs(splitTransaction.amount) - allocated;
  }, [splitTransaction, splits]);

  // Submit split
  const handleSplitSubmit = () => {
    if (!splitTransaction) return;

    // Validate all splits have categories
    const hasEmptyCategory = splits.some((s) => !s.taxAccountId);
    if (hasEmptyCategory) {
      alert('All splits must have a category selected');
      return;
    }

    // Validate amounts add up
    if (Math.abs(remainingAmount) > 0.01) {
      alert(`Split amounts must equal the transaction total. Remaining: $${remainingAmount.toFixed(2)}`);
      return;
    }

    splitMutation.mutate({
      parentId: splitTransaction.id,
      splits: splits.map((s) => ({
        taxAccountId: s.taxAccountId,
        amount: s.amount,
        description: s.description || undefined,
      })),
    });
  };

  if (authLoading || vendorLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Vendor not found</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/accounting/vendors" className="text-gray-400 hover:text-white">
              &larr; Back to Vendors
            </Link>
          </div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            {vendor.name}
            {vendor.requiresSplit && (
              <span className="text-yellow-400 text-lg" title="Requires split review">
                &#8646;
              </span>
            )}
          </h1>
          <p className="text-gray-400">
            {vendor.matchPatterns.join(' • ')}
          </p>
        </div>
        <div className="text-right">
          {vendor.defaultTaxAccount && (
            <div className="text-sm text-gray-400">
              Default Category: <span className="text-white">{vendor.defaultTaxAccount.code} - {vendor.defaultTaxAccount.name}</span>
            </div>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold">{stats.total}</div>
          <div className="text-gray-400 text-sm">Total Transactions</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-yellow-400">{stats.pending}</div>
          <div className="text-gray-400 text-sm">Pending Allocation</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold text-green-400">{stats.allocated}</div>
          <div className="text-gray-400 text-sm">Fully Allocated</div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <div className="text-2xl font-bold">
            ${stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </div>
          <div className="text-gray-400 text-sm">Total Spend</div>
        </div>
      </div>

      {/* Progress Bar */}
      {stats.total > 0 && (
        <div className="mb-6">
          <div className="flex justify-between text-sm text-gray-400 mb-1">
            <span>Allocation Progress</span>
            <span>{Math.round((stats.allocated / stats.total) * 100)}% complete</span>
          </div>
          <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full bg-green-500 transition-all"
              style={{ width: `${(stats.allocated / stats.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter Toggle */}
      <div className="flex items-center gap-4 mb-4">
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={showOnlyPending}
            onChange={(e) => setShowOnlyPending(e.target.checked)}
            className="w-4 h-4"
          />
          <span>Show only pending allocations</span>
        </label>
        <span className="text-gray-500">
          Showing {transactions.length} of {stats.total} transactions
        </span>
      </div>

      {/* Transactions Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Date</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Description</th>
              <th className="text-right px-4 py-3 text-sm font-medium text-gray-300">Amount</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Category</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {transactions.map((tx: any) => (
              <tr key={tx.id} className="hover:bg-gray-750">
                <td className="px-4 py-3 text-sm">
                  {new Date(tx.date).toLocaleDateString()}
                </td>
                <td className="px-4 py-3">
                  <div className="text-sm truncate max-w-[300px]" title={tx.description}>
                    {tx.description}
                  </div>
                </td>
                <td className="px-4 py-3 text-right font-mono">
                  <span className={tx.amount < 0 ? 'text-red-400' : 'text-green-400'}>
                    ${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </span>
                </td>
                <td className="px-4 py-3">
                  {tx.isSplit ? (
                    <span className="text-purple-400 text-sm">Split ({tx.children?.length || 0} items)</span>
                  ) : tx.taxAccount ? (
                    <span className="bg-gray-700 px-2 py-1 rounded text-sm">
                      {tx.taxAccount.code} - {tx.taxAccount.name}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-sm">Uncategorized</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  {tx.isSplit ? (
                    <span className="bg-purple-900/50 text-purple-300 px-2 py-1 rounded text-xs">
                      SPLIT
                    </span>
                  ) : vendor?.defaultTaxAccountId && tx.taxAccountId === vendor.defaultTaxAccountId ? (
                    <span className="bg-yellow-900/50 text-yellow-300 px-2 py-1 rounded text-xs">
                      PENDING
                    </span>
                  ) : tx.taxAccountId ? (
                    <span className="bg-green-900/50 text-green-300 px-2 py-1 rounded text-xs">
                      ALLOCATED
                    </span>
                  ) : (
                    <span className="bg-red-900/50 text-red-300 px-2 py-1 rounded text-xs">
                      NONE
                    </span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    {tx.isSplit ? (
                      <button
                        onClick={() => unsplitMutation.mutate({ parentId: tx.id })}
                        disabled={unsplitMutation.isPending}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Unsplit
                      </button>
                    ) : (
                      <button
                        onClick={() => openSplitModal(tx)}
                        className="text-blue-400 hover:text-blue-300 text-sm"
                      >
                        Split
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {transactions.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  {showOnlyPending
                    ? 'No pending allocations! All transactions are categorized.'
                    : 'No transactions found for this vendor.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Split Modal */}
      {splitModalOpen && splitTransaction && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">Split Transaction</h2>

            {/* Transaction Info */}
            <div className="bg-gray-700 rounded p-4 mb-4">
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">Date:</span>
                <span>{new Date(splitTransaction.date).toLocaleDateString()}</span>
              </div>
              <div className="flex justify-between mb-2">
                <span className="text-gray-400">Description:</span>
                <span className="text-right max-w-[300px] truncate">{splitTransaction.description}</span>
              </div>
              <div className="flex justify-between text-lg font-bold">
                <span className="text-gray-400">Total Amount:</span>
                <span className="text-red-400">
                  ${Math.abs(splitTransaction.amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>

            {/* Split Entries */}
            <div className="space-y-3 mb-4">
              {splits.map((split, index) => (
                <div key={index} className="flex gap-3 items-start bg-gray-700/50 rounded p-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Category</label>
                    <SearchableSelect
                      options={categoryOptions}
                      value={split.taxAccountId}
                      onChange={(value) => updateSplit(index, 'taxAccountId', value)}
                      placeholder="Select category..."
                      className="w-full"
                    />
                  </div>
                  <div className="w-32">
                    <label className="block text-xs text-gray-400 mb-1">Amount</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={split.amount || ''}
                      onChange={(e) => updateSplit(index, 'amount', parseFloat(e.target.value) || 0)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-right"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-400 mb-1">Note (optional)</label>
                    <input
                      type="text"
                      value={split.description || ''}
                      onChange={(e) => updateSplit(index, 'description', e.target.value)}
                      className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                      placeholder="e.g., Office supplies"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => removeSplitRow(index)}
                    disabled={splits.length <= 1}
                    className="mt-6 text-red-400 hover:text-red-300 disabled:text-gray-600 px-2"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>

            {/* Add Row Button */}
            <button
              type="button"
              onClick={addSplitRow}
              className="text-blue-400 hover:text-blue-300 text-sm mb-4"
            >
              + Add another category
            </button>

            {/* Remaining Amount */}
            <div className={`flex justify-between text-lg font-bold p-3 rounded mb-4 ${
              Math.abs(remainingAmount) < 0.01
                ? 'bg-green-900/30 text-green-400'
                : 'bg-yellow-900/30 text-yellow-400'
            }`}>
              <span>Remaining to allocate:</span>
              <span>${remainingAmount.toFixed(2)}</span>
            </div>

            {/* Quick Allocation Tip */}
            {remainingAmount > 0.01 && splits.length > 0 && (
              <p className="text-gray-400 text-sm mb-4">
                Tip: Click a split amount field and enter the remaining ${remainingAmount.toFixed(2)} to complete allocation.
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <button
                onClick={handleSplitSubmit}
                disabled={splitMutation.isPending || Math.abs(remainingAmount) > 0.01}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded font-medium"
              >
                {splitMutation.isPending ? 'Splitting...' : 'Apply Split'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setSplitModalOpen(false);
                  setSplitTransaction(null);
                  setSplits([]);
                }}
                className="px-4 py-2 border border-gray-600 rounded hover:bg-gray-700"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

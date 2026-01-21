'use client';

import { useState, useEffect, KeyboardEvent } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

interface VendorFormData {
  name: string;
  matchPatterns: string[];
  defaultBankAccountId: string;
  defaultTaxAccountId: string;
  requiresSplit: boolean;
  notes: string;
  isActive: boolean;
}

const emptyForm: VendorFormData = {
  name: '',
  matchPatterns: [],
  defaultBankAccountId: '',
  defaultTaxAccountId: '',
  requiresSplit: false,
  notes: '',
  isActive: true,
};

export default function VendorsPage() {
  const { requireAuth, isLoading: authLoading } = useAuth();
  const [companyId] = useState('donovan-farms');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<VendorFormData>(emptyForm);
  const [patternInput, setPatternInput] = useState('');
  const [testDescriptions] = useState<string[]>([
    'AMAZON.COM*MF4Y123',
    'SHELL OIL 12345',
  ]);

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  // Get vendors
  const { data: vendors, refetch: refetchVendors } = trpc.vendors.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Get bank accounts for dropdown
  const { data: bankAccounts } = trpc.bankAccounts.list.useQuery(
    { companyId, active: true },
    { enabled: !!companyId }
  );

  // Get tax accounts for dropdown
  const { data: taxAccounts } = trpc.taxAccounts.list.useQuery(
    { companyId, active: true },
    { enabled: !!companyId }
  );

  // Get stats
  const { data: stats } = trpc.vendors.stats.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Test patterns
  const { data: testResults } = trpc.vendors.testPatterns.useQuery(
    {
      patterns: formData.matchPatterns,
      testDescriptions,
    },
    { enabled: formData.matchPatterns.length > 0 }
  );

  // Mutations
  const createMutation = trpc.vendors.create.useMutation({
    onSuccess: () => {
      refetchVendors();
      setShowForm(false);
      setFormData(emptyForm);
      setPatternInput('');
    },
  });

  const updateMutation = trpc.vendors.update.useMutation({
    onSuccess: () => {
      refetchVendors();
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
      setPatternInput('');
    },
  });

  const deleteMutation = trpc.vendors.delete.useMutation({
    onSuccess: () => refetchVendors(),
  });

  const bulkMatchMutation = trpc.vendors.bulkMatch.useMutation({
    onSuccess: (result) => {
      alert(`Matched ${result.matchedCount} of ${result.totalTransactions} transactions`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.matchPatterns.length === 0) {
      alert('Add at least one match pattern');
      return;
    }
    if (editingId) {
      updateMutation.mutate({
        id: editingId,
        ...formData,
        defaultBankAccountId: formData.defaultBankAccountId || null,
        defaultTaxAccountId: formData.defaultTaxAccountId || null,
        notes: formData.notes || null,
      });
    } else {
      createMutation.mutate({
        ...formData,
        companyId,
        defaultBankAccountId: formData.defaultBankAccountId || undefined,
        defaultTaxAccountId: formData.defaultTaxAccountId || undefined,
        notes: formData.notes || undefined,
      });
    }
  };

  const handleEdit = (vendor: any) => {
    setEditingId(vendor.id);
    setFormData({
      name: vendor.name,
      matchPatterns: vendor.matchPatterns,
      defaultBankAccountId: vendor.defaultBankAccountId || '',
      defaultTaxAccountId: vendor.defaultTaxAccountId || '',
      requiresSplit: vendor.requiresSplit,
      notes: vendor.notes || '',
      isActive: vendor.isActive,
    });
    setShowForm(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete vendor "${name}"? Transactions will be unlinked but not deleted.`)) {
      deleteMutation.mutate({ id });
    }
  };

  const addPattern = () => {
    const pattern = patternInput.trim().toUpperCase();
    if (pattern && !formData.matchPatterns.includes(pattern)) {
      setFormData({
        ...formData,
        matchPatterns: [...formData.matchPatterns, pattern],
      });
      setPatternInput('');
    }
  };

  const removePattern = (pattern: string) => {
    setFormData({
      ...formData,
      matchPatterns: formData.matchPatterns.filter((p) => p !== pattern),
    });
  };

  const handlePatternKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addPattern();
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-gray-900 flex items-center justify-center">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <div className="flex items-center gap-4 mb-2">
            <Link href="/accounting" className="text-gray-400 hover:text-white">
              &larr; Accounting
            </Link>
          </div>
          <h1 className="text-2xl font-bold">Vendors</h1>
          <p className="text-gray-400">
            Track WHO you paid (vendors) separate from WHAT you bought (categories)
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => bulkMatchMutation.mutate({ companyId })}
            disabled={bulkMatchMutation.isPending}
            className="bg-gray-700 hover:bg-gray-600 disabled:bg-gray-800 px-4 py-2 rounded font-medium"
          >
            {bulkMatchMutation.isPending ? 'Matching...' : 'Auto-Match All'}
          </button>
          <button
            onClick={() => {
              setEditingId(null);
              setFormData(emptyForm);
              setPatternInput('');
              setShowForm(true);
            }}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
          >
            + Add Vendor
          </button>
        </div>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.totalVendors}</div>
            <div className="text-gray-400 text-sm">Total Vendors</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{stats.activeVendors}</div>
            <div className="text-gray-400 text-sm">Active</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-yellow-400">{stats.vendorsRequiringSplit}</div>
            <div className="text-gray-400 text-sm">Require Split</div>
          </div>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'Edit Vendor' : 'Create Vendor'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Vendor Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  placeholder="e.g., Amazon, Shell, Home Depot"
                  required
                />
              </div>

              {/* Match Patterns */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">
                  Match Patterns (case-insensitive)
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={patternInput}
                    onChange={(e) => setPatternInput(e.target.value)}
                    onKeyDown={handlePatternKeyDown}
                    className="flex-1 bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    placeholder="Type a pattern and press Enter (e.g., AMAZON, AMZN)"
                  />
                  <button
                    type="button"
                    onClick={addPattern}
                    className="bg-gray-600 hover:bg-gray-500 px-4 py-2 rounded"
                  >
                    Add
                  </button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {formData.matchPatterns.map((pattern) => (
                    <span
                      key={pattern}
                      className="bg-blue-900/50 text-blue-300 px-3 py-1 rounded-full flex items-center gap-2"
                    >
                      {pattern}
                      <button
                        type="button"
                        onClick={() => removePattern(pattern)}
                        className="text-blue-400 hover:text-blue-200"
                      >
                        &times;
                      </button>
                    </span>
                  ))}
                  {formData.matchPatterns.length === 0 && (
                    <span className="text-gray-500 text-sm">No patterns added yet</span>
                  )}
                </div>
              </div>

              {/* Defaults */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Default Card (optional)
                  </label>
                  <select
                    value={formData.defaultBankAccountId}
                    onChange={(e) =>
                      setFormData({ ...formData, defaultBankAccountId: e.target.value })
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="">None</option>
                    {bankAccounts?.map((ba: any) => (
                      <option key={ba.id} value={ba.id}>
                        {ba.name} {ba.accountNumber && `(****${ba.accountNumber})`}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Default Category (optional)
                  </label>
                  <select
                    value={formData.defaultTaxAccountId}
                    onChange={(e) =>
                      setFormData({ ...formData, defaultTaxAccountId: e.target.value })
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="">None (or split)</option>
                    {taxAccounts?.map((ta: any) => (
                      <option key={ta.id} value={ta.id}>
                        {ta.code} - {ta.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Flags */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formData.requiresSplit}
                    onChange={(e) =>
                      setFormData({ ...formData, requiresSplit: e.target.checked })
                    }
                    className="w-4 h-4"
                  />
                  <span>Requires Split</span>
                  <span className="text-gray-500 text-sm">(flag for review)</span>
                </label>
                {editingId && (
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.isActive}
                      onChange={(e) =>
                        setFormData({ ...formData, isActive: e.target.checked })
                      }
                      className="w-4 h-4"
                    />
                    <span>Active</span>
                  </label>
                )}
              </div>

              {/* Notes */}
              <div>
                <label className="block text-sm text-gray-400 mb-1">Notes (optional)</label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  rows={2}
                  placeholder="e.g., Usually office supplies + personal mixed"
                />
              </div>

              {/* Test Patterns */}
              {formData.matchPatterns.length > 0 && (
                <div className="border-t border-gray-700 pt-4">
                  <label className="block text-sm text-gray-400 mb-2">
                    Test Patterns Against Sample Descriptions
                  </label>
                  <div className="space-y-2">
                    {testResults?.map((result: any, i: number) => (
                      <div
                        key={i}
                        className={`p-2 rounded text-sm flex justify-between ${
                          result.matched
                            ? 'bg-green-900/50 text-green-300'
                            : 'bg-gray-700 text-gray-400'
                        }`}
                      >
                        <span className="font-mono">{result.description}</span>
                        <span>
                          {result.matched
                            ? `Matched: ${result.matchedPatterns.join(', ')}`
                            : 'No match'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded font-medium"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingId
                    ? 'Update Vendor'
                    : 'Create Vendor'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData(emptyForm);
                    setPatternInput('');
                  }}
                  className="px-4 py-2 border border-gray-600 rounded hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vendors Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Vendor</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">
                Match Patterns
              </th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Default Category</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Transactions</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {vendors?.map((vendor: any) => (
              <tr
                key={vendor.id}
                className={`hover:bg-gray-750 ${!vendor.isActive ? 'opacity-50' : ''}`}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${
                        vendor.isActive ? 'bg-green-500' : 'bg-gray-500'
                      }`}
                    />
                    {vendor.requiresSplit && (
                      <span
                        className="text-yellow-400 text-lg"
                        title="Requires split review"
                      >
                        &#8646;
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{vendor.name}</div>
                  {vendor.notes && (
                    <div className="text-xs text-gray-500 truncate max-w-[200px]">
                      {vendor.notes}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex flex-wrap gap-1">
                    {vendor.matchPatterns.slice(0, 3).map((pattern: string) => (
                      <code
                        key={pattern}
                        className="bg-gray-700 px-2 py-0.5 rounded text-xs"
                      >
                        {pattern}
                      </code>
                    ))}
                    {vendor.matchPatterns.length > 3 && (
                      <span className="text-gray-500 text-xs">
                        +{vendor.matchPatterns.length - 3} more
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-4 py-3">
                  {vendor.defaultTaxAccount ? (
                    <span className="bg-gray-700 px-2 py-1 rounded text-sm">
                      {vendor.defaultTaxAccount.name}
                    </span>
                  ) : (
                    <span className="text-gray-500 text-sm">—</span>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-400">{vendor._count.transactions}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <Link
                      href={`/accounting/vendors/${vendor.id}`}
                      className="text-green-400 hover:text-green-300 text-sm"
                    >
                      View
                    </Link>
                    <button
                      onClick={() => handleEdit(vendor)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(vendor.id, vendor.name)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!vendors || vendors.length === 0) && (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                  No vendors found. Create one to start auto-detecting vendors in transactions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Top Vendors by Spend */}
      {stats?.topVendorsBySpend && stats.topVendorsBySpend.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Top Vendors by Spend</h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {stats.topVendorsBySpend.slice(0, 5).map((v: any) => (
                <div key={v.id} className="text-center">
                  <div className="text-xl font-bold">
                    ${v.totalSpend.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-sm text-gray-400">{v.name}</div>
                  <div className="text-xs text-gray-500">{v.transactionCount} transactions</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';

type MatchType = 'CONTAINS' | 'STARTS_WITH' | 'EXACT' | 'REGEX';

interface RuleFormData {
  name: string;
  matchType: MatchType;
  matchValue: string;
  taxAccountId: string;
  priority: number;
  enabled: boolean;
}

const emptyForm: RuleFormData = {
  name: '',
  matchType: 'CONTAINS',
  matchValue: '',
  taxAccountId: '',
  priority: 50,
  enabled: true,
};

export default function RulesPage() {
  const { requireAuth, isLoading: authLoading } = useAuth();
  const [companyId] = useState('donovan-farms');
  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formData, setFormData] = useState<RuleFormData>(emptyForm);
  const [testDescription, setTestDescription] = useState('');

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  // Get rules
  const { data: rules, refetch: refetchRules } = trpc.categorizationRules.list.useQuery(
    { companyId, search: search || undefined },
    { enabled: !!companyId }
  );

  // Get tax accounts for dropdown
  const { data: taxAccounts } = trpc.taxAccounts.list.useQuery(
    { companyId, active: true },
    { enabled: !!companyId }
  );

  // Get stats
  const { data: stats } = trpc.categorizationRules.stats.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Test rule pattern
  const { data: testResult } = trpc.categorizationRules.test.useQuery(
    {
      description: testDescription,
      matchType: formData.matchType,
      matchValue: formData.matchValue,
    },
    { enabled: !!testDescription && !!formData.matchValue }
  );

  // Mutations
  const createMutation = trpc.categorizationRules.create.useMutation({
    onSuccess: () => {
      refetchRules();
      setShowForm(false);
      setFormData(emptyForm);
    },
  });

  const updateMutation = trpc.categorizationRules.update.useMutation({
    onSuccess: () => {
      refetchRules();
      setShowForm(false);
      setEditingId(null);
      setFormData(emptyForm);
    },
  });

  const deleteMutation = trpc.categorizationRules.delete.useMutation({
    onSuccess: () => refetchRules(),
  });

  const toggleMutation = trpc.categorizationRules.toggle.useMutation({
    onSuccess: () => refetchRules(),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingId) {
      updateMutation.mutate({ id: editingId, ...formData, companyId });
    } else {
      createMutation.mutate({ ...formData, companyId });
    }
  };

  const handleEdit = (rule: any) => {
    setEditingId(rule.id);
    setFormData({
      name: rule.name,
      matchType: rule.matchType,
      matchValue: rule.matchValue,
      taxAccountId: rule.taxAccountId,
      priority: rule.priority,
      enabled: rule.enabled,
    });
    setShowForm(true);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`Delete rule "${name}"?`)) {
      deleteMutation.mutate({ id });
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
          <h1 className="text-2xl font-bold">Categorization Rules</h1>
          <p className="text-gray-400">
            Rules automatically categorize bank transactions based on description patterns
          </p>
        </div>
        <button
          onClick={() => {
            setEditingId(null);
            setFormData(emptyForm);
            setShowForm(true);
          }}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded font-medium"
        >
          + Add Rule
        </button>
      </div>

      {/* Stats */}
      {stats && (
        <div className="grid grid-cols-4 gap-4 mb-6">
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold">{stats.total}</div>
            <div className="text-gray-400 text-sm">Total Rules</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-green-400">{stats.enabled}</div>
            <div className="text-gray-400 text-sm">Active</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-gray-500">{stats.disabled}</div>
            <div className="text-gray-400 text-sm">Disabled</div>
          </div>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="text-2xl font-bold text-blue-400">{stats.autoCreated}</div>
            <div className="text-gray-400 text-sm">Auto-Created</div>
          </div>
        </div>
      )}

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search rules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="bg-gray-800 border border-gray-700 rounded px-4 py-2 w-64"
        />
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg p-6 w-full max-w-lg">
            <h2 className="text-xl font-bold mb-4">
              {editingId ? 'Edit Rule' : 'Create Rule'}
            </h2>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm text-gray-400 mb-1">Rule Name</label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  placeholder="e.g., Shell Gas Stations"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Match Type</label>
                  <select
                    value={formData.matchType}
                    onChange={(e) =>
                      setFormData({ ...formData, matchType: e.target.value as MatchType })
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  >
                    <option value="CONTAINS">Contains</option>
                    <option value="STARTS_WITH">Starts With</option>
                    <option value="EXACT">Exact Match</option>
                    <option value="REGEX">Regex</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Match Value</label>
                  <input
                    type="text"
                    value={formData.matchValue}
                    onChange={(e) => setFormData({ ...formData, matchValue: e.target.value })}
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                    placeholder="e.g., SHELL"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-1">Category (Tax Account)</label>
                <select
                  value={formData.taxAccountId}
                  onChange={(e) => setFormData({ ...formData, taxAccountId: e.target.value })}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  required
                >
                  <option value="">Select category...</option>
                  {taxAccounts?.map((ta: any) => (
                    <option key={ta.id} value={ta.id}>
                      {ta.code} - {ta.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">
                    Priority (0-100, higher = first)
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={formData.priority}
                    onChange={(e) =>
                      setFormData({ ...formData, priority: parseInt(e.target.value) || 50 })
                    }
                    className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  />
                </div>
                <div className="flex items-end">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.enabled}
                      onChange={(e) => setFormData({ ...formData, enabled: e.target.checked })}
                      className="w-4 h-4"
                    />
                    <span>Enabled</span>
                  </label>
                </div>
              </div>

              {/* Test Pattern */}
              <div className="border-t border-gray-700 pt-4">
                <label className="block text-sm text-gray-400 mb-1">Test Pattern</label>
                <input
                  type="text"
                  value={testDescription}
                  onChange={(e) => setTestDescription(e.target.value)}
                  className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
                  placeholder="Enter a transaction description to test..."
                />
                {testResult && testDescription && (
                  <div
                    className={`mt-2 p-2 rounded text-sm ${
                      testResult.matches
                        ? 'bg-green-900/50 text-green-300'
                        : 'bg-red-900/50 text-red-300'
                    }`}
                  >
                    {testResult.matches
                      ? `Match! Confidence: ${testResult.confidence}%`
                      : 'No match'}
                  </div>
                )}
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="submit"
                  disabled={createMutation.isPending || updateMutation.isPending}
                  className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 px-4 py-2 rounded font-medium"
                >
                  {createMutation.isPending || updateMutation.isPending
                    ? 'Saving...'
                    : editingId
                    ? 'Update Rule'
                    : 'Create Rule'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setEditingId(null);
                    setFormData(emptyForm);
                    setTestDescription('');
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

      {/* Rules Table */}
      <div className="bg-gray-800 rounded-lg overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-700">
            <tr>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Status</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Name</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Pattern</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Category</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Priority</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Matches</th>
              <th className="text-left px-4 py-3 text-sm font-medium text-gray-300">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-700">
            {rules?.map((rule: any) => (
              <tr key={rule.id} className={`hover:bg-gray-750 ${!rule.enabled ? 'opacity-50' : ''}`}>
                <td className="px-4 py-3">
                  <button
                    onClick={() => toggleMutation.mutate({ id: rule.id })}
                    className={`w-3 h-3 rounded-full ${
                      rule.enabled ? 'bg-green-500' : 'bg-gray-500'
                    }`}
                    title={rule.enabled ? 'Click to disable' : 'Click to enable'}
                  />
                </td>
                <td className="px-4 py-3">
                  <div className="font-medium">{rule.name}</div>
                  {rule.autoCreated && (
                    <span className="text-xs text-gray-500">Auto-created</span>
                  )}
                </td>
                <td className="px-4 py-3">
                  <code className="bg-gray-700 px-2 py-1 rounded text-sm">
                    {rule.matchType}: {rule.matchValue}
                  </code>
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`px-2 py-1 rounded text-sm ${
                      rule.taxAccount.taxTreatment === 'DEDUCTIBLE'
                        ? 'bg-green-900/50 text-green-300'
                        : rule.taxAccount.taxTreatment === 'NON_DEDUCTIBLE'
                        ? 'bg-red-900/50 text-red-300'
                        : 'bg-gray-700 text-gray-300'
                    }`}
                  >
                    {rule.taxAccount.name}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-400">{rule.priority}</td>
                <td className="px-4 py-3 text-gray-400">{rule.timesMatched}</td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleEdit(rule)}
                      className="text-blue-400 hover:text-blue-300 text-sm"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(rule.id, rule.name)}
                      className="text-red-400 hover:text-red-300 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {(!rules || rules.length === 0) && (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No rules found. Create one to start auto-categorizing transactions.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Top Rules */}
      {stats?.topRules && stats.topRules.length > 0 && (
        <div className="mt-6">
          <h3 className="text-lg font-medium mb-3">Most Used Rules</h3>
          <div className="bg-gray-800 rounded-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              {stats.topRules.slice(0, 5).map((r: any) => (
                <div key={r.id} className="text-center">
                  <div className="text-xl font-bold">{r.timesMatched}</div>
                  <div className="text-sm text-gray-400 truncate" title={r.matchValue}>
                    {r.matchValue}
                  </div>
                  <div className="text-xs text-gray-500">{r.accountName}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

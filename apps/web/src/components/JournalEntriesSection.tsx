'use client';

import { useState } from 'react';
import Link from 'next/link';

interface JournalLine {
  id: string;
  accountId: string;
  debit: number;
  credit: number;
  description?: string;
  lineOrder: number;
  account: {
    id: string;
    code: string;
    name: string;
  };
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  entryDate: Date | string;
  description: string;
  status: 'DRAFT' | 'POSTED' | 'VOIDED';
  referenceNumber?: string;
  notes?: string;
  lines: JournalLine[];
}

interface JournalEntriesSectionProps {
  entries: JournalEntry[];
  isLoading?: boolean;
}

export default function JournalEntriesSection({
  entries,
  isLoading
}: JournalEntriesSectionProps) {
  const [expandedEntries, setExpandedEntries] = useState<Set<string>>(new Set());

  const toggleEntry = (entryId: string) => {
    const newExpanded = new Set(expandedEntries);
    if (newExpanded.has(entryId)) {
      newExpanded.delete(entryId);
    } else {
      newExpanded.add(entryId);
    }
    setExpandedEntries(newExpanded);
  };

  const calculateTotals = (lines: JournalLine[]) => {
    const totalDebits = lines.reduce((sum, line) => sum + Number(line.debit), 0);
    const totalCredits = lines.reduce((sum, line) => sum + Number(line.credit), 0);
    return { totalDebits, totalCredits };
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'POSTED':
        return 'bg-green-100 text-green-800 border-green-200';
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800 border-gray-200';
      case 'VOIDED':
        return 'bg-red-100 text-red-800 border-red-200';
      default:
        return 'bg-gray-100 text-gray-800 border-gray-200';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'POSTED':
        return '✓';
      case 'DRAFT':
        return '📝';
      case 'VOIDED':
        return '✗';
      default:
        return '○';
    }
  };

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <span className="text-xl">📒</span>
          <h3 className="text-lg font-semibold text-gray-900">Accounting Transactions</h3>
        </div>
        <div className="flex items-center justify-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600"></div>
          <p className="ml-3 text-sm text-gray-500">Loading journal entries...</p>
        </div>
      </div>
    );
  }

  if (!entries || entries.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center space-x-2 mb-4">
          <span className="text-xl">📒</span>
          <h3 className="text-lg font-semibold text-gray-900">Accounting Transactions</h3>
        </div>
        <div className="text-center py-8">
          <p className="text-sm text-gray-500">
            No journal entries yet. Journal entries are created automatically when invoice status changes.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center space-x-2">
          <span className="text-xl">📒</span>
          <h3 className="text-lg font-semibold text-gray-900">
            Accounting Transactions ({entries.length})
          </h3>
        </div>
      </div>

      <div className="space-y-4">
        {entries.map((entry) => {
          const isExpanded = expandedEntries.has(entry.id);
          const { totalDebits, totalCredits } = calculateTotals(entry.lines);
          const isBalanced = Math.abs(totalDebits - totalCredits) < 0.01;

          return (
            <div
              key={entry.id}
              className="border border-gray-200 rounded-lg overflow-hidden"
            >
              {/* Entry Header */}
              <button
                onClick={() => toggleEntry(entry.id)}
                className="w-full px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <span className="text-gray-400">
                      {isExpanded ? '▼' : '▶'}
                    </span>
                    <div>
                      <div className="flex items-center space-x-2">
                        <Link
                          href={`/journal/${entry.id}`}
                          className="font-semibold text-blue-600 hover:text-blue-800 hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {entry.entryNumber}
                        </Link>
                        <span className="text-sm text-gray-600">-</span>
                        <span className="text-sm font-medium text-gray-900">
                          {entry.description}
                        </span>
                      </div>
                      {entry.referenceNumber && (
                        <p className="text-xs text-gray-500 mt-1">
                          Reference: {entry.referenceNumber}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`px-2 py-1 text-xs font-medium rounded border ${getStatusColor(entry.status)}`}>
                      {getStatusIcon(entry.status)} {entry.status}
                    </span>
                    <span className="text-sm text-gray-600">
                      {new Date(entry.entryDate).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              </button>

              {/* Entry Details (Expanded) */}
              {isExpanded && (
                <div className="px-4 py-4 bg-white">
                  {/* Journal Lines Table */}
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead>
                        <tr className="bg-gray-50">
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Account
                          </th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Description
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Debit
                          </th>
                          <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                            Credit
                          </th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {entry.lines
                          .sort((a, b) => a.lineOrder - b.lineOrder)
                          .map((line) => (
                            <tr key={line.id} className="hover:bg-gray-50">
                              <td className="px-3 py-2 text-sm">
                                <div className="font-medium text-gray-900">
                                  {line.account.code}
                                </div>
                                <div className="text-xs text-gray-500">
                                  {line.account.name}
                                </div>
                              </td>
                              <td className="px-3 py-2 text-sm text-gray-600">
                                {line.description || '-'}
                              </td>
                              <td className="px-3 py-2 text-sm text-right font-mono">
                                {Number(line.debit) > 0 ? (
                                  <span className="text-gray-900">
                                    ${Number(line.debit).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-sm text-right font-mono">
                                {Number(line.credit) > 0 ? (
                                  <span className="text-gray-900">
                                    ${Number(line.credit).toFixed(2)}
                                  </span>
                                ) : (
                                  <span className="text-gray-300">-</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        {/* Totals Row */}
                        <tr className="bg-gray-50 font-semibold border-t-2 border-gray-300">
                          <td className="px-3 py-2 text-sm" colSpan={2}>
                            Totals:
                            {!isBalanced && (
                              <span className="ml-2 text-xs text-red-600 font-normal">
                                ⚠️ Unbalanced
                              </span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-sm text-right font-mono text-gray-900">
                            ${totalDebits.toFixed(2)}
                          </td>
                          <td className="px-3 py-2 text-sm text-right font-mono text-gray-900">
                            ${totalCredits.toFixed(2)}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Notes */}
                  {entry.notes && (
                    <div className="mt-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded text-sm">
                      <p className="text-xs font-medium text-blue-900 mb-1">Notes:</p>
                      <p className="text-blue-800">{entry.notes}</p>
                    </div>
                  )}

                  {/* Balance Warning */}
                  {!isBalanced && (
                    <div className="mt-3 px-3 py-2 bg-red-50 border border-red-200 rounded text-sm">
                      <p className="text-red-800">
                        <span className="font-semibold">Warning:</span> This entry is unbalanced.
                        Debits (${totalDebits.toFixed(2)}) do not equal Credits (${totalCredits.toFixed(2)}).
                      </p>
                    </div>
                  )}

                  {/* Action Link */}
                  <div className="mt-3 text-right">
                    <Link
                      href={`/journal/${entry.id}`}
                      className="text-sm text-blue-600 hover:text-blue-800 hover:underline"
                    >
                      View Full Entry →
                    </Link>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Info Box */}
      <div className="mt-6 px-4 py-3 bg-blue-50 border border-blue-200 rounded-lg">
        <div className="flex items-start space-x-2">
          <span className="text-blue-600 mt-0.5">ℹ️</span>
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">About Journal Entries</p>
            <ul className="space-y-1 text-xs">
              <li>• <strong>Revenue Recognition:</strong> Created when invoice is sent (DR Accounts Receivable, CR Service Revenue)</li>
              <li>• <strong>Cash Receipt:</strong> Created when payment is received (DR Cash, CR Accounts Receivable)</li>
              <li>• <strong>Posted entries</strong> affect account balances and cannot be edited</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

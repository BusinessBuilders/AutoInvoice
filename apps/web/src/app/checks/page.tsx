'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

export default function ChecksPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'matched' | 'processed' | 'review_needed'>('all');

  const { data: checks, isLoading, refetch } = trpc.check.list.useQuery({
    limit: 50,
    offset: 0,
    status: statusFilter,
  });

  const { data: stats } = trpc.check.stats.useQuery();

  const deleteCheckMutation = trpc.check.delete.useMutation({
    onSuccess: () => {
      refetch();
    },
  });

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this check?')) return;

    try {
      await deleteCheckMutation.mutateAsync({ id });
    } catch (err: any) {
      alert(`Error: ${err.message}`);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      pending: 'bg-yellow-100 text-yellow-800',
      matched: 'bg-green-100 text-green-800',
      processed: 'bg-blue-100 text-blue-800',
      review_needed: 'bg-red-100 text-red-800',
    };

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status as keyof typeof styles] || 'bg-gray-100 text-gray-800'}`}>
        {status.replace('_', ' ').toUpperCase()}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">💵 Check Payments</h1>
              <p className="mt-1 text-sm text-gray-500">
                View and manage check payment records
              </p>
            </div>
            <Link
              href="/checks/upload"
              className="px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
            >
              📸 Upload Check
            </Link>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Checks</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
                </div>
                <div className="text-3xl">💵</div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Matched</p>
                  <p className="text-2xl font-bold text-green-600 mt-1">{stats.matched}</p>
                </div>
                <div className="text-3xl">✅</div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Pending</p>
                  <p className="text-2xl font-bold text-yellow-600 mt-1">{stats.pending}</p>
                </div>
                <div className="text-3xl">⏳</div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-gray-600">Total Amount</p>
                  <p className="text-2xl font-bold text-blue-600 mt-1">
                    ${Number(stats.totalAmount).toFixed(2)}
                  </p>
                </div>
                <div className="text-3xl">💰</div>
              </div>
            </div>
          </div>
        )}

        {/* Filters */}
        <div className="bg-white shadow rounded-lg p-4 mb-6">
          <div className="flex items-center space-x-4">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <div className="flex space-x-2">
              {(['all', 'pending', 'matched', 'processed', 'review_needed'] as const).map((status) => (
                <button
                  key={status}
                  onClick={() => setStatusFilter(status)}
                  className={`px-3 py-1 text-sm font-medium rounded-lg transition-colors ${
                    statusFilter === status
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {status.replace('_', ' ').charAt(0).toUpperCase() + status.replace('_', ' ').slice(1)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Checks List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-12 text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="text-gray-500 mt-4">Loading checks...</p>
            </div>
          ) : !checks || checks.length === 0 ? (
            <div className="p-12 text-center">
              <div className="text-6xl mb-4">💵</div>
              <h3 className="text-lg font-medium text-gray-900 mb-2">No checks found</h3>
              <p className="text-sm text-gray-500 mb-6">
                Upload a check photo to automatically match it to an invoice
              </p>
              <Link
                href="/checks/upload"
                className="inline-flex items-center px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700"
              >
                📸 Upload First Check
              </Link>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Check #
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Payee
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Invoice
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Confidence
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {/* @ts-ignore - Type instantiation may be excessively deep with Prisma types from tRPC */}
                  {checks.map((check) => (
                    <tr key={check.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-medium text-gray-900">
                          {check.checkNumber}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm font-semibold text-green-600">
                          ${Number(check.amount).toFixed(2)}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {new Date(check.date).toLocaleDateString()}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {check.payee || '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {check.invoice ? (
                          <Link
                            href={`/invoices/${check.invoice.id}`}
                            className="text-sm text-blue-600 hover:text-blue-800 font-medium"
                          >
                            {check.invoice.invoiceNumber}
                            <br />
                            <span className="text-xs text-gray-500">
                              {check.invoice.customer.name}
                            </span>
                          </Link>
                        ) : (
                          <span className="text-sm text-gray-500">No match</span>
                        )}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        {getStatusBadge(check.status)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="text-sm text-gray-900">
                          {check.confidence ? `${(check.confidence * 100).toFixed(0)}%` : '-'}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        {check.invoice ? (
                          <Link
                            href={`/invoices/${check.invoice.id}`}
                            className="text-blue-600 hover:text-blue-900 mr-4"
                          >
                            View Invoice
                          </Link>
                        ) : null}
                        {!check.processed && (
                          <button
                            onClick={() => handleDelete(check.id)}
                            className="text-red-600 hover:text-red-900"
                          >
                            Delete
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Help Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">About Check Payment Recognition</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-800">
            <div>
              <p className="font-semibold mb-2">Status Meanings:</p>
              <ul className="space-y-1 ml-4">
                <li><strong>Pending:</strong> Check uploaded but not yet matched</li>
                <li><strong>Matched:</strong> Successfully matched to an invoice</li>
                <li><strong>Processed:</strong> Invoice marked as PAID</li>
                <li><strong>Review Needed:</strong> Low confidence, manual review required</li>
              </ul>
            </div>
            <div>
              <p className="font-semibold mb-2">How It Works:</p>
              <ul className="space-y-1 ml-4">
                <li>• AI extracts check details from photos</li>
                <li>• Automatically finds matching invoices</li>
                <li>• Marks invoices as PAID when confident</li>
                <li>• Saves time on manual payment tracking</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

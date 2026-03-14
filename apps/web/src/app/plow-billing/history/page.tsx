'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

type StatusFilter = 'ALL' | 'PENDING' | 'SENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';

const STATUS_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  PENDING: { bg: 'bg-yellow-50', text: 'text-yellow-700', dot: 'bg-yellow-400' },
  SENT: { bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-400' },
  VIEWED: { bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-400' },
  PAID: { bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-400' },
  EXPIRED: { bg: 'bg-gray-50', text: 'text-gray-500', dot: 'bg-gray-400' },
  CANCELLED: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-400' },
};

function formatDate(date: string | Date) {
  return new Date(date).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function formatCurrency(amount: number) {
  return `$${amount.toFixed(2)}`;
}

export default function BillingHistoryPage() {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');

  const { data: billings, isLoading, refetch } = trpc.payments.getPlowBillings.useQuery(
    { limit: 100 },
    { refetchInterval: 30000 }
  );

  const syncMutation = trpc.payments.syncBillingStatuses.useMutation({
    onSuccess: (result) => {
      refetch();
      if (result.updated > 0) {
        alert(`Synced! ${result.updated} billing(s) updated to PAID.`);
      } else {
        alert(`Checked ${result.checked} active billing(s). No new payments found.`);
      }
    },
    onError: (err) => {
      alert('Sync failed: ' + err.message);
    },
  });

  const cancelMutation = trpc.payments.cancelBilling.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => alert('Cancel failed: ' + err.message),
  });

  const filtered = billings?.filter(
    (b) => statusFilter === 'ALL' || b.status === statusFilter
  ) ?? [];

  // Summary stats
  const stats = billings?.reduce(
    (acc, b) => {
      acc.total++;
      acc[b.status as string] = (acc[b.status as string] || 0) + 1;
      if (b.status === 'PAID') acc.paidAmount += b.totalAmount;
      if (b.status === 'PENDING' || b.status === 'SENT') acc.outstandingAmount += b.totalAmount;
      return acc;
    },
    { total: 0, paidAmount: 0, outstandingAmount: 0 } as Record<string, number>
  ) ?? { total: 0, paidAmount: 0, outstandingAmount: 0 };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/plow-billing" className="text-gray-500 hover:text-gray-700">
                ← Billing
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Billing History</h1>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
              >
                {syncMutation.isPending ? 'Syncing...' : 'Sync from Stripe'}
              </button>
              <button
                onClick={() => refetch()}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Refresh
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <p className="text-sm text-gray-500">Total Sent</p>
            <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <p className="text-sm text-gray-500">Collected</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(stats.paidAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <p className="text-sm text-gray-500">Outstanding</p>
            <p className="text-2xl font-bold text-amber-600">{formatCurrency(stats.outstandingAmount)}</p>
          </div>
          <div className="bg-white rounded-lg shadow-sm border p-4">
            <p className="text-sm text-gray-500">Paid</p>
            <p className="text-2xl font-bold text-green-600">{stats.PAID || 0} / {stats.total}</p>
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
          {(['ALL', 'PENDING', 'SENT', 'PAID', 'CANCELLED', 'EXPIRED'] as StatusFilter[]).map((status) => {
            const count = status === 'ALL' ? stats.total : (stats[status] || 0);
            return (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-600 border hover:bg-gray-50'
                }`}
              >
                {status === 'ALL' ? 'All' : status.charAt(0) + status.slice(1).toLowerCase()}
                {' '}({count})
              </button>
            );
          })}
        </div>

        {/* Billing Records */}
        {filtered.length === 0 ? (
          <div className="bg-white rounded-lg shadow-sm border p-8 text-center">
            <p className="text-gray-500">No billings found{statusFilter !== 'ALL' ? ` with status "${statusFilter}"` : ''}.</p>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Customer</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Services</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Amount</th>
                  <th className="text-center px-4 py-3 text-xs font-medium text-gray-500 uppercase">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Created</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase">Paid</th>
                  <th className="text-right px-4 py-3 text-xs font-medium text-gray-500 uppercase">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((billing) => {
                  const colors = STATUS_COLORS[billing.status] || STATUS_COLORS.PENDING;
                  const isActive = billing.status === 'PENDING' || billing.status === 'SENT';

                  return (
                    <tr key={billing.id} className={`hover:bg-gray-50 ${billing.status === 'PAID' ? 'bg-green-50/30' : ''}`}>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900">{billing.customerName}</p>
                        {billing.customerAddress && (
                          <p className="text-xs text-gray-500">{billing.customerAddress}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-600">
                        <div className="flex flex-col gap-0.5">
                          {billing.plowCount > 0 && <span>Plow x{billing.plowCount}</span>}
                          {billing.saltCount > 0 && <span>Salt x{billing.saltCount}</span>}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-gray-900">
                        {formatCurrency(billing.totalAmount)}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colors.bg} ${colors.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${colors.dot}`}></span>
                          {billing.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-gray-500">
                        {formatDate(billing.createdAt)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {billing.paidAt ? (
                          <span className="text-green-600 font-medium">{formatDate(billing.paidAt)}</span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {billing.url && (
                            <a
                              href={billing.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-800 text-sm"
                            >
                              Link
                            </a>
                          )}
                          {isActive && (
                            <button
                              onClick={() => {
                                if (confirm(`Cancel billing for ${billing.customerName}?`)) {
                                  cancelMutation.mutate({ billingId: billing.id });
                                }
                              }}
                              className="text-red-500 hover:text-red-700 text-sm"
                            >
                              Cancel
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}

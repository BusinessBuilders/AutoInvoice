'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function InvoicesPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const customerId = searchParams.get('customerId');

  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [search, setSearch] = useState('');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<{ id: string; number: string } | null>(null);

  // Sorting and date range filtering state
  const [sortBy, setSortBy] = useState<'serviceDate' | 'issueDate' | 'dueDate' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [serviceDateFrom, setServiceDateFrom] = useState<string>('');
  const [serviceDateTo, setServiceDateTo] = useState<string>('');

  const { data: invoicesData, isLoading, refetch } = trpc.invoice.list.useQuery({
    customerId: customerId || undefined,
    limit: 100,
    sortBy,
    sortOrder,
    serviceDateFrom: serviceDateFrom ? new Date(serviceDateFrom) : undefined,
    serviceDateTo: serviceDateTo ? new Date(serviceDateTo) : undefined,
  });
  const deleteInvoiceMutation = trpc.invoice.delete.useMutation();
  const updateStatusMutation = trpc.invoice.updateStatus.useMutation();

  const filteredInvoices = invoicesData?.invoices?.filter((invoice) => {
    const matchesStatus = statusFilter === 'all' || invoice.status === statusFilter;
    const matchesSearch = invoice.invoiceNumber.toLowerCase().includes(search.toLowerCase()) ||
                          invoice.customer?.name.toLowerCase().includes(search.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-green-100 text-green-800';
      case 'SENT':
        return 'bg-yellow-100 text-yellow-800';
      case 'OVERDUE':
        return 'bg-red-100 text-red-800';
      case 'DRAFT':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, invoice: { id: string; invoiceNumber: string }) => {
    e.preventDefault();
    e.stopPropagation();
    setInvoiceToDelete({ id: invoice.id, number: invoice.invoiceNumber });
    setShowDeleteConfirm(true);
  };

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;

    try {
      await deleteInvoiceMutation.mutateAsync({ id: invoiceToDelete.id });
      await refetch();
      setShowDeleteConfirm(false);
      setInvoiceToDelete(null);
    } catch (error: any) {
      alert(`Failed to delete invoice: ${error.message}`);
      setShowDeleteConfirm(false);
    }
  };

  const handleMarkAsSent = async (e: React.MouseEvent, invoiceId: string) => {
    e.preventDefault();
    e.stopPropagation();
    
    try {
      await updateStatusMutation.mutateAsync({
        id: invoiceId,
        status: 'SENT',
      });
      await refetch();
    } catch (error: any) {
      alert(`Failed to update invoice: ${error.message}`);
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
            <h1 className="text-3xl font-bold text-gray-900">Invoices</h1>
            <p className="mt-1 text-sm text-gray-500">
              {customerId ? 'Customer invoices' : 'All invoices'}
            </p>
          </div>
          <div className="mt-4 flex space-x-3 md:mt-0 md:ml-4">
            <Link
              href="/quick"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
            >
              ⚡ Quick Invoice
            </Link>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Search invoices..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />

          <div className="flex gap-2">
            {['all', 'DRAFT', 'SENT', 'PAID', 'OVERDUE'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                {status === 'all' ? 'All' : status}
              </button>
            ))}
          </div>
        </div>

        {/* Sort and Filter Controls */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap items-center gap-4">
            {/* Sort Controls */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Sort by:</label>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
              >
                <option value="serviceDate">Service Date</option>
                <option value="issueDate">Issue Date</option>
                <option value="dueDate">Due Date</option>
                <option value="createdAt">Created Date</option>
              </select>

              <button
                onClick={() => setSortOrder(order => order === 'desc' ? 'asc' : 'desc')}
                className="px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 text-sm font-medium flex items-center gap-1"
              >
                {sortOrder === 'desc' ? '↓ Newest First' : '↑ Oldest First'}
              </button>
            </div>

            {/* Vertical Divider */}
            <div className="h-8 w-px bg-gray-300"></div>

            {/* Date Range Filter */}
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium text-gray-700">Service Date:</label>
              <input
                type="date"
                value={serviceDateFrom}
                onChange={(e) => setServiceDateFrom(e.target.value)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                placeholder="From"
              />
              <span className="text-gray-500">to</span>
              <input
                type="date"
                value={serviceDateTo}
                onChange={(e) => setServiceDateTo(e.target.value)}
                className="rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm"
                placeholder="To"
              />

              {/* Clear Date Filter Button */}
              {(serviceDateFrom || serviceDateTo) && (
                <button
                  onClick={() => {
                    setServiceDateFrom('');
                    setServiceDateTo('');
                  }}
                  className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
                >
                  Clear
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Invoice List */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-500">Loading invoices...</p>
          </div>
        ) : filteredInvoices && filteredInvoices.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {filteredInvoices.map((invoice) => (
                <li key={invoice.id} className="relative">
                  <Link
                    href={`/invoices/${invoice.id}`}
                    className="block hover:bg-gray-50 transition-colors"
                  >
                    <div className="px-4 py-4 sm:px-6 pr-32">
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center">
                            <p className="text-lg font-semibold text-blue-600 truncate">
                              {invoice.invoiceNumber}
                            </p>
                            <span
                              className={`ml-3 px-2 py-1 text-xs font-medium rounded ${getStatusColor(invoice.status)}`}
                            >
                              {invoice.status}
                            </span>
                          </div>

                          {invoice.customer && (
                            <p className="mt-1 text-sm text-gray-900">
                              {invoice.customer.name}
                              {invoice.customer.company && ` (${invoice.customer.company})`}
                            </p>
                          )}

                          <div className="mt-2 flex items-center text-sm text-gray-500">
                            <span className="mr-4">
                              📅 Service: {new Date(invoice.serviceDate).toLocaleDateString()}
                            </span>
                            <span>
                              📤 Issued: {new Date(invoice.issueDate).toLocaleDateString()}
                            </span>
                            {invoice.status !== 'PAID' && (
                              <span className="ml-4">
                                ⏰ Due: {new Date(invoice.dueDate).toLocaleDateString()}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="ml-5 flex-shrink-0 text-right">
                          <p className="text-2xl font-bold text-gray-900">
                            ${parseFloat(invoice.total).toFixed(2)}
                          </p>
                          <p className="text-sm text-gray-500">
                            {invoice.lineItems?.length || 0} item{invoice.lineItems?.length !== 1 ? 's' : ''}
                          </p>
                        </div>
                      </div>
                    </div>
                  </Link>
                  {/* Action buttons */}
                  <div className="absolute right-4 top-1/2 -translate-y-1/2 flex gap-2">
                    {invoice.status === 'DRAFT' && (
                      <button
                        onClick={(e) => handleMarkAsSent(e, invoice.id)}
                        disabled={updateStatusMutation.isPending}
                        className="p-2 text-yellow-600 hover:text-yellow-800 hover:bg-yellow-50 rounded-md transition-colors disabled:opacity-50"
                        title="Mark as Sent"
                      >
                        📤
                      </button>
                    )}
                    <button
                      onClick={(e) => handleDeleteClick(e, invoice)}
                      className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded-md transition-colors"
                      title="Delete invoice"
                    >
                      🗑️
                    </button>
                  </div>
                </li>
              ))}
            </ul>
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
                d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No invoices</h3>
            <p className="mt-1 text-sm text-gray-500">
              {search || statusFilter !== 'all'
                ? 'No invoices match your filters.'
                : 'Get started by creating your first invoice.'}
            </p>
            {!search && statusFilter === 'all' && (
              <div className="mt-6">
                <Link
                  href="/quick"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700"
                >
                  ⚡ Create Quick Invoice
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Summary Stats */}
        {filteredInvoices && filteredInvoices.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-5 sm:grid-cols-4">
            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-3xl">📊</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Total</dt>
                      <dd className="text-lg font-semibold text-gray-900">
                        {filteredInvoices.length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-3xl">💰</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Revenue</dt>
                      <dd className="text-lg font-semibold text-gray-900">
                        ${filteredInvoices
                          .reduce((sum, inv) => sum + parseFloat(inv.total), 0)
                          .toFixed(2)}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-3xl">✅</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Paid</dt>
                      <dd className="text-lg font-semibold text-green-600">
                        {filteredInvoices.filter((inv) => inv.status === 'PAID').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white overflow-hidden shadow rounded-lg">
              <div className="p-5">
                <div className="flex items-center">
                  <div className="flex-shrink-0">
                    <div className="text-3xl">⏰</div>
                  </div>
                  <div className="ml-5 w-0 flex-1">
                    <dl>
                      <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                      <dd className="text-lg font-semibold text-yellow-600">
                        {filteredInvoices.filter((inv) => inv.status === 'SENT').length}
                      </dd>
                    </dl>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && invoiceToDelete && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Invoice?</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete invoice {invoiceToDelete.number}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setInvoiceToDelete(null);
                  }}
                  disabled={deleteInvoiceMutation.isPending}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteInvoice}
                  disabled={deleteInvoiceMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteInvoiceMutation.isPending ? 'Deleting...' : 'Delete Invoice'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

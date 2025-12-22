'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState, useEffect } from 'react';

export default function ReceiptsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [showError, setShowError] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  // Fetch actual receipts from database
  const { data: receiptsData, isLoading, error } = trpc.receipt.list.useQuery({
    limit: 100,
    offset: 0,
    status: statusFilter as 'all' | 'processed' | 'review_needed' | 'pending',
  });

  // Show error toast if query fails
  useEffect(() => {
    if (error) {
      setErrorMessage(`Failed to load receipts: ${error.message}`);
      setShowError(true);
      console.error('Receipt list error:', error);
    }
  }, [error]);

  const receipts = receiptsData || [];

  console.log('Receipts page:', { isLoading, receiptsCount: receipts.length, error: error?.message });

  const filteredReceipts = receipts.filter((receipt) => {
    const matchesSearch = receipt.vendor.toLowerCase().includes(search.toLowerCase()) ||
                          receipt.category?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === 'all' || receipt.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const totalAmount = filteredReceipts.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Error Toast */}
        {showError && (
          <div className="mb-4 bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded relative" role="alert">
            <strong className="font-bold">Error!</strong>
            <span className="block sm:inline"> {errorMessage}</span>
            <button
              className="absolute top-0 bottom-0 right-0 px-4 py-3"
              onClick={() => setShowError(false)}
            >
              <span className="text-2xl">&times;</span>
            </button>
          </div>
        )}

        {/* Back Navigation */}
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div className="md:flex md:items-center md:justify-between mb-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900">📷 Receipts</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage expense receipts and convert to invoices
            </p>
          </div>
          <div className="mt-4 flex space-x-3 md:mt-0 md:ml-4">
            <Link
              href="/receipts/upload"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              📸 Upload Receipt
            </Link>
          </div>
        </div>

        {/* Stats */}
        <div className="mb-6 grid grid-cols-1 gap-5 sm:grid-cols-3">
          <div className="bg-white overflow-hidden shadow rounded-lg">
            <div className="p-5">
              <div className="flex items-center">
                <div className="flex-shrink-0">
                  <div className="text-3xl">📊</div>
                </div>
                <div className="ml-5 w-0 flex-1">
                  <dl>
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Receipts</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      {filteredReceipts.length}
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
                    <dt className="text-sm font-medium text-gray-500 truncate">Total Amount</dt>
                    <dd className="text-lg font-semibold text-gray-900">
                      ${totalAmount.toFixed(2)}
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
                    <dt className="text-sm font-medium text-gray-500 truncate">Processed</dt>
                    <dd className="text-lg font-semibold text-green-600">
                      {receipts.filter(r => r.status === 'processed').length}
                    </dd>
                  </dl>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <input
            type="text"
            placeholder="Search receipts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />

          <div className="flex gap-2">
            {['all', 'processed', 'pending'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                  statusFilter === status
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
              >
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Receipt List */}
        {filteredReceipts.length > 0 ? (
          <div className="bg-white shadow overflow-hidden sm:rounded-md">
            <ul className="divide-y divide-gray-200">
              {filteredReceipts.map((receipt) => (
                <li key={receipt.id}>
                  <div className="px-4 py-4 sm:px-6 hover:bg-gray-50">
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center">
                          <div className="text-3xl mr-3">🧾</div>
                          <div>
                            <div className="flex items-center">
                              <p className="text-lg font-semibold text-gray-900 truncate">
                                {receipt.vendor}
                              </p>
                              <span
                                className={`ml-3 px-2 py-1 text-xs font-medium rounded ${
                                  receipt.status === 'processed'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-yellow-100 text-yellow-800'
                                }`}
                              >
                                {receipt.status}
                              </span>
                            </div>

                            <div className="mt-2 flex items-center text-sm text-gray-500">
                              <span className="mr-4">
                                📅 {new Date(receipt.date).toLocaleDateString()}
                              </span>
                              {receipt.category && (
                                <span className="mr-4">
                                  📁 {receipt.category}
                                </span>
                              )}
                              <span>
                                🎯 {((receipt.confidence || 0) * 100).toFixed(0)}% confidence
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="ml-5 flex items-center space-x-4">
                        <div className="text-right">
                          <p className="text-2xl font-bold text-gray-900">
                            ${Number(receipt.amount).toFixed(2)}
                          </p>
                        </div>

                        <div className="flex flex-col space-y-2">
                          <Link
                            href={`/invoices/new?receiptId=${receipt.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded text-white bg-green-600 hover:bg-green-700"
                          >
                            Create Invoice
                          </Link>
                          <Link
                            href={`/receipts/${receipt.id}`}
                            className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-xs font-medium rounded text-gray-700 bg-white hover:bg-gray-50"
                          >
                            View Details
                          </Link>
                        </div>
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <div className="text-6xl mb-4">📷</div>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No receipts</h3>
            <p className="mt-1 text-sm text-gray-500">
              {search || statusFilter !== 'all'
                ? 'No receipts match your filters.'
                : 'Get started by uploading your first receipt.'}
            </p>
            {!search && statusFilter === 'all' && (
              <div className="mt-6">
                <Link
                  href="/receipts/upload"
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  📸 Upload Receipt
                </Link>
              </div>
            )}
          </div>
        )}

        {/* Features */}
        <div className="mt-8 bg-gradient-to-r from-purple-500 to-pink-600 rounded-lg shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">📸 Receipt Management Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center mb-2">
                <div className="text-3xl mr-3">🤖</div>
                <h3 className="text-lg font-semibold">AI-Powered OCR</h3>
              </div>
              <p className="text-sm text-purple-100">
                Automatically extract vendor, amount, date, and line items from receipt images
              </p>
            </div>

            <div>
              <div className="flex items-center mb-2">
                <div className="text-3xl mr-3">📱</div>
                <h3 className="text-lg font-semibold">Mobile & Desktop</h3>
              </div>
              <p className="text-sm text-purple-100">
                Take photos with your phone camera or upload from your computer
              </p>
            </div>

            <div>
              <div className="flex items-center mb-2">
                <div className="text-3xl mr-3">📄</div>
                <h3 className="text-lg font-semibold">Quick Conversion</h3>
              </div>
              <p className="text-sm text-purple-100">
                Convert receipts to invoices with one click, or save for expense tracking
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white border-opacity-20">
            <p className="text-sm text-purple-100">
              💡 <strong>Pro tip:</strong> You can also upload receipts via Telegram bot - just send a photo!
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

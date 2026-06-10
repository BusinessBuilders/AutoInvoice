'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function ReceiptDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const { data: receipt, isLoading, error } = trpc.receipt.getById.useQuery({ id });
  const deleteReceiptMutation = trpc.receipt.delete.useMutation();

  const handleDeleteReceipt = async () => {
    try {
      await deleteReceiptMutation.mutateAsync({ id });
      router.push('/receipts');
    } catch (error: any) {
      alert(`Failed to delete receipt: ${error.message}`);
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">⏳</div>
          <p className="text-gray-600">Loading receipt...</p>
        </div>
      </div>
    );
  }

  if (error || !receipt) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="text-4xl mb-4">❌</div>
          <p className="text-red-600">Failed to load receipt: {error?.message || 'Not found'}</p>
          <Link href="/receipts" className="mt-4 inline-block text-blue-600 hover:underline">
            ← Back to Receipts
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex gap-4 mb-4">
            <Link href="/" className="text-blue-600 hover:underline inline-block">
              ← Back to Home
            </Link>
            <Link href="/receipts" className="text-blue-600 hover:underline inline-block">
              ← Back to Receipts
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Receipt Details</h1>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Receipt Image */}
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-xl font-semibold mb-4">Receipt Image</h2>
            {receipt.imageData || receipt.imageUrl ? (
              <div className="relative w-full aspect-[3/4] bg-gray-100 rounded-lg overflow-hidden">
                <img
                  src={
                    receipt.imageData
                      ? `data:image/png;base64,${receipt.imageData}`
                      : receipt.imageUrl || ''
                  }
                  alt="Receipt"
                  className="w-full h-full object-contain"
                  onError={(e) => {
                    console.error('Image failed to load');
                    // Try alternate format if first fails
                    const img = e.target as HTMLImageElement;
                    if (receipt.imageData && img.src.includes('image/png')) {
                      img.src = `data:image/jpeg;base64,${receipt.imageData}`;
                    }
                  }}
                />
              </div>
            ) : (
              <div className="w-full aspect-[3/4] bg-gray-100 rounded-lg flex items-center justify-center">
                <div className="text-center text-gray-500">
                  <div className="text-4xl mb-2">📷</div>
                  <p>No image available</p>
                  <p className="text-xs mt-2">imageData: {receipt.imageData ? 'exists' : 'null'}</p>
                  <p className="text-xs">imageUrl: {receipt.imageUrl || 'null'}</p>
                </div>
              </div>
            )}
          </div>

          {/* Receipt Details */}
          <div className="space-y-6">
            {/* Basic Info */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Information</h2>
              <dl className="space-y-3">
                <div>
                  <dt className="text-sm font-medium text-gray-500">Vendor</dt>
                  <dd className="mt-1 text-lg font-semibold text-gray-900">{receipt.vendor}</dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Amount</dt>
                  <dd className="mt-1 text-2xl font-bold text-green-600">
                    ${Number(receipt.amount).toFixed(2)}
                  </dd>
                </div>
                <div>
                  <dt className="text-sm font-medium text-gray-500">Date</dt>
                  <dd className="mt-1 text-lg text-gray-900">
                    {new Date(receipt.date).toLocaleDateString()}
                  </dd>
                </div>
                {receipt.category && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Category</dt>
                    <dd className="mt-1 text-lg text-gray-900">{receipt.category}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm font-medium text-gray-500">Status</dt>
                  <dd className="mt-1">
                    <span
                      className={`inline-flex px-3 py-1 text-sm font-medium rounded-full ${
                        receipt.status === 'processed'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {receipt.status}
                    </span>
                  </dd>
                </div>
                {receipt.confidence && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">OCR Confidence</dt>
                    <dd className="mt-1 text-lg text-gray-900">
                      {((receipt.confidence || 0) * 100).toFixed(0)}%
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Line Items */}
            {receipt.ocrData && (receipt.ocrData as any).lineItems && (receipt.ocrData as any).lineItems.length > 0 && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Line Items</h2>
                <div className="space-y-2">
                  {(receipt.ocrData as any).lineItems.map((item: any, idx: number) => (
                    <div
                      key={idx}
                      className="flex justify-between items-center py-2 border-b border-gray-200 last:border-b-0"
                    >
                      <div>
                        <p className="font-medium text-gray-900">{item.description}</p>
                        {item.quantity && (
                          <p className="text-sm text-gray-500">
                            Qty: {item.quantity}
                          </p>
                        )}
                      </div>
                      <p className="font-semibold text-gray-900">
                        ${Number(item.amount || item.price || 0).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes */}
            {receipt.notes && (
              <div className="bg-white shadow rounded-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Notes</h2>
                <p className="text-gray-700 whitespace-pre-wrap">{receipt.notes}</p>
              </div>
            )}

            {/* Actions */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Actions</h2>
              <div className="space-y-3">
                <Link
                  href={`/invoices/new?receiptId=${receipt.id}`}
                  className="block w-full text-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
                >
                  Create Invoice from Receipt
                </Link>
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="block w-full text-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-red-600 hover:bg-red-700"
                  disabled={!!receipt.invoiceId}
                  title={receipt.invoiceId ? 'Cannot delete receipt linked to invoice' : 'Delete receipt'}
                >
                  {receipt.invoiceId ? 'Delete (Linked to Invoice)' : 'Delete Receipt'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Receipt?</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete this receipt from {receipt.vendor}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteReceiptMutation.isPending}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteReceipt}
                  disabled={deleteReceiptMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteReceiptMutation.isPending ? 'Deleting...' : 'Delete Receipt'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

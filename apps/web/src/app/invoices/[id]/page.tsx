'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useParams } from 'next/navigation';

export default function InvoiceDetailPage() {
  const params = useParams();
  const invoiceId = params.id as string;

  const { data: invoice, isLoading } = trpc.invoice.getById.useQuery({ id: invoiceId });

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

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-500">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Invoice not found</h1>
          <Link href="/invoices" className="mt-4 text-blue-600 hover:text-blue-800">
            ← Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/invoices"
            className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Invoices
          </Link>
          <div className="md:flex md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
              <div className="mt-2 flex items-center space-x-3">
                <span className={`px-3 py-1 text-sm font-medium rounded ${getStatusColor(invoice.status)}`}>
                  {invoice.status}
                </span>
                {invoice.source && (
                  <span className="text-sm text-gray-500">via {invoice.source}</span>
                )}
              </div>
            </div>
            <div className="mt-4 flex space-x-3 md:mt-0">
              <button className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50">
                📄 Download PDF
              </button>
              <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                📧 Send Email
              </button>
            </div>
          </div>
        </div>

        {/* Invoice Content */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {/* Customer & Dates */}
          <div className="px-6 py-5 border-b border-gray-200">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bill To</h3>
                {invoice.customer && (
                  <div className="mt-2">
                    <Link
                      href={`/customers/${invoice.customer.id}`}
                      className="text-lg font-semibold text-blue-600 hover:text-blue-800"
                    >
                      {invoice.customer.name}
                    </Link>
                    {invoice.customer.company && (
                      <p className="text-sm text-gray-500">{invoice.customer.company}</p>
                    )}
                    {invoice.customer.email && (
                      <p className="text-sm text-gray-600">{invoice.customer.email}</p>
                    )}
                    {invoice.customer.addressLine1 && (
                      <p className="text-sm text-gray-600 mt-1">
                        {invoice.customer.addressLine1}
                        {invoice.customer.city && <><br />{invoice.customer.city}, {invoice.customer.state} {invoice.customer.zipCode}</>}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Service Date</dt>
                    <dd className="text-sm text-gray-900">
                      {new Date(invoice.serviceDate).toLocaleDateString('en-US', {
                        weekday: 'long',
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Issue Date</dt>
                    <dd className="text-sm text-gray-900">
                      {new Date(invoice.issueDate).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Due Date</dt>
                    <dd className="text-sm text-gray-900">
                      {new Date(invoice.dueDate).toLocaleDateString()}
                    </dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="px-6 py-5">
            <h3 className="text-sm font-medium text-gray-900 mb-4">Line Items</h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead>
                  <tr className="bg-gray-50">
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Description
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Quantity
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Rate
                    </th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Amount
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {invoice.lineItems?.map((item: any, index: number) => (
                    <tr key={item.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="px-4 py-4 text-sm text-gray-900">
                        {item.description}
                        {item.service && (
                          <span className="ml-2 text-xs text-gray-500">({item.service.code})</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 text-right">
                        {item.quantity} {item.unit}
                      </td>
                      <td className="px-4 py-4 text-sm text-gray-900 text-right">
                        ${parseFloat(item.rate).toFixed(2)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-gray-900 text-right">
                        ${parseFloat(item.amount).toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Totals */}
          <div className="px-6 py-5 bg-gray-50 border-t border-gray-200">
            <div className="max-w-sm ml-auto space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium text-gray-900">
                  ${parseFloat(invoice.subtotal).toFixed(2)}
                </span>
              </div>

              {invoice.taxAmount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax ({invoice.taxRate}%):</span>
                  <span className="font-medium text-gray-900">
                    ${parseFloat(invoice.taxAmount).toFixed(2)}
                  </span>
                </div>
              )}

              {invoice.discount > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount:</span>
                  <span className="font-medium text-red-600">
                    -${parseFloat(invoice.discount).toFixed(2)}
                  </span>
                </div>
              )}

              <div className="border-t border-gray-300 pt-2 flex justify-between">
                <span className="text-lg font-semibold text-gray-900">Total:</span>
                <span className="text-2xl font-bold text-green-600">
                  ${parseFloat(invoice.total).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {invoice.notes && (
            <div className="px-6 py-5 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Notes</h3>
              <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
            </div>
          )}

          {/* Payment Info */}
          {invoice.status !== 'PAID' && (
            <div className="px-6 py-5 bg-blue-50 border-t border-blue-200">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Payment Information</h3>
              <p className="text-sm text-blue-800">
                Payment is due by {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {/* Activity Log (placeholder) */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity</h3>
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-2 h-2 mt-2 bg-blue-500 rounded-full"></div>
              <div className="ml-3">
                <p className="text-sm text-gray-900">
                  Invoice created
                  {invoice.source && ` via ${invoice.source}`}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(invoice.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            {invoice.status === 'SENT' && (
              <div className="flex items-start">
                <div className="flex-shrink-0 w-2 h-2 mt-2 bg-yellow-500 rounded-full"></div>
                <div className="ml-3">
                  <p className="text-sm text-gray-900">Invoice sent to customer</p>
                  <p className="text-xs text-gray-500">
                    {new Date(invoice.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
            {invoice.status === 'PAID' && (
              <div className="flex items-start">
                <div className="flex-shrink-0 w-2 h-2 mt-2 bg-green-500 rounded-full"></div>
                <div className="ml-3">
                  <p className="text-sm text-gray-900">Payment received</p>
                  <p className="text-xs text-gray-500">
                    {invoice.paidAt && new Date(invoice.paidAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

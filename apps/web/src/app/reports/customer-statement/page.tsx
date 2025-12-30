'use client';

import { useState, useMemo, useEffect } from 'react';
import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

type InvoiceStatus = 'SENT' | 'PAID' | 'OVERDUE';

export default function CustomerStatementPage() {
  const searchParams = useSearchParams();
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [includeStatuses, setIncludeStatuses] = useState<InvoiceStatus[]>(['SENT', 'OVERDUE']);

  // Set customer ID from URL params on mount
  useEffect(() => {
    const customerId = searchParams.get('customerId');
    if (customerId) {
      setSelectedCustomerId(customerId);
    }
  }, [searchParams]);

  // Get customers list
  const { data: customersData, isLoading: loadingCustomers } = trpc.customer.list.useQuery({});

  // Get statement data
  const { data: statement, isLoading: loadingStatement, refetch } = trpc.customerStatement.getStatement.useQuery(
    { customerId: selectedCustomerId, includeStatuses },
    { enabled: !!selectedCustomerId }
  );

  // Mark as paid mutation
  const markPaidMutation = trpc.customerStatement.markInvoiceAsPaid.useMutation({
    onSuccess: () => {
      refetch();
      alert('Invoice marked as paid!');
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    }
  });

  // Send statement mutation
  const sendStatementMutation = trpc.customerStatement.sendStatement.useMutation({
    onSuccess: (data) => {
      if (data.pdfPath) {
        alert('Statement PDF generated successfully!');
        // In production, you'd open/download the PDF
      }
      if (data.emailSent) {
        alert('Statement emailed successfully!');
      }
    },
    onError: (error) => {
      alert(`Error: ${error.message}`);
    }
  });

  const handleMarkPaid = (invoiceId: string) => {
    if (confirm('Mark this invoice as paid?')) {
      markPaidMutation.mutate({ invoiceId });
    }
  };

  const handleDownloadPDF = () => {
    if (!selectedCustomerId) return;
    sendStatementMutation.mutate({ customerId: selectedCustomerId, sendEmail: false });
  };

  const handleEmailStatement = () => {
    if (!selectedCustomerId) return;
    if (confirm('Send statement via email to customer?')) {
      sendStatementMutation.mutate({ customerId: selectedCustomerId, sendEmail: true });
    }
  };

  const handleStatusToggle = (status: InvoiceStatus) => {
    setIncludeStatuses(prev =>
      prev.includes(status)
        ? prev.filter(s => s !== status)
        : [...prev, status]
    );
  };

  const isLoading = loadingStatement || markPaidMutation.isPending || sendStatementMutation.isPending;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div>
            <Link href="/reports" className="text-blue-600 hover:text-blue-700 mb-2 inline-block">
              ← Back to Reports
            </Link>
            <h1 className="text-3xl font-bold text-gray-900">Customer Statement</h1>
            <p className="text-gray-600 mt-1">View and manage customer invoices</p>
          </div>
        </div>

        {/* Customer Selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Select Customer
              </label>
              <select
                value={selectedCustomerId}
                onChange={(e) => setSelectedCustomerId(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={loadingCustomers}
              >
                <option value="">-- Select a customer --</option>
                {customersData?.customers?.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>

            {selectedCustomerId && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Filter by Status
                </label>
                <div className="flex gap-2 flex-wrap">
                  {(['SENT', 'OVERDUE', 'PAID'] as InvoiceStatus[]).map(status => (
                    <button
                      key={status}
                      onClick={() => handleStatusToggle(status)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        includeStatuses.includes(status)
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {status}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Loading State */}
        {loadingStatement && selectedCustomerId && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
            <p className="text-gray-600">Loading statement...</p>
          </div>
        )}

        {/* Statement Content */}
        {!loadingStatement && selectedCustomerId && statement && (
          <>
            {/* Summary Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 rounded-lg p-6">
                <h3 className="text-sm font-medium text-blue-700 mb-1">Total Invoices</h3>
                <p className="text-3xl font-bold text-blue-600">{statement.summary.totalInvoices}</p>
              </div>
              <div className="bg-red-50 rounded-lg p-6">
                <h3 className="text-sm font-medium text-red-700 mb-1">Total Due</h3>
                <p className="text-3xl font-bold text-red-600">
                  ${parseFloat(statement.summary.totalAmount).toFixed(2)}
                </p>
              </div>
              <div className="bg-orange-50 rounded-lg p-6">
                <h3 className="text-sm font-medium text-orange-700 mb-1">Overdue</h3>
                <p className="text-3xl font-bold text-orange-600">
                  ${parseFloat(statement.summary.overdueAmount).toFixed(2)}
                </p>
                <p className="text-xs text-orange-600 mt-1">{statement.summary.overdueCount} invoices</p>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 mb-6 flex-wrap">
              <button
                onClick={handleDownloadPDF}
                disabled={isLoading || statement.invoices.length === 0}
                className="flex items-center gap-2 px-6 py-3 bg-white border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
                Download PDF
              </button>
              <button
                onClick={handleEmailStatement}
                disabled={isLoading || statement.invoices.length === 0}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Email Statement
              </button>
            </div>

            {/* Empty State */}
            {statement.invoices.length === 0 && (
              <div className="bg-white rounded-lg shadow p-12 text-center">
                <div className="text-gray-400 mb-4">
                  <svg className="mx-auto h-24 w-24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Invoices Found</h3>
                <p className="text-gray-600">
                  This customer has no invoices with the selected statuses.
                </p>
              </div>
            )}

            {/* Invoice Table */}
            {statement.invoices.length > 0 && (
              <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="min-w-full">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Invoice #
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Date
                        </th>
                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Due Date
                        </th>
                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Amount
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Status
                        </th>
                        <th className="px-6 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">
                          Action
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 bg-white">
                      {statement.invoices.map((invoice) => (
                        <tr key={invoice.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-900">
                            {invoice.invoiceNumber}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {new Date(invoice.date).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {new Date(invoice.dueDate).toLocaleDateString()}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono text-gray-900">
                            ${parseFloat(invoice.total).toFixed(2)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${
                              invoice.status === 'OVERDUE' ? 'bg-red-100 text-red-800' :
                              invoice.status === 'PAID' ? 'bg-green-100 text-green-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {invoice.status}
                              {invoice.daysOverdue > 0 && ` (${invoice.daysOverdue}d)`}
                            </span>
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-center">
                            {invoice.status !== 'PAID' && (
                              <button
                                onClick={() => handleMarkPaid(invoice.id)}
                                disabled={markPaidMutation.isPending}
                                className="text-green-600 hover:text-green-800 font-medium text-sm disabled:opacity-50"
                              >
                                Mark Paid
                              </button>
                            )}
                            {invoice.status === 'PAID' && (
                              <span className="text-gray-400 text-sm flex items-center justify-center gap-1">
                                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                                </svg>
                                Paid
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

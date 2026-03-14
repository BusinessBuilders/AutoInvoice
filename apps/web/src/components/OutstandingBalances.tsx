'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';

export default function OutstandingBalances() {
  // Get all customers
  const { data: customersData, isLoading } = trpc.customer.list.useQuery({});

  // Get invoices to calculate outstanding balances
  const { data: invoicesData } = trpc.invoice.list.useQuery({ limit: 100 });

  if (isLoading) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-center h-32">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  // Calculate outstanding balance per customer
  const customerBalances = (customersData?.customers || [])
    .map(customer => {
      const customerInvoices = invoicesData?.invoices?.filter(
        inv => inv.customerId === customer.id && (inv.status === 'SENT' || inv.status === 'OVERDUE')
      ) || [];

      const totalOwed = customerInvoices.reduce(
        (sum, inv) => sum + parseFloat(inv.total || '0'),
        0
      );

      const overdueInvoices = customerInvoices.filter(inv => inv.status === 'OVERDUE').length;

      return {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        totalOwed,
        invoiceCount: customerInvoices.length,
        overdueCount: overdueInvoices,
      };
    })
    .filter(c => c.totalOwed > 0)
    .sort((a, b) => b.totalOwed - a.totalOwed)
    .slice(0, 5);

  const totalOutstanding = customerBalances.reduce((sum, c) => sum + c.totalOwed, 0);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  };

  if (customerBalances.length === 0) {
    return (
      <div className="bg-white shadow rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center">
            <div className="text-3xl mr-3">💰</div>
            <h2 className="text-xl font-bold text-gray-900">Outstanding Balances</h2>
          </div>
        </div>
        <div className="text-center py-8">
          <div className="text-gray-400 mb-2 text-4xl">✅</div>
          <p className="text-gray-600 text-sm">No outstanding balances</p>
          <p className="text-gray-500 text-xs mt-1">All invoices are paid!</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white shadow rounded-lg overflow-hidden">
      {/* Header */}
      <div className="bg-gradient-to-r from-orange-500 to-red-600 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="text-3xl mr-3">💰</div>
            <div>
              <h2 className="text-lg font-semibold text-white">Outstanding Balances</h2>
              <p className="text-sm text-orange-100">Top customers with unpaid invoices</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-white">{formatCurrency(totalOutstanding)}</p>
            <p className="text-xs text-orange-100">Total owed</p>
          </div>
        </div>
      </div>

      {/* Customer List */}
      <div className="p-6">
        <div className="space-y-3">
          {customerBalances.map((customer) => (
            <Link
              key={customer.id}
              href={`/reports/customer-statement?customerId=${customer.id}`}
              className="block p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors border border-gray-200"
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {customer.name}
                    </p>
                    {customer.overdueCount > 0 && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-800">
                        {customer.overdueCount} overdue
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1">
                    <p className="text-xs text-gray-500">
                      {customer.invoiceCount} {customer.invoiceCount === 1 ? 'invoice' : 'invoices'}
                    </p>
                    {customer.email && (
                      <p className="text-xs text-gray-400 truncate">{customer.email}</p>
                    )}
                  </div>
                </div>
                <div className="ml-4 flex items-center gap-2">
                  <div className="text-right">
                    <p className="text-lg font-bold text-red-600">
                      {formatCurrency(customer.totalOwed)}
                    </p>
                  </div>
                  <svg
                    className="w-5 h-5 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9 5l7 7-7 7"
                    />
                  </svg>
                </div>
              </div>
            </Link>
          ))}
        </div>

        {/* Actions */}
        <div className="mt-6 pt-6 border-t border-gray-200">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Link
              href="/reports/customer-statement"
              className="px-4 py-2 text-sm font-medium text-center text-red-700 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
            >
              📋 View All Statements
            </Link>
            <Link
              href="/invoices?status=SENT,OVERDUE"
              className="px-4 py-2 text-sm font-medium text-center text-orange-700 bg-orange-50 border border-orange-200 rounded-lg hover:bg-orange-100 transition-colors"
            >
              📄 View Unpaid Invoices
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

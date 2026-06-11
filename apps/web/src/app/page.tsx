'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';
import { useEffect, Fragment } from 'react';
import FinancialOverview from '@/components/FinancialOverview';
import OutstandingBalances from '@/components/OutstandingBalances';

export default function Home() {
  const { logout, isLoading, requireAuth, isAuthenticated } = useAuth();
  const { data: stats } = trpc.invoice.stats.useQuery();
  const { data: recentInvoicesData } = trpc.invoice.list.useQuery({ limit: 5 });
  const { data: customersData } = trpc.customer.list.useQuery({ limit: 5 });

  useEffect(() => {
    requireAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">AutoInvoice Dashboard</h1>
            <p className="mt-2 text-lg text-gray-600">
              AI-powered invoice automation platform
            </p>
          </div>
          <div className="flex space-x-3">
            {isAuthenticated ? (
              <>
                <Link
                  href="/settings"
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  ⚙️ Settings
                </Link>
                <button
                  onClick={logout}
                  className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  🚪 Logout
                </button>
              </>
            ) : (
              <Link
                href="/login"
                className="px-6 py-3 text-lg font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 shadow-lg"
              >
                🔑 Sign In
              </Link>
            )}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Link
            href="/quick"
            className="relative group bg-gradient-to-br from-green-500 to-green-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">⚡</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Quick Invoice</h3>
                <p className="text-sm text-green-100">Natural language entry</p>
              </div>
            </div>
          </Link>

          <Link
            href="/quick-manual"
            className="relative group bg-gradient-to-br from-blue-500 to-indigo-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">📝</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Manual Invoice</h3>
                <p className="text-sm text-blue-100">Traditional form entry</p>
              </div>
            </div>
          </Link>

          <Link
            href="/voice"
            className="relative group bg-gradient-to-br from-violet-500 to-purple-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🎤</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Voice Invoice</h3>
                <p className="text-sm text-violet-100">Speak your invoice</p>
              </div>
            </div>
          </Link>

          <Link
            href="/receipts/upload"
            className="relative group bg-gradient-to-br from-orange-500 to-red-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">📷</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Upload Receipt</h3>
                <p className="text-sm text-orange-100">AI-powered OCR</p>
              </div>
            </div>
          </Link>

          <Link
            href="/customers"
            className="relative group bg-gradient-to-br from-blue-500 to-blue-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">👥</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Customers</h3>
                <p className="text-sm text-blue-100">Manage contacts</p>
              </div>
            </div>
          </Link>

          <Link
            href="/services"
            className="relative group bg-gradient-to-br from-purple-500 to-purple-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🛠️</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Services</h3>
                <p className="text-sm text-purple-100">Service catalog</p>
              </div>
            </div>
          </Link>

          <Link
            href="/invoices"
            className="relative group bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">📄</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Invoices</h3>
                <p className="text-sm text-yellow-100">View all invoices</p>
              </div>
            </div>
          </Link>

          <Link
            href="/leads/business-cards"
            className="relative group bg-gradient-to-br from-pink-500 to-rose-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">📇</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Lead Cards</h3>
                <p className="text-sm text-pink-100">Scan business cards</p>
              </div>
            </div>
          </Link>

          <Link
            href="/network"
            className="relative group bg-gradient-to-br from-teal-500 to-cyan-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🌐</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Network</h3>
                <p className="text-sm text-teal-100">Contact database</p>
              </div>
            </div>
          </Link>

          <Link
            href="/reports"
            className="relative group bg-gradient-to-br from-indigo-500 to-purple-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">📊</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Reports</h3>
                <p className="text-sm text-indigo-100">Business analytics</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Business OS */}
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Business OS</h2>
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <Link
            href="/jobs"
            className="relative group bg-gradient-to-br from-emerald-500 to-green-700 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🚜</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Jobs</h3>
                <p className="text-sm text-emerald-100">Crew packet &amp; routes</p>
              </div>
            </div>
          </Link>

          <Link
            href="/revenue"
            className="relative group bg-gradient-to-br from-amber-500 to-yellow-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">💰</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Revenue</h3>
                <p className="text-sm text-amber-100">Every dollar, every engine</p>
              </div>
            </div>
          </Link>

          <Link
            href="/subscriptions"
            className="relative group bg-gradient-to-br from-cyan-500 to-blue-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🔁</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Subscriptions</h3>
                <p className="text-sm text-cyan-100">MRR, renewals, churn</p>
              </div>
            </div>
          </Link>

          <Link
            href="/orders"
            className="relative group bg-gradient-to-br from-fuchsia-500 to-pink-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🛒</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Commerce</h3>
                <p className="text-sm text-fuchsia-100">Products &amp; orders</p>
              </div>
            </div>
          </Link>

          <Link
            href="/time-clock"
            className="relative group bg-gradient-to-br from-slate-600 to-gray-800 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🕐</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Time Clock</h3>
                <p className="text-sm text-slate-200">Who&apos;s on the clock</p>
              </div>
            </div>
          </Link>

          <Link
            href="/attribution"
            className="relative group bg-gradient-to-br from-rose-500 to-red-600 rounded-lg shadow-lg p-6 hover:shadow-xl transition-all hover:scale-105"
          >
            <div className="flex items-center">
              <div className="text-4xl">🎯</div>
              <div className="ml-4">
                <h3 className="text-lg font-semibold text-white">Attribution</h3>
                <p className="text-sm text-rose-100">CAC, LTV, ROAS</p>
              </div>
            </div>
          </Link>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">📊</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Total Invoices</dt>
                  <dd className="mt-1 text-3xl font-bold text-gray-900">
                    {stats?.total || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">✅</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Paid</dt>
                  <dd className="mt-1 text-3xl font-bold text-green-600">
                    {stats?.paid || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">⏰</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Pending</dt>
                  <dd className="mt-1 text-3xl font-bold text-yellow-600">
                    {stats?.sent || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="text-3xl">🚨</div>
              </div>
              <div className="ml-5 w-0 flex-1">
                <dl>
                  <dt className="text-sm font-medium text-gray-500 truncate">Overdue</dt>
                  <dd className="mt-1 text-3xl font-bold text-red-600">
                    {stats?.overdue || 0}
                  </dd>
                </dl>
              </div>
            </div>
          </div>
        </div>

        {/* Financial Overview Widget */}
        <div className="mb-8">
          <FinancialOverview />
        </div>

        {/* Outstanding Balances Widget */}
        <div className="mb-8">
          <OutstandingBalances />
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Recent Invoices */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
                <Link href="/invoices" className="text-sm text-blue-600 hover:text-blue-800">
                  View all →
                </Link>
              </div>
            </div>
            <div className="px-6 py-4">
              {recentInvoicesData?.invoices && recentInvoicesData.invoices.length > 0 ? (
                <div className="space-y-3">
                  {(recentInvoicesData.invoices as any[]).map((invoice) => (
                    <Link
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {invoice.invoiceNumber}
                          </p>
                          {invoice.customer && (
                            <p className="text-xs text-gray-500 truncate">
                              {invoice.customer.name}
                            </p>
                          )}
                        </div>
                        <div className="ml-4 flex-shrink-0 text-right">
                          <p className="text-sm font-semibold text-gray-900">
                            ${parseFloat(invoice.total).toFixed(2)}
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              invoice.status === 'PAID'
                                ? 'bg-green-100 text-green-800'
                                : invoice.status === 'SENT'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {invoice.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No invoices yet</p>
                  <Link
                    href="/quick"
                    className="mt-3 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                  >
                    Create your first invoice →
                  </Link>
                </div>
              )}
            </div>
          </div>

          {/* Recent Customers */}
          <div className="bg-white shadow rounded-lg">
            <div className="px-6 py-4 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-900">Recent Customers</h2>
                <Link href="/customers" className="text-sm text-blue-600 hover:text-blue-800">
                  View all →
                </Link>
              </div>
            </div>
            <div className="px-6 py-4">
              {customersData?.customers && customersData.customers.length > 0 ? (
                <div className="space-y-3">
                  {customersData.customers.map((customer: any) => (
                    <Link
                      key={customer.id}
                      href={`/customers/${customer.id}`}
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-gray-900 truncate">
                            {customer.name}
                          </p>
                          {customer.email && (
                            <p className="text-xs text-gray-500 truncate">{customer.email}</p>
                          )}
                        </div>
                        <div className="ml-4">
                          <Link
                            href={`/quick?customerId=${customer.id}`}
                            className="text-sm text-green-600 hover:text-green-800"
                            onClick={(e) => e.stopPropagation()}
                          >
                            ⚡ Quick Invoice
                          </Link>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <p className="text-sm text-gray-500">No customers yet</p>
                  <Link
                    href="/customers/new"
                    className="mt-3 inline-flex items-center text-sm text-blue-600 hover:text-blue-800"
                  >
                    Add your first customer →
                  </Link>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Getting Started */}
        <div className="mt-8 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">🚀 Getting Started</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="flex items-center mb-2">
                <span className="flex-shrink-0 w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center font-bold mr-3">
                  1
                </span>
                <h3 className="text-lg font-semibold">Add Customers</h3>
              </div>
              <p className="text-sm text-blue-100 ml-11">
                Set up your customer database with contact info and nicknames for quick entry
              </p>
            </div>

            <div>
              <div className="flex items-center mb-2">
                <span className="flex-shrink-0 w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center font-bold mr-3">
                  2
                </span>
                <h3 className="text-lg font-semibold">Configure Services</h3>
              </div>
              <p className="text-sm text-blue-100 ml-11">
                Add your services with pricing. Set custom rates for specific customers
              </p>
            </div>

            <div>
              <div className="flex items-center mb-2">
                <span className="flex-shrink-0 w-8 h-8 bg-white bg-opacity-20 rounded-full flex items-center justify-center font-bold mr-3">
                  3
                </span>
                <h3 className="text-lg font-semibold">Create Invoices</h3>
              </div>
              <p className="text-sm text-blue-100 ml-11">
                Use quick entry to create invoices instantly with natural language
              </p>
            </div>
          </div>

          <div className="mt-6 pt-6 border-t border-white border-opacity-20">
            <p className="text-sm text-blue-100">
              💡 <strong>Pro tip:</strong> Try "9999 sqft hydroseed for Blair today" in Quick Invoice
            </p>
          </div>
        </div>

        {/* Features */}
        <div className="mt-8 bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="flex items-start">
              <div className="text-2xl mr-3">🤖</div>
              <div>
                <h3 className="font-semibold text-gray-900">AI-Powered Parsing</h3>
                <p className="text-sm text-gray-600">Natural language invoice creation</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-2xl mr-3">💰</div>
              <div>
                <h3 className="font-semibold text-gray-900">Custom Pricing</h3>
                <p className="text-sm text-gray-600">Per-customer rate overrides</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-2xl mr-3">📄</div>
              <div>
                <h3 className="font-semibold text-gray-900">PDF Generation</h3>
                <p className="text-sm text-gray-600">Professional branded invoices</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-2xl mr-3">🔍</div>
              <div>
                <h3 className="font-semibold text-gray-900">Smart Matching</h3>
                <p className="text-sm text-gray-600">Fuzzy customer and service search</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-2xl mr-3">📱</div>
              <div>
                <h3 className="font-semibold text-gray-900">Telegram Bot</h3>
                <p className="text-sm text-gray-600">Create invoices via chat</p>
              </div>
            </div>
            <div className="flex items-start">
              <div className="text-2xl mr-3">📧</div>
              <div>
                <h3 className="font-semibold text-gray-900">Email Integration</h3>
                <p className="text-sm text-gray-600">Google Workspace integration</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

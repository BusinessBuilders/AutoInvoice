'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function ReportsPage() {
  const [dateRange, setDateRange] = useState<'7d' | '30d' | '90d' | 'all'>('30d');
  const [startDate, endDate] = useMemo(() => {
    const end = new Date();
    const start = new Date();

    if (dateRange === '7d') {
      start.setDate(start.getDate() - 7);
    } else if (dateRange === '30d') {
      start.setDate(start.getDate() - 30);
    } else if (dateRange === '90d') {
      start.setDate(start.getDate() - 90);
    } else {
      start.setFullYear(start.getFullYear() - 10); // All time
    }

    return [start, end];
  }, [dateRange]);

  // Load all reports data
  const { data: overview } = trpc.reporting.getOverview.useQuery({
    startDate,
    endDate,
  });

  const { data: categoryData } = trpc.reporting.getRevenueByCategory.useQuery({
    startDate,
    endDate,
  });

  const { data: topCustomers } = trpc.reporting.getTopCustomers.useQuery({
    limit: 10,
    startDate,
    endDate,
  });

  const { data: servicePerformance } = trpc.reporting.getServicePerformance.useQuery({
    limit: 10,
    startDate,
    endDate,
  });

  const { data: statusBreakdown } = trpc.reporting.getInvoiceStatusBreakdown.useQuery({
    startDate,
    endDate,
  });

  const { data: revenueOverTime } = trpc.reporting.getRevenueOverTime.useQuery({
    startDate,
    endDate,
    interval: 'day',
  });

  // Load expense reports data
  const { data: expenseOverview } = trpc.reporting.getExpenseOverview.useQuery({
    startDate,
    endDate,
  });

  const { data: expensesByCategory } = trpc.reporting.getExpensesByCategory.useQuery({
    startDate,
    endDate,
  });

  const { data: profitAnalysis } = trpc.reporting.getProfitAnalysis.useQuery({
    startDate,
    endDate,
    groupBy: 'category',
  });

  const { data: topVendors } = trpc.reporting.getTopVendors.useQuery({
    limit: 10,
    startDate,
    endDate,
  });

  const { data: expenseTrends } = trpc.reporting.getExpenseTrends.useQuery({
    startDate,
    endDate,
    interval: 'day',
  });

  // Calculate net profit
  const netProfit = overview && expenseOverview
    ? parseFloat(overview.paidRevenue.toString()) - parseFloat(expenseOverview.totalExpenses.toString())
    : 0;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Business Reports</h1>
            <p className="text-gray-600 mt-1">Analytics and insights for your business</p>
          </div>

          {/* Date Range Filter */}
          <div className="flex gap-2">
            {(['7d', '30d', '90d', 'all'] as const).map((range) => (
              <button
                key={range}
                onClick={() => setDateRange(range)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  dateRange === range
                    ? 'bg-blue-600 text-white'
                    : 'bg-white text-gray-700 hover:bg-gray-100'
                }`}
              >
                {range === '7d' && 'Last 7 Days'}
                {range === '30d' && 'Last 30 Days'}
                {range === '90d' && 'Last 90 Days'}
                {range === 'all' && 'All Time'}
              </button>
            ))}
          </div>
        </div>

        {/* Overview Stats */}
        {overview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Revenue</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ${parseFloat(overview.totalRevenue.toString()).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Paid: ${parseFloat(overview.paidRevenue.toString()).toFixed(2)}
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Outstanding</h3>
              <p className="text-3xl font-bold text-orange-600 mt-2">
                ${parseFloat(overview.outstandingAmount.toString()).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {overview.pendingInvoices} pending invoices
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Invoices</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                {overview.totalInvoices}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {overview.paidInvoices} paid
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Avg Invoice</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ${parseFloat(overview.avgInvoiceValue.toString()).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {overview.totalCustomers} customers
              </p>
            </div>
          </div>
        )}

        {/* Expense Overview Stats */}
        {expenseOverview && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Total Expenses</h3>
              <p className="text-3xl font-bold text-red-600 mt-2">
                ${parseFloat(expenseOverview.totalExpenses.toString()).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {expenseOverview.expenseCount} receipts
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Avg Expense</h3>
              <p className="text-3xl font-bold text-gray-900 mt-2">
                ${parseFloat(expenseOverview.avgExpenseAmount.toString()).toFixed(2)}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Per receipt
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Net Profit</h3>
              <p className={`text-3xl font-bold mt-2 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                ${netProfit.toFixed(2)}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Revenue - Expenses
              </p>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-sm font-medium text-gray-500">Profit Margin</h3>
              <p className={`text-3xl font-bold mt-2 ${netProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {overview ? ((netProfit / parseFloat(overview.paidRevenue.toString())) * 100).toFixed(1) : 0}%
              </p>
              <p className="text-sm text-gray-600 mt-1">
                Of paid revenue
              </p>
            </div>
          </div>
        )}

        {/* Revenue by Category */}
        {categoryData && categoryData.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue by Category</h2>
            <div className="space-y-4">
              {categoryData.map((cat) => {
                const maxRevenue = Math.max(...categoryData.map((c) => c.revenue));
                const percentage = (cat.revenue / maxRevenue) * 100;

                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{cat.category}</span>
                      <div className="text-right">
                        <span className="font-bold text-gray-900">
                          ${cat.revenue.toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          ({cat.jobs} jobs)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-blue-600 h-3 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Avg per job: ${cat.avgPerJob.toFixed(2)} • {cat.count} line items
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Two column layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
          {/* Top Customers */}
          {topCustomers && topCustomers.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Top Customers</h2>
              <div className="space-y-3">
                {topCustomers.map((customer, idx) => (
                  <Link
                    key={customer.customer.id}
                    href={`/customers/${customer.customer.id}`}
                    className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                        <div>
                          <p className="font-medium text-gray-900">
                            {customer.customer.name}
                          </p>
                          {customer.customer.company && (
                            <p className="text-sm text-gray-500">
                              {customer.customer.company}
                            </p>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">
                          ${customer.totalRevenue.toFixed(2)}
                        </p>
                        <p className="text-sm text-gray-500">
                          {customer.invoiceCount} invoices
                        </p>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}

          {/* Invoice Status Breakdown */}
          {statusBreakdown && statusBreakdown.length > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Invoice Status</h2>
              <div className="space-y-4">
                {statusBreakdown.map((status) => {
                  const totalRevenue = statusBreakdown.reduce(
                    (sum, s) => sum + s.revenue,
                    0
                  );
                  const percentage = (status.revenue / totalRevenue) * 100;

                  const statusColors: Record<string, string> = {
                    PAID: 'bg-green-600',
                    SENT: 'bg-yellow-600',
                    DRAFT: 'bg-gray-600',
                  };

                  return (
                    <div key={status.status}>
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-gray-900">{status.status}</span>
                        <div className="text-right">
                          <span className="font-bold text-gray-900">
                            ${status.revenue.toFixed(2)}
                          </span>
                          <span className="text-sm text-gray-500 ml-2">
                            ({status.count})
                          </span>
                        </div>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-3">
                        <div
                          className={`${statusColors[status.status] || 'bg-blue-600'} h-3 rounded-full transition-all`}
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Expenses by Category */}
        {expensesByCategory && expensesByCategory.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Expenses by Category</h2>
            <div className="space-y-4">
              {expensesByCategory.map((cat) => {
                const maxAmount = Math.max(...expensesByCategory.map((c) => c.totalAmount));
                const percentage = (cat.totalAmount / maxAmount) * 100;

                return (
                  <div key={cat.category}>
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{cat.category}</span>
                      <div className="text-right">
                        <span className="font-bold text-gray-900">
                          ${cat.totalAmount.toFixed(2)}
                        </span>
                        <span className="text-sm text-gray-500 ml-2">
                          ({cat.count} receipts)
                        </span>
                      </div>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div
                        className="bg-red-600 h-3 rounded-full transition-all"
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                    <div className="text-sm text-gray-600 mt-1">
                      Avg per receipt: ${cat.avgAmount.toFixed(2)} • {cat.percentage.toFixed(1)}% of total
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Profit Analysis by Category */}
        {profitAnalysis && profitAnalysis.data.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Profit Analysis by Category</h2>
            <div className="space-y-4">
              {profitAnalysis.data.map((item) => {
                return (
                  <div key={item.groupKey} className="border-b pb-4 last:border-b-0">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium text-gray-900">{item.groupKey}</span>
                      <div className="text-right">
                        <span className={`font-bold ${item.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ${item.profit.toFixed(2)}
                        </span>
                        <span className={`text-sm ml-2 ${item.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          ({item.profitMargin.toFixed(1)}% margin)
                        </span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-gray-600">Revenue: </span>
                        <span className="font-semibold text-gray-900">${item.revenue.toFixed(2)}</span>
                      </div>
                      <div>
                        <span className="text-gray-600">Direct Costs: </span>
                        <span className="font-semibold text-gray-900">${item.directCosts.toFixed(2)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
              {profitAnalysis.overheadCosts > 0 && (
                <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-gray-700">Overhead Costs (not tied to jobs)</span>
                    <span className="font-bold text-gray-900">${profitAnalysis.overheadCosts.toFixed(2)}</span>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Top Vendors */}
        {topVendors && topVendors.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Top Vendors by Spending</h2>
            <div className="space-y-3">
              {topVendors.map((vendor, idx) => (
                <div
                  key={vendor.vendor}
                  className="block p-3 bg-gray-50 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg font-bold text-gray-400">#{idx + 1}</span>
                      <div>
                        <p className="font-medium text-gray-900">
                          {vendor.vendor}
                        </p>
                        <p className="text-sm text-gray-500">
                          {vendor.mostCommonCategory}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-gray-900">
                        ${vendor.totalSpent.toFixed(2)}
                      </p>
                      <p className="text-sm text-gray-500">
                        {vendor.receiptCount} receipts • ${vendor.avgExpenseAmount.toFixed(2)} avg
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Expense Trends Over Time */}
        {expenseTrends && expenseTrends.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Expense Trend</h2>
            <div className="h-64 flex items-end justify-between gap-1">
              {expenseTrends.map((day, idx) => {
                const maxExpense = Math.max(...expenseTrends.map((d) => d.totalExpenses));
                const height = (day.totalExpenses / maxExpense) * 100;

                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center group relative"
                  >
                    <div className="w-full flex flex-col items-center">
                      <div
                        className="w-full bg-red-600 rounded-t transition-all hover:bg-red-700"
                        style={{ height: `${height}%`, minHeight: day.totalExpenses > 0 ? '4px' : '0' }}
                      />
                      {idx % Math.ceil(expenseTrends.length / 10) === 0 && (
                        <p className="text-xs text-gray-500 mt-2 rotate-45 origin-left">
                          {new Date(day.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                      {new Date(day.date).toLocaleDateString()}
                      <br />
                      Expenses: ${day.totalExpenses.toFixed(2)}
                      <br />
                      Receipts: {day.receiptCount}
                      <br />
                      Top: {day.topCategory}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Service Performance */}
        {servicePerformance && servicePerformance.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Top Services</h2>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Service
                    </th>
                    <th className="text-left py-3 px-4 font-semibold text-gray-700">
                      Category
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">
                      Revenue
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">
                      Usage
                    </th>
                    <th className="text-right py-3 px-4 font-semibold text-gray-700">
                      Avg Revenue
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {servicePerformance.map((service) => (
                    <tr key={service.service.id} className="border-b hover:bg-gray-50">
                      <td className="py-3 px-4 font-medium text-gray-900">
                        {service.service.name}
                      </td>
                      <td className="py-3 px-4 text-gray-600">
                        {service.service.category}
                      </td>
                      <td className="py-3 px-4 text-right font-semibold text-gray-900">
                        ${service.revenue.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        {service.usageCount}x
                      </td>
                      <td className="py-3 px-4 text-right text-gray-600">
                        ${service.avgRevenue.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Revenue Over Time - Simple Line Chart */}
        {revenueOverTime && revenueOverTime.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Revenue Trend</h2>
            <div className="h-64 flex items-end justify-between gap-1">
              {revenueOverTime.map((day, idx) => {
                const maxRevenue = Math.max(...revenueOverTime.map((d) => d.revenue));
                const height = (day.revenue / maxRevenue) * 100;

                return (
                  <div
                    key={day.date}
                    className="flex-1 flex flex-col items-center group relative"
                  >
                    <div className="w-full flex flex-col items-center">
                      <div
                        className="w-full bg-blue-600 rounded-t transition-all hover:bg-blue-700"
                        style={{ height: `${height}%`, minHeight: day.revenue > 0 ? '4px' : '0' }}
                      />
                      {idx % Math.ceil(revenueOverTime.length / 10) === 0 && (
                        <p className="text-xs text-gray-500 mt-2 rotate-45 origin-left">
                          {new Date(day.date).toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                          })}
                        </p>
                      )}
                    </div>
                    {/* Tooltip */}
                    <div className="absolute bottom-full mb-2 hidden group-hover:block bg-gray-900 text-white text-xs rounded py-1 px-2 whitespace-nowrap z-10">
                      {new Date(day.date).toLocaleDateString()}
                      <br />
                      Revenue: ${day.revenue.toFixed(2)}
                      <br />
                      Invoices: {day.invoiceCount}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

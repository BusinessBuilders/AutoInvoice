'use client';

import { useState, useMemo } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend,
} from 'chart.js';
import { Bar, Pie } from 'react-chartjs-2';
import './print.css';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  LineElement,
  PointElement,
  Title,
  Tooltip,
  Legend
);

type DatePreset = 'this-month' | 'last-month' | 'this-quarter' | 'this-year' | 'custom';

function getDateRangeFromPreset(preset: DatePreset): [Date, Date] {
  const now = new Date();
  const start = new Date();
  const end = new Date();

  switch (preset) {
    case 'this-month':
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'last-month':
      start.setMonth(now.getMonth() - 1);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setMonth(now.getMonth());
      end.setDate(0); // Last day of previous month
      end.setHours(23, 59, 59, 999);
      break;
    case 'this-quarter':
      const currentQuarter = Math.floor(now.getMonth() / 3);
      start.setMonth(currentQuarter * 3);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'this-year':
      start.setMonth(0);
      start.setDate(1);
      start.setHours(0, 0, 0, 0);
      end.setHours(23, 59, 59, 999);
      break;
    case 'custom':
      // Will be overridden by custom date inputs
      break;
  }

  return [start, end];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(new Date(date));
}

export default function ProfitAndLossPage() {
  const [preset, setPreset] = useState<DatePreset>('this-month');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  const [startDate, endDate] = useMemo(() => {
    if (preset === 'custom' && customStartDate && customEndDate) {
      return [new Date(customStartDate), new Date(customEndDate)];
    }
    return getDateRangeFromPreset(preset);
  }, [preset, customStartDate, customEndDate]);

  const { data: report, isLoading } = trpc.reporting.profitAndLoss.useQuery(
    {
      startDate,
      endDate,
    },
    {
      enabled: true,
    }
  );

  const handlePresetChange = (newPreset: DatePreset) => {
    setPreset(newPreset);
    if (newPreset !== 'custom') {
      setCustomStartDate('');
      setCustomEndDate('');
    }
  };

  const handleExportPDF = async () => {
    // TODO: Implement PDF export
    alert('PDF export coming soon!');
  };

  const handleExportCSV = () => {
    if (!report) return;

    const rows: string[] = [];
    rows.push(`Profit & Loss Statement`);
    rows.push(`Period: ${formatDate(report.period.start)} to ${formatDate(report.period.end)}`);
    rows.push('');
    rows.push('REVENUE');
    rows.push('Account Code,Account Name,Amount');

    report.revenue.accounts.forEach((acc) => {
      rows.push(`${acc.code},${acc.name},${acc.amount.toFixed(2)}`);
    });

    rows.push(`,,${report.revenue.total.toFixed(2)}`);
    rows.push('');
    rows.push('EXPENSES');
    rows.push('Account Code,Account Name,Amount');

    report.expenses.accounts.forEach((acc) => {
      rows.push(`${acc.code},${acc.name},${acc.amount.toFixed(2)}`);
    });

    rows.push(`,,${report.expenses.total.toFixed(2)}`);
    rows.push('');
    rows.push(`NET INCOME,,${report.netIncome.toFixed(2)}`);
    rows.push(`PROFIT MARGIN,,${report.profitMargin.toFixed(2)}%`);

    const csv = rows.join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `profit-loss-${formatDate(report.period.start)}-to-${formatDate(report.period.end)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePrint = () => {
    window.print();
  };

  // Chart data
  const revenueVsExpensesData = useMemo(() => {
    if (!report) return null;

    return {
      labels: ['Revenue', 'Expenses'],
      datasets: [
        {
          label: 'Amount',
          data: [report.revenue.total, report.expenses.total],
          backgroundColor: ['rgba(34, 197, 94, 0.8)', 'rgba(239, 68, 68, 0.8)'],
          borderColor: ['rgb(34, 197, 94)', 'rgb(239, 68, 68)'],
          borderWidth: 1,
        },
      ],
    };
  }, [report]);

  const expenseBreakdownData = useMemo(() => {
    if (!report || report.expenses.accounts.length === 0) return null;

    const colors = [
      'rgba(239, 68, 68, 0.8)',
      'rgba(249, 115, 22, 0.8)',
      'rgba(245, 158, 11, 0.8)',
      'rgba(234, 179, 8, 0.8)',
      'rgba(132, 204, 22, 0.8)',
      'rgba(34, 197, 94, 0.8)',
    ];

    return {
      labels: report.expenses.accounts.map((acc) => acc.name),
      datasets: [
        {
          data: report.expenses.accounts.map((acc) => acc.amount),
          backgroundColor: colors.slice(0, report.expenses.accounts.length),
          borderWidth: 1,
        },
      ],
    };
  }, [report]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="animate-pulse">
            <div className="h-8 bg-gray-300 rounded w-1/3 mb-4"></div>
            <div className="h-64 bg-gray-300 rounded mb-4"></div>
            <div className="h-64 bg-gray-300 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Back Navigation */}
        <Link href="/reports" className="text-blue-600 hover:text-blue-700 mb-4 inline-block print:hidden">
          ← Back to Reports
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Profit &amp; Loss Statement</h1>
          <p className="text-gray-600">Income statement showing revenue, expenses, and net income</p>
        </div>

        {/* Date Range Selector */}
        <div className="bg-white rounded-lg shadow p-6 mb-6 print:hidden">
          <div className="flex flex-wrap items-end gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Date Range
              </label>
              <div className="flex gap-2">
                {(['this-month', 'last-month', 'this-quarter', 'this-year', 'custom'] as const).map(
                  (p) => (
                    <button
                      key={p}
                      onClick={() => handlePresetChange(p)}
                      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                        preset === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {p === 'this-month' && 'This Month'}
                      {p === 'last-month' && 'Last Month'}
                      {p === 'this-quarter' && 'This Quarter'}
                      {p === 'this-year' && 'This Year'}
                      {p === 'custom' && 'Custom'}
                    </button>
                  )
                )}
              </div>
            </div>

            {preset === 'custom' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Start Date
                  </label>
                  <input
                    type="date"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    End Date
                  </label>
                  <input
                    type="date"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </>
            )}
          </div>

          {report && (
            <div className="mt-4 text-sm text-gray-600">
              Showing data from <strong>{formatDate(report.period.start)}</strong> to{' '}
              <strong>{formatDate(report.period.end)}</strong>
            </div>
          )}
        </div>

        {/* Empty State */}
        {report && report.revenue.accounts.length === 0 && report.expenses.accounts.length === 0 && (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <div className="text-gray-400 mb-4">
              <svg
                className="mx-auto h-24 w-24"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={1}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Data Available</h3>
            <p className="text-gray-600">
              There are no posted journal entries in the selected date range.
            </p>
          </div>
        )}

        {/* Report Display */}
        {report && (report.revenue.accounts.length > 0 || report.expenses.accounts.length > 0) && (
          <>
            {/* Main Report Card */}
            <div className="bg-white rounded-lg shadow overflow-hidden mb-6">
              {/* Revenue Section */}
              <div className="border-b border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">REVENUE</h2>
                <div className="space-y-2">
                  {report.revenue.accounts.map((account) => (
                    <div
                      key={account.code}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-gray-500 w-20">
                          {account.code}
                        </span>
                        <span className="font-medium text-gray-900">{account.name}</span>
                      </div>
                      <span className="font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(account.amount)}
                      </span>
                    </div>
                  ))}
                  {report.revenue.accounts.length === 0 && (
                    <div className="text-gray-500 text-sm italic py-2">No revenue accounts</div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-4 mt-4 border-t-2 border-gray-300">
                  <span className="font-bold text-gray-900">Total Revenue</span>
                  <span className="font-bold text-xl text-green-600 tabular-nums">
                    {formatCurrency(report.revenue.total)}
                  </span>
                </div>
              </div>

              {/* Expenses Section */}
              <div className="border-b border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">EXPENSES</h2>
                <div className="space-y-2">
                  {report.expenses.accounts.map((account) => (
                    <div
                      key={account.code}
                      className="flex items-center justify-between py-2 border-b border-gray-100 last:border-b-0"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-mono text-gray-500 w-20">
                          {account.code}
                        </span>
                        <span className="font-medium text-gray-900">{account.name}</span>
                      </div>
                      <span className="font-semibold text-gray-900 tabular-nums">
                        {formatCurrency(account.amount)}
                      </span>
                    </div>
                  ))}
                  {report.expenses.accounts.length === 0 && (
                    <div className="text-gray-500 text-sm italic py-2">No expense accounts</div>
                  )}
                </div>
                <div className="flex items-center justify-between pt-4 mt-4 border-t-2 border-gray-300">
                  <span className="font-bold text-gray-900">Total Expenses</span>
                  <span className="font-bold text-xl text-red-600 tabular-nums">
                    {formatCurrency(report.expenses.total)}
                  </span>
                </div>
              </div>

              {/* Summary Section */}
              <div className="bg-gray-50 p-6">
                <div className="space-y-3">
                  <div className="flex items-center justify-between py-3 border-b border-gray-300">
                    <span className="text-xl font-bold text-gray-900">NET INCOME</span>
                    <span
                      className={`text-3xl font-bold tabular-nums ${
                        report.netIncome >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {formatCurrency(report.netIncome)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between py-2">
                    <span className="text-lg font-semibold text-gray-700">Profit Margin</span>
                    <span
                      className={`text-2xl font-bold tabular-nums ${
                        report.profitMargin >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}
                    >
                      {report.profitMargin.toFixed(1)}%
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 print:hidden">
              {/* Revenue vs Expenses Chart */}
              {revenueVsExpensesData && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Revenue vs Expenses</h3>
                  <div className="h-80">
                    <Bar
                      data={revenueVsExpensesData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            display: false,
                          },
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                return formatCurrency(context.parsed.y);
                              },
                            },
                          },
                        },
                        scales: {
                          y: {
                            beginAtZero: true,
                            ticks: {
                              callback: (value) => formatCurrency(Number(value)),
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Expense Breakdown Chart */}
              {expenseBreakdownData && report.expenses.accounts.length > 0 && (
                <div className="bg-white rounded-lg shadow p-6">
                  <h3 className="text-lg font-bold text-gray-900 mb-4">Expense Breakdown</h3>
                  <div className="h-80">
                    <Pie
                      data={expenseBreakdownData}
                      options={{
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                          legend: {
                            position: 'bottom',
                          },
                          tooltip: {
                            callbacks: {
                              label: (context) => {
                                const label = context.label || '';
                                const value = formatCurrency(Number(context.parsed));
                                const percentage = (
                                  (Number(context.parsed) / report.expenses.total) *
                                  100
                                ).toFixed(1);
                                return `${label}: ${value} (${percentage}%)`;
                              },
                            },
                          },
                        },
                      }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Export Actions */}
            <div className="flex gap-4 print:hidden">
              <button
                onClick={handleExportPDF}
                className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z"
                  />
                </svg>
                Export PDF
              </button>

              <button
                onClick={handleExportCSV}
                className="flex items-center gap-2 px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-medium"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  />
                </svg>
                Export CSV
              </button>

              <button
                onClick={handlePrint}
                className="flex items-center gap-2 px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors font-medium"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z"
                  />
                </svg>
                Print
              </button>
            </div>
          </>
        )}
      </div>

    </div>
  );
}

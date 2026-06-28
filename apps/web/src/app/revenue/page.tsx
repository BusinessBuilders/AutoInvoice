'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { money, ENGINE_LABELS } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

const WINDOWS = [
  { label: '30 days', days: 30 },
  { label: '90 days', days: 90 },
  { label: 'Year', days: 365 },
];

export default function RevenuePage() {
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [days, setDays] = useState(90);
  const companyId = companyFilter === 'all' ? undefined : companyFilter;
  const from = new Date(Date.now() - days * 86400000);

  const { data: companies } = trpc.company.list.useQuery();
  const { data: summary } = trpc.revenueEvents.summary.useQuery({ companyId, from });
  const { data: events } = trpc.revenueEvents.list.useQuery({ companyId, limit: 25 });
  const { data: mrr } = trpc.subscription.mrr.useQuery({ companyId });
  const { data: aging } = trpc.quote.aging.useQuery({ companyId });
  const { data: leadStats } = trpc.lead.stats.useQuery();

  const pipelineValue =
    aging
      ? Object.values(aging.buckets).flat().reduce((s: number, q: any) => s + Number(q.total), 0)
      : 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← Back to Dashboard</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Revenue</h1>
            <p className="mt-1 text-sm text-gray-500">Every dollar, every engine — one spine</p>
          </div>
          <div className="mt-4 flex gap-2 md:mt-0">
            {WINDOWS.map((w) => (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                className={`px-3 py-1.5 text-sm rounded-md border ${
                  days === w.days ? 'bg-blue-600 text-white border-blue-600' : 'border-gray-300 text-gray-700'
                }`}
              >
                {w.label}
              </button>
            ))}
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm"
            >
              <option value="all">All companies</option>
              {companies?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Headline cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-sm text-gray-500">Net revenue ({days}d)</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{money(summary?.net)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-sm text-gray-500">MRR</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{money(mrr?.mrr)}</div>
            <div className="text-xs text-gray-500 mt-1">
              {mrr?.activeCount ?? 0} active
              {mrr?.pastDueCount ? ` · ${mrr.pastDueCount} past due` : ''}
              {mrr?.churnRiskCount ? ` · ⚠️ ${mrr.churnRiskCount} churn risk` : ''}
            </div>
          </div>
          <div className="bg-white rounded-lg shadow p-5">
            <div className="text-sm text-gray-500">Open pipeline</div>
            <div className="text-3xl font-bold text-gray-900 mt-1">{money(pipelineValue)}</div>
            <div className="text-xs text-gray-500 mt-1">
              {aging?.totalOpen ?? 0} open quotes
              {leadStats ? ` · ${(leadStats as any).NEW ?? 0} new leads` : ''}
            </div>
          </div>
        </div>

        {/* By engine */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">Revenue by engine ({days} days)</h2>
          {!summary?.byEngine.length ? (
            <p className="text-sm text-gray-500">No revenue events in this window.</p>
          ) : (
            <div className="space-y-3">
              {summary.byEngine
                .slice()
                .sort((a, b) => b.total - a.total)
                .map((e) => {
                  const max = Math.max(...summary.byEngine.map((x) => Math.abs(x.total)), 1);
                  return (
                    <div key={e.engine} className="flex items-center gap-3">
                      <div className="w-40 text-sm text-gray-700">{ENGINE_LABELS[e.engine] ?? e.engine}</div>
                      <div className="flex-1 bg-gray-100 rounded-full h-5 overflow-hidden">
                        <div
                          className={`h-5 ${e.total >= 0 ? 'bg-green-500' : 'bg-red-500'}`}
                          style={{ width: `${Math.min(100, (Math.abs(e.total) / max) * 100)}%` }}
                        />
                      </div>
                      <div className="w-28 text-right text-sm font-medium text-gray-900">{money(e.total)}</div>
                      <div className="w-16 text-right text-xs text-gray-500">{e.count} evt</div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>

        {/* Quote aging */}
        <div className="bg-white rounded-lg shadow p-6 mb-8">
          <h2 className="font-semibold text-gray-900 mb-4">Quote aging (open quotes)</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {aging &&
              (Object.entries(aging.buckets) as [string, any[]][]).map(([bucket, quotes]) => (
                <div key={bucket} className={`rounded-lg p-4 ${quotes.length && (bucket === '15-30' || bucket === '30+') ? 'bg-red-50' : 'bg-gray-50'}`}>
                  <div className="text-sm text-gray-500">{bucket} days</div>
                  <div className="text-2xl font-bold text-gray-900">{quotes.length}</div>
                  <div className="text-xs text-gray-500">{money(quotes.reduce((s, q) => s + Number(q.total), 0))}</div>
                </div>
              ))}
          </div>
        </div>

        {/* Recent events */}
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <h2 className="font-semibold text-gray-900 p-6 pb-3">Recent revenue events</h2>
          {!events?.items.length ? (
            <p className="text-sm text-gray-500 px-6 pb-6">No events yet — they appear as invoices get paid, orders land, and renewals collect.</p>
          ) : (
            <div className="divide-y divide-gray-100">
              {events.items.map((e: any) => (
                <div key={e.id} className="px-6 py-3 flex items-center justify-between text-sm">
                  <div>
                    <span className="text-gray-900">{e.description ?? `${e.engine} ${e.eventType}`}</span>
                    <span className="text-gray-500 ml-2">
                      {e.customer?.name ?? ''} · {e.company?.name ?? e.companyId}
                    </span>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className={`font-medium ${Number(e.amount) < 0 ? 'text-red-600' : 'text-green-700'}`}>
                      {money(Number(e.amount))}
                    </span>
                    <span className="text-gray-400">{new Date(e.occurredAt).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

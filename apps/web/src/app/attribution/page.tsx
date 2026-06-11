'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

function monthsAgoISO(n: number) {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return d;
}

export default function AttributionPage() {
  const { data: companies } = trpc.company.list.useQuery();
  const [companyId, setCompanyId] = useState<string>('');
  const [months, setMonths] = useState(6);
  const effectiveCompany = companyId || companies?.[0]?.id || '';

  const { data: report, refetch } = trpc.adSpend.report.useQuery(
    { companyId: effectiveCompany, from: monthsAgoISO(months), to: new Date() },
    { enabled: !!effectiveCompany }
  );
  const { data: ltv } = trpc.adSpend.ltv.useQuery({ companyId: effectiveCompany || undefined, top: 15 });
  const record = trpc.adSpend.record.useMutation();

  const [spend, setSpend] = useState({ date: '', channel: '', campaign: '', amount: '', clicks: '' });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← Back to Dashboard</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Attribution</h1>
            <p className="mt-1 text-sm text-gray-500">Which ads build the money — and which burn it (first-touch)</p>
          </div>
          <div className="mt-4 flex gap-2 md:mt-0">
            <select value={months} onChange={(e) => setMonths(Number(e.target.value))}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              {[3, 6, 12].map((m) => <option key={m} value={m}>{m} months</option>)}
            </select>
            <select value={effectiveCompany} onChange={(e) => setCompanyId(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
        </div>

        {/* Record spend */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Record ad spend</h2>
          <div className="flex gap-2 flex-wrap items-end">
            <input type="date" className="rounded-md border border-gray-300 px-3 py-2 text-sm"
              value={spend.date} onChange={(e) => setSpend({ ...spend, date: e.target.value })} />
            <input className="rounded-md border border-gray-300 px-3 py-2 text-sm w-32" placeholder="channel (facebook)"
              value={spend.channel} onChange={(e) => setSpend({ ...spend, channel: e.target.value.toLowerCase() })} />
            <input className="rounded-md border border-gray-300 px-3 py-2 text-sm w-40" placeholder="campaign (optional)"
              value={spend.campaign} onChange={(e) => setSpend({ ...spend, campaign: e.target.value })} />
            <input type="number" step="0.01" className="rounded-md border border-gray-300 px-3 py-2 text-sm w-28" placeholder="$ spend"
              value={spend.amount} onChange={(e) => setSpend({ ...spend, amount: e.target.value })} />
            <input type="number" className="rounded-md border border-gray-300 px-3 py-2 text-sm w-24" placeholder="clicks"
              value={spend.clicks} onChange={(e) => setSpend({ ...spend, clicks: e.target.value })} />
            <button
              className="px-4 py-2 rounded-md text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              disabled={record.isPending || !spend.date || !spend.channel || !spend.amount || !effectiveCompany}
              onClick={async () => {
                try {
                  await record.mutateAsync({
                    companyId: effectiveCompany,
                    date: new Date(spend.date),
                    channel: spend.channel,
                    campaign: spend.campaign || '',
                    spend: Number(spend.amount),
                    clicks: spend.clicks ? Number(spend.clicks) : undefined,
                  });
                  setSpend({ ...spend, amount: '', clicks: '' });
                  await refetch();
                } catch (e: any) { alert(`Failed: ${e.message}`); }
              }}>
              {record.isPending ? 'Saving…' : 'Record'}
            </button>
            <p className="text-xs text-gray-400 w-full">Re-recording the same day/channel/campaign corrects the figure (no duplicates).</p>
          </div>
        </div>

        {/* CAC / ROAS by channel */}
        <div className="bg-white shadow rounded-lg p-6 mb-6 overflow-x-auto">
          <h2 className="font-semibold text-gray-900 mb-3">CAC &amp; ROAS by channel (monthly)</h2>
          {!report?.channels.length ? (
            <p className="text-sm text-gray-500">No spend or attributed revenue yet. Record spend above; leads/orders carry UTM automatically.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-4">Month</th><th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4 text-right">Spend</th><th className="py-2 pr-4 text-right">New customers</th>
                  <th className="py-2 pr-4 text-right">CAC</th><th className="py-2 pr-4 text-right">Attributed revenue</th>
                  <th className="py-2 text-right">ROAS</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {report.channels.map((r: any) => (
                  <tr key={`${r.month}|${r.channel}`} className={r.roas != null && r.roas < 1 ? 'bg-red-50' : undefined}>
                    <td className="py-2 pr-4">{r.month}</td>
                    <td className="py-2 pr-4">{r.channel}</td>
                    <td className="py-2 pr-4 text-right">{money(r.spend)}</td>
                    <td className="py-2 pr-4 text-right">{r.newCustomers}</td>
                    <td className="py-2 pr-4 text-right">{r.cac != null ? money(r.cac) : '—'}</td>
                    <td className="py-2 pr-4 text-right">{money(r.attributedRevenue)}</td>
                    <td className={`py-2 text-right font-medium ${r.roas == null ? '' : r.roas >= 1 ? 'text-green-700' : 'text-red-600'}`}>
                      {r.roas != null ? `${r.roas.toFixed(2)}×` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* ROAS per campaign + LTV */}
        <div className="grid md:grid-cols-2 gap-6">
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="font-semibold text-gray-900 mb-3">ROAS by campaign ({months}mo)</h2>
            {!report?.campaigns.length ? (
              <p className="text-sm text-gray-500">No campaign-tagged spend/revenue yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {report.campaigns.map((c: any) => (
                  <div key={c.campaign} className="flex items-center justify-between">
                    <span className="text-gray-700">{c.campaign}</span>
                    <span className="text-gray-500">{money(c.attributedRevenue)} / {money(c.spend)}</span>
                    <span className={`font-medium ${c.roas == null ? '' : c.roas >= 1 ? 'text-green-700' : 'text-red-600'}`}>
                      {c.roas != null ? `${c.roas.toFixed(2)}×` : '—'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="font-semibold text-gray-900 mb-3">Top customers by lifetime value</h2>
            {!ltv?.length ? (
              <p className="text-sm text-gray-500">No revenue events with customers yet.</p>
            ) : (
              <div className="space-y-2 text-sm">
                {ltv.map((c: any) => (
                  <div key={c.customerId} className="flex items-center justify-between">
                    <span className="text-gray-700">{c.name ?? c.customerId}</span>
                    <span className="text-xs text-gray-400">{c.acquisitionSource ?? 'organic'}</span>
                    <span className="font-medium text-gray-900">{money(c.ltv)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

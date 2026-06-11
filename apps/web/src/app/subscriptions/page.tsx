'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

function subStatusColor(status: string) {
  switch (status) {
    case 'ACTIVE': return 'bg-green-100 text-green-800';
    case 'PAST_DUE': return 'bg-red-100 text-red-800';
    case 'PAUSED': return 'bg-yellow-100 text-yellow-800';
    case 'CANCELLED': return 'bg-gray-100 text-gray-600';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function SubscriptionsPage() {
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [showNew, setShowNew] = useState(false);
  const companyId = companyFilter === 'all' ? undefined : companyFilter;

  const { data: companies } = trpc.company.list.useQuery();
  const { data: subs, refetch } = trpc.subscription.list.useQuery({ companyId });
  const { data: mrr, refetch: refetchMrr } = trpc.subscription.mrr.useQuery({ companyId });
  const recordRenewal = trpc.subscription.recordRenewal.useMutation();
  const markFailed = trpc.subscription.markPaymentFailed.useMutation();
  const update = trpc.subscription.update.useMutation();
  const create = trpc.subscription.create.useMutation();
  const convertLead = trpc.lead.convertToSubscription.useMutation();
  const { data: wonLeads, refetch: refetchLeads } = trpc.lead.list.useQuery({ status: 'WON', limit: 20 });
  const [convertTarget, setConvertTarget] = useState<any | null>(null);
  const [convForm, setConvForm] = useState({ name: '', amount: '', interval: 'MONTHLY' as 'MONTHLY' | 'QUARTERLY' | 'YEARLY', companyId: '' });

  // new subscription form
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [interval, setInterval_] = useState<'MONTHLY' | 'QUARTERLY' | 'YEARLY'>('MONTHLY');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const [customerId, setCustomerId] = useState('');
  const { data: customerOptions } = trpc.customer.search.useQuery(
    { query: customerSearch },
    { enabled: customerSearch.length >= 2 }
  );

  const refresh = async () => { await Promise.all([refetch(), refetchMrr()]); };
  const act = async (fn: () => Promise<unknown>, label: string) => {
    try { await fn(); await refresh(); } catch (e: any) { alert(`${label} failed: ${e.message}`); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← Back to Dashboard</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Subscriptions</h1>
            <p className="mt-1 text-sm text-gray-500">Recurring revenue — renewals, dunning, churn</p>
          </div>
          <div className="mt-4 flex gap-2 md:mt-0">
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All companies</option>
              {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowNew(true)}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
              + New Subscription
            </button>
          </div>
        </div>

        {/* MRR cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">MRR</div>
            <div className="text-2xl font-bold text-gray-900">{money(mrr?.mrr)}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Active</div>
            <div className="text-2xl font-bold text-green-700">{mrr?.activeCount ?? 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Past due</div>
            <div className="text-2xl font-bold text-red-600">{mrr?.pastDueCount ?? 0}</div>
          </div>
          <div className="bg-white rounded-lg shadow p-4">
            <div className="text-sm text-gray-500">Churn risk</div>
            <div className="text-2xl font-bold text-amber-600">{mrr?.churnRiskCount ?? 0}</div>
          </div>
        </div>

        {/* Won leads ready to convert (Eve intake closes here) */}
        {!!wonLeads?.length && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Won leads — convert to subscription</h2>
            <div className="space-y-2">
              {wonLeads.map((l: any) => (
                <div key={l.id} className="flex items-center justify-between text-sm flex-wrap gap-2">
                  <div>
                    <span className="text-gray-900 font-medium">{l.name}</span>
                    <span className="text-gray-500 ml-2">{l.phone}{l.source ? ` · via ${l.source}` : ''}</span>
                  </div>
                  <button
                    className="px-3 py-1.5 text-xs rounded-md text-white bg-cyan-600 hover:bg-cyan-700"
                    onClick={() => {
                      setConvertTarget(l);
                      setConvForm({ name: `${l.name} — subscription`, amount: '', interval: 'MONTHLY', companyId: l.companyId ?? '' });
                    }}>
                    🔁 Convert to subscription
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* List */}
        {!subs?.length ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No subscriptions yet. Win a Business Builders deal and start one — or convert a WON lead.
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
            {subs.map((s: any) => (
              <div key={s.id} className="px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{s.name}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${subStatusColor(s.status)}`}>
                        {s.status.replace('_', ' ')}
                      </span>
                      {s.dunningStage > 0 && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800">
                          dunning {s.dunningStage}/3
                        </span>
                      )}
                      {s.churnRisk && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          ⚠️ churn risk
                        </span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {s.customer?.name} · {money(Number(s.amount))}/{s.interval.toLowerCase()} · renews{' '}
                      {new Date(s.currentPeriodEnd).toLocaleDateString()}
                      {s.cancelAtPeriodEnd ? ' · cancels at period end' : ''}
                    </div>
                  </div>
                  {s.status !== 'CANCELLED' && (
                    <div className="flex gap-2 flex-wrap">
                      <button
                        className="px-3 py-1.5 text-xs rounded-md text-white bg-green-600 hover:bg-green-700"
                        onClick={() => act(() => recordRenewal.mutateAsync({ id: s.id }), 'Record renewal')}>
                        💵 Record renewal
                      </button>
                      <button
                        className="px-3 py-1.5 text-xs rounded-md border border-orange-300 text-orange-700 hover:bg-orange-50"
                        onClick={() => act(() => markFailed.mutateAsync({ id: s.id }), 'Mark failed')}>
                        Payment failed
                      </button>
                      <button
                        className="px-3 py-1.5 text-xs rounded-md border border-gray-300 text-gray-700 hover:bg-gray-50"
                        onClick={() => act(() => update.mutateAsync({ id: s.id, cancelAtPeriodEnd: !s.cancelAtPeriodEnd }), 'Update')}>
                        {s.cancelAtPeriodEnd ? 'Undo cancel' : 'Cancel at period end'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Convert lead modal */}
        {convertTarget && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">Convert “{convertTarget.name}” to subscription</h2>
              <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Subscription name" value={convForm.name}
                onChange={(e) => setConvForm({ ...convForm, name: e.target.value })} />
              <div className="flex gap-2">
                <input className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" type="number" step="0.01"
                  placeholder="Amount" value={convForm.amount}
                  onChange={(e) => setConvForm({ ...convForm, amount: e.target.value })} />
                <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" value={convForm.interval}
                  onChange={(e) => setConvForm({ ...convForm, interval: e.target.value as any })}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
              <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" value={convForm.companyId}
                onChange={(e) => setConvForm({ ...convForm, companyId: e.target.value })}>
                <option value="">Select company…</option>
                {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex justify-end gap-3 pt-2">
                <button className="px-4 py-2 text-sm rounded-md border border-gray-300" onClick={() => setConvertTarget(null)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm rounded-md text-white bg-cyan-600 hover:bg-cyan-700 disabled:opacity-50"
                  disabled={convertLead.isPending || !convForm.name || !convForm.amount || !convForm.companyId}
                  onClick={() =>
                    act(async () => {
                      await convertLead.mutateAsync({
                        leadId: convertTarget.id, companyId: convForm.companyId,
                        name: convForm.name, amount: Number(convForm.amount), interval: convForm.interval,
                      });
                      setConvertTarget(null);
                      await refetchLeads();
                    }, 'Convert lead')
                  }>
                  {convertLead.isPending ? 'Converting…' : 'Convert'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* New subscription modal */}
        {showNew && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">New Subscription</h2>
              <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Name (e.g. Acme — hosting + automation)"
                value={name} onChange={(e) => setName(e.target.value)} />
              <div>
                <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Search customer…" value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(''); }} />
                {customerSearch.length >= 2 && !customerId && (
                  <div className="border rounded-md mt-1 max-h-36 overflow-y-auto divide-y">
                    {customerOptions?.map((c: any) => (
                      <button key={c.id} className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); }}>
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <input className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" type="number" step="0.01"
                  placeholder="Amount" value={amount} onChange={(e) => setAmount(e.target.value)} />
                <select className="rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={interval} onChange={(e) => setInterval_(e.target.value as any)}>
                  <option value="MONTHLY">Monthly</option>
                  <option value="QUARTERLY">Quarterly</option>
                  <option value="YEARLY">Yearly</option>
                </select>
              </div>
              <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={newCompanyId} onChange={(e) => setNewCompanyId(e.target.value)}>
                <option value="">Select company…</option>
                {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex justify-end gap-3 pt-2">
                <button className="px-4 py-2 text-sm rounded-md border border-gray-300" onClick={() => setShowNew(false)}>
                  Cancel
                </button>
                <button
                  className="px-4 py-2 text-sm rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  disabled={create.isPending || !name || !customerId || !newCompanyId || !amount}
                  onClick={() =>
                    act(async () => {
                      await create.mutateAsync({
                        name, customerId, companyId: newCompanyId,
                        amount: Number(amount), interval,
                      });
                      setShowNew(false);
                    }, 'Create')
                  }>
                  {create.isPending ? 'Creating…' : 'Create'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

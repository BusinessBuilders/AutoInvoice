'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

function orderStatusColor(status: string) {
  switch (status) {
    case 'PAID': return 'bg-green-100 text-green-800';
    case 'FULFILLED': return 'bg-blue-100 text-blue-800';
    case 'PENDING': return 'bg-gray-100 text-gray-800';
    case 'PARTIALLY_REFUNDED': return 'bg-orange-100 text-orange-800';
    case 'REFUNDED': return 'bg-red-100 text-red-800';
    case 'CANCELLED': return 'bg-gray-100 text-gray-500';
    default: return 'bg-gray-100 text-gray-800';
  }
}

export default function OrdersPage() {
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [reviewOnly, setReviewOnly] = useState(false);
  const [showSources, setShowSources] = useState(false);
  const companyId = companyFilter === 'all' ? undefined : companyFilter;

  const { data: companies } = trpc.company.list.useQuery();
  const { data: orders, refetch } = trpc.order.list.useQuery({
    companyId,
    needsReview: reviewOnly ? true : undefined,
    limit: 100,
  });
  const { data: sources, refetch: refetchSources } = trpc.order.listIngestSources.useQuery({ companyId });
  const markFulfilled = trpc.order.markFulfilled.useMutation();
  const resolveReview = trpc.order.resolveReview.useMutation();
  const createSource = trpc.order.createIngestSource.useMutation();
  const setSourceActive = trpc.order.setIngestSourceActive.useMutation();

  const [newSource, setNewSource] = useState({ companyId: '', key: '', name: '', kind: 'custom' as const });
  const [createdSecret, setCreatedSecret] = useState<{ key: string; secret: string } | null>(null);

  const act = async (fn: () => Promise<unknown>, label: string) => {
    try { await fn(); await refetch(); } catch (e: any) { alert(`${label} failed: ${e.message}`); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← Back to Dashboard</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Orders</h1>
            <p className="mt-1 text-sm text-gray-500">Ingested from your online stores — every paid order becomes an invoice + revenue event</p>
          </div>
          <div className="mt-4 flex gap-2 md:mt-0 flex-wrap">
            <Link href="/products" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
              🏷️ Products
            </Link>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All companies</option>
              {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <label className="flex items-center gap-2 text-sm text-gray-700 px-2">
              <input type="checkbox" checked={reviewOnly} onChange={(e) => setReviewOnly(e.target.checked)} />
              needs review
            </label>
            <button onClick={() => setShowSources(!showSources)}
              className="px-4 py-2 rounded-md text-sm font-medium border border-gray-300 text-gray-700 hover:bg-gray-50">
              🔌 Stores ({sources?.length ?? 0})
            </button>
          </div>
        </div>

        {/* Ingest sources */}
        {showSources && (
          <div className="bg-white shadow rounded-lg p-6 mb-6">
            <h2 className="font-semibold text-gray-900 mb-3">Connected stores (webhook sources)</h2>
            <div className="space-y-2 mb-4">
              {sources?.map((s: any) => (
                <div key={s.id} className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-mono">{s.key}</span>
                    <span className="text-gray-500 ml-2">{s.name} · {s.kind}</span>
                    {!s.active && <span className="ml-2 text-xs text-red-500">inactive</span>}
                    {s.lastSeenAt && <span className="ml-2 text-xs text-gray-400">last order {new Date(s.lastSeenAt).toLocaleDateString()}</span>}
                  </div>
                  <button className="text-xs text-blue-600 hover:underline"
                    onClick={() => act(async () => { await setSourceActive.mutateAsync({ id: s.id, active: !s.active }); await refetchSources(); }, 'Toggle')}>
                    {s.active ? 'deactivate' : 'activate'}
                  </button>
                </div>
              ))}
              {!sources?.length && <p className="text-sm text-gray-500">No stores connected.</p>}
            </div>

            {createdSecret ? (
              <div className="rounded-md bg-amber-50 border border-amber-300 p-4 text-sm">
                <p className="font-medium text-amber-900">HMAC secret for “{createdSecret.key}” — shown ONCE. Copy it now:</p>
                <div className="flex items-center gap-2 mt-2">
                  <code className="bg-white border rounded px-2 py-1 text-xs break-all flex-1">{createdSecret.secret}</code>
                  <button className="px-3 py-1.5 text-xs rounded-md text-white bg-amber-600 hover:bg-amber-700"
                    onClick={() => { navigator.clipboard.writeText(createdSecret.secret); }}>
                    📋 Copy
                  </button>
                </div>
                <p className="text-xs text-amber-800 mt-2">
                  Webhook URL: <code>POST /api/webhook/orders/{createdSecret.key}</code> · sign raw body with
                  HMAC-SHA256, header <code>X-AutoInvoice-Signature: sha256=&lt;hex&gt;</code> + <code>X-AutoInvoice-Timestamp</code>.
                </p>
                <button className="text-xs text-amber-700 underline mt-2" onClick={() => setCreatedSecret(null)}>
                  I copied it — dismiss
                </button>
              </div>
            ) : (
              <div className="flex gap-2 flex-wrap items-end">
                <input className="rounded-md border border-gray-300 px-3 py-2 text-sm w-36" placeholder="key (a-z0-9-)"
                  value={newSource.key}
                  onChange={(e) => setNewSource({ ...newSource, key: e.target.value.toLowerCase() })} />
                <input className="rounded-md border border-gray-300 px-3 py-2 text-sm flex-1 min-w-32" placeholder="Store name"
                  value={newSource.name} onChange={(e) => setNewSource({ ...newSource, name: e.target.value })} />
                <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" value={newSource.kind}
                  onChange={(e) => setNewSource({ ...newSource, kind: e.target.value as any })}>
                  <option value="custom">custom</option>
                  <option value="stripe">stripe</option>
                  <option value="shopify">shopify</option>
                </select>
                <select className="rounded-md border border-gray-300 px-3 py-2 text-sm" value={newSource.companyId}
                  onChange={(e) => setNewSource({ ...newSource, companyId: e.target.value })}>
                  <option value="">Company…</option>
                  {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
                <button
                  className="px-4 py-2 rounded-md text-sm text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  disabled={createSource.isPending || !newSource.key || !newSource.name || !newSource.companyId}
                  onClick={() =>
                    act(async () => {
                      const created = await createSource.mutateAsync(newSource);
                      setCreatedSecret({ key: created.key, secret: created.secret });
                      setNewSource({ companyId: newSource.companyId, key: '', name: '', kind: 'custom' });
                      await refetchSources();
                    }, 'Create store')
                  }>
                  Connect store
                </button>
              </div>
            )}
          </div>
        )}

        {/* Orders list */}
        {!orders?.items.length ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No orders{reviewOnly ? ' needing review' : ''} yet. Connect a store and orders flow in automatically.
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg divide-y divide-gray-200">
            {orders.items.map((o: any) => (
              <div key={o.id} className="px-4 sm:px-6 py-4">
                <div className="flex items-center justify-between flex-wrap gap-3">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-sm text-gray-900">{o.externalId}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${orderStatusColor(o.status)}`}>
                        {o.status.replace('_', ' ')}
                      </span>
                      <span className="text-xs text-gray-500">via {o.source}</span>
                      {o.needsReview && (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800">needs review</span>
                      )}
                    </div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {o.customer?.name ?? 'unmatched customer'} ·{' '}
                      {o.items.map((it: any) => `${it.quantity}× ${it.sku}`).join(', ')} ·{' '}
                      {new Date(o.placedAt).toLocaleDateString()}
                      {o.invoice && <> · invoice <Link className="text-blue-600 underline" href={`/invoices/${o.invoice.id}`}>{o.invoice.invoiceNumber}</Link></>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <div className="font-medium text-gray-900">{money(Number(o.total))}</div>
                      {Number(o.refundedAmount) > 0 && (
                        <div className="text-xs text-red-600">-{money(Number(o.refundedAmount))} refunded</div>
                      )}
                    </div>
                    {o.status === 'PAID' && (
                      <button className="px-3 py-1.5 text-xs rounded-md text-white bg-blue-600 hover:bg-blue-700"
                        onClick={() => act(() => markFulfilled.mutateAsync({ id: o.id }), 'Fulfill')}>
                        📦 Fulfilled
                      </button>
                    )}
                    {o.needsReview && (
                      <button className="px-3 py-1.5 text-xs rounded-md border border-amber-400 text-amber-700 hover:bg-amber-50"
                        onClick={() => act(() => resolveReview.mutateAsync({ id: o.id }), 'Resolve review')}>
                        ✓ Reviewed
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

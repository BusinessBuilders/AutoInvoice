'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { money } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

export default function ProductsPage() {
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [showNew, setShowNew] = useState(false);
  const companyId = companyFilter === 'all' ? undefined : companyFilter;

  const { data: companies } = trpc.company.list.useQuery();
  const { data: products, refetch } = trpc.product.list.useQuery({ companyId });
  const { data: marginReport } = trpc.product.marginReport.useQuery(
    { companyId: companyId ?? '' },
    { enabled: !!companyId }
  );
  const create = trpc.product.create.useMutation();
  const update = trpc.product.update.useMutation();

  const [form, setForm] = useState({ sku: '', name: '', price: '', cogs: '', stockQty: '0', lowStockThreshold: '0', companyId: '' });

  const act = async (fn: () => Promise<unknown>, label: string) => {
    try { await fn(); await refetch(); } catch (e: any) { alert(`${label} failed: ${e.message}`); }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← Back to Dashboard</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Products</h1>
            <p className="mt-1 text-sm text-gray-500">Catalog with COGS + stock counts (inventory-lite)</p>
          </div>
          <div className="mt-4 flex gap-2 md:mt-0">
            <Link href="/orders" className="px-4 py-2 rounded-md text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700">
              📦 Orders
            </Link>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All companies</option>
              {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button onClick={() => setShowNew(true)}
              className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
              + Product
            </button>
          </div>
        </div>

        {/* Catalog */}
        <div className="bg-white shadow rounded-lg overflow-x-auto mb-8">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3 text-right">Price</th>
                <th className="px-4 py-3 text-right">COGS</th>
                <th className="px-4 py-3 text-right">Margin</th>
                <th className="px-4 py-3 text-right">Stock</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {products?.map((p: any) => {
                const low = p.lowStockThreshold > 0 && p.stockQty <= p.lowStockThreshold;
                return (
                  <tr key={p.id} className={low ? 'bg-red-50' : undefined}>
                    <td className="px-4 py-3 font-mono">{p.sku}</td>
                    <td className="px-4 py-3">{p.name}{!p.active && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}</td>
                    <td className="px-4 py-3 text-right">{money(Number(p.price))}</td>
                    <td className="px-4 py-3 text-right">{p.cogs != null ? money(Number(p.cogs)) : '—'}</td>
                    <td className="px-4 py-3 text-right">
                      {p.cogs != null ? money(Number(p.price) - Number(p.cogs)) : '—'}
                    </td>
                    <td className={`px-4 py-3 text-right font-medium ${low ? 'text-red-700' : ''}`}>
                      {p.stockQty}{low ? ' ⚠️' : ''}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button className="text-xs text-blue-600 hover:underline"
                        onClick={() => {
                          const qty = prompt(`New stock count for ${p.sku}:`, String(p.stockQty));
                          if (qty != null) act(() => update.mutateAsync({ id: p.id, stockQty: Number(qty) }), 'Update stock');
                        }}>
                        adjust stock
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!products?.length && (
                <tr><td colSpan={7} className="px-4 py-10 text-center text-gray-500">No products yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Margin per SKU per channel */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Margin per SKU per channel</h2>
          {!companyId ? (
            <p className="text-sm text-gray-500">Pick a company to see the margin report.</p>
          ) : !marginReport?.length ? (
            <p className="text-sm text-gray-500">No paid orders yet for this company.</p>
          ) : (
            <table className="min-w-full text-sm">
              <thead className="text-left text-xs uppercase text-gray-500">
                <tr>
                  <th className="py-2 pr-4">SKU</th><th className="py-2 pr-4">Channel</th>
                  <th className="py-2 pr-4 text-right">Units</th><th className="py-2 pr-4 text-right">Revenue</th>
                  <th className="py-2 pr-4 text-right">COGS</th><th className="py-2 pr-4 text-right">Margin</th>
                  <th className="py-2 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {marginReport.map((r: any) => (
                  <tr key={`${r.sku}|${r.channel}`}>
                    <td className="py-2 pr-4 font-mono">{r.sku}</td>
                    <td className="py-2 pr-4">{r.channel}</td>
                    <td className="py-2 pr-4 text-right">{r.units}</td>
                    <td className="py-2 pr-4 text-right">{money(r.revenue)}</td>
                    <td className="py-2 pr-4 text-right">{money(r.cogs)}</td>
                    <td className="py-2 pr-4 text-right font-medium">{money(r.margin)}</td>
                    <td className="py-2 text-right">{r.marginPct != null ? `${r.marginPct.toFixed(1)}%` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* New product modal */}
        {showNew && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-3">
              <h2 className="text-lg font-semibold text-gray-900">New Product</h2>
              <div className="flex gap-2">
                <input className="w-36 rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="SKU"
                  value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value.toUpperCase() })} />
                <input className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" placeholder="Name"
                  value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <input className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" type="number" step="0.01"
                  placeholder="Price" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                <input className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm" type="number" step="0.01"
                  placeholder="COGS (optional)" value={form.cogs} onChange={(e) => setForm({ ...form, cogs: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <label className="flex-1 text-xs text-gray-600">Stock
                  <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" type="number"
                    value={form.stockQty} onChange={(e) => setForm({ ...form, stockQty: e.target.value })} />
                </label>
                <label className="flex-1 text-xs text-gray-600">Low-stock alert at
                  <input className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm" type="number"
                    value={form.lowStockThreshold} onChange={(e) => setForm({ ...form, lowStockThreshold: e.target.value })} />
                </label>
              </div>
              <select className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={form.companyId} onChange={(e) => setForm({ ...form, companyId: e.target.value })}>
                <option value="">Select company…</option>
                {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
              <div className="flex justify-end gap-3 pt-2">
                <button className="px-4 py-2 text-sm rounded-md border border-gray-300" onClick={() => setShowNew(false)}>Cancel</button>
                <button
                  className="px-4 py-2 text-sm rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  disabled={create.isPending || !form.sku || !form.name || !form.price || !form.companyId}
                  onClick={() =>
                    act(async () => {
                      await create.mutateAsync({
                        companyId: form.companyId, sku: form.sku, name: form.name,
                        price: Number(form.price), cogs: form.cogs ? Number(form.cogs) : undefined,
                        stockQty: Number(form.stockQty) || 0, lowStockThreshold: Number(form.lowStockThreshold) || 0,
                      });
                      setShowNew(false);
                      setForm({ sku: '', name: '', price: '', cogs: '', stockQty: '0', lowStockThreshold: '0', companyId: form.companyId });
                    }, 'Create product')
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

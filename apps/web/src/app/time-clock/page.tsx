'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';

export const dynamic = 'force-dynamic';

function fmtMinutes(m: number) {
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Date | string | null → value for <input type="datetime-local"> (local tz). */
function toLocalInput(d: Date | string | null | undefined): string {
  if (!d) return '';
  const dt = new Date(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}T${pad(dt.getHours())}:${pad(dt.getMinutes())}`;
}

function fmtClock(d: Date | string | null | undefined): string {
  if (!d) return '—';
  return new Date(d).toLocaleString(undefined, {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

export default function TimeClockPage() {
  const utils = trpc.useContext();
  const [companyId, setCompanyId] = useState<string>('');
  const [days, setDays] = useState(14);
  const [editId, setEditId] = useState<string | null>(null);
  const [editIn, setEditIn] = useState('');
  const [editOut, setEditOut] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addIn, setAddIn] = useState('');
  const [addOut, setAddOut] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const companyFilter = companyId || undefined;

  const companies = (trpc.company.list.useQuery(undefined, { retry: false }).data ?? []) as any[];
  const { data: team, isLoading, error } = trpc.timeClock.teamStatus.useQuery(
    { companyId: companyFilter },
    { refetchInterval: 30000, retry: false }
  );
  const entriesQ = trpc.timeClock.entries.useQuery(
    { companyId: companyFilter, days },
    { retry: false }
  );
  const codesQ = trpc.company.crewCodes.useQuery(undefined, { retry: false });

  const isAdmin = !error;
  const teamRows = (team ?? []) as any[];
  const entries = (entriesQ.data ?? []) as any[];
  const codes = (codesQ.data ?? []) as any[];
  const onClock = teamRows.filter((t) => t.clockedIn);

  function invalidate() {
    utils.timeClock.teamStatus.invalidate();
    utils.timeClock.entries.invalidate();
  }

  const adjust = trpc.timeClock.adjustEntry.useMutation({ onSuccess: () => { invalidate(); setEditId(null); } });
  const createManual = trpc.timeClock.createManualEntry.useMutation({
    onSuccess: () => { invalidate(); setShowAdd(false); setAddIn(''); setAddOut(''); setAddNotes(''); setAddUserId(''); },
  });
  const del = trpc.timeClock.deleteEntry.useMutation({ onSuccess: invalidate });
  const regen = trpc.company.regenerateCrewCode.useMutation({ onSuccess: () => utils.company.crewCodes.invalidate() });

  function startEdit(e: any) {
    setEditId(e.id);
    setEditIn(toLocalInput(e.clockIn));
    setEditOut(toLocalInput(e.clockOut));
    setEditNotes(e.notes ?? '');
  }

  function saveEdit() {
    if (!editId || !editIn) return;
    adjust.mutate({
      id: editId,
      clockIn: new Date(editIn),
      clockOut: editOut ? new Date(editOut) : null,
      notes: editNotes || null,
    });
  }

  function submitAdd() {
    if (!addUserId || !addIn) return;
    createManual.mutate({
      userId: addUserId,
      clockIn: new Date(addIn),
      clockOut: addOut ? new Date(addOut) : undefined,
      notes: addNotes || undefined,
    });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← Back to Dashboard</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Time Clock</h1>
            <p className="mt-1 text-sm text-gray-500">Who&apos;s on the clock — live, with week totals and full edit control</p>
          </div>
          <Link href="/crew" className="mt-4 md:mt-0 inline-flex px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
            🕐 My punch clock
          </Link>
        </div>

        {!isAdmin ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            {error?.message?.includes('Owners') ? 'This panel is for owners/admins — use My punch clock above.' : error?.message}
          </div>
        ) : (
          <>
            {/* Company filter — each business its own clock */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <label className="text-sm font-medium text-gray-700">Business:</label>
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">All businesses</option>
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <label className="text-sm font-medium text-gray-700 ml-2">Window:</label>
              <select
                value={days}
                onChange={(e) => setDays(Number(e.target.value))}
                className="rounded-md border-gray-300 text-sm shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value={7}>7 days</option>
                <option value={14}>14 days</option>
                <option value={30}>30 days</option>
                <option value={90}>90 days</option>
              </select>
            </div>

            {/* Live stats */}
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-5">
                <div className="text-sm text-gray-500">On the clock now</div>
                <div className="text-3xl font-bold text-green-700">{isLoading ? '…' : onClock.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-5">
                <div className="text-sm text-gray-500">Team week total</div>
                <div className="text-3xl font-bold text-gray-900">
                  {fmtMinutes(teamRows.reduce((s, t) => s + t.weekMinutes, 0))}
                </div>
              </div>
            </div>

            {/* Live team panel */}
            <div className="bg-white shadow rounded-lg overflow-hidden divide-y divide-gray-100 mb-8">
              {teamRows.length === 0 ? (
                <div className="px-6 py-8 text-center text-gray-400 text-sm">No crew in this view yet.</div>
              ) : (
                teamRows
                  .slice()
                  .sort((a, b) => Number(b.clockedIn) - Number(a.clockedIn) || b.weekMinutes - a.weekMinutes)
                  .map((t) => (
                    <div key={t.userId} className="px-4 sm:px-6 py-4 flex items-center justify-between flex-wrap gap-2">
                      <div className="flex items-center gap-3">
                        <span className={`w-2.5 h-2.5 rounded-full ${t.clockedIn ? 'bg-green-500 animate-pulse' : 'bg-gray-300'}`} />
                        <div>
                          <div className="font-medium text-gray-900">{t.name}</div>
                          <div className="text-xs text-gray-500">
                            {t.role.toLowerCase()}
                            {t.clockedIn && t.since && ` · in since ${new Date(t.since).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`}
                            {t.lastGps && (
                              <a className="text-blue-600 ml-1" target="_blank" rel="noreferrer"
                                href={`https://maps.google.com/?q=${t.lastGps.lat},${t.lastGps.lng}`}>📍 punch location</a>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-gray-900">{fmtMinutes(t.weekMinutes)}</div>
                        <div className="text-xs text-gray-400">this week</div>
                      </div>
                    </div>
                  ))
              )}
            </div>

            {/* Editable entries */}
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xl font-bold text-gray-900">Time entries</h2>
              <button
                onClick={() => setShowAdd((v) => !v)}
                className="px-3 py-1.5 rounded-md text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
              >
                {showAdd ? 'Cancel' : '+ Add manual entry'}
              </button>
            </div>

            {showAdd && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4 grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Worker</label>
                  <select value={addUserId} onChange={(e) => setAddUserId(e.target.value)}
                    className="w-full rounded-md border-gray-300 text-sm shadow-sm">
                    <option value="">Select worker…</option>
                    {teamRows.map((t) => <option key={t.userId} value={t.userId}>{t.name}</option>)}
                  </select>
                </div>
                <div className="hidden sm:block" />
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Clock in</label>
                  <input type="datetime-local" value={addIn} onChange={(e) => setAddIn(e.target.value)}
                    className="w-full rounded-md border-gray-300 text-sm shadow-sm" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Clock out (optional)</label>
                  <input type="datetime-local" value={addOut} onChange={(e) => setAddOut(e.target.value)}
                    className="w-full rounded-md border-gray-300 text-sm shadow-sm" />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-gray-600 mb-1">Note (optional)</label>
                  <input type="text" value={addNotes} onChange={(e) => setAddNotes(e.target.value)}
                    placeholder="e.g. forgot to punch in" className="w-full rounded-md border-gray-300 text-sm shadow-sm" />
                </div>
                <div className="sm:col-span-2 flex justify-end">
                  <button onClick={submitAdd} disabled={!addUserId || !addIn || createManual.isPending}
                    className="px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50">
                    {createManual.isPending ? 'Saving…' : 'Save entry'}
                  </button>
                </div>
                {createManual.error && <p className="sm:col-span-2 text-sm text-red-600">{createManual.error.message}</p>}
              </div>
            )}

            <div className="bg-white shadow rounded-lg overflow-hidden mb-4">
              <table className="min-w-full divide-y divide-gray-200 text-sm">
                <thead className="bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase">
                  <tr>
                    <th className="px-4 py-2">Worker</th>
                    <th className="px-4 py-2">Business</th>
                    <th className="px-4 py-2">In</th>
                    <th className="px-4 py-2">Out</th>
                    <th className="px-4 py-2">Total</th>
                    <th className="px-4 py-2">Note</th>
                    <th className="px-4 py-2 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {entriesQ.isLoading ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">Loading entries…</td></tr>
                  ) : entries.length === 0 ? (
                    <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No entries in this window.</td></tr>
                  ) : (
                    entries.map((e) =>
                      editId === e.id ? (
                        <tr key={e.id} className="bg-yellow-50">
                          <td className="px-4 py-2 font-medium text-gray-900">{e.userName}</td>
                          <td className="px-4 py-2 text-gray-500">{e.companyName ?? '—'}</td>
                          <td className="px-4 py-2">
                            <input type="datetime-local" value={editIn} onChange={(ev) => setEditIn(ev.target.value)}
                              className="rounded border-gray-300 text-xs" />
                          </td>
                          <td className="px-4 py-2">
                            <input type="datetime-local" value={editOut} onChange={(ev) => setEditOut(ev.target.value)}
                              className="rounded border-gray-300 text-xs" />
                          </td>
                          <td className="px-4 py-2 text-gray-400">auto</td>
                          <td className="px-4 py-2">
                            <input type="text" value={editNotes} onChange={(ev) => setEditNotes(ev.target.value)}
                              className="rounded border-gray-300 text-xs w-full" />
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <button onClick={saveEdit} disabled={adjust.isPending || !editIn}
                              className="text-green-700 font-medium mr-3 disabled:opacity-50">Save</button>
                            <button onClick={() => setEditId(null)} className="text-gray-500">Cancel</button>
                          </td>
                        </tr>
                      ) : (
                        <tr key={e.id} className={e.open ? 'bg-green-50/40' : ''}>
                          <td className="px-4 py-2 font-medium text-gray-900">{e.userName}</td>
                          <td className="px-4 py-2 text-gray-500">{e.companyName ?? '—'}</td>
                          <td className="px-4 py-2 text-gray-700">{fmtClock(e.clockIn)}</td>
                          <td className="px-4 py-2 text-gray-700">
                            {e.open ? <span className="text-green-700 font-medium">on the clock</span> : fmtClock(e.clockOut)}
                          </td>
                          <td className="px-4 py-2 text-gray-700">{e.totalMinutes != null ? fmtMinutes(e.totalMinutes) : '—'}</td>
                          <td className="px-4 py-2 text-gray-500 max-w-[14rem] truncate" title={e.notes ?? ''}>
                            {e.notes ?? ''}
                            {e.editedByName && <span className="block text-[10px] text-amber-600">edited by {e.editedByName}</span>}
                          </td>
                          <td className="px-4 py-2 text-right whitespace-nowrap">
                            <button onClick={() => startEdit(e)} className="text-blue-600 font-medium mr-3">Edit</button>
                            <button
                              onClick={() => { if (confirm(`Delete ${e.userName}'s entry from ${fmtClock(e.clockIn)}?`)) del.mutate({ id: e.id }); }}
                              className="text-red-600">Delete</button>
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
            {(adjust.error || del.error) && (
              <p className="text-sm text-red-600 mb-4">{adjust.error?.message ?? del.error?.message}</p>
            )}

            {/* Crew invite codes — each business its own code */}
            <div className="bg-white shadow rounded-lg p-5">
              <h2 className="text-lg font-bold text-gray-900 mb-1">Crew sign-up codes</h2>
              <p className="text-xs text-gray-500 mb-4">
                Share a code + <code>/crew/signup</code> with a new hire. The code routes them to that business&apos;s clock.
              </p>
              <div className="divide-y divide-gray-100">
                {codes.map((c) => (
                  <div key={c.id} className="py-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <div className="font-medium text-gray-900">{c.name}</div>
                      <code className="text-sm text-gray-600">{c.crewSignupCode ?? <span className="text-gray-400">no code yet</span>}</code>
                    </div>
                    <div className="flex items-center gap-3">
                      {c.crewSignupCode && (
                        <button onClick={() => navigator.clipboard?.writeText(c.crewSignupCode)}
                          className="text-sm text-blue-600">Copy</button>
                      )}
                      <button onClick={() => regen.mutate({ companyId: c.id })} disabled={regen.isPending}
                        className="text-sm text-gray-600 hover:text-gray-900 disabled:opacity-50">
                        {c.crewSignupCode ? 'Rotate' : 'Generate'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

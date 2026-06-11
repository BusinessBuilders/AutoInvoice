'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

function fmtMinutes(m: number) {
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export default function TimeClockPage() {
  const { data: team, isLoading, error } = trpc.timeClock.teamStatus.useQuery(undefined, {
    refetchInterval: 30000,
    retry: false,
  });

  const onClock = team?.filter((t) => t.clockedIn) ?? [];

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← Back to Dashboard</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Time Clock</h1>
            <p className="mt-1 text-sm text-gray-500">Who&apos;s on the clock — live, with week totals</p>
          </div>
          <Link href="/crew" className="mt-4 md:mt-0 inline-flex px-4 py-2 rounded-md text-sm font-medium text-white bg-green-600 hover:bg-green-700">
            🕐 My punch clock
          </Link>
        </div>

        {error ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            {error.message.includes('Owners') ? 'This panel is for owners/admins — use My punch clock above.' : error.message}
          </div>
        ) : isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading team…</div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <div className="bg-white rounded-lg shadow p-5">
                <div className="text-sm text-gray-500">On the clock now</div>
                <div className="text-3xl font-bold text-green-700">{onClock.length}</div>
              </div>
              <div className="bg-white rounded-lg shadow p-5">
                <div className="text-sm text-gray-500">Team week total</div>
                <div className="text-3xl font-bold text-gray-900">
                  {fmtMinutes((team ?? []).reduce((s, t) => s + t.weekMinutes, 0))}
                </div>
              </div>
            </div>

            <div className="bg-white shadow rounded-lg overflow-hidden divide-y divide-gray-100">
              {(team ?? [])
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
                ))}
            </div>
            <p className="text-xs text-gray-400 mt-3">
              Crew sign-up: share <code>/crew/signup</code> + the invite code. Hours include open punches in real time.
            </p>
          </>
        )}
      </div>
    </div>
  );
}

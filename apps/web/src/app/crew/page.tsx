'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { jobStatusColor } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

/** Get a GPS fix from the phone; resolves null if denied/unavailable.
 * Hard 6s race: getCurrentPosition can fire NEITHER callback when the
 * permission prompt is ignored, which would hang the punch button forever. */
function getGps(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) return resolve(null);
    const timer = setTimeout(() => resolve(null), 6000);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timer);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      () => {
        clearTimeout(timer);
        resolve(null);
      },
      { enableHighAccuracy: true, timeout: 5000, maximumAge: 60000 }
    );
  });
}

function fmtMinutes(m: number) {
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

export default function CrewHubPage() {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  const { data: status, refetch } = trpc.timeClock.status.useQuery(undefined, {
    refetchInterval: 60000,
  });
  const clockIn = trpc.timeClock.clockIn.useMutation();
  const clockOut = trpc.timeClock.clockOut.useMutation();
  const startJob = trpc.job.start.useMutation();
  const completeJob = trpc.job.complete.useMutation();

  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    try {
      await fn();
      await refetch();
    } catch (e: any) {
      alert(`${label} failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  };

  const handleClockIn = () =>
    act('clock-in', async () => {
      const gps = await getGps();
      await clockIn.mutateAsync({ lat: gps?.lat, lng: gps?.lng });
    });

  const handleClockOut = () =>
    act('clock-out', async () => {
      const gps = await getGps();
      await clockOut.mutateAsync({ lat: gps?.lat, lng: gps?.lng, notes: notes || undefined });
      setNotes('');
    });

  const handleDone = (jobId: string) =>
    act(`done-${jobId}`, async () => {
      const gps = await getGps();
      await completeJob.mutateAsync({ id: jobId, lat: gps?.lat, lng: gps?.lng });
    });

  const mission = status?.mission ?? [];
  const remaining = mission.filter((j: any) => j.status !== 'COMPLETED').length;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-bold text-gray-900">👷 Crew</h1>
          <button
            className="text-sm text-gray-500"
            onClick={() => {
              localStorage.removeItem('accessToken');
              localStorage.removeItem('refreshToken');
              localStorage.removeItem('userRole');
              router.push('/login');
            }}>
            Sign out
          </button>
        </div>

        {/* Clock card */}
        <div className={`rounded-2xl shadow-lg p-6 mb-6 text-center ${status?.clockedIn ? 'bg-green-600' : 'bg-white'}`}>
          {status?.clockedIn ? (
            <>
              <div className="text-green-100 text-sm">On the clock since{' '}
                {status.openEntry && new Date(status.openEntry.clockIn).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
              </div>
              <div className="text-4xl font-bold text-white my-2">{fmtMinutes(status.todayMinutes)}</div>
              <input
                className="w-full rounded-md border-0 px-3 py-2 text-sm mb-3"
                placeholder="Note for the day (optional)"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
              <button
                className="w-full py-4 rounded-xl bg-white text-green-700 font-bold text-lg shadow disabled:opacity-60"
                disabled={busy === 'clock-out'}
                onClick={handleClockOut}>
                {busy === 'clock-out' ? 'Punching out…' : '🕐 Clock Out'}
              </button>
            </>
          ) : (
            <>
              <div className="text-gray-500 text-sm">
                {status ? `Worked today: ${fmtMinutes(status.todayMinutes)}` : 'Ready for the day?'}
              </div>
              <button
                className="w-full mt-3 py-5 rounded-xl bg-green-600 text-white font-bold text-xl shadow hover:bg-green-700 disabled:opacity-60"
                disabled={busy === 'clock-in'}
                onClick={handleClockIn}>
                {busy === 'clock-in' ? 'Punching in…' : '🕐 Clock In'}
              </button>
              <p className="text-xs text-gray-400 mt-2">Clocking in shows your mission for the day</p>
            </>
          )}
        </div>

        {/* Mission */}
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-gray-900">Today&apos;s mission</h2>
          {mission.length > 0 && (
            <span className="text-sm text-gray-500">{remaining} of {mission.length} to go</span>
          )}
        </div>
        {!mission.length ? (
          <div className="bg-white rounded-xl shadow p-8 text-center text-gray-500 text-sm">
            No jobs assigned for today.{status?.clockedIn ? '' : ' Clock in and check with the boss.'}
          </div>
        ) : (
          <ol className="space-y-3">
            {mission.map((job: any, idx: number) => (
              <li key={job.id} className="bg-white rounded-xl shadow p-4">
                <div className="flex items-start gap-3">
                  <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center font-bold text-white ${job.status === 'COMPLETED' ? 'bg-green-500' : 'bg-indigo-600'}`}>
                    {job.status === 'COMPLETED' ? '✓' : job.routeOrder ?? idx + 1}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-gray-900">{job.title}</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${jobStatusColor(job.status)}`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-600">{job.customer.name}</div>
                    {job.location?.addressLine1 && (
                      <a className="text-sm text-blue-600 block"
                        href={`https://maps.google.com/?q=${encodeURIComponent(`${job.location.addressLine1} ${job.location.city ?? ''}`)}`}
                        target="_blank" rel="noreferrer">
                        📍 {job.location.addressLine1}
                      </a>
                    )}
                    {job.customer.phone && (
                      <a className="text-sm text-blue-600 block" href={`tel:${job.customer.phone}`}>📞 {job.customer.phone}</a>
                    )}
                    {job.customer.notes && (
                      <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">👤 {job.customer.notes}</div>
                    )}
                    <div className="flex gap-2 mt-3">
                      {job.status === 'SCHEDULED' && (
                        <button
                          className="flex-1 py-2.5 rounded-lg bg-yellow-500 text-white font-semibold text-sm disabled:opacity-60"
                          disabled={busy === `start-${job.id}`}
                          onClick={() => act(`start-${job.id}`, () => startJob.mutateAsync({ id: job.id }))}>
                          ▶ Start
                        </button>
                      )}
                      {job.status === 'IN_PROGRESS' && (
                        <button
                          className="flex-1 py-2.5 rounded-lg bg-green-600 text-white font-semibold text-sm disabled:opacity-60"
                          disabled={busy === `done-${job.id}`}
                          onClick={() => handleDone(job.id)}>
                          {busy === `done-${job.id}` ? 'Saving…' : '✅ Done with job'}
                        </button>
                      )}
                      <Link href={`/jobs/${job.id}`}
                        className="py-2.5 px-3 rounded-lg border border-gray-300 text-gray-600 text-sm">
                        📷 Details
                      </Link>
                    </div>
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

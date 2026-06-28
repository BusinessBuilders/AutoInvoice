'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { jobStatusColor } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = (date.getDay() + 6) % 7; // Monday = 0
  date.setDate(date.getDate() - day);
  date.setHours(0, 0, 0, 0);
  return date;
}
const DAY_MS = 86400000;
const fmtDay = (d: Date) => d.toLocaleDateString(undefined, { weekday: 'short', month: 'numeric', day: 'numeric' });
const isoDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const STATUS_BORDER: Record<string, string> = {
  SCHEDULED: 'border-l-blue-500',
  IN_PROGRESS: 'border-l-yellow-500',
  COMPLETED: 'border-l-purple-500',
  CLOSED: 'border-l-green-500',
  REQUESTED: 'border-l-gray-400',
  CANCELLED: 'border-l-red-400',
};

export default function SchedulePage() {
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const companyId = companyFilter === 'all' ? undefined : companyFilter;
  const weekEnd = new Date(weekStart.getTime() + 7 * DAY_MS);

  const { data: companies } = trpc.company.list.useQuery();
  const { data, isLoading } = trpc.job.list.useQuery({
    companyId,
    from: weekStart,
    to: weekEnd,
    limit: 200,
  });
  // date-filtered query excludes null scheduledStart, so fetch requests separately
  const { data: requested } = trpc.job.list.useQuery({
    companyId,
    status: 'REQUESTED' as any,
    limit: 50,
  });

  const days = Array.from({ length: 7 }, (_, i) => new Date(weekStart.getTime() + i * DAY_MS));
  const jobsByDay = new Map<string, any[]>();
  for (const job of data?.items ?? []) {
    if (!job.scheduledStart || job.status === 'CANCELLED') continue;
    const key = isoDay(new Date(job.scheduledStart));
    jobsByDay.set(key, [...(jobsByDay.get(key) ?? []), job]);
  }
  for (const list of Array.from(jobsByDay.values())) {
    list.sort((a, b) => (a.routeOrder ?? 99) - (b.routeOrder ?? 99) ||
      new Date(a.scheduledStart).getTime() - new Date(b.scheduledStart).getTime());
  }
  const today = isoDay(new Date());
  const unscheduled = (requested?.items ?? []).filter((j: any) => !j.scheduledStart);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/jobs" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← All Jobs</Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Schedule</h1>
            <p className="mt-1 text-sm text-gray-500">
              Week of {weekStart.toLocaleDateString(undefined, { month: 'long', day: 'numeric' })}
            </p>
          </div>
          <div className="mt-4 flex gap-2 md:mt-0">
            <button className="px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-100"
              onClick={() => setWeekStart(new Date(weekStart.getTime() - 7 * DAY_MS))}>
              ← Prev
            </button>
            <button className="px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-100"
              onClick={() => setWeekStart(startOfWeek(new Date()))}>
              Today
            </button>
            <button className="px-3 py-2 rounded-md border border-gray-300 text-sm hover:bg-gray-100"
              onClick={() => setWeekStart(new Date(weekStart.getTime() + 7 * DAY_MS))}>
              Next →
            </button>
            <select value={companyFilter} onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm">
              <option value="all">All companies</option>
              {companies?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <Link href="/jobs/day"
              className="px-3 py-2 rounded-md text-sm text-white bg-indigo-600 hover:bg-indigo-700">
              🗺️ Day view
            </Link>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading schedule…</div>
        ) : (
          <>
            {/* Week board: columns on desktop, stacked days on mobile */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-7 gap-3">
              {days.map((d) => {
                const key = isoDay(d);
                const dayJobs = jobsByDay.get(key) ?? [];
                const isToday = key === today;
                return (
                  <div key={key}
                    className={`rounded-lg border ${isToday ? 'border-blue-400 bg-blue-50/50' : 'border-gray-200 bg-white'} flex flex-col min-h-28`}>
                    <Link href={`/jobs/day`}
                      className={`px-3 py-2 text-sm font-semibold border-b ${isToday ? 'text-blue-700 border-blue-200' : 'text-gray-700 border-gray-100'}`}>
                      {fmtDay(d)}
                      <span className="float-right text-xs font-normal text-gray-400">
                        {dayJobs.length || ''}
                      </span>
                    </Link>
                    <div className="p-2 space-y-2 flex-1">
                      {dayJobs.map((job: any) => (
                        <Link key={job.id} href={`/jobs/${job.id}`}
                          className={`block rounded-md border border-gray-200 border-l-4 ${STATUS_BORDER[job.status] ?? ''} bg-white shadow-sm px-2.5 py-2 hover:shadow transition-shadow`}>
                          <div className="text-xs text-gray-400">
                            {job.routeOrder != null && <span className="font-bold text-indigo-600 mr-1">#{job.routeOrder}</span>}
                            {new Date(job.scheduledStart).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </div>
                          <div className="text-sm font-medium text-gray-900 leading-tight">{job.title}</div>
                          <div className="text-xs text-gray-500 truncate">{job.customer?.name}</div>
                          <div className="flex items-center justify-between mt-1">
                            <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${jobStatusColor(job.status)}`}>
                              {job.status.replace('_', ' ')}
                            </span>
                            {job.assignments?.length > 0 && (
                              <span className="text-[10px] text-gray-400" title={job.assignments.map((a: any) => a.user.name).join(', ')}>
                                👷 {job.assignments.length}
                              </span>
                            )}
                          </div>
                        </Link>
                      ))}
                      {!dayJobs.length && <div className="text-xs text-gray-300 text-center pt-2">—</div>}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Unscheduled requests */}
            {unscheduled.length > 0 && (
              <div className="mt-6 bg-white rounded-lg shadow p-4">
                <h2 className="text-sm font-semibold text-gray-700 mb-2">⏳ Requested — needs scheduling</h2>
                <div className="flex flex-wrap gap-2">
                  {unscheduled.map((job: any) => (
                    <Link key={job.id} href={`/jobs/${job.id}`}
                      className="rounded-md border border-dashed border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50">
                      {job.title} <span className="text-gray-400">· {job.customer?.name}</span>
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

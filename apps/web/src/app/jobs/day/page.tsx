'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { jobStatusColor } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function JobsDayPage() {
  const [date, setDate] = useState(todayStr());
  const [companyFilter, setCompanyFilter] = useState<string>('all');

  const { data: companies } = trpc.company.list.useQuery();
  const { data: jobs, isLoading } = trpc.job.dayView.useQuery({
    date: new Date(`${date}T12:00:00`),
    companyId: companyFilter === 'all' ? undefined : companyFilter,
  });

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/jobs" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← All Jobs</Link>

        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Day View</h1>
            <p className="mt-1 text-sm text-gray-500">The route — stop by stop</p>
          </div>
          <div className="flex gap-2">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={companyFilter}
              onChange={(e) => setCompanyFilter(e.target.value)}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="all">All companies</option>
              {companies?.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>

        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading route…</div>
        ) : !jobs?.length ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No jobs scheduled for {date}.
          </div>
        ) : (
          <ol className="space-y-3">
            {jobs.map((job: any, idx: number) => (
              <li key={job.id}>
                <Link
                  href={`/jobs/${job.id}`}
                  className="block bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold">
                      {job.routeOrder ?? idx + 1}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-gray-900">{job.title}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${jobStatusColor(job.status)}`}>
                          {job.status.replace('_', ' ')}
                        </span>
                      </div>
                      <div className="text-sm text-gray-700 mt-0.5">{job.customer.name}</div>
                      {job.location?.addressLine1 && (
                        <a
                          className="text-sm text-blue-600 block"
                          href={`https://maps.google.com/?q=${encodeURIComponent(
                            `${job.location.addressLine1} ${job.location.city ?? ''}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          📍 {job.location.addressLine1}{job.location.city ? `, ${job.location.city}` : ''}
                        </a>
                      )}
                      {job.customer.phone && (
                        <a className="text-sm text-blue-600 block" href={`tel:${job.customer.phone}`}
                          onClick={(e) => e.stopPropagation()}>
                          📞 {job.customer.phone}
                        </a>
                      )}
                      {job.customer.notes && (
                        <div className="text-xs text-amber-700 bg-amber-50 rounded px-2 py-1 mt-1">
                          👤 {job.customer.notes}
                        </div>
                      )}
                      {job.assignments.length > 0 && (
                        <div className="text-xs text-gray-500 mt-1">
                          👷 {job.assignments.map((a: any) => a.user.name).join(', ')}
                        </div>
                      )}
                    </div>
                    <div className="text-right text-sm text-gray-500 flex-shrink-0">
                      {job.scheduledStart &&
                        new Date(job.scheduledStart).toLocaleTimeString(undefined, {
                          hour: 'numeric', minute: '2-digit',
                        })}
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}

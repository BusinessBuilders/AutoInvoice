'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { jobStatusColor } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

const STATUSES = ['REQUESTED', 'SCHEDULED', 'IN_PROGRESS', 'COMPLETED', 'CLOSED', 'CANCELLED'] as const;

export default function JobsPage() {
  const router = useRouter();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [companyFilter, setCompanyFilter] = useState<string>('all');
  const [showNew, setShowNew] = useState(false);

  const { data: companies } = trpc.company.list.useQuery();
  const { data, isLoading, refetch } = trpc.job.list.useQuery({
    status: statusFilter === 'all' ? undefined : (statusFilter as any),
    companyId: companyFilter === 'all' ? undefined : companyFilter,
    limit: 100,
  });

  // New job form
  const [title, setTitle] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [companyId, setCompanyId] = useState('');
  const [scheduledStart, setScheduledStart] = useState('');
  const [customerSearch, setCustomerSearch] = useState('');
  const { data: customerOptions } = trpc.customer.search.useQuery(
    { query: customerSearch },
    { enabled: customerSearch.length >= 2 }
  );
  const createJob = trpc.job.create.useMutation();

  const handleCreate = async () => {
    if (!title || !customerId || !companyId) {
      alert('Title, customer and company are required');
      return;
    }
    try {
      const job = await createJob.mutateAsync({
        title,
        customerId,
        companyId,
        scheduledStart: scheduledStart ? new Date(scheduledStart) : undefined,
      });
      setShowNew(false);
      router.push(`/jobs/${job.id}`);
    } catch (e: any) {
      alert(`Failed to create job: ${e.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        <div className="md:flex md:items-center md:justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Jobs</h1>
            <p className="mt-1 text-sm text-gray-500">Field service — request to closeout</p>
          </div>
          <div className="mt-4 flex space-x-3 md:mt-0">
            <Link
              href="/jobs/day"
              className="inline-flex items-center px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700"
            >
              🗺️ Day View
            </Link>
            <button
              onClick={() => setShowNew(true)}
              className="inline-flex items-center px-4 py-2 rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
            >
              + New Job
            </button>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3 mb-6">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm text-sm py-2 px-3 border"
          >
            <option value="all">All statuses</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s.replace('_', ' ')}</option>
            ))}
          </select>
          <select
            value={companyFilter}
            onChange={(e) => setCompanyFilter(e.target.value)}
            className="rounded-md border-gray-300 shadow-sm text-sm py-2 px-3 border"
          >
            <option value="all">All companies</option>
            {companies?.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* List */}
        {isLoading ? (
          <div className="text-center py-12 text-gray-500">Loading jobs…</div>
        ) : !data?.items.length ? (
          <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
            No jobs yet. Create the first one — this is the crew packet.
          </div>
        ) : (
          <div className="bg-white shadow rounded-lg overflow-hidden divide-y divide-gray-200">
            {data.items.map((job: any) => (
              <Link
                key={job.id}
                href={`/jobs/${job.id}`}
                className="block px-4 py-4 hover:bg-gray-50 sm:px-6"
              >
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="font-medium text-gray-900">{job.jobNumber}</span>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${jobStatusColor(job.status)}`}>
                        {job.status.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="text-sm text-gray-700 mt-1">{job.title}</div>
                    <div className="text-sm text-gray-500">
                      {job.customer?.name}
                      {job.assignments.length > 0 &&
                        ` · crew: ${job.assignments.map((a: any) => a.user.name).join(', ')}`}
                    </div>
                  </div>
                  <div className="text-right text-sm text-gray-500">
                    {job.scheduledStart
                      ? new Date(job.scheduledStart).toLocaleString(undefined, {
                          month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
                        })
                      : 'unscheduled'}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}

        {/* New job modal */}
        {showNew && (
          <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 space-y-4">
              <h2 className="text-lg font-semibold text-gray-900">New Job</h2>
              <input
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                placeholder="Title (e.g. Hydroseed front lawn)"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <div>
                <input
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  placeholder="Search customer…"
                  value={customerSearch}
                  onChange={(e) => { setCustomerSearch(e.target.value); setCustomerId(''); }}
                />
                {customerSearch.length >= 2 && !customerId && (
                  <div className="border rounded-md mt-1 max-h-36 overflow-y-auto divide-y">
                    {customerOptions?.map((c: any) => (
                      <button
                        key={c.id}
                        className="block w-full text-left px-3 py-2 text-sm hover:bg-gray-50"
                        onClick={() => { setCustomerId(c.id); setCustomerSearch(c.name); }}
                      >
                        {c.name} {c.phone ? `· ${c.phone}` : ''}
                      </button>
                    ))}
                    {!customerOptions?.length && (
                      <div className="px-3 py-2 text-sm text-gray-500">No matches</div>
                    )}
                  </div>
                )}
              </div>
              <select
                className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
              >
                <option value="">Select company…</option>
                {companies?.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <label className="block text-sm text-gray-600">
                Scheduled start (optional)
                <input
                  type="datetime-local"
                  className="mt-1 w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
                  value={scheduledStart}
                  onChange={(e) => setScheduledStart(e.target.value)}
                />
              </label>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  className="px-4 py-2 text-sm rounded-md border border-gray-300"
                  onClick={() => setShowNew(false)}
                >
                  Cancel
                </button>
                <button
                  className="px-4 py-2 text-sm rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
                  disabled={createJob.isPending}
                  onClick={handleCreate}
                >
                  {createJob.isPending ? 'Creating…' : 'Create Job'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

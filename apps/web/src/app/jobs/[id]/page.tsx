'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { useParams } from 'next/navigation';
import { jobStatusColor, money } from '@/lib/business-os';

export const dynamic = 'force-dynamic';

type ChecklistItem = { item: string; done: boolean };

export default function JobDetailPage() {
  const params = useParams();
  const jobId = params.id as string;

  const { data: job, isLoading, refetch } = trpc.job.get.useQuery({ id: jobId });

  const schedule = trpc.job.schedule.useMutation();
  const start = trpc.job.start.useMutation();
  const complete = trpc.job.complete.useMutation();
  const close = trpc.job.close.useMutation();
  const cancel = trpc.job.cancel.useMutation();
  const assignCrew = trpc.job.assignCrew.useMutation();
  const removeCrew = trpc.job.removeCrew.useMutation();
  const addPhoto = trpc.job.addPhoto.useMutation();
  const { data: team } = trpc.team.listMembers.useQuery(undefined, { retry: false });

  const [scheduleAt, setScheduleAt] = useState('');
  const [routeOrder, setRouteOrder] = useState('');
  const [closeoutNotes, setCloseoutNotes] = useState('');
  const [customerNotes, setCustomerNotes] = useState('');
  const [actualCost, setActualCost] = useState('');
  const [checklist, setChecklist] = useState<ChecklistItem[] | null>(null);
  const [newItem, setNewItem] = useState('');
  const [photoPhase, setPhotoPhase] = useState<'before' | 'during' | 'after'>('after');
  const [crewUserId, setCrewUserId] = useState('');
  const [closedInvoice, setClosedInvoice] = useState<{ invoiceNumber: string; id: string } | null>(null);

  if (isLoading) return <div className="min-h-screen bg-gray-50 p-12 text-center text-gray-500">Loading…</div>;
  if (!job) return <div className="min-h-screen bg-gray-50 p-12 text-center text-gray-500">Job not found</div>;

  const items: ChecklistItem[] = checklist ?? ((job.checklist as ChecklistItem[]) || []);
  const act = async (fn: () => Promise<unknown>, label: string) => {
    try {
      await fn();
      await refetch();
    } catch (e: any) {
      alert(`${label} failed: ${e.message}`);
    }
  };

  const handlePhotoUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async () => {
      const base64 = (reader.result as string).split(',')[1];
      await act(
        () => addPhoto.mutateAsync({ jobId: job.id, imageData: base64, phase: photoPhase, caption: file.name }),
        'Photo upload'
      );
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
        <Link href="/jobs" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">← All Jobs</Link>

        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="flex items-start justify-between flex-wrap gap-3">
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl font-bold text-gray-900">{job.jobNumber}</h1>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-medium ${jobStatusColor(job.status)}`}>
                  {job.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-lg text-gray-700 mt-1">{job.title}</p>
              {job.description && <p className="text-sm text-gray-500 mt-1">{job.description}</p>}
            </div>
            <div className="text-right text-sm text-gray-600">
              <div className="font-medium">{job.customer.name}</div>
              {job.customer.phone && <a className="text-blue-600" href={`tel:${job.customer.phone}`}>{job.customer.phone}</a>}
              {job.location && (
                <div className="text-gray-500 mt-1">
                  {job.location.addressLine1}{job.location.city ? `, ${job.location.city}` : ''}
                </div>
              )}
              {job.scheduledStart && (
                <div className="mt-1">📅 {new Date(job.scheduledStart).toLocaleString()}</div>
              )}
            </div>
          </div>

          {/* Lifecycle actions */}
          <div className="mt-6 border-t pt-4 flex flex-wrap items-end gap-3">
            {(job.status === 'REQUESTED' || job.status === 'SCHEDULED') && (
              <div className="flex items-end gap-2 flex-wrap">
                <label className="text-sm text-gray-600">
                  {job.status === 'REQUESTED' ? 'Schedule for' : 'Reschedule'}
                  <input type="datetime-local" className="block mt-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                </label>
                <label className="text-sm text-gray-600">
                  Route #
                  <input type="number" className="block mt-1 w-20 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
                    value={routeOrder} onChange={(e) => setRouteOrder(e.target.value)} />
                </label>
                <button
                  className="px-4 py-2 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700"
                  onClick={() => scheduleAt && act(() => schedule.mutateAsync({
                    id: job.id, scheduledStart: new Date(scheduleAt),
                    routeOrder: routeOrder ? Number(routeOrder) : undefined,
                  }), 'Schedule')}
                >
                  📅 Schedule
                </button>
              </div>
            )}
            {job.status === 'SCHEDULED' && (
              <button className="px-4 py-2 text-sm rounded-md text-white bg-yellow-600 hover:bg-yellow-700"
                onClick={() => act(() => start.mutateAsync({ id: job.id }), 'Start')}>
                ▶ Start Job
              </button>
            )}
            {job.status === 'IN_PROGRESS' && (
              <button className="px-4 py-2 text-sm rounded-md text-white bg-purple-600 hover:bg-purple-700"
                onClick={() => act(() => complete.mutateAsync({
                  id: job.id,
                  closeoutNotes: closeoutNotes || undefined,
                  customerNotes: customerNotes || undefined,
                  checklist: items.length ? (items as any) : undefined,
                  actualCost: actualCost ? Number(actualCost) : undefined,
                }), 'Complete')}>
                ✅ Complete Job
              </button>
            )}
            {job.status === 'COMPLETED' && (
              <button className="px-4 py-2 text-sm rounded-md text-white bg-green-600 hover:bg-green-700"
                onClick={() => act(async () => {
                  const res = await close.mutateAsync({ id: job.id });
                  if (res.invoice) setClosedInvoice({ invoiceNumber: res.invoice.invoiceNumber, id: res.invoice.id });
                }, 'Close')}>
                🧾 Close &amp; Invoice
              </button>
            )}
            {job.status !== 'CLOSED' && job.status !== 'CANCELLED' && (
              <button className="px-4 py-2 text-sm rounded-md border border-red-300 text-red-700 hover:bg-red-50"
                onClick={() => confirm('Cancel this job?') && act(() => cancel.mutateAsync({ id: job.id }), 'Cancel')}>
                Cancel Job
              </button>
            )}
          </div>

          {(closedInvoice || job.invoice) && (
            <div className="mt-4 rounded-md bg-green-50 border border-green-200 p-3 text-sm text-green-800">
              Invoice <Link className="underline font-medium" href={`/invoices/${closedInvoice?.id ?? job.invoice!.id}`}>
                {closedInvoice?.invoiceNumber ?? job.invoice!.invoiceNumber}
              </Link>{' '}
              {job.invoice ? `(${job.invoice.status}, ${money(Number(job.invoice.total))})` : 'created'} from this job.
            </div>
          )}
        </div>

        {/* Closeout */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Closeout — the crew packet</h2>
          <div className="space-y-2 mb-4">
            {items.map((it, i) => (
              <label key={i} className="flex items-center gap-2 text-sm text-gray-700">
                <input type="checkbox" checked={it.done}
                  disabled={job.status === 'CLOSED' || job.status === 'CANCELLED'}
                  onChange={(e) => {
                    const next = items.map((x, j) => (j === i ? { ...x, done: e.target.checked } : x));
                    setChecklist(next);
                  }} />
                <span className={it.done ? 'line-through text-gray-400' : ''}>{it.item}</span>
              </label>
            ))}
            {job.status !== 'CLOSED' && job.status !== 'CANCELLED' && (
              <div className="flex gap-2">
                <input className="flex-1 rounded-md border border-gray-300 px-3 py-1.5 text-sm"
                  placeholder="Add checklist item…" value={newItem}
                  onChange={(e) => setNewItem(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && newItem.trim()) {
                      setChecklist([...items, { item: newItem.trim(), done: false }]);
                      setNewItem('');
                    }
                  }} />
              </div>
            )}
          </div>
          {job.status === 'IN_PROGRESS' && (
            <div className="grid sm:grid-cols-2 gap-3">
              <textarea className="rounded-md border border-gray-300 px-3 py-2 text-sm" rows={2}
                placeholder="Closeout notes (what was done)" value={closeoutNotes}
                onChange={(e) => setCloseoutNotes(e.target.value)} />
              <textarea className="rounded-md border border-gray-300 px-3 py-2 text-sm" rows={2}
                placeholder="Customer notes (gate code, dog, preferences…)" value={customerNotes}
                onChange={(e) => setCustomerNotes(e.target.value)} />
              <input className="rounded-md border border-gray-300 px-3 py-2 text-sm" type="number" step="0.01"
                placeholder="Actual cost ($, used if no quote)" value={actualCost}
                onChange={(e) => setActualCost(e.target.value)} />
            </div>
          )}
          {job.closeoutNotes && <p className="text-sm text-gray-600 mt-2">📝 {job.closeoutNotes}</p>}
          {job.customerNotes && <p className="text-sm text-gray-600 mt-1">👤 {job.customerNotes}</p>}
        </div>

        {/* Photos */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="font-semibold text-gray-900 mb-3">Photos</h2>
          <div className="flex items-center gap-3 mb-4">
            <select className="rounded-md border border-gray-300 px-2 py-1.5 text-sm" value={photoPhase}
              onChange={(e) => setPhotoPhase(e.target.value as any)}>
              <option value="before">Before</option>
              <option value="during">During</option>
              <option value="after">After</option>
            </select>
            <label className="px-3 py-1.5 text-sm rounded-md border border-gray-300 cursor-pointer hover:bg-gray-50">
              📷 Add photo
              <input type="file" accept="image/*" capture="environment" className="hidden"
                onChange={(e) => e.target.files?.[0] && handlePhotoUpload(e.target.files[0])} />
            </label>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
            {job.photos.map((p) => (
              <div key={p.id} className="text-center">
                {p.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.imageUrl} alt={p.caption ?? ''} className="rounded-md object-cover w-full h-24" />
                ) : (
                  <div className="rounded-md bg-gray-100 h-24 flex items-center justify-center text-2xl">🖼️</div>
                )}
                <div className="text-xs text-gray-500 mt-1">{p.phase}</div>
              </div>
            ))}
            {!job.photos.length && <p className="text-sm text-gray-500 col-span-4">No photos yet.</p>}
          </div>
        </div>

        {/* Crew */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="font-semibold text-gray-900 mb-3">Crew</h2>
          <div className="space-y-2 mb-4">
            {job.assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between text-sm">
                <span>👷 {a.user.name}{a.role ? ` (${a.role})` : ''}</span>
                <button className="text-red-600 text-xs hover:underline"
                  onClick={() => act(() => removeCrew.mutateAsync({ jobId: job.id, userId: a.user.id }), 'Remove crew')}>
                  remove
                </button>
              </div>
            ))}
            {!job.assignments.length && <p className="text-sm text-gray-500">No crew assigned.</p>}
          </div>
          <div className="flex gap-2">
            <select className="flex-1 rounded-md border border-gray-300 px-2 py-1.5 text-sm"
              value={crewUserId} onChange={(e) => setCrewUserId(e.target.value)}>
              <option value="">Assign team member…</option>
              {(team as any[] | undefined)?.map((u: any) => (
                <option key={u.id} value={u.id}>{u.name}</option>
              ))}
            </select>
            <button className="px-3 py-1.5 text-sm rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
              disabled={!crewUserId}
              onClick={() => act(() => assignCrew.mutateAsync({ jobId: job.id, userId: crewUserId }), 'Assign crew')}>
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

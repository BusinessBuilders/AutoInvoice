'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export const dynamic = 'force-dynamic';

export default function CrewSignupPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', inviteCode: '' });
  const [error, setError] = useState('');

  const register = trpc.auth.registerEmployee.useMutation({
    onSuccess: (data) => {
      localStorage.setItem('accessToken', data.accessToken);
      localStorage.setItem('refreshToken', data.refreshToken);
      localStorage.setItem('userRole', data.user.role);
      localStorage.setItem('userName', data.user.name);
      router.push('/crew');
    },
    onError: (e) => setError(e.message),
  });

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg max-w-sm w-full p-6 space-y-4">
        <div className="text-center">
          <div className="text-4xl">👷</div>
          <h1 className="text-2xl font-bold text-gray-900 mt-2">Join the Crew</h1>
          <p className="text-sm text-gray-500 mt-1">
            Crew account: time clock + your jobs. Ask the boss for the invite code.
          </p>
        </div>
        {error && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">{error}</div>
        )}
        <input className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm" placeholder="Your name"
          value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        <input className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm" type="email" placeholder="Email"
          value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />
        <input className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm" type="tel" placeholder="Phone (optional)"
          value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        <input className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm" type="password" placeholder="Password (6+ characters)"
          value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        <input className="w-full rounded-md border border-gray-300 px-3 py-2.5 text-sm" placeholder="Invite code"
          value={form.inviteCode} onChange={(e) => setForm({ ...form, inviteCode: e.target.value })} />
        <button
          className="w-full py-3 rounded-md text-white font-medium bg-green-600 hover:bg-green-700 disabled:opacity-50"
          disabled={register.isPending || !form.name || !form.email || form.password.length < 6 || !form.inviteCode}
          onClick={() => {
            setError('');
            register.mutate({
              name: form.name, email: form.email, password: form.password,
              phone: form.phone || undefined, inviteCode: form.inviteCode,
            });
          }}>
          {register.isPending ? 'Creating account…' : 'Create crew account'}
        </button>
        <p className="text-center text-sm text-gray-500">
          Already have an account? <Link href="/login" className="text-blue-600">Sign in</Link>
        </p>
      </div>
    </div>
  );
}

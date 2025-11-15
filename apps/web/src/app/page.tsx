'use client';

import { trpc } from '@/lib/trpc';

export default function Home() {
  const stats = trpc.invoice.stats.useQuery();

  return (
    <main className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-4xl font-bold mb-8">AutoInvoice Dashboard</h1>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div className="bg-card rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-muted-foreground">Total Invoices</h3>
            <p className="text-3xl font-bold mt-2">{stats.data?.total || 0}</p>
          </div>

          <div className="bg-card rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-muted-foreground">Paid</h3>
            <p className="text-3xl font-bold mt-2 text-green-600">{stats.data?.paid || 0}</p>
          </div>

          <div className="bg-card rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-muted-foreground">Pending</h3>
            <p className="text-3xl font-bold mt-2 text-yellow-600">{stats.data?.sent || 0}</p>
          </div>

          <div className="bg-card rounded-lg shadow p-6">
            <h3 className="text-sm font-medium text-muted-foreground">Overdue</h3>
            <p className="text-3xl font-bold mt-2 text-red-600">{stats.data?.overdue || 0}</p>
          </div>
        </div>

        <div className="mt-8 bg-card rounded-lg shadow p-6">
          <h2 className="text-2xl font-bold mb-4">Getting Started</h2>
          <p className="text-muted-foreground">
            Welcome to AutoInvoice! This is your AI-powered invoice automation platform.
          </p>
          <div className="mt-4 space-y-2">
            <p>✅ Backend API running</p>
            <p>✅ PostgreSQL database ready</p>
            <p>✅ tRPC client connected</p>
          </div>
        </div>
      </div>
    </main>
  );
}

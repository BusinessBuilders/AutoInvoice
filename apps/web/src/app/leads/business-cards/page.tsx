'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function LeadBusinessCardsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');

  const { data, isLoading } = trpc.leadBusinessCard.list.useQuery({
    limit: 50,
    offset: 0,
    search: search || undefined,
    status: (statusFilter || undefined) as any,
  });

  const deleteMutation = trpc.leadBusinessCard.delete.useMutation({
    onSuccess: () => {
      window.location.reload();
    },
  });

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-7xl mx-auto px-4">
        {/* Back Navigation */}
        <Link href="/" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          ← Back to Dashboard
        </Link>

        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">Lead Business Cards</h1>
            <p className="text-gray-600 mt-2">
              {data?.pagination.total || 0} business card contacts
            </p>
          </div>
          <Link
            href="/leads/business-cards/upload"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Upload Cards
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <input
              type="text"
              placeholder="Search name, company, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">All Statuses</option>
              <option value="NEW">New</option>
              <option value="CONTACTED">Contacted</option>
              <option value="QUALIFIED">Qualified</option>
              <option value="WON">Converted</option>
              <option value="LOST">Lost</option>
            </select>
          </div>
        </div>

        {/* Leads Grid */}
        {isLoading ? (
          <div className="text-center py-12">Loading...</div>
        ) : data?.leads && data.leads.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.leads.map((lead) => (
              <div
                key={lead.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900 mb-1">
                        {lead.name}
                      </h3>
                      {lead.title && (
                        <p className="text-sm text-gray-600">{lead.title}</p>
                      )}
                      {lead.company && (
                        <p className="text-sm font-medium text-gray-700">
                          {lead.company}
                        </p>
                      )}
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${
                      lead.status === 'NEW' ? 'bg-blue-100 text-blue-800' :
                      lead.status === 'CONTACTED' ? 'bg-yellow-100 text-yellow-800' :
                      lead.status === 'QUALIFIED' ? 'bg-purple-100 text-purple-800' :
                      lead.status === 'WON' ? 'bg-green-100 text-green-800' :
                      'bg-gray-100 text-gray-800'
                    }`}>
                      {lead.status}
                    </span>
                  </div>

                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    {lead.phone && (
                      <div className="flex items-center gap-2">
                        <span>📞</span>
                        <span>{lead.phone}</span>
                      </div>
                    )}
                    {lead.email && (
                      <div className="flex items-center gap-2">
                        <span>✉️</span>
                        <span className="truncate">{lead.email}</span>
                      </div>
                    )}
                    {lead.website && (
                      <div className="flex items-center gap-2">
                        <span>🌐</span>
                        <span className="truncate">{lead.website}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/leads/business-cards/${lead.id}`}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 text-sm"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm('Delete this lead?')) {
                          deleteMutation.mutate({ id: lead.id });
                        }
                      }}
                      className="px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 text-sm"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-md p-12 text-center">
            <div className="text-6xl mb-4">📇</div>
            <h3 className="text-xl font-semibold mb-2">No business cards yet</h3>
            <p className="text-gray-600 mb-6">
              Start scanning business cards to build your leads database
            </p>
            <Link
              href="/leads/business-cards/upload"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Upload First Card
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

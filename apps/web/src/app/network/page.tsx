'use client';

import { useState } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

export default function NetworkContactsPage() {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('');

  const { data, isLoading } = trpc.contact.list.useQuery({
    limit: 50,
    offset: 0,
    search: search || undefined,
    category: categoryFilter || undefined,
  });

  const deleteMutation = trpc.contact.delete.useMutation({
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
            <h1 className="text-3xl font-bold text-gray-900">Network Contacts</h1>
            <p className="text-gray-600 mt-2">
              {data?.pagination.total || 0} professional contacts
            </p>
          </div>
          <Link
            href="/network/upload"
            className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            + Add Contacts
          </Link>
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="text"
              placeholder="Search name, company, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="text"
              placeholder="Filter by category..."
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
        </div>

        {/* Contacts Grid */}
        {isLoading ? (
          <div className="text-center py-12">Loading...</div>
        ) : data?.contacts && data.contacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {data.contacts.map((contact) => (
              <div
                key={contact.id}
                className="bg-white rounded-lg shadow-md overflow-hidden hover:shadow-lg transition-shadow"
              >
                <div className="p-6">
                  <div className="mb-4">
                    <h3 className="text-lg font-semibold text-gray-900 mb-1">
                      {contact.name}
                    </h3>
                    {contact.title && (
                      <p className="text-sm text-gray-600">{contact.title}</p>
                    )}
                    {contact.company && (
                      <p className="text-sm font-medium text-gray-700">
                        {contact.company}
                      </p>
                    )}
                    {contact.category && (
                      <span className="inline-block mt-2 px-2 py-1 text-xs bg-gray-100 text-gray-700 rounded">
                        {contact.category}
                      </span>
                    )}
                  </div>

                  <div className="space-y-2 text-sm text-gray-600 mb-4">
                    {contact.phone && (
                      <div className="flex items-center gap-2">
                        <span>📞</span>
                        <span>{contact.phone}</span>
                      </div>
                    )}
                    {contact.email && (
                      <div className="flex items-center gap-2">
                        <span>✉️</span>
                        <span className="truncate">{contact.email}</span>
                      </div>
                    )}
                    {contact.website && (
                      <div className="flex items-center gap-2">
                        <span>🌐</span>
                        <span className="truncate">{contact.website}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Link
                      href={`/network/${contact.id}`}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700 text-sm"
                    >
                      View Details
                    </Link>
                    <button
                      onClick={() => {
                        if (confirm('Delete this contact?')) {
                          deleteMutation.mutate({ id: contact.id });
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
            <div className="text-6xl mb-4">🌐</div>
            <h3 className="text-xl font-semibold mb-2">No contacts yet</h3>
            <p className="text-gray-600 mb-6">
              Start building your professional network
            </p>
            <Link
              href="/network/upload"
              className="inline-block px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Add First Contact
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}

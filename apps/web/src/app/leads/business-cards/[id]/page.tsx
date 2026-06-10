'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

export default function LeadBusinessCardDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const router = useRouter();
  const [isEditing, setIsEditing] = useState(false);
  const [noteContent, setNoteContent] = useState('');

  const { data: lead, isLoading } = trpc.leadBusinessCard.getById.useQuery({
    id: params.id,
  });

  const updateMutation = trpc.leadBusinessCard.update.useMutation({
    onSuccess: () => {
      setIsEditing(false);
      window.location.reload();
    },
  });

  const addNoteMutation = trpc.leadBusinessCard.addNote.useMutation({
    onSuccess: () => {
      setNoteContent('');
      window.location.reload();
    },
  });

  const convertMutation = trpc.leadBusinessCard.convertToCustomer.useMutation({
    onSuccess: (result) => {
      alert(`Lead converted to customer! Customer ID: ${result.id}`);
      router.push('/leads/business-cards');
    },
  });

  const deleteMutation = trpc.leadBusinessCard.delete.useMutation({
    onSuccess: () => {
      router.push('/leads/business-cards');
    },
  });

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    email: '',
    company: '',
    title: '',
    website: '',
    linkedIn: '',
    twitter: '',
    facebook: '',
    instagram: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    zipCode: '',
    country: '',
    status: 'NEW' as const,
    category: '',
    notes: '',
  });

  // Initialize form data when lead loads
  if (lead && !isEditing && formData.name === '') {
    setFormData({
      name: lead.name || '',
      phone: lead.phone || '',
      email: lead.email || '',
      company: lead.company || '',
      title: lead.title || '',
      website: lead.website || '',
      linkedIn: lead.linkedIn || '',
      twitter: lead.twitter || '',
      facebook: lead.facebook || '',
      instagram: lead.instagram || '',
      addressLine1: lead.addressLine1 || '',
      addressLine2: lead.addressLine2 || '',
      city: lead.city || '',
      state: lead.state || '',
      zipCode: lead.zipCode || '',
      country: lead.country || '',
      status: (lead.status || 'NEW') as any,
      category: '',
      notes: '',
    });
  }

  const handleSave = () => {
    updateMutation.mutate({
      id: params.id,
      data: formData,
    });
  };

  const handleAddNote = () => {
    if (!noteContent.trim()) return;
    addNoteMutation.mutate({
      leadId: params.id,
      content: noteContent,
    });
  };

  const handleConvert = () => {
    if (confirm('Convert this lead to a customer?')) {
      convertMutation.mutate({ leadId: params.id });
    }
  };

  const handleDelete = () => {
    if (confirm('Delete this lead? This action cannot be undone.')) {
      deleteMutation.mutate({ id: params.id });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center py-12">Loading...</div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="min-h-screen bg-gray-50 py-8">
        <div className="max-w-6xl mx-auto px-4">
          <div className="text-center py-12">Lead not found</div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/leads/business-cards"
            className="text-blue-600 hover:text-blue-700 mb-4 inline-block"
          >
            ← Back to Business Card Leads
          </Link>
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{lead.name}</h1>
              {lead.title && (
                <p className="text-lg text-gray-600 mt-1">{lead.title}</p>
              )}
              {lead.company && (
                <p className="text-lg font-medium text-gray-700 mt-1">
                  {lead.company}
                </p>
              )}
            </div>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                lead.status === 'NEW'
                  ? 'bg-blue-100 text-blue-800'
                  : lead.status === 'CONTACTED'
                  ? 'bg-yellow-100 text-yellow-800'
                  : lead.status === 'QUALIFIED'
                  ? 'bg-purple-100 text-purple-800'
                  : lead.status === 'WON'
                  ? 'bg-green-100 text-green-800'
                  : 'bg-gray-100 text-gray-800'
              }`}
            >
              {lead.status}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Business Card Image */}
            {lead.businessCardImageUrl && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4">Business Card</h2>
                <div className="bg-gray-100 rounded-lg overflow-hidden">
                  <img
                    src={lead.businessCardImageUrl}
                    alt="Business card"
                    className="w-full h-auto"
                  />
                </div>
                {lead.extractionConfidence && (
                  <p className="text-sm text-gray-500 mt-2">
                    Extraction confidence:{' '}
                    {Math.round(lead.extractionConfidence * 100)}%
                  </p>
                )}
              </div>
            )}

            {/* Contact Information */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold">Contact Information</h2>
                {!isEditing ? (
                  <button
                    onClick={() => setIsEditing(true)}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
                  >
                    Edit
                  </button>
                ) : (
                  <div className="flex gap-2">
                    <button
                      onClick={() => setIsEditing(false)}
                      className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={updateMutation.isPending}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                    >
                      {updateMutation.isPending ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Name
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.name}
                      onChange={(e) =>
                        setFormData({ ...formData, name: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{lead.name || '—'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Phone
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.phone}
                      onChange={(e) =>
                        setFormData({ ...formData, phone: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{lead.phone || '—'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  {isEditing ? (
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) =>
                        setFormData({ ...formData, email: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{lead.email || '—'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Company
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.company}
                      onChange={(e) =>
                        setFormData({ ...formData, company: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{lead.company || '—'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Title
                  </label>
                  {isEditing ? (
                    <input
                      type="text"
                      value={formData.title}
                      onChange={(e) =>
                        setFormData({ ...formData, title: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : (
                    <p className="text-gray-900">{lead.title || '—'}</p>
                  )}
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Website
                  </label>
                  {isEditing ? (
                    <input
                      type="url"
                      value={formData.website}
                      onChange={(e) =>
                        setFormData({ ...formData, website: e.target.value })
                      }
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                    />
                  ) : lead.website ? (
                    <a
                      href={lead.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline"
                    >
                      {lead.website}
                    </a>
                  ) : (
                    <p className="text-gray-900">—</p>
                  )}
                </div>
              </div>

              {/* Address */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Address</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address Line 1
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.addressLine1}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            addressLine1: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900">{lead.addressLine1 || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Address Line 2
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.addressLine2}
                        onChange={(e) =>
                          setFormData({
                            ...formData,
                            addressLine2: e.target.value,
                          })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900">{lead.addressLine2 || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      City
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.city}
                        onChange={(e) =>
                          setFormData({ ...formData, city: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900">{lead.city || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      State
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.state}
                        onChange={(e) =>
                          setFormData({ ...formData, state: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900">{lead.state || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Zip Code
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.zipCode}
                        onChange={(e) =>
                          setFormData({ ...formData, zipCode: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900">{lead.zipCode || '—'}</p>
                    )}
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Country
                    </label>
                    {isEditing ? (
                      <input
                        type="text"
                        value={formData.country}
                        onChange={(e) =>
                          setFormData({ ...formData, country: e.target.value })
                        }
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      />
                    ) : (
                      <p className="text-gray-900">{lead.country || '—'}</p>
                    )}
                  </div>
                </div>
              </div>

              {/* Social Media */}
              <div className="mt-6">
                <h3 className="text-lg font-semibold mb-3">Social Media</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {['linkedIn', 'twitter', 'facebook', 'instagram'].map(
                    (platform) => (
                      <div key={platform}>
                        <label className="block text-sm font-medium text-gray-700 mb-1 capitalize">
                          {platform}
                        </label>
                        {isEditing ? (
                          <input
                            type="url"
                            value={formData[platform as keyof typeof formData]}
                            onChange={(e) =>
                              setFormData({
                                ...formData,
                                [platform]: e.target.value,
                              })
                            }
                            className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                          />
                        ) : lead[platform as keyof typeof lead] ? (
                          <a
                            href={lead[platform as keyof typeof lead] as string}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:underline"
                          >
                            {lead[platform as keyof typeof lead] as string}
                          </a>
                        ) : (
                          <p className="text-gray-900">—</p>
                        )}
                      </div>
                    )
                  )}
                </div>
              </div>
            </div>

            {/* Notes */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Notes</h2>

              {/* Add Note */}
              <div className="mb-4">
                <textarea
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  placeholder="Add a note..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                  rows={3}
                />
                <button
                  onClick={handleAddNote}
                  disabled={addNoteMutation.isPending || !noteContent.trim()}
                  className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                >
                  {addNoteMutation.isPending ? 'Adding...' : 'Add Note'}
                </button>
              </div>

              {/* Notes List */}
              {lead.notes && lead.notes.length > 0 ? (
                <div className="space-y-3">
                  {lead.notes.map((note: any) => (
                    <div
                      key={note.id}
                      className="border border-gray-200 rounded-lg p-3"
                    >
                      <p className="text-gray-900 whitespace-pre-wrap">
                        {note.content}
                      </p>
                      <p className="text-xs text-gray-500 mt-2">
                        {new Date(note.createdAt).toLocaleString()}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-gray-500 text-sm">No notes yet</p>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Actions */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Actions</h2>
              <div className="space-y-3">
                {lead.status !== 'WON' && (
                  <button
                    onClick={handleConvert}
                    disabled={convertMutation.isPending}
                    className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
                  >
                    {convertMutation.isPending
                      ? 'Converting...'
                      : 'Convert to Customer'}
                  </button>
                )}

                {lead.phone && (
                  <a
                    href={`tel:${lead.phone}`}
                    className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700"
                  >
                    Call
                  </a>
                )}

                {lead.email && (
                  <a
                    href={`mailto:${lead.email}`}
                    className="block w-full px-4 py-2 bg-blue-600 text-white text-center rounded-lg hover:bg-blue-700"
                  >
                    Email
                  </a>
                )}

                <button
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  className="w-full px-4 py-2 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 disabled:opacity-50"
                >
                  {deleteMutation.isPending ? 'Deleting...' : 'Delete Lead'}
                </button>
              </div>
            </div>

            {/* Status Update */}
            {isEditing && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <h2 className="text-xl font-semibold mb-4">Status</h2>
                <select
                  value={formData.status}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      status: e.target.value as any,
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="NEW">New</option>
                  <option value="CONTACTED">Contacted</option>
                  <option value="QUALIFIED">Qualified</option>
                  <option value="CONVERTED">Converted</option>
                  <option value="LOST">Lost</option>
                </select>
              </div>
            )}

            {/* Metadata */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <h2 className="text-xl font-semibold mb-4">Information</h2>
              <div className="space-y-2 text-sm">
                <div>
                  <span className="text-gray-600">Source:</span>
                  <span className="ml-2 text-gray-900 capitalize">
                    {lead.source?.replace('_', ' ')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-600">Created:</span>
                  <span className="ml-2 text-gray-900">
                    {new Date(lead.createdAt).toLocaleDateString()}
                  </span>
                </div>
                {lead.updatedAt && (
                  <div>
                    <span className="text-gray-600">Updated:</span>
                    <span className="ml-2 text-gray-900">
                      {new Date(lead.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

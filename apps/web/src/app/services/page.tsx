'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function ServicesPage() {
  const { isLoading: authLoading, requireAuth } = useAuth();
  const [search, setSearch] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    code: '',
    category: '',
    basePrice: '',
    priceUnit: 'unit',
    description: '',
  });

  const { data: services, isLoading } = trpc.service.list.useQuery();
  const utils = trpc.useContext();

  useEffect(() => {
    requireAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createService = trpc.service.create.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      setShowAddModal(false);
      setFormData({
        name: '',
        code: '',
        category: '',
        basePrice: '',
        priceUnit: 'unit',
        description: '',
      });
    },
  });

  const filteredServices = services?.filter((service) =>
    service.name.toLowerCase().includes(search.toLowerCase()) ||
    service.code.toLowerCase().includes(search.toLowerCase()) ||
    service.category.toLowerCase().includes(search.toLowerCase())
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createService.mutate({
      ...formData,
      basePrice: formData.basePrice ? parseFloat(formData.basePrice) : undefined,
    });
  };

  // Group services by category
  const servicesByCategory = filteredServices?.reduce((acc: any, service) => {
    const category = service.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="md:flex md:items-center md:justify-between mb-8">
          <div className="flex-1 min-w-0">
            <h1 className="text-3xl font-bold text-gray-900">Service Catalog</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your services and pricing
            </p>
          </div>
          <div className="mt-4 flex md:mt-0 md:ml-4">
            <button
              onClick={() => setShowAddModal(true)}
              className="ml-3 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              + Add Service
            </button>
          </div>
        </div>

        {/* Search */}
        <div className="mb-6">
          <input
            type="text"
            placeholder="Search services..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full px-4 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
          />
        </div>

        {/* Services by Category */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="mt-2 text-sm text-gray-500">Loading services...</p>
          </div>
        ) : servicesByCategory && Object.keys(servicesByCategory).length > 0 ? (
          <div className="space-y-6">
            {Object.entries(servicesByCategory).map(([category, categoryServices]: [string, any]) => (
              <div key={category} className="bg-white shadow rounded-lg overflow-hidden">
                <div className="px-6 py-4 bg-gray-50 border-b border-gray-200">
                  <h2 className="text-lg font-semibold text-gray-900">{category}</h2>
                  <p className="text-sm text-gray-500">{categoryServices.length} service{categoryServices.length !== 1 ? 's' : ''}</p>
                </div>
                <div className="divide-y divide-gray-200">
                  {categoryServices.map((service: any) => (
                    <div key={service.id} className="px-6 py-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="flex items-center">
                            <h3 className="text-lg font-semibold text-gray-900">{service.name}</h3>
                            <span className="ml-3 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                              {service.code}
                            </span>
                          </div>
                          {service.description && (
                            <p className="mt-1 text-sm text-gray-500">{service.description}</p>
                          )}
                        </div>
                        <div className="ml-6 text-right">
                          {service.basePrice ? (
                            <>
                              <p className="text-2xl font-bold text-green-600">
                                ${parseFloat(service.basePrice).toFixed(2)}
                              </p>
                              <p className="text-sm text-gray-500">per {service.priceUnit}</p>
                            </>
                          ) : (
                            <p className="text-sm text-gray-500 italic">No base price</p>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-12 bg-white rounded-lg shadow">
            <svg
              className="mx-auto h-12 w-12 text-gray-400"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01"
              />
            </svg>
            <h3 className="mt-2 text-sm font-medium text-gray-900">No services</h3>
            <p className="mt-1 text-sm text-gray-500">
              {search ? 'No services match your search.' : 'Get started by adding your first service.'}
            </p>
            {!search && (
              <div className="mt-6">
                <button
                  onClick={() => setShowAddModal(true)}
                  className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  + Add Service
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add Service Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add New Service</h3>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Service Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                  placeholder="Hydroseeding"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Service Code <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.code}
                  onChange={(e) => setFormData({ ...formData, code: e.target.value.toUpperCase() })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                  placeholder="HYDROSEED"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">
                  Category <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={formData.category}
                  onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                  placeholder="Landscaping"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700">Base Price</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.basePrice}
                    onChange={(e) => setFormData({ ...formData, basePrice: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                    placeholder="0.15"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700">Unit</label>
                  <select
                    value={formData.priceUnit}
                    onChange={(e) => setFormData({ ...formData, priceUnit: e.target.value })}
                    className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                  >
                    <option value="sqft">sqft</option>
                    <option value="hour">hour</option>
                    <option value="unit">unit</option>
                    <option value="each">each</option>
                    <option value="day">day</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700">Description</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                  placeholder="Optional description..."
                />
              </div>

              <div className="flex justify-end space-x-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createService.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                >
                  {createService.isPending ? 'Adding...' : 'Add Service'}
                </button>
              </div>
            </form>

            {createService.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded">
                <p className="text-sm text-red-600">{createService.error.message}</p>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
  );
}

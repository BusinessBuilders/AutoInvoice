'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const { data: customer, isLoading } = trpc.customer.getById.useQuery({ id: customerId });
  const { data: invoices } = trpc.invoice.list.useQuery({ customerId, limit: 10 });

  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingForm, setPricingForm] = useState({
    serviceId: '',
    price: '',
    unit: '',
  });

  const utils = trpc.useContext();
  const { data: services } = trpc.service.list.useQuery({ limit: 100 });

  const deleteCustomer = trpc.customer.delete.useMutation({
    onSuccess: () => {
      router.push('/customers');
    },
  });

  const setPricingMutation = trpc.smartTemplates.setCustomerPricing.useMutation({
    onSuccess: () => {
      utils.customer.getById.invalidate({ id: customerId });
    },
  });

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete ${customer?.name}?`)) {
      deleteCustomer.mutate({ id: customerId });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-500">Loading customer...</p>
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Customer not found</h1>
          <Link href="/customers" className="mt-4 text-blue-600 hover:text-blue-800">
            ← Back to Customers
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/customers"
            className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Customers
          </Link>
          <div className="md:flex md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{customer.name}</h1>
              {customer.company && (
                <p className="mt-1 text-lg text-gray-500">{customer.company}</p>
              )}
            </div>
            <div className="mt-4 flex space-x-3 md:mt-0">
              <Link
                href={`/quick?customerId=${customer.id}`}
                className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-green-600 hover:bg-green-700"
              >
                ⚡ Quick Invoice
              </Link>
              <button
                onClick={handleDelete}
                className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
              >
                Delete
              </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Customer Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
              <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                {customer.email && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Email</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      <a href={`mailto:${customer.email}`} className="text-blue-600 hover:text-blue-800">
                        {customer.email}
                      </a>
                    </dd>
                  </div>
                )}
                {customer.phone && (
                  <div>
                    <dt className="text-sm font-medium text-gray-500">Phone</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      <a href={`tel:${customer.phone}`} className="text-blue-600 hover:text-blue-800">
                        {customer.phone}
                      </a>
                    </dd>
                  </div>
                )}
                {customer.addressLine1 && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Address</dt>
                    <dd className="mt-1 text-sm text-gray-900">
                      {customer.addressLine1}
                      {customer.addressLine2 && <>, {customer.addressLine2}</>}
                      <br />
                      {customer.city && `${customer.city}, `}
                      {customer.state} {customer.zipCode}
                      {customer.country && <><br />{customer.country}</>}
                    </dd>
                  </div>
                )}
                {customer.nickname && customer.nickname.length > 0 && (
                  <div className="sm:col-span-2">
                    <dt className="text-sm font-medium text-gray-500">Nicknames</dt>
                    <dd className="mt-1 flex flex-wrap gap-2">
                      {customer.nickname.map((nick: string, i: number) => (
                        <span
                          key={i}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {nick}
                        </span>
                      ))}
                    </dd>
                  </div>
                )}
              </dl>
            </div>

            {/* Custom Pricing */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Custom Pricing</h2>
                <button
                  onClick={() => setShowPricingModal(true)}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  + Add Custom Price
                </button>
              </div>

              {customer.priceOverrides && customer.priceOverrides.length > 0 ? (
                <div className="space-y-3">
                  {customer.priceOverrides.map((override: any) => (
                    <div key={override.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium text-gray-900">{override.service.name}</p>
                        <p className="text-sm text-gray-500">{override.service.code}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold text-green-600">
                          ${parseFloat(override.price).toFixed(2)}/{override.unit}
                        </p>
                        {override.service.basePrice && (
                          <p className="text-xs text-gray-500 line-through">
                            ${parseFloat(override.service.basePrice).toFixed(2)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No custom pricing set. Uses standard rates.</p>
              )}
            </div>

            {/* Recent Invoices */}
            <div className="bg-white shadow rounded-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">Recent Invoices</h2>
                <Link
                  href={`/invoices?customerId=${customer.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View All
                </Link>
              </div>

              {invoices && invoices.length > 0 ? (
                <div className="space-y-3">
                  {invoices.map((invoice: any) => (
                    <Link
                      key={invoice.id}
                      href={`/invoices/${invoice.id}`}
                      className="block p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium text-gray-900">{invoice.invoiceNumber}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(invoice.serviceDate).toLocaleDateString()}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-semibold text-gray-900">
                            ${parseFloat(invoice.total).toFixed(2)}
                          </p>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                              invoice.status === 'PAID'
                                ? 'bg-green-100 text-green-800'
                                : invoice.status === 'SENT'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-gray-100 text-gray-800'
                            }`}
                          >
                            {invoice.status}
                          </span>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-500">No invoices yet.</p>
              )}
            </div>
          </div>

          {/* Right Column - Stats */}
          <div className="space-y-6">
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-medium text-gray-500 mb-4">Customer Stats</h3>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-500">Total Invoices</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {invoices?.length || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${invoices?.reduce((sum: number, inv: any) => sum + parseFloat(inv.total), 0).toFixed(2) || '0.00'}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Customer Since</p>
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(customer.createdAt).toLocaleDateString()}
                  </p>
                </div>
              </div>
            </div>

            {customer.notes && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Notes</h3>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Custom Pricing Modal */}
      {showPricingModal && (
        <div className="fixed inset-0 bg-gray-500 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">Add Custom Pricing</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700">Service</label>
                <select
                  value={pricingForm.serviceId}
                  onChange={(e) => setPricingForm({ ...pricingForm, serviceId: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                >
                  <option value="">Select a service...</option>
                  {services?.map((service: any) => (
                    <option key={service.id} value={service.id}>
                      {service.name} ({service.code})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Price</label>
                <input
                  type="number"
                  step="0.01"
                  value={pricingForm.price}
                  onChange={(e) => setPricingForm({ ...pricingForm, price: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700">Unit</label>
                <input
                  type="text"
                  value={pricingForm.unit}
                  onChange={(e) => setPricingForm({ ...pricingForm, unit: e.target.value })}
                  className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm py-2 px-3"
                  placeholder="sqft, hour, unit, etc."
                />
              </div>
            </div>
            <div className="mt-6 flex justify-end space-x-3">
              <button
                onClick={() => setShowPricingModal(false)}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  if (!pricingForm.serviceId || !pricingForm.price) {
                    alert('Please select a service and enter a price');
                    return;
                  }
                  try {
                    await setPricingMutation.mutateAsync({
                      customerId,
                      serviceId: pricingForm.serviceId,
                      price: parseFloat(pricingForm.price),
                      unit: pricingForm.unit,
                    });
                    setShowPricingModal(false);
                    setPricingForm({ serviceId: '', price: '', unit: '' });
                  } catch (err: any) {
                    alert(`Error: ${err.message}`);
                  }
                }}
                disabled={setPricingMutation.isLoading}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {setPricingMutation.isLoading ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

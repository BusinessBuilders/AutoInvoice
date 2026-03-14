'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';

export default function CustomerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const customerId = params.id as string;

  const { data: customer, isLoading, refetch } = trpc.customer.get.useQuery({ id: customerId });
  const { data: invoiceData } = trpc.invoice.list.useQuery({ customerId, limit: 10 });

  const [isEditMode, setIsEditMode] = useState(false);
  const [showPricingModal, setShowPricingModal] = useState(false);
  const [pricingForm, setPricingForm] = useState({
    serviceId: '',
    price: '',
    unit: '',
  });

  // Edit form state
  const [editedName, setEditedName] = useState('');
  const [editedCompany, setEditedCompany] = useState('');
  const [editedEmail, setEditedEmail] = useState('');
  const [editedPhone, setEditedPhone] = useState('');
  const [editedAddressLine1, setEditedAddressLine1] = useState('');
  const [editedAddressLine2, setEditedAddressLine2] = useState('');
  const [editedCity, setEditedCity] = useState('');
  const [editedState, setEditedState] = useState('');
  const [editedZipCode, setEditedZipCode] = useState('');
  const [editedNotes, setEditedNotes] = useState('');
  const [isPlowCustomer, setIsPlowCustomer] = useState(false);
  const [plowPrice, setPlowPrice] = useState('');
  const [saltPrice, setSaltPrice] = useState('');

  const utils = trpc.useContext();
  const { data: services } = trpc.service.list.useQuery();

  const updateCustomerMutation = trpc.customer.update.useMutation();

  const deleteCustomer = trpc.customer.delete.useMutation({
    onSuccess: () => {
      router.push('/customers');
    },
  });

  const setPricingMutation = trpc.smartTemplates.setCustomerPricing.useMutation({
    onSuccess: () => {
      utils.customer.get.invalidate({ id: customerId });
    },
  });

  const setPlowPriceMutation = trpc.payments.setCustomerPrice.useMutation();

  const handleDelete = () => {
    if (confirm(`Are you sure you want to delete ${customer?.name}?`)) {
      deleteCustomer.mutate({ id: customerId });
    }
  };

  const handleEditToggle = () => {
    if (!isEditMode && customer) {
      // Initialize form when entering edit mode
      setEditedName(customer.name || '');
      setEditedCompany(customer.company || '');
      setEditedEmail(customer.email || '');
      setEditedPhone(customer.phone || '');
      setEditedAddressLine1(customer.addressLine1 || '');
      setEditedAddressLine2(customer.addressLine2 || '');
      setEditedCity(customer.city || '');
      setEditedState(customer.state || '');
      setEditedZipCode(customer.zipCode || '');
      setEditedNotes(customer.notes || '');
      // Initialize plow customer state
      const tags = customer.tags || [];
      const hasPlow = tags.some((t: string) => t.toLowerCase().includes('plow') || t.toLowerCase().includes('snow'));
      setIsPlowCustomer(hasPlow);
      // Get existing plow/salt prices from priceOverrides
      const plowOverride = customer.priceOverrides?.find((o: any) => o.service?.code === 'PLOW');
      const saltOverride = customer.priceOverrides?.find((o: any) => o.service?.code === 'SALT');
      setPlowPrice(plowOverride ? parseFloat(plowOverride.price).toString() : '');
      setSaltPrice(saltOverride ? parseFloat(saltOverride.price).toString() : '');
    }
    setIsEditMode(!isEditMode);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleSaveCustomer = async () => {
    try {
      // Build tags array - add or remove plow tag
      let newTags = [...(customer?.tags || [])];
      const hasPlowTag = newTags.some((t: string) => t.toLowerCase() === 'plow');
      if (isPlowCustomer && !hasPlowTag) {
        newTags.push('plow');
      } else if (!isPlowCustomer && hasPlowTag) {
        newTags = newTags.filter((t: string) => t.toLowerCase() !== 'plow');
      }

      await updateCustomerMutation.mutateAsync({
        id: customerId,
        name: editedName,
        company: editedCompany || undefined,
        email: editedEmail || undefined,
        phone: editedPhone || undefined,
        addressLine1: editedAddressLine1 || undefined,
        addressLine2: editedAddressLine2 || undefined,
        city: editedCity || undefined,
        state: editedState || undefined,
        zipCode: editedZipCode || undefined,
        notes: editedNotes || undefined,
        tags: newTags,
      });

      // Save plow/salt prices if set
      if (isPlowCustomer) {
        if (plowPrice) {
          await setPlowPriceMutation.mutateAsync({
            customerId,
            serviceCode: 'PLOW',
            price: parseFloat(plowPrice),
          });
        }
        if (saltPrice) {
          await setPlowPriceMutation.mutateAsync({
            customerId,
            serviceCode: 'SALT',
            price: parseFloat(saltPrice),
          });
        }
      }

      await refetch();
      setIsEditMode(false);
      alert('Customer updated successfully!');
    } catch (error: any) {
      alert(`Failed to update customer: ${error.message}`);
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
              <div className="flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">{customer.name}</h1>
                {customer.tags?.some((t: string) => t.toLowerCase().includes('plow') || t.toLowerCase().includes('snow')) && (
                  <span className="inline-flex items-center px-2.5 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
                    Plow
                  </span>
                )}
              </div>
              {customer.company && (
                <p className="mt-1 text-lg text-gray-500">{customer.company}</p>
              )}
            </div>
            <div className="mt-4 flex space-x-3 md:mt-0">
              {!isEditMode ? (
                <>
                  <button
                    onClick={handleEditToggle}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    ✏️ Edit Customer
                  </button>
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
                </>
              ) : (
                <>
                  <button
                    onClick={handleSaveCustomer}
                    disabled={updateCustomerMutation.isPending}
                    className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateCustomerMutation.isPending ? '⏳ Saving...' : '💾 Save Changes'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={updateCustomerMutation.isPending}
                    className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-md shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    ❌ Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          {/* Left Column - Customer Info */}
          <div className="lg:col-span-2 space-y-6">
            {/* Contact Information */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Contact Information</h2>
              {!isEditMode ? (
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
                  {customer.company && (
                    <div className="sm:col-span-2">
                      <dt className="text-sm font-medium text-gray-500">Company</dt>
                      <dd className="mt-1 text-sm text-gray-900">{customer.company}</dd>
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
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
                    <input
                      type="text"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                      placeholder="Customer name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
                    <input
                      type="text"
                      value={editedCompany}
                      onChange={(e) => setEditedCompany(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                      placeholder="Company name"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
                    <input
                      type="email"
                      value={editedEmail}
                      onChange={(e) => setEditedEmail(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
                    <input
                      type="tel"
                      value={editedPhone}
                      onChange={(e) => setEditedPhone(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                      placeholder="(555) 123-4567"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 1</label>
                    <input
                      type="text"
                      value={editedAddressLine1}
                      onChange={(e) => setEditedAddressLine1(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                      placeholder="Street address"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Address Line 2</label>
                    <input
                      type="text"
                      value={editedAddressLine2}
                      onChange={(e) => setEditedAddressLine2(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                      placeholder="Apt, suite, etc."
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div className="col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
                      <input
                        type="text"
                        value={editedCity}
                        onChange={(e) => setEditedCity(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="City"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                      <input
                        type="text"
                        value={editedState}
                        onChange={(e) => setEditedState(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="CA"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Zip Code</label>
                    <input
                      type="text"
                      value={editedZipCode}
                      onChange={(e) => setEditedZipCode(e.target.value)}
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                      placeholder="12345"
                    />
                  </div>

                  {/* Plow Customer Section */}
                  <div className="border-t pt-4 mt-4">
                    <label className="flex items-center gap-3 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isPlowCustomer}
                        onChange={(e) => setIsPlowCustomer(e.target.checked)}
                        className="w-5 h-5 text-blue-600 rounded"
                      />
                      <span className="text-sm font-medium text-gray-700">Plow Customer</span>
                    </label>

                    {isPlowCustomer && (
                      <div className="mt-3 ml-8 grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Plow Price</label>
                          <div className="flex items-center">
                            <span className="text-gray-500 mr-1">$</span>
                            <input
                              type="number"
                              value={plowPrice}
                              onChange={(e) => setPlowPrice(e.target.value)}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                              placeholder="50"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-sm text-gray-600 mb-1">Salt Price</label>
                          <div className="flex items-center">
                            <span className="text-gray-500 mr-1">$</span>
                            <input
                              type="number"
                              value={saltPrice}
                              onChange={(e) => setSaltPrice(e.target.value)}
                              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                              placeholder="30"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
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

              {invoiceData?.invoices && invoiceData.invoices.length > 0 ? (
                <div className="space-y-3">
                  {invoiceData.invoices.map((invoice: any) => (
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
                    {invoiceData?.invoices?.length || 0}
                  </p>
                </div>
                <div>
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${invoiceData?.invoices?.reduce((sum: number, inv: any) => sum + parseFloat(inv.total), 0).toFixed(2) || '0.00'}
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

            {(customer.notes || isEditMode) && (
              <div className="bg-white shadow rounded-lg p-6">
                <h3 className="text-sm font-medium text-gray-500 mb-2">Notes</h3>
                {!isEditMode ? (
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{customer.notes}</p>
                ) : (
                  <textarea
                    value={editedNotes}
                    onChange={(e) => setEditedNotes(e.target.value)}
                    rows={6}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                    placeholder="Add notes about this customer..."
                  />
                )}
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
                disabled={setPricingMutation.isPending}
                className="px-4 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                {setPricingMutation.isPending ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

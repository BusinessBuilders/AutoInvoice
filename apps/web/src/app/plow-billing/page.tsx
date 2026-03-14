'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { trpc } from '@/lib/trpc';

interface PlowCustomer {
  id: string;
  name: string;
  phone: string | null;
  addressLine1: string | null;
  city: string | null;
  plowPrice: number;
  saltPrice: number;
}

interface BillingRecord {
  id: string;
  url: string;
  amount: number;
  status: 'PENDING' | 'SENT' | 'PAID' | 'EXPIRED' | 'CANCELLED';
  createdAt: string;
  paidAt: string | null;
}

export default function PlowBillingPage() {
  const [selectedServices, setSelectedServices] = useState<Record<string, { plow: number; salt: number }>>({});
  const [customerBillings, setCustomerBillings] = useState<Record<string, BillingRecord>>({});
  const [loading, setLoading] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [editingPrice, setEditingPrice] = useState<{ customerId: string; service: 'plow' | 'salt' } | null>(null);
  const [tempPrice, setTempPrice] = useState<string>('');
  const [customerPrices, setCustomerPrices] = useState<Record<string, { plow: number; salt: number }>>({});

  // Get all customers - filter for plow customers by tag
  const { data: customersData, isLoading, refetch: refetchCustomers } = trpc.customer.list.useQuery({ limit: 100 });

  // Get billing history
  const { data: billingsData, refetch: refetchBillings } = trpc.payments.getPlowBillings.useQuery(
    { limit: 100 },
    { refetchInterval: 30000 } // Auto-refresh every 30 seconds to catch payments
  );

  // Update billing records for each customer (most recent UNPAID per customer)
  useEffect(() => {
    if (billingsData) {
      const billingMap: Record<string, BillingRecord> = {};
      for (const b of billingsData) {
        // Skip paid/cancelled/expired — those are done, customer is ready for new bill
        if (b.status === 'PAID' || b.status === 'CANCELLED' || b.status === 'EXPIRED') continue;
        // Only keep the most recent active billing per customer
        if (!billingMap[b.customerId] || new Date(b.createdAt) > new Date(billingMap[b.customerId].createdAt)) {
          billingMap[b.customerId] = {
            id: b.id,
            url: b.url,
            amount: b.totalAmount,
            status: b.status as BillingRecord['status'],
            createdAt: b.createdAt,
            paidAt: b.paidAt,
          };
        }
      }
      setCustomerBillings(billingMap);
    }
  }, [billingsData]);

  // Get plow services
  const { data: servicesData } = trpc.service.list.useQuery();

  // Find plow service prices (defaults)
  const plowService = servicesData?.find((s: any) => s.code === 'PLOW');
  const saltService = servicesData?.find((s: any) => s.code === 'SALT');
  const defaultPlowPrice = plowService?.basePrice ? parseFloat(plowService.basePrice) : 50;
  const defaultSaltPrice = saltService?.basePrice ? parseFloat(saltService.basePrice) : 30;

  // Filter for plow customers
  const plowCustomers: PlowCustomer[] = (customersData?.customers || [])
    .filter((c: any) => {
      const tags = c.tags || [];
      const notes = c.notes || '';
      const isPlow = tags.some((t: string) => t.toLowerCase().includes('plow') || t.toLowerCase().includes('snow')) ||
                     notes.toLowerCase().includes('plow') ||
                     notes.toLowerCase().includes('snow');
      return isPlow;
    })
    .map((c: any) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      addressLine1: c.addressLine1,
      city: c.city,
      plowPrice: customerPrices[c.id]?.plow ?? defaultPlowPrice,
      saltPrice: customerPrices[c.id]?.salt ?? defaultSaltPrice,
    }));

  // Get customer-specific prices
  const { data: pricesData } = trpc.payments.getCustomerPrices.useQuery(
    {
      customerIds: plowCustomers.map((c) => c.id),
      serviceCodes: ['PLOW', 'SALT'],
    },
    { enabled: plowCustomers.length > 0 }
  );

  // Update local prices when data loads
  useEffect(() => {
    if (pricesData?.prices) {
      const newPrices: Record<string, { plow: number; salt: number }> = {};
      for (const [customerId, prices] of Object.entries(pricesData.prices)) {
        const priceMap = prices as Record<string, number>;
        newPrices[customerId] = {
          plow: priceMap.PLOW ?? defaultPlowPrice,
          salt: priceMap.SALT ?? defaultSaltPrice,
        };
      }
      setCustomerPrices(newPrices);
    }
  }, [pricesData, defaultPlowPrice, defaultSaltPrice]);

  const createPaymentLink = trpc.payments.createPlowBillingLink.useMutation();
  const setCustomerPrice = trpc.payments.setCustomerPrice.useMutation();

  const updateQuantity = (customerId: string, service: 'plow' | 'salt', qty: number) => {
    setSelectedServices(prev => ({
      ...prev,
      [customerId]: {
        plow: service === 'plow' ? Math.max(0, qty) : (prev[customerId]?.plow || 0),
        salt: service === 'salt' ? Math.max(0, qty) : (prev[customerId]?.salt || 0),
      }
    }));
  };

  const getCustomerPrice = (customerId: string, service: 'plow' | 'salt') => {
    if (customerPrices[customerId]) {
      return customerPrices[customerId][service];
    }
    return service === 'plow' ? defaultPlowPrice : defaultSaltPrice;
  };

  const getTotal = (customerId: string) => {
    const services = selectedServices[customerId] || { plow: 0, salt: 0 };
    let total = 0;
    total += services.plow * getCustomerPrice(customerId, 'plow');
    total += services.salt * getCustomerPrice(customerId, 'salt');
    return total;
  };

  const startEditPrice = (customerId: string, service: 'plow' | 'salt') => {
    setEditingPrice({ customerId, service });
    setTempPrice(getCustomerPrice(customerId, service).toString());
  };

  const savePrice = async () => {
    if (!editingPrice) return;
    const price = parseFloat(tempPrice);
    if (isNaN(price) || price < 0) {
      alert('Please enter a valid price');
      return;
    }

    try {
      await setCustomerPrice.mutateAsync({
        customerId: editingPrice.customerId,
        serviceCode: editingPrice.service === 'plow' ? 'PLOW' : 'SALT',
        price,
      });

      // Update local state
      setCustomerPrices(prev => ({
        ...prev,
        [editingPrice.customerId]: {
          ...prev[editingPrice.customerId],
          plow: prev[editingPrice.customerId]?.plow ?? defaultPlowPrice,
          salt: prev[editingPrice.customerId]?.salt ?? defaultSaltPrice,
          [editingPrice.service]: price,
        },
      }));
      setEditingPrice(null);
    } catch (error: any) {
      alert('Error saving price: ' + (error.message || 'Unknown error'));
    }
  };

  const handleGenerateLink = async (customer: PlowCustomer) => {
    const services = selectedServices[customer.id] || { plow: 0, salt: 0 };
    if (services.plow === 0 && services.salt === 0) {
      alert('Please enter quantity for at least one service');
      return;
    }

    setLoading(customer.id);
    try {
      const serviceList = [];
      if (services.plow > 0) {
        const plowTotal = services.plow * getCustomerPrice(customer.id, 'plow');
        serviceList.push({ name: `Plowing x${services.plow}`, amount: plowTotal });
      }
      if (services.salt > 0) {
        const saltTotal = services.salt * getCustomerPrice(customer.id, 'salt');
        serviceList.push({ name: `Salting x${services.salt}`, amount: saltTotal });
      }

      const result = await createPaymentLink.mutateAsync({
        customerId: customer.id,
        services: serviceList,
      });

      // Update local billing state immediately
      setCustomerBillings(prev => ({
        ...prev,
        [customer.id]: {
          id: result.id,
          url: result.url,
          amount: result.amount,
          status: 'PENDING' as const,
          createdAt: new Date().toISOString(),
          paidAt: null,
        },
      }));

      // Refetch to get the full record
      refetchBillings();
    } catch (error: any) {
      alert('Error generating link: ' + (error.message || 'Unknown error'));
    } finally {
      setLoading(null);
    }
  };

  const markAsSent = trpc.payments.markBillingSent.useMutation({
    onSuccess: () => refetchBillings(),
  });

  const copyLink = (customerId: string, billingId: string) => {
    const billing = customerBillings[customerId];
    if (billing?.url) {
      navigator.clipboard.writeText(billing.url);
      setCopiedId(customerId);
      setTimeout(() => setCopiedId(null), 2000);
      // Mark as sent when copied
      if (billing.status === 'PENDING') {
        markAsSent.mutate({ billingId });
      }
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/" className="text-gray-500 hover:text-gray-700">
                ← Back
              </Link>
              <h1 className="text-2xl font-bold text-gray-900">Plow Billing</h1>
            </div>
            <div className="flex items-center gap-4">
              <button
                onClick={() => { setSelectedServices({}); setCustomerBillings({}); refetchCustomers(); refetchBillings(); }}
                className="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm font-medium hover:bg-gray-200 transition-colors"
              >
                Refresh
              </button>
              <Link
                href="/plow-route"
                className="px-4 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
              >
                🚗 Driver Route
              </Link>
              <span className="text-sm text-gray-500">
                {plowCustomers.length} customers
              </span>
            </div>
          </div>
          <p className="mt-2 text-sm text-gray-500">
            Click on a price to edit it. Prices are saved per customer.
          </p>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {plowCustomers.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg shadow-sm border">
            <p className="text-gray-500 mb-4">No plow customers found.</p>
            <p className="text-sm text-gray-400 mb-6">
              Add &quot;plow&quot; or &quot;snow&quot; to a customer&apos;s tags or notes to show them here.
            </p>
            <Link
              href="/customers"
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Manage Customers
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {plowCustomers.map((customer) => {
              const services = selectedServices[customer.id] || { plow: 0, salt: 0 };
              const total = getTotal(customer.id);
              const billing = customerBillings[customer.id];
              const isLoadingThis = loading === customer.id;
              const plowPrice = getCustomerPrice(customer.id, 'plow');
              const saltPrice = getCustomerPrice(customer.id, 'salt');

              // Status badge colors
              const statusColors: Record<string, string> = {
                PENDING: 'bg-yellow-100 text-yellow-800',
                SENT: 'bg-blue-100 text-blue-800',
                PAID: 'bg-green-100 text-green-800',
                EXPIRED: 'bg-gray-100 text-gray-800',
                CANCELLED: 'bg-red-100 text-red-800',
              };

              return (
                <div key={customer.id} className={`bg-white rounded-lg shadow-sm border p-4 ${billing?.status === 'PAID' ? 'border-green-300' : ''}`}>
                  {/* Customer Info with Status */}
                  <div className="mb-4">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-lg text-gray-900">{customer.name}</h3>
                      {billing && (
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[billing.status]}`}>
                          {billing.status}
                        </span>
                      )}
                    </div>
                    {customer.addressLine1 && (
                      <p className="text-sm text-gray-500">
                        {customer.addressLine1}{customer.city ? `, ${customer.city}` : ''}
                      </p>
                    )}
                    {customer.phone && (
                      <a
                        href={`tel:${customer.phone}`}
                        className="text-sm text-blue-600 hover:underline flex items-center gap-1 mt-1"
                      >
                        {customer.phone}
                      </a>
                    )}
                  </div>

                  {/* Service Selection with Quantities and Editable Prices */}
                  <div className="space-y-3 mb-4">
                    {/* Plowing row */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={services.plow || ''}
                        onChange={(e) => updateQuantity(customer.id, 'plow', parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-12 px-2 py-1 text-center border rounded text-sm"
                      />
                      <span className="text-sm flex-1">x Plowing</span>
                      {editingPrice?.customerId === customer.id && editingPrice?.service === 'plow' ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm">$</span>
                          <input
                            type="number"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && savePrice()}
                            className="w-16 px-1 py-0.5 text-sm border rounded"
                            autoFocus
                          />
                          <button
                            onClick={savePrice}
                            className="text-green-600 hover:text-green-700 text-sm"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditPrice(customer.id, 'plow')}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          title="Click to edit price"
                        >
                          @ ${plowPrice}
                        </button>
                      )}
                      {services.plow > 0 && (
                        <span className="text-sm text-gray-500">
                          = ${(services.plow * plowPrice).toFixed(0)}
                        </span>
                      )}
                    </div>
                    {/* Salting row */}
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        value={services.salt || ''}
                        onChange={(e) => updateQuantity(customer.id, 'salt', parseInt(e.target.value) || 0)}
                        placeholder="0"
                        className="w-12 px-2 py-1 text-center border rounded text-sm"
                      />
                      <span className="text-sm flex-1">x Salting</span>
                      {editingPrice?.customerId === customer.id && editingPrice?.service === 'salt' ? (
                        <div className="flex items-center gap-1">
                          <span className="text-sm">$</span>
                          <input
                            type="number"
                            value={tempPrice}
                            onChange={(e) => setTempPrice(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && savePrice()}
                            className="w-16 px-1 py-0.5 text-sm border rounded"
                            autoFocus
                          />
                          <button
                            onClick={savePrice}
                            className="text-green-600 hover:text-green-700 text-sm"
                          >
                            Save
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => startEditPrice(customer.id, 'salt')}
                          className="text-sm font-medium text-blue-600 hover:text-blue-700"
                          title="Click to edit price"
                        >
                          @ ${saltPrice}
                        </button>
                      )}
                      {services.salt > 0 && (
                        <span className="text-sm text-gray-500">
                          = ${(services.salt * saltPrice).toFixed(0)}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Total & Actions */}
                  <div className="border-t pt-4">
                    <div className="flex items-center justify-between mb-3">
                      <span className="font-medium">Total:</span>
                      <span className="text-xl font-bold text-green-600">
                        ${total.toFixed(2)}
                      </span>
                    </div>

                    {billing ? (
                      <div className="space-y-2">
                        <div className="flex gap-2">
                          <button
                            onClick={() => copyLink(customer.id, billing.id)}
                            className="flex-1 px-3 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700"
                          >
                            {copiedId === customer.id ? 'Copied!' : 'Copy Link'}
                          </button>
                          <a
                            href={billing.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200"
                          >
                            Open
                          </a>
                        </div>
                        {customer.phone && (
                          <a
                            href={`sms:${customer.phone}?body=Hi ${customer.name.split(' ')[0]}! Here's your snow service invoice for $${billing.amount}: ${billing.url}`}
                            className="block w-full text-center px-3 py-2 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200"
                          >
                            Text Link to Customer
                          </a>
                        )}
                      </div>
                    ) : (
                      <button
                        onClick={() => handleGenerateLink(customer)}
                        disabled={total === 0 || isLoadingThis}
                        className={`w-full px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                          total === 0
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : isLoadingThis
                            ? 'bg-blue-400 text-white cursor-wait'
                            : 'bg-blue-600 text-white hover:bg-blue-700'
                        }`}
                      >
                        {isLoadingThis ? 'Generating...' : 'Generate Stripe Link'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

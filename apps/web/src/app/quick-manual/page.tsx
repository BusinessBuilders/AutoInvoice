'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';

interface LineItem {
  serviceId?: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
}

// Modal component for inline creation
function Modal({ isOpen, onClose, title, children }: {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  const modalRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div ref={modalRef} className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h3 className="text-lg font-semibold text-gray-900">{title}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl font-bold">
            &times;
          </button>
        </div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}

export default function QuickManualInvoicePage() {
  const router = useRouter();
  const utils = trpc.useUtils();

  // Main state
  const [selectedCustomerId, setSelectedCustomerId] = useState('');
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [serviceDate, setServiceDate] = useState(new Date().toISOString().split('T')[0]);
  const [jobName, setJobName] = useState('');
  const [notes, setNotes] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showCustomItem, setShowCustomItem] = useState(false);
  const [customDescription, setCustomDescription] = useState('');
  const [customQuantity, setCustomQuantity] = useState(1);
  const [customRate, setCustomRate] = useState(0);
  const [customUnit, setCustomUnit] = useState('each');

  // Modal state
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [showServiceModal, setShowServiceModal] = useState(false);

  // New customer form
  const [newCustomerName, setNewCustomerName] = useState('');
  const [newCustomerEmail, setNewCustomerEmail] = useState('');
  const [newCustomerPhone, setNewCustomerPhone] = useState('');
  const [newCustomerCompany, setNewCustomerCompany] = useState('');

  // New service form
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCode, setNewServiceCode] = useState('');
  const [newServiceCategory, setNewServiceCategory] = useState('');
  const [newServicePrice, setNewServicePrice] = useState<number | ''>('');
  const [newServiceUnit, setNewServiceUnit] = useState('each');

  // Queries
  const { data: customersData, isLoading: customersLoading } = trpc.customer.list.useQuery({});
  const { data: servicesData, isLoading: servicesLoading } = trpc.service.list.useQuery({});

  // Mutations
  const createInvoiceMutation = trpc.invoice.create.useMutation();
  const createCustomerMutation = trpc.customer.create.useMutation({
    onSuccess: (customer) => {
      utils.customer.list.invalidate();
      setSelectedCustomerId(customer.id);
      setShowCustomerModal(false);
      resetCustomerForm();
    },
  });
  const createServiceMutation = trpc.service.create.useMutation({
    onSuccess: () => {
      utils.service.list.invalidate();
      setShowServiceModal(false);
      resetServiceForm();
    },
  });

  const customers = customersData?.customers || [];
  const services = servicesData || [];

  // Get unique categories for the dropdown
  const existingCategories = [...new Set(services.map((s: any) => s.category).filter(Boolean))];

  const filteredServices = services.filter((s: any) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.category?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Group services by category
  const groupedServices = filteredServices.reduce((acc: Record<string, any[]>, service: any) => {
    const category = service.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  const resetCustomerForm = () => {
    setNewCustomerName('');
    setNewCustomerEmail('');
    setNewCustomerPhone('');
    setNewCustomerCompany('');
  };

  const resetServiceForm = () => {
    setNewServiceName('');
    setNewServiceCode('');
    setNewServiceCategory('');
    setNewServicePrice('');
    setNewServiceUnit('each');
  };

  const handleAddService = (service: any) => {
    const newItem: LineItem = {
      serviceId: service.id,
      description: service.name,
      quantity: 1,
      unit: service.priceUnit || 'each',
      rate: parseFloat(service.basePrice) || 0,
      amount: parseFloat(service.basePrice) || 0,
    };
    setLineItems([...lineItems, newItem]);
  };

  const handleAddCustomItem = () => {
    if (!customDescription.trim()) return;

    const newItem: LineItem = {
      description: customDescription,
      quantity: customQuantity,
      unit: customUnit,
      rate: customRate,
      amount: customQuantity * customRate,
    };
    setLineItems([...lineItems, newItem]);
    setCustomDescription('');
    setCustomQuantity(1);
    setCustomRate(0);
    setCustomUnit('each');
    setShowCustomItem(false);
  };

  const handleUpdateItem = (index: number, field: keyof LineItem, value: any) => {
    const updated = [...lineItems];
    let parsedValue = value;

    if (field === 'quantity' || field === 'rate') {
      parsedValue = parseFloat(value) || 0;
    }

    updated[index] = { ...updated[index], [field]: parsedValue };

    if (field === 'quantity' || field === 'rate') {
      updated[index].amount = updated[index].quantity * updated[index].rate;
    }

    setLineItems(updated);
  };

  const handleRemoveItem = (index: number) => {
    setLineItems(lineItems.filter((_, i) => i !== index));
  };

  const calculateTotal = () => {
    return lineItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return;

    createCustomerMutation.mutate({
      name: newCustomerName,
      email: newCustomerEmail || undefined,
      phone: newCustomerPhone || undefined,
      company: newCustomerCompany || undefined,
    });
  };

  const handleCreateService = async () => {
    if (!newServiceName.trim() || !newServiceCode.trim() || !newServiceCategory.trim()) return;

    createServiceMutation.mutate({
      name: newServiceName,
      code: newServiceCode,
      category: newServiceCategory,
      basePrice: typeof newServicePrice === 'number' ? newServicePrice : undefined,
      priceUnit: newServiceUnit || undefined,
    });
  };

  const handleCreateInvoice = async () => {
    if (!selectedCustomerId) {
      alert('Please select a customer');
      return;
    }
    if (lineItems.length === 0) {
      alert('Please add at least one item');
      return;
    }

    try {
      const invoice = await createInvoiceMutation.mutateAsync({
        customerId: selectedCustomerId,
        serviceDate: new Date(serviceDate),
        dueDate: new Date(serviceDate), // Due on receipt
        serviceAddress: jobName || undefined, // Job name / location
        lineItems: lineItems.map((item, index) => ({
          serviceId: item.serviceId,
          description: item.description,
          quantity: item.quantity,
          unit: item.unit,
          rate: item.rate,
          amount: item.amount,
          order: index,
        })),
        notes: notes || undefined,
      });
      router.push(`/invoices/${invoice.id}`);
    } catch (error: any) {
      alert(`Failed to create invoice: ${error.message}`);
    }
  };

  // Auto-generate service code from name
  useEffect(() => {
    if (newServiceName && !newServiceCode) {
      const code = newServiceName
        .toUpperCase()
        .replace(/[^A-Z0-9\s]/g, '')
        .split(/\s+/)
        .map(word => word.slice(0, 3))
        .join('-')
        .slice(0, 12);
      setNewServiceCode(code);
    }
  }, [newServiceName, newServiceCode]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quick Invoice</h1>
              <p className="text-sm text-gray-500">Click services to add them - no AI needed</p>
            </div>
            <div className="flex gap-3">
              <Link href="/voice" className="text-sm text-purple-600 hover:text-purple-800">
                Voice Mode
              </Link>
              <Link href="/quick" className="text-sm text-blue-600 hover:text-blue-800">
                AI Mode
              </Link>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Service Picker */}
          <div className="space-y-4">
            {/* Customer Selection */}
            <div className="bg-white shadow rounded-lg p-4">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium text-gray-700">Customer *</label>
                <button
                  onClick={() => setShowCustomerModal(true)}
                  className="text-sm text-green-600 hover:text-green-800 font-medium"
                >
                  + New Customer
                </button>
              </div>
              {customersLoading ? (
                <div className="animate-pulse h-10 bg-gray-200 rounded-md" />
              ) : (
                <select
                  value={selectedCustomerId}
                  onChange={(e) => setSelectedCustomerId(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                >
                  <option value="">Select a customer...</option>
                  {customers?.map((customer: any) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} {customer.company ? `(${customer.company})` : ''}
                    </option>
                  ))}
                </select>
              )}

              {/* Job Name / Location - Optional */}
              <div className="mt-3">
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Job Name / Location <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="e.g. Downtown Office, Warehouse #3, Pool House..."
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for residential jobs at customer's address</p>
              </div>
            </div>

            {/* Service Search */}
            <div className="bg-white shadow rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <label className="block text-sm font-medium text-gray-700">Services</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setShowServiceModal(true)}
                    className="text-sm text-green-600 hover:text-green-800 font-medium"
                  >
                    + New Service
                  </button>
                  <button
                    onClick={() => setShowCustomItem(!showCustomItem)}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    + Custom Item
                  </button>
                </div>
              </div>

              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search services..."
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3 mb-3"
              />

              {/* Custom Item Form */}
              {showCustomItem && (
                <div className="bg-gray-50 p-3 rounded-md mb-3 space-y-2">
                  <input
                    type="text"
                    value={customDescription}
                    onChange={(e) => setCustomDescription(e.target.value)}
                    placeholder="Description"
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="number"
                      value={customQuantity}
                      onChange={(e) => setCustomQuantity(parseFloat(e.target.value) || 1)}
                      placeholder="Qty"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                    />
                    <input
                      type="text"
                      value={customUnit}
                      onChange={(e) => setCustomUnit(e.target.value)}
                      placeholder="Unit"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                    />
                    <input
                      type="number"
                      step="0.01"
                      value={customRate}
                      onChange={(e) => setCustomRate(parseFloat(e.target.value) || 0)}
                      placeholder="Rate"
                      className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                    />
                  </div>
                  <button
                    onClick={handleAddCustomItem}
                    disabled={!customDescription.trim()}
                    className="w-full px-3 py-2 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
                  >
                    Add Custom Item
                  </button>
                </div>
              )}

              {/* Service List */}
              <div className="max-h-96 overflow-y-auto space-y-4">
                {servicesLoading ? (
                  <div className="space-y-2">
                    {[1, 2, 3].map((i) => (
                      <div key={i} className="animate-pulse h-12 bg-gray-200 rounded-md" />
                    ))}
                  </div>
                ) : Object.entries(groupedServices).length > 0 ? (
                  Object.entries(groupedServices).map(([category, categoryServices]) => (
                    <div key={category}>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                        {category}
                      </h4>
                      <div className="space-y-1">
                        {(categoryServices as any[]).map((service: any) => (
                          <button
                            key={service.id}
                            onClick={() => handleAddService(service)}
                            className="w-full text-left px-3 py-2 rounded-md hover:bg-blue-50 border border-gray-200 hover:border-blue-300 transition-colors"
                          >
                            <div className="flex items-center justify-between">
                              <div>
                                <span className="text-sm font-medium text-gray-900">{service.name}</span>
                                <span className="ml-2 text-xs text-gray-500">({service.code})</span>
                              </div>
                              <span className="text-sm font-semibold text-green-600">
                                ${parseFloat(service.basePrice || 0).toFixed(2)}
                              </span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-8">
                    <p className="text-gray-500 mb-2">No services found</p>
                    <button
                      onClick={() => setShowServiceModal(true)}
                      className="text-sm text-green-600 hover:text-green-800 font-medium"
                    >
                      Create your first service
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right: Invoice Preview */}
          <div className="space-y-4">
            {/* Date & Notes */}
            <div className="bg-white shadow rounded-lg p-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service Date</label>
                  <input
                    type="date"
                    value={serviceDate}
                    onChange={(e) => setServiceDate(e.target.value)}
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Optional notes..."
                    className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                  />
                </div>
              </div>
            </div>

            {/* Line Items */}
            <div className="bg-white shadow rounded-lg overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-200">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-900">
                    Line Items ({lineItems.length})
                  </h3>
                  {jobName && (
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                      {jobName}
                    </span>
                  )}
                </div>
              </div>

              <div className="divide-y divide-gray-200">
                {lineItems.map((item, index) => (
                  <div key={index} className="px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleUpdateItem(index, 'description', e.target.value)}
                          className="block w-full text-sm font-medium text-gray-900 border-0 border-b border-transparent hover:border-gray-300 focus:border-blue-500 focus:ring-0 px-0 py-1"
                        />
                        <div className="flex items-center gap-2 mt-1">
                          <input
                            type="number"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => handleUpdateItem(index, 'quantity', e.target.value)}
                            className="w-16 text-xs text-gray-600 border rounded px-2 py-1"
                          />
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleUpdateItem(index, 'unit', e.target.value)}
                            className="w-16 text-xs text-gray-600 border rounded px-2 py-1"
                          />
                          <span className="text-xs text-gray-500">@</span>
                          <span className="text-xs text-gray-500">$</span>
                          <input
                            type="number"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => handleUpdateItem(index, 'rate', e.target.value)}
                            className="w-20 text-xs text-gray-600 border rounded px-2 py-1"
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-900">
                          ${item.amount.toFixed(2)}
                        </span>
                        <button
                          onClick={() => handleRemoveItem(index)}
                          className="text-red-500 hover:text-red-700 text-lg font-bold"
                        >
                          &times;
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
                {lineItems.length === 0 && (
                  <div className="px-4 py-8 text-center text-gray-500">
                    Click services on the left to add them
                  </div>
                )}
              </div>

              {/* Total */}
              {lineItems.length > 0 && (
                <div className="px-4 py-3 bg-gray-50 border-t border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold text-gray-900">Total:</span>
                    <span className="text-2xl font-bold text-green-600">
                      ${calculateTotal().toFixed(2)}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* Create Button */}
            <button
              onClick={handleCreateInvoice}
              disabled={!selectedCustomerId || lineItems.length === 0 || createInvoiceMutation.isPending}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-lg text-lg font-semibold hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg transition-colors"
            >
              {createInvoiceMutation.isPending ? (
                <span className="flex items-center justify-center gap-2">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  Creating...
                </span>
              ) : (
                `Create Invoice - $${calculateTotal().toFixed(2)}`
              )}
            </button>

            {/* Quick actions */}
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => setLineItems([])}
                disabled={lineItems.length === 0}
                className="text-sm text-gray-500 hover:text-red-600 disabled:opacity-50"
              >
                Clear All Items
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* New Customer Modal */}
      <Modal isOpen={showCustomerModal} onClose={() => setShowCustomerModal(false)} title="Add New Customer">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name *</label>
            <input
              type="text"
              value={newCustomerName}
              onChange={(e) => setNewCustomerName(e.target.value)}
              placeholder="John Smith"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Company</label>
            <input
              type="text"
              value={newCustomerCompany}
              onChange={(e) => setNewCustomerCompany(e.target.value)}
              placeholder="Acme Corp"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Email</label>
              <input
                type="email"
                value={newCustomerEmail}
                onChange={(e) => setNewCustomerEmail(e.target.value)}
                placeholder="john@example.com"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
                placeholder="(555) 123-4567"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
              />
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowCustomerModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateCustomer}
              disabled={!newCustomerName.trim() || createCustomerMutation.isPending}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {createCustomerMutation.isPending ? 'Creating...' : 'Create Customer'}
            </button>
          </div>
          {createCustomerMutation.error && (
            <p className="text-sm text-red-600">{createCustomerMutation.error.message}</p>
          )}
        </div>
      </Modal>

      {/* New Service Modal */}
      <Modal isOpen={showServiceModal} onClose={() => setShowServiceModal(false)} title="Add New Service">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Service Name *</label>
            <input
              type="text"
              value={newServiceName}
              onChange={(e) => setNewServiceName(e.target.value)}
              placeholder="Lawn Mowing"
              className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code *</label>
              <input
                type="text"
                value={newServiceCode}
                onChange={(e) => setNewServiceCode(e.target.value.toUpperCase())}
                placeholder="LAWN-MOW"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <input
                type="text"
                value={newServiceCategory}
                onChange={(e) => setNewServiceCategory(e.target.value)}
                placeholder="Landscaping"
                list="category-suggestions"
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
              />
              <datalist id="category-suggestions">
                {existingCategories.map((cat) => (
                  <option key={cat} value={cat} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Base Price</label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-gray-500">$</span>
                <input
                  type="number"
                  step="0.01"
                  value={newServicePrice}
                  onChange={(e) => setNewServicePrice(e.target.value ? parseFloat(e.target.value) : '')}
                  placeholder="0.00"
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 pl-7 pr-3"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select
                value={newServiceUnit}
                onChange={(e) => setNewServiceUnit(e.target.value)}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
              >
                <option value="each">each</option>
                <option value="hour">hour</option>
                <option value="sqft">sqft</option>
                <option value="linear ft">linear ft</option>
                <option value="cubic yard">cubic yard</option>
                <option value="bag">bag</option>
                <option value="trip">trip</option>
              </select>
            </div>
          </div>
          <div className="flex gap-3 pt-2">
            <button
              onClick={() => setShowServiceModal(false)}
              className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={handleCreateService}
              disabled={!newServiceName.trim() || !newServiceCode.trim() || !newServiceCategory.trim() || createServiceMutation.isPending}
              className="flex-1 px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:opacity-50"
            >
              {createServiceMutation.isPending ? 'Creating...' : 'Create Service'}
            </button>
          </div>
          {createServiceMutation.error && (
            <p className="text-sm text-red-600">{createServiceMutation.error.message}</p>
          )}
        </div>
      </Modal>
    </div>
  );
}

'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';
import JournalEntriesSection from '@/components/JournalEntriesSection';

interface EditableLineItem {
  id?: string;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  order: number;
  serviceId?: string;
}

export default function InvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const invoiceId = params.id as string;
  const [isDownloading, setIsDownloading] = useState(false);
  const [isEditMode, setIsEditMode] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [editedLineItems, setEditedLineItems] = useState<EditableLineItem[]>([]);
  const [editedNotes, setEditedNotes] = useState('');
  const [editedServiceDate, setEditedServiceDate] = useState('');
  const [editedDueDate, setEditedDueDate] = useState('');
  const [editedPaymentTerms, setEditedPaymentTerms] = useState('Net 30');
  const [editedServiceAddress, setEditedServiceAddress] = useState('');
  const [editedCustomerName, setEditedCustomerName] = useState('');
  const [editedCustomerEmail, setEditedCustomerEmail] = useState('');
  const [editedCustomerPhone, setEditedCustomerPhone] = useState('');
  const [editedCustomerCompany, setEditedCustomerCompany] = useState('');
  const [editedCustomerAddressLine1, setEditedCustomerAddressLine1] = useState('');
  const [editedCustomerAddressLine2, setEditedCustomerAddressLine2] = useState('');
  const [editedCustomerCity, setEditedCustomerCity] = useState('');
  const [editedCustomerState, setEditedCustomerState] = useState('');
  const [editedCustomerZipCode, setEditedCustomerZipCode] = useState('');
  const [serviceSearchTerm, setServiceSearchTerm] = useState('');
  const [customerSearchTerm, setCustomerSearchTerm] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const { data: invoice, isLoading, refetch } = trpc.invoice.get.useQuery({ id: invoiceId });
  
  const { data: servicesData } = trpc.service.list.useQuery();

  const { data: customerSearchResults } = trpc.customer.list.useQuery(
    { search: customerSearchTerm, limit: 8 },
    { enabled: customerSearchTerm.length > 1 }
  );
  
  // Filter and group services
  const filteredServices = servicesData?.filter((s: any) =>
    s.name.toLowerCase().includes(serviceSearchTerm.toLowerCase()) ||
    s.code.toLowerCase().includes(serviceSearchTerm.toLowerCase()) ||
    s.category?.toLowerCase().includes(serviceSearchTerm.toLowerCase())
  ) || [];

  const groupedServices = filteredServices.reduce((acc: Record<string, any[]>, service: any) => {
    const category = service.category || 'Uncategorized';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {});

  // Fetch journal entries for this invoice
  const { data: journalEntries, isLoading: isLoadingJournalEntries } = trpc.journal.getBySource.useQuery(
    {
      sourceType: 'INVOICE',
      sourceId: invoiceId,
    },
    {
      enabled: !!invoiceId, // Only fetch when we have an invoice ID
    }
  );
  
  const updateInvoiceMutation = trpc.invoice.update.useMutation();
  const updateCustomerMutation = trpc.customer.update.useMutation();
  const deleteInvoiceMutation = trpc.invoice.delete.useMutation();
  const downloadPdfMutation = trpc.invoice.downloadPdf.useQuery(
    { id: invoiceId },
    { enabled: false }
  );

  useEffect(() => {
    if (invoice && isEditMode) {
      setEditedLineItems(
        invoice.lineItems?.map((item: any) => ({
          id: item.id,
          description: item.description,
          quantity: parseFloat(item.quantity.toString()),
          unit: item.unit || 'unit',
          rate: parseFloat(item.rate.toString()),
          amount: parseFloat(item.amount.toString()),
          order: item.order,
          serviceId: item.serviceId,
        })) || []
      );
      setEditedNotes(invoice.notes || '');
      setEditedServiceDate(new Date(invoice.serviceDate).toISOString().split('T')[0]);
      setEditedDueDate(new Date(invoice.dueDate).toISOString().split('T')[0]);
      setEditedPaymentTerms(invoice.paymentTerms || 'Net 30');
      setEditedServiceAddress(invoice.serviceAddress || '');

      // Initialize customer fields
      if (invoice.customer) {
        setEditedCustomerName(invoice.customer.name || '');
        setEditedCustomerEmail(invoice.customer.email || '');
        setEditedCustomerPhone(invoice.customer.phone || '');
        setEditedCustomerCompany(invoice.customer.company || '');
        setEditedCustomerAddressLine1(invoice.customer.addressLine1 || '');
        setEditedCustomerAddressLine2(invoice.customer.addressLine2 || '');
        setEditedCustomerCity(invoice.customer.city || '');
        setEditedCustomerState(invoice.customer.state || '');
        setEditedCustomerZipCode(invoice.customer.zipCode || '');
      }
    }
  }, [invoice, isEditMode]);

  const handleDownloadPdf = async () => {
    try {
      setIsDownloading(true);

      // Fetch PDF data using tRPC client
      const pdfData = await downloadPdfMutation.refetch();

      if (!pdfData.data) {
        throw new Error('Failed to generate PDF');
      }

      // Convert base64 to blob
      const byteCharacters = atob(pdfData.data.data);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
      const blob = new Blob([byteArray], { type: 'application/pdf' });

      // Create download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = pdfData.data.filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error: any) {
      alert(`Failed to download PDF: ${error.message}`);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleEditToggle = () => {
    setSelectedCustomerId(null);
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
    setIsEditMode(!isEditMode);
  };

  const handleCancelEdit = () => {
    setSelectedCustomerId(null);
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
    setIsEditMode(false);
  };

  const handleSelectExistingCustomer = (customer: any) => {
    setSelectedCustomerId(customer.id);
    setCustomerSearchTerm('');
    setShowCustomerDropdown(false);
    setEditedCustomerName(customer.name || '');
    setEditedCustomerEmail(customer.email || '');
    setEditedCustomerPhone(customer.phone || '');
    setEditedCustomerCompany(customer.company || '');
    setEditedCustomerAddressLine1(customer.addressLine1 || '');
    setEditedCustomerAddressLine2(customer.addressLine2 || '');
    setEditedCustomerCity(customer.city || '');
    setEditedCustomerState(customer.state || '');
    setEditedCustomerZipCode(customer.zipCode || '');
  };

  const handleLineItemChange = (index: number, field: keyof EditableLineItem, value: any) => {
    const updated = [...editedLineItems];

    // Convert numeric fields from strings to numbers
    let parsedValue = value;
    if (field === 'quantity' || field === 'rate' || field === 'amount') {
      parsedValue = parseFloat(value) || 0;
    }

    updated[index] = { ...updated[index], [field]: parsedValue };

    // Auto-calculate amount when quantity or rate changes
    if (field === 'quantity' || field === 'rate') {
      const quantity = field === 'quantity' ? parsedValue : updated[index].quantity;
      const rate = field === 'rate' ? parsedValue : updated[index].rate;
      updated[index].amount = quantity * rate;
    }

    setEditedLineItems(updated);
  };

  // **Add service selection handler**
  const handleServiceSelect = (index: number, serviceId: string) => {
    const service = servicesData?.find(s => s.id === serviceId);
    if (!service) return;

    const updated = [...editedLineItems];
    const basePrice = service.basePrice ? parseFloat(service.basePrice.toString()) : 0;
    updated[index] = {
      ...updated[index],
      serviceId: service.id,
      description: service.name,
      unit: service.priceUnit || 'unit',
      rate: basePrice,
      amount: updated[index].quantity * basePrice,
    };
    setEditedLineItems(updated);
  };

  const handleAddLineItem = () => {
    const newItem: EditableLineItem = {
      description: '',
      quantity: 1,
      unit: 'unit',
      rate: 0,
      amount: 0,
      order: editedLineItems.length,
    };
    setEditedLineItems([...editedLineItems, newItem]);
  };

  const handleDeleteLineItem = (index: number) => {
    const updated = editedLineItems.filter((_, i) => i !== index);
    // Reorder items
    updated.forEach((item, i) => {
      item.order = i;
    });
    setEditedLineItems(updated);
  };

  const handleSaveInvoice = async () => {
    try {
      if (selectedCustomerId) {
        // Reassigning to a different existing customer — update invoice customerId only
        await updateInvoiceMutation.mutateAsync({
          id: invoiceId,
          customerId: selectedCustomerId,
          lineItems: editedLineItems,
          notes: editedNotes,
          serviceDate: new Date(editedServiceDate),
          dueDate: new Date(editedDueDate),
          paymentTerms: editedPaymentTerms,
          serviceAddress: editedServiceAddress || undefined,
        });
      } else {
        // Editing the existing customer's info in-place
        if (invoice?.customer) {
          await updateCustomerMutation.mutateAsync({
            id: invoice.customer.id,
            name: editedCustomerName,
            email: editedCustomerEmail || undefined,
            phone: editedCustomerPhone || undefined,
            company: editedCustomerCompany || undefined,
            addressLine1: editedCustomerAddressLine1 || undefined,
            addressLine2: editedCustomerAddressLine2 || undefined,
            city: editedCustomerCity || undefined,
            state: editedCustomerState || undefined,
            zipCode: editedCustomerZipCode || undefined,
          });
        }

        await updateInvoiceMutation.mutateAsync({
          id: invoiceId,
          lineItems: editedLineItems,
          notes: editedNotes,
          serviceDate: new Date(editedServiceDate),
          dueDate: new Date(editedDueDate),
          paymentTerms: editedPaymentTerms,
          serviceAddress: editedServiceAddress || undefined,
        });
      }

      await refetch();
      setIsEditMode(false);
      alert('Invoice and customer information updated successfully!');
    } catch (error: any) {
      alert(`Failed to update: ${error.message}`);
    }
  };

  const handleDeleteInvoice = async () => {
    try {
      await deleteInvoiceMutation.mutateAsync({ id: invoiceId });
      router.push('/invoices');
    } catch (error: any) {
      alert(`Failed to delete invoice: ${error.message}`);
      setShowDeleteConfirm(false);
    }
  };

  const calculateSubtotal = () => {
    return editedLineItems.reduce((sum, item) => sum + item.amount, 0);
  };

  const calculateTax = () => {
    const subtotal = calculateSubtotal();
    const taxRate = Number(invoice?.taxRate || 0);
    return subtotal * (taxRate / 100);
  };

  const calculateTotal = () => {
    const subtotal = calculateSubtotal();
    const tax = calculateTax();
    const discount = Number(invoice?.discount || 0);
    return subtotal + tax - discount;
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'PAID':
        return 'bg-green-100 text-green-800';
      case 'SENT':
        return 'bg-yellow-100 text-yellow-800';
      case 'OVERDUE':
        return 'bg-red-100 text-red-800';
      case 'DRAFT':
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-sm text-gray-500">Loading invoice...</p>
        </div>
      </div>
    );
  }

  if (!invoice) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900">Invoice not found</h1>
          <Link href="/invoices" className="mt-4 text-blue-600 hover:text-blue-800">
            ← Back to Invoices
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/invoices"
            className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Invoices
          </Link>
          <div className="md:flex md:items-center md:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">{invoice.invoiceNumber}</h1>
              <div className="mt-2 flex items-center space-x-3">
                <span className={`px-3 py-1 text-sm font-medium rounded ${getStatusColor(invoice.status)}`}>
                  {invoice.status}
                </span>
                {invoice.source && (
                  <span className="text-sm text-gray-500">via {invoice.source}</span>
                )}
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-3 md:mt-0">
              {!isEditMode ? (
                <>
                  <button
                    onClick={handleEditToggle}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    ✏️ Edit Invoice
                  </button>
                  <button
                    onClick={handleDownloadPdf}
                    disabled={isDownloading}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isDownloading ? '⏳ Generating...' : '📄 Download PDF'}
                  </button>
                  <button className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700">
                    📧 Send Email
                  </button>
                  <button
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center px-4 py-2 border border-red-300 rounded-md shadow-sm text-sm font-medium text-red-700 bg-white hover:bg-red-50"
                  >
                    🗑️ Delete
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={handleSaveInvoice}
                    disabled={updateInvoiceMutation.isPending}
                    className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {updateInvoiceMutation.isPending ? '⏳ Saving...' : '💾 Save Changes'}
                  </button>
                  <button
                    onClick={handleCancelEdit}
                    disabled={updateInvoiceMutation.isPending}
                    className="inline-flex items-center px-6 py-3 border border-gray-300 rounded-md shadow-sm text-base font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                  >
                    ❌ Cancel
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Invoice Content */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {/* Customer & Dates */}
          <div className="px-6 py-5 border-b border-gray-200">
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div>
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">Bill To</h3>
                {!isEditMode ? (
                  invoice.customer && (
                    <div className="mt-2">
                      <Link
                        href={`/customers/${invoice.customer.id}`}
                        className="text-lg font-semibold text-blue-600 hover:text-blue-800"
                      >
                        {invoice.customer.name}
                      </Link>
                      {invoice.customer.company && (
                        <p className="text-sm text-gray-500">{invoice.customer.company}</p>
                      )}
                      {invoice.customer.email && (
                        <p className="text-sm text-gray-600">{invoice.customer.email}</p>
                      )}
                      {invoice.customer.phone && (
                        <p className="text-sm text-gray-600">{invoice.customer.phone}</p>
                      )}
                      {invoice.customer.addressLine1 && (
                        <p className="text-sm text-gray-600 mt-1">
                          {invoice.customer.addressLine1}
                          {invoice.customer.addressLine2 && <><br />{invoice.customer.addressLine2}</>}
                          {invoice.customer.city && <><br />{invoice.customer.city}, {invoice.customer.state} {invoice.customer.zipCode}</>}
                        </p>
                      )}
                    </div>
                  )
                ) : (
                  <div className="space-y-3">
                    {/* Customer search / switch */}
                    <div className="relative">
                      <label className="block text-xs font-medium text-gray-700 mb-1">
                        Switch to existing customer
                      </label>
                      <input
                        type="text"
                        value={customerSearchTerm}
                        onChange={(e) => {
                          setCustomerSearchTerm(e.target.value);
                          setShowCustomerDropdown(true);
                          if (!e.target.value) setSelectedCustomerId(null);
                        }}
                        onFocus={() => setShowCustomerDropdown(true)}
                        onBlur={() => setTimeout(() => setShowCustomerDropdown(false), 150)}
                        className="block w-full rounded-md border-blue-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="Search by name, email or phone..."
                      />
                      {showCustomerDropdown && customerSearchResults?.customers && customerSearchResults.customers.length > 0 && (
                        <ul className="absolute z-10 mt-1 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                          {customerSearchResults.customers.map((c: any) => (
                            <li key={c.id}>
                              <button
                                type="button"
                                onMouseDown={() => handleSelectExistingCustomer(c)}
                                className="w-full text-left px-3 py-2 hover:bg-blue-50 text-sm"
                              >
                                <span className="font-medium text-gray-900">{c.name}</span>
                                {c.company && <span className="text-gray-500 ml-1">· {c.company}</span>}
                                {c.email && <span className="block text-xs text-gray-400">{c.email}</span>}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {selectedCustomerId && selectedCustomerId !== invoice?.customerId && (
                        <p className="mt-1 text-xs text-blue-600 font-medium">
                          Switching bill-to: {editedCustomerName}
                          <button
                            type="button"
                            onClick={() => {
                              setSelectedCustomerId(null);
                              setEditedCustomerName(invoice?.customer?.name || '');
                              setEditedCustomerEmail(invoice?.customer?.email || '');
                              setEditedCustomerPhone(invoice?.customer?.phone || '');
                              setEditedCustomerCompany(invoice?.customer?.company || '');
                              setEditedCustomerAddressLine1(invoice?.customer?.addressLine1 || '');
                              setEditedCustomerAddressLine2(invoice?.customer?.addressLine2 || '');
                              setEditedCustomerCity(invoice?.customer?.city || '');
                              setEditedCustomerState(invoice?.customer?.state || '');
                              setEditedCustomerZipCode(invoice?.customer?.zipCode || '');
                            }}
                            className="ml-2 text-gray-400 hover:text-gray-600"
                          >
                            ✕ Cancel
                          </button>
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                      <input
                        type="text"
                        value={editedCustomerName}
                        onChange={(e) => setEditedCustomerName(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="Customer name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Company</label>
                      <input
                        type="text"
                        value={editedCustomerCompany}
                        onChange={(e) => setEditedCustomerCompany(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="Company name"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Email</label>
                      <input
                        type="email"
                        value={editedCustomerEmail}
                        onChange={(e) => setEditedCustomerEmail(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="email@example.com"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Phone</label>
                      <input
                        type="tel"
                        value={editedCustomerPhone}
                        onChange={(e) => setEditedCustomerPhone(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Address Line 1</label>
                      <input
                        type="text"
                        value={editedCustomerAddressLine1}
                        onChange={(e) => setEditedCustomerAddressLine1(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="Street address"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Address Line 2</label>
                      <input
                        type="text"
                        value={editedCustomerAddressLine2}
                        onChange={(e) => setEditedCustomerAddressLine2(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="Apt, suite, etc."
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="col-span-2">
                        <label className="block text-xs font-medium text-gray-700 mb-1">City</label>
                        <input
                          type="text"
                          value={editedCustomerCity}
                          onChange={(e) => setEditedCustomerCity(e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-700 mb-1">State</label>
                        <input
                          type="text"
                          value={editedCustomerState}
                          onChange={(e) => setEditedCustomerState(e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                          placeholder="CA"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-700 mb-1">Zip Code</label>
                      <input
                        type="text"
                        value={editedCustomerZipCode}
                        onChange={(e) => setEditedCustomerZipCode(e.target.value)}
                        className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="12345"
                      />
                    </div>
                  </div>
                )}
              </div>

              <div>
                <dl className="space-y-2">
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Service Date</dt>
                    {!isEditMode ? (
                      <dd className="text-sm text-gray-900">
                        {new Date(invoice.serviceDate).toLocaleDateString('en-US', {
                          weekday: 'long',
                          year: 'numeric',
                          month: 'long',
                          day: 'numeric',
                        })}
                      </dd>
                    ) : (
                      <input
                        type="date"
                        value={editedServiceDate}
                        onChange={(e) => setEditedServiceDate(e.target.value)}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base py-2 px-3"
                      />
                    )}
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Issue Date</dt>
                    <dd className="text-sm text-gray-900">
                      {new Date(invoice.issueDate).toLocaleDateString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Due Date</dt>
                    {!isEditMode ? (
                      <dd className="text-sm text-gray-900">
                        {new Date(invoice.dueDate).toLocaleDateString()}
                      </dd>
                    ) : (
                      <input
                        type="date"
                        value={editedDueDate}
                        onChange={(e) => setEditedDueDate(e.target.value)}
                        className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2"
                      />
                    )}
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Payment Terms</dt>
                    {!isEditMode ? (
                      <dd className="text-sm text-gray-900">
                        {invoice.paymentTerms || 'Net 30'}
                      </dd>
                    ) : (
                      <select
                        value={editedPaymentTerms}
                        onChange={(e) => setEditedPaymentTerms(e.target.value)}
                        className="text-sm border-gray-300 rounded-md shadow-sm focus:border-blue-500 focus:ring-blue-500 px-3 py-2"
                      >
                        <option value="Due on Receipt">Due on Receipt</option>
                        <option value="Net 15">Net 15</option>
                        <option value="Net 30">Net 30</option>
                        <option value="Net 45">Net 45</option>
                        <option value="Net 60">Net 60</option>
                        <option value="Net 90">Net 90</option>
                      </select>
                    )}
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-gray-500">Service Address</dt>
                    {!isEditMode ? (
                      <dd className="text-sm text-gray-900">
                        {invoice.serviceAddress || 'N/A'}
                      </dd>
                    ) : (
                      <textarea
                        value={editedServiceAddress}
                        onChange={(e) => setEditedServiceAddress(e.target.value)}
                        rows={2}
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                        placeholder="Enter service location address..."
                      />
                    )}
                  </div>
                </dl>
              </div>
            </div>
          </div>

          {/* Line Items */}
          <div className="px-6 py-5">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-sm font-medium text-gray-900">Line Items</h3>
              {isEditMode && (
                <button
                  onClick={handleAddLineItem}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
                >
                  ➕ Add Item
                </button>
              )}
            </div>

            {!isEditMode ? (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Description
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Quantity
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Rate
                      </th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Amount
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {invoice.lineItems?.map((item: any, index: number) => (
                      <tr key={item.id || index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-4 py-4 text-sm text-gray-900">
                          {item.description}
                          {item.service && (
                            <span className="ml-2 text-xs text-gray-500">({item.service.code})</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 text-right">
                          {item.quantity} {item.unit}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-900 text-right">
                          ${parseFloat(item.rate).toFixed(2)}
                        </td>
                        <td className="px-4 py-4 text-sm font-semibold text-gray-900 text-right">
                          ${parseFloat(item.amount).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="space-y-4">
                {editedLineItems.map((item, index) => (
                  <div key={index} className="bg-gray-50 p-4 rounded-lg border-2 border-gray-200">
                    <div className="flex justify-between items-start mb-3">
                      <span className="text-sm font-medium text-gray-700">Item {index + 1}</span>
                      <button
                        onClick={() => handleDeleteLineItem(index)}
                        className="text-red-600 hover:text-red-800 text-sm font-medium px-3 py-1 rounded-md hover:bg-red-50"
                      >
                        🗑️ Delete
                      </button>
                    </div>

                    <div className="space-y-3">
                      {/* Service Selector */}
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Select from Service Catalog (Optional)
                        </label>
                        
                        {/* Search Input */}
                        <input
                          type="text"
                          placeholder="🔍 Search services by name, code, or category..."
                          value={serviceSearchTerm}
                          onChange={(e) => setServiceSearchTerm(e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3 mb-2"
                        />

                        {/* Scrollable Service List */}
                        <div className="max-h-64 overflow-y-auto border border-gray-300 rounded-md bg-white">
                          {!servicesData?.length ? (
                            <p className="p-4 text-sm text-gray-500 text-center">
                              No services available. Add services in the Services page first.
                            </p>
                          ) : Object.keys(groupedServices).length === 0 ? (
                            <p className="p-4 text-sm text-gray-500 text-center">
                              No services match your search.
                            </p>
                          ) : (
                            Object.entries(groupedServices).map(([category, services]: [string, any[]]) => (
                              <div key={category} className="border-b border-gray-200 last:border-b-0">
                                {/* Category Header */}
                                <div className="bg-gray-100 px-3 py-2 sticky top-0">
                                  <h4 className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
                                    {category}
                                  </h4>
                                </div>
                                
                                {/* Services in Category */}
                                <div className="divide-y divide-gray-100">
                                  {services.map((service: any) => (
                                    <button
                                      key={service.id}
                                      type="button"
                                      onClick={() => {
                                        handleServiceSelect(index, service.id);
                                        setServiceSearchTerm(''); // Clear search after selection
                                      }}
                                      className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors group"
                                    >
                                      <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                          <p className="text-sm font-medium text-gray-900 group-hover:text-blue-600">
                                            {service.name}
                                          </p>
                                          <p className="text-xs text-gray-500 mt-0.5">
                                            {service.code}
                                          </p>
                                        </div>
                                        <div className="text-right ml-2">
                                          <p className="text-sm font-semibold text-gray-900">
                                            ${parseFloat(service.basePrice.toString()).toFixed(2)}
                                          </p>
                                          <p className="text-xs text-gray-500">
                                            per {service.priceUnit || 'unit'}
                                          </p>
                                        </div>
                                      </div>
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Description
                        </label>
                        <input
                          type="text"
                          value={item.description}
                          onChange={(e) => handleLineItemChange(index, 'description', e.target.value)}
                          className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base py-3 px-4"
                          placeholder="Service description"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Quantity
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.quantity}
                            onChange={(e) => handleLineItemChange(index, 'quantity', e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base py-3 px-4"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Unit
                          </label>
                          <input
                            type="text"
                            value={item.unit}
                            onChange={(e) => handleLineItemChange(index, 'unit', e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base py-3 px-4"
                            placeholder="unit"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Rate ($)
                          </label>
                          <input
                            type="number"
                            step="0.01"
                            value={item.rate}
                            onChange={(e) => handleLineItemChange(index, 'rate', e.target.value)}
                            className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base py-3 px-4"
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 mb-1">
                            Amount ($)
                          </label>
                          <input
                            type="number"
                            value={item.amount.toFixed(2)}
                            readOnly
                            className="block w-full rounded-md border-gray-300 bg-gray-100 shadow-sm text-base py-3 px-4 font-semibold text-gray-900"
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                ))}

                {editedLineItems.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No line items. Click "Add Item" to add a line item.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Totals */}
          <div className="px-6 py-5 bg-gray-50 border-t border-gray-200">
            <div className="max-w-sm ml-auto space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Subtotal:</span>
                <span className="font-medium text-gray-900">
                  ${isEditMode ? calculateSubtotal().toFixed(2) : parseFloat(invoice.subtotal).toFixed(2)}
                </span>
              </div>

              {(Number(invoice.taxAmount) > 0 || isEditMode) && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Tax ({invoice.taxRate}%):</span>
                  <span className="font-medium text-gray-900">
                    ${isEditMode ? calculateTax().toFixed(2) : parseFloat(invoice.taxAmount).toFixed(2)}
                  </span>
                </div>
              )}

              {Number(invoice.discount) > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600">Discount:</span>
                  <span className="font-medium text-red-600">
                    -${parseFloat(invoice.discount).toFixed(2)}
                  </span>
                </div>
              )}

              <div className="border-t border-gray-300 pt-2 flex justify-between">
                <span className="text-lg font-semibold text-gray-900">Total:</span>
                <span className="text-2xl font-bold text-green-600">
                  ${isEditMode ? calculateTotal().toFixed(2) : parseFloat(invoice.total).toFixed(2)}
                </span>
              </div>
            </div>
          </div>

          {/* Notes */}
          {(invoice.notes || isEditMode) && (
            <div className="px-6 py-5 border-t border-gray-200">
              <h3 className="text-sm font-medium text-gray-900 mb-2">Notes</h3>
              {!isEditMode ? (
                <p className="text-sm text-gray-600 whitespace-pre-wrap">{invoice.notes}</p>
              ) : (
                <textarea
                  value={editedNotes}
                  onChange={(e) => setEditedNotes(e.target.value)}
                  rows={4}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base py-3 px-4"
                  placeholder="Add notes or payment instructions..."
                />
              )}
            </div>
          )}

          {/* Payment Info */}
          {invoice.status !== 'PAID' && (
            <div className="px-6 py-5 bg-blue-50 border-t border-blue-200">
              <h3 className="text-sm font-medium text-blue-900 mb-2">Payment Information</h3>
              <p className="text-sm text-blue-800">
                {invoice.paymentTerms === 'Due on Receipt' 
                  ? 'Payment is due upon receipt'
                  : `Payment due within ${invoice.paymentTerms?.replace('Net ', '') || '30'} days`
                }
              </p>
              <p className="text-xs text-blue-700 mt-1">
                Due by: {new Date(invoice.dueDate).toLocaleDateString()}
              </p>
            </div>
          )}
        </div>

        {/* Activity Log (placeholder) */}
        <div className="mt-6 bg-white shadow rounded-lg p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Activity</h3>
          <div className="space-y-3">
            <div className="flex items-start">
              <div className="flex-shrink-0 w-2 h-2 mt-2 bg-blue-500 rounded-full"></div>
              <div className="ml-3">
                <p className="text-sm text-gray-900">
                  Invoice created
                  {invoice.source && ` via ${invoice.source}`}
                </p>
                <p className="text-xs text-gray-500">
                  {new Date(invoice.createdAt).toLocaleString()}
                </p>
              </div>
            </div>
            {invoice.status === 'SENT' && (
              <div className="flex items-start">
                <div className="flex-shrink-0 w-2 h-2 mt-2 bg-yellow-500 rounded-full"></div>
                <div className="ml-3">
                  <p className="text-sm text-gray-900">Invoice sent to customer</p>
                  <p className="text-xs text-gray-500">
                    {new Date(invoice.updatedAt).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
            {invoice.status === 'PAID' && (
              <div className="flex items-start">
                <div className="flex-shrink-0 w-2 h-2 mt-2 bg-green-500 rounded-full"></div>
                <div className="ml-3">
                  <p className="text-sm text-gray-900">Payment received</p>
                  <p className="text-xs text-gray-500">
                    {invoice.paidDate && new Date(invoice.paidDate).toLocaleString()}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Journal Entries Section */}
        <div className="mt-6">
          <JournalEntriesSection
            entries={(journalEntries as any) || []}
            isLoading={isLoadingJournalEntries}
          />
        </div>

        {/* Delete Confirmation Dialog */}
        {showDeleteConfirm && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-md mx-4">
              <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Invoice?</h3>
              <p className="text-sm text-gray-600 mb-6">
                Are you sure you want to delete invoice {invoice.invoiceNumber}? This action cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  disabled={deleteInvoiceMutation.isPending}
                  className="px-4 py-2 border border-gray-300 rounded-md text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleDeleteInvoice}
                  disabled={deleteInvoiceMutation.isPending}
                  className="px-4 py-2 border border-transparent rounded-md text-sm font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50"
                >
                  {deleteInvoiceMutation.isPending ? 'Deleting...' : 'Delete Invoice'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

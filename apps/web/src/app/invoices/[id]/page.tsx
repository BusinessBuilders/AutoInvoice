'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState, useEffect } from 'react';

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

  const { data: invoice, isLoading, refetch } = trpc.invoice.get.useQuery({ id: invoiceId });
  const updateInvoiceMutation = trpc.invoice.update.useMutation();
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
    setIsEditMode(!isEditMode);
  };

  const handleCancelEdit = () => {
    setIsEditMode(false);
  };

  const handleLineItemChange = (index: number, field: keyof EditableLineItem, value: any) => {
    const updated = [...editedLineItems];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-calculate amount when quantity or rate changes
    if (field === 'quantity' || field === 'rate') {
      const quantity = field === 'quantity' ? parseFloat(value) || 0 : updated[index].quantity;
      const rate = field === 'rate' ? parseFloat(value) || 0 : updated[index].rate;
      updated[index].amount = quantity * rate;
    }

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
      await updateInvoiceMutation.mutateAsync({
        id: invoiceId,
        lineItems: editedLineItems,
        notes: editedNotes,
        serviceDate: new Date(editedServiceDate),
        dueDate: new Date(editedDueDate),
      });

      await refetch();
      setIsEditMode(false);
      alert('Invoice updated successfully!');
    } catch (error: any) {
      alert(`Failed to update invoice: ${error.message}`);
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
                <h3 className="text-xs font-medium text-gray-500 uppercase tracking-wide">Bill To</h3>
                {invoice.customer && (
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
                    {invoice.customer.addressLine1 && (
                      <p className="text-sm text-gray-600 mt-1">
                        {invoice.customer.addressLine1}
                        {invoice.customer.city && <><br />{invoice.customer.city}, {invoice.customer.state} {invoice.customer.zipCode}</>}
                      </p>
                    )}
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
                        className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-base py-2 px-3"
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
                Payment is due by {new Date(invoice.dueDate).toLocaleDateString()}
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

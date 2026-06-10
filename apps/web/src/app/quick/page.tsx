'use client';

import { trpc } from '@/lib/trpc';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default function QuickInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');

  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');
  const [autoCreateCustomer, setAutoCreateCustomer] = useState(true);
  const [autoCreateService, setAutoCreateService] = useState(false);
  const [jobName, setJobName] = useState('');
  const [customDescriptions, setCustomDescriptions] = useState<{ [key: number]: string }>({});

  const utils = trpc.useContext();
  const { data: customersData } = trpc.customer.list.useQuery({ limit: 100 });
  const { data: services } = trpc.service.list.useQuery();

  // Load customer name if customerId is provided
  useEffect(() => {
    if (customerId && customersData?.customers) {
      const customer = customersData.customers.find((c) => c.id === customerId);
      if (customer) {
        setInput(`for ${customer.name} `);
      }
    }
  }, [customerId, customersData]);

  // Initialize custom descriptions when parsed result changes
  useEffect(() => {
    if (parsed?.lineItems) {
      const initialDescriptions: { [key: number]: string } = {};
      parsed.lineItems.forEach((item: any, index: number) => {
        // Initialize with auto-generated description
        initialDescriptions[index] = item.service
          ? `${item.service.name} - ${item.quantity} ${item.unit}`
          : item.description || '';
      });
      setCustomDescriptions(initialDescriptions);
    }
  }, [parsed]);

  const parseInvoice = trpc.smartTemplates.parseQuickInvoice.useMutation();
  const createInvoice = trpc.invoice.create.useMutation({
    onSuccess: (data) => {
      router.push(`/invoices/${data.id}`);
    },
  });

  const handleParse = async () => {
    if (!input.trim()) return;

    setIsParsing(true);
    setError('');
    setParsed(null);

    try {
      const result = await parseInvoice.mutateAsync({
        text: input,
        autoCreateCustomer,
        autoCreateService,
      });
      setParsed(result);
    } catch (err: any) {
      setError(err.message || 'Failed to parse invoice');
    } finally {
      setIsParsing(false);
    }
  };

  const quickAddCustomer = trpc.smartTemplates.quickAddCustomer.useMutation();

  const handleCreate = async () => {
    if (!parsed) return;

    let customerId = parsed.customer.id;

    // If customer is pending, create it first
    if (parsed.pendingCustomer) {
      try {
        const newCustomer = await quickAddCustomer.mutateAsync({
          name: parsed.pendingCustomer,
          nickname: [parsed.pendingCustomer],
        });
        customerId = newCustomer.id;
      } catch (err: any) {
        setError(`Failed to create customer: ${err.message}`);
        return;
      }
    }

    createInvoice.mutate({
      customerId,
      serviceDate: new Date(parsed.date),
      dueDate: new Date(parsed.date), // Due on receipt
      serviceAddress: jobName || undefined,
      lineItems: parsed.lineItems.map((item: any, index: number) => ({
        serviceId: item.service?.id || null,
        description: customDescriptions[index] || item.description || '',
        quantity: item.quantity,
        unit: item.unit,
        rate: item.rate,
        amount: item.amount,
        order: index,
      })),
      notes: `Created via quick entry: "${input}"`,
    });
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/"
            className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Dashboard
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">⚡ Quick Invoice Entry</h1>
          <p className="mt-1 text-sm text-gray-500">
            Create invoices instantly with natural language
          </p>
        </div>

        {/* Quick Entry Form */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <div className="mb-4">
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Describe the invoice
            </label>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  handleParse();
                }
              }}
              placeholder='Try: "9999 sqft of hydroseed for Blair today" or "salted walks at Hawthon"'
              rows={3}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 text-lg"
            />
            <p className="mt-2 text-xs text-gray-500">
              💡 Tip: Press Cmd/Ctrl + Enter to parse
            </p>
          </div>

          {/* Auto-Create Options */}
          <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
            <p className="text-sm font-medium text-gray-700 mb-3">Auto-Create Options</p>
            <div className="flex flex-wrap gap-6">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateCustomer}
                  onChange={(e) => setAutoCreateCustomer(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Auto-create new customers
                </span>
              </label>
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCreateService}
                  onChange={(e) => setAutoCreateService(e.target.checked)}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="ml-2 text-sm text-gray-700">
                  Auto-create new services
                </span>
              </label>
            </div>
            <p className="mt-2 text-xs text-gray-500">
              When enabled, unrecognized customers/services will be added to your database automatically.
            </p>
          </div>

          {/* Examples */}
          <div className="mb-4">
            <p className="text-xs font-medium text-gray-500 mb-2">Examples:</p>
            <div className="flex flex-wrap gap-2">
              {[
                '9999 sqft hydroseed for Blair today',
                'salted walks at Hawthon',
                '500 sqft fertilizer for John Smith yesterday',
                '2 hours lawn mowing for Acme Corp',
              ].map((example, i) => (
                <button
                  key={i}
                  onClick={() => setInput(example)}
                  className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded-full text-gray-700"
                >
                  {example}
                </button>
              ))}
            </div>
          </div>

          <button
            onClick={handleParse}
            disabled={!input.trim() || isParsing}
            className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isParsing ? (
              <span className="flex items-center justify-center">
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Parsing with AI...
              </span>
            ) : (
              '🤖 Parse with AI'
            )}
          </button>

          {error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{error}</p>
            </div>
          )}
        </div>

        {/* Parsed Result */}
        {parsed && (
          <div className="bg-white shadow rounded-lg p-6 mb-6 border-2 border-green-500">
            <div className="flex items-start justify-between mb-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">Parsed Invoice</h2>
                <p className="text-sm text-gray-500">
                  Confidence: {(parsed.confidence * 100).toFixed(0)}%
                </p>
              </div>
              <button
                onClick={() => setParsed(null)}
                className="text-gray-400 hover:text-gray-600"
              >
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            </div>

            <div className="space-y-4">
              {/* Customer */}
              <div className={`flex items-center justify-between p-4 rounded-lg ${parsed.customer.isNew ? 'bg-yellow-50 border border-yellow-200' : 'bg-blue-50'}`}>
                <div>
                  <p className={`text-xs font-medium uppercase ${parsed.customer.isNew ? 'text-yellow-600' : 'text-blue-600'}`}>
                    Customer {parsed.customer.isNew && '(New)'}
                  </p>
                  <p className="text-lg font-semibold text-gray-900">{parsed.customer.name}</p>
                  {parsed.customer.email && (
                    <p className="text-sm text-gray-500">{parsed.customer.email}</p>
                  )}
                  {parsed.pendingCustomer && (
                    <p className="text-xs text-yellow-600 mt-1">Will be created when invoice is saved</p>
                  )}
                </div>
                {!parsed.pendingCustomer && (
                  <Link
                    href={`/customers/${parsed.customer.id}`}
                    className="text-sm text-blue-600 hover:text-blue-800"
                  >
                    View →
                  </Link>
                )}
              </div>

              {/* Date */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="text-xs font-medium text-gray-500 uppercase">Service Date</p>
                <p className="text-lg font-semibold text-gray-900">
                  {new Date(parsed.date).toLocaleDateString('en-US', {
                    weekday: 'long',
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                  })}
                </p>
              </div>

              {/* Job Name / Location */}
              <div className="p-4 bg-gray-50 rounded-lg">
                <label className="text-xs font-medium text-gray-500 uppercase">
                  Job Name / Location <span className="text-gray-400 font-normal normal-case">(optional)</span>
                </label>
                <input
                  type="text"
                  value={jobName}
                  onChange={(e) => setJobName(e.target.value)}
                  placeholder="e.g. Downtown Office, Warehouse #3..."
                  className="mt-1 block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 text-sm py-2 px-3"
                />
                <p className="text-xs text-gray-400 mt-1">Leave blank for residential jobs</p>
              </div>

              {/* Line Items */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-gray-500 uppercase">Line Items</p>
                {parsed.lineItems.map((item: any, index: number) => (
                  <div key={index} className="p-4 bg-purple-50 rounded-lg border-l-4 border-purple-600">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">
                          {item.service?.name || item.description}
                        </p>
                        {item.service?.code && (
                          <p className="text-sm text-gray-600">{item.service.code}</p>
                        )}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-gray-900">${item.amount.toFixed(2)}</p>
                        <p className="text-sm text-gray-600">
                          {item.quantity.toLocaleString()} {item.unit} @ ${item.rate.toFixed(2)}
                        </p>
                      </div>
                    </div>
                    {/* Editable Description */}
                    <div>
                      <label className="text-xs font-medium text-gray-600 mb-1 block">
                        Description / Work Details
                      </label>
                      <textarea
                        value={customDescriptions[index] || ''}
                        onChange={(e) => setCustomDescriptions({
                          ...customDescriptions,
                          [index]: e.target.value,
                        })}
                        placeholder="Describe the work done (e.g., Trimmed branches and removed dead wood...)"
                        className="w-full rounded-md border-gray-300 shadow-sm focus:border-purple-500 focus:ring-purple-500 text-sm py-2 px-3"
                        rows={2}
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* Total */}
              <div className="p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <p className="text-xs font-medium text-green-600 uppercase">Total Amount</p>
                <p className="text-3xl font-bold text-green-600">
                  ${parsed.total.toFixed(2)}
                </p>
                {parsed.lineItems.length > 1 && (
                  <p className="text-sm text-gray-600 mt-1">
                    {parsed.lineItems.length} line items
                  </p>
                )}
              </div>

              {/* Warnings */}
              {parsed.warnings && parsed.warnings.length > 0 && (
                <div className="p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <p className="text-xs font-medium text-yellow-800 uppercase mb-2">Warnings</p>
                  <ul className="list-disc list-inside space-y-1">
                    {parsed.warnings.map((warning: string, index: number) => (
                      <li key={index} className="text-sm text-yellow-700">{warning}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>

            {/* Actions */}
            <div className="mt-6 flex space-x-3">
              <button
                onClick={handleCreate}
                disabled={createInvoice.isPending}
                className="flex-1 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {createInvoice.isPending ? 'Creating...' : '✓ Create Invoice'}
              </button>
              <button
                onClick={() => setParsed(null)}
                className="px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
            </div>

            {createInvoice.error && (
              <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                <p className="text-sm text-red-600">{createInvoice.error.message}</p>
              </div>
            )}
          </div>
        )}

        {/* Quick Reference */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">How It Works</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start">
              <span className="font-bold mr-2">1.</span>
              <span>Type what you did in natural language (e.g., "9999 sqft hydroseed for Blair today")</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">2.</span>
              <span>AI matches customer by name or nickname (Blair, blair property, etc.)</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">3.</span>
              <span>AI identifies the service and uses custom pricing if set</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">4.</span>
              <span>Review the parsed invoice and create it with one click!</span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-xs text-blue-700">
              💡 <strong>Pro tip:</strong> Add nicknames to customers and keywords to services for even faster entry.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

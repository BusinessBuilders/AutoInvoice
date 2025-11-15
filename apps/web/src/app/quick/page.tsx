'use client';

import { trpc } from '@/lib/trpc';
import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function QuickInvoicePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const customerId = searchParams.get('customerId');

  const [input, setInput] = useState('');
  const [parsed, setParsed] = useState<any>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [error, setError] = useState('');

  const utils = trpc.useContext();
  const { data: customers } = trpc.customer.list.useQuery({ limit: 100 });
  const { data: services } = trpc.service.list.useQuery({ limit: 100 });

  // Load customer name if customerId is provided
  useEffect(() => {
    if (customerId && customers) {
      const customer = customers.find((c) => c.id === customerId);
      if (customer) {
        setInput(`for ${customer.name} `);
      }
    }
  }, [customerId, customers]);

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
      const result = await parseInvoice.mutateAsync({ text: input });
      setParsed(result);
    } catch (err: any) {
      setError(err.message || 'Failed to parse invoice');
    } finally {
      setIsParsing(false);
    }
  };

  const handleCreate = () => {
    if (!parsed) return;

    createInvoice.mutate({
      customerId: parsed.customer.id,
      serviceDate: parsed.date,
      issueDate: new Date(),
      dueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
      lineItems: [
        {
          serviceId: parsed.service.id,
          description: `${parsed.service.name} - ${parsed.quantity} ${parsed.unit}`,
          quantity: parsed.quantity,
          unit: parsed.unit,
          rate: parsed.rate,
          amount: parsed.total,
          order: 0,
        },
      ],
      subtotal: parsed.total,
      total: parsed.total,
      status: 'DRAFT',
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
              <div className="flex items-center justify-between p-4 bg-blue-50 rounded-lg">
                <div>
                  <p className="text-xs font-medium text-blue-600 uppercase">Customer</p>
                  <p className="text-lg font-semibold text-gray-900">{parsed.customer.name}</p>
                  {parsed.customer.email && (
                    <p className="text-sm text-gray-500">{parsed.customer.email}</p>
                  )}
                </div>
                <Link
                  href={`/customers/${parsed.customer.id}`}
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  View →
                </Link>
              </div>

              {/* Service */}
              <div className="p-4 bg-purple-50 rounded-lg">
                <p className="text-xs font-medium text-purple-600 uppercase">Service</p>
                <p className="text-lg font-semibold text-gray-900">{parsed.service.name}</p>
                <p className="text-sm text-gray-500">{parsed.service.code}</p>
              </div>

              {/* Line Item Details */}
              <div className="grid grid-cols-3 gap-4">
                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 uppercase">Quantity</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {parsed.quantity.toLocaleString()}
                  </p>
                  <p className="text-sm text-gray-500">{parsed.unit}</p>
                </div>

                <div className="p-4 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-500 uppercase">Rate</p>
                  <p className="text-2xl font-bold text-gray-900">
                    ${parsed.rate.toFixed(2)}
                  </p>
                  <p className="text-sm text-gray-500">per {parsed.unit}</p>
                </div>

                <div className="p-4 bg-green-50 rounded-lg">
                  <p className="text-xs font-medium text-green-600 uppercase">Total</p>
                  <p className="text-2xl font-bold text-green-600">
                    ${parsed.total.toFixed(2)}
                  </p>
                </div>
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
            </div>

            {/* Actions */}
            <div className="mt-6 flex space-x-3">
              <button
                onClick={handleCreate}
                disabled={createInvoice.isLoading}
                className="flex-1 px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {createInvoice.isLoading ? 'Creating...' : '✓ Create Invoice'}
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

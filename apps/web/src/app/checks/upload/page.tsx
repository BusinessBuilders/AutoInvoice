'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

interface ExtractedCheck {
  checkNumber: string;
  amount: number;
  date: string;
  payee?: string;
  memo?: string;
  confidence: number;
}

interface MatchingInvoice {
  id: string;
  invoiceNumber: string;
  total: string | number;
  serviceDate: string;
  customer: {
    id: string;
    name: string;
  };
}

export default function CheckUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedCheck | null>(null);
  const [matchingInvoices, setMatchingInvoices] = useState<MatchingInvoice[]>([]);
  const [autoMatched, setAutoMatched] = useState(false);
  const [matchedInvoiceId, setMatchedInvoiceId] = useState<string | null>(null);
  const [error, setError] = useState<string>('');

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setImageFile(file);
    setError('');
    setExtractedData(null);
    setMatchingInvoices([]);
    setAutoMatched(false);
    setMatchedInvoiceId(null);

    // Preview image
    const reader = new FileReader();
    reader.onload = (e) => {
      setSelectedImage(e.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFileSelect(file);
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) handleFileSelect(file);
        break;
      }
    }
  };

  const uploadCheck = trpc.check.upload.useMutation();

  const processCheck = async () => {
    if (!imageFile) return;

    setIsProcessing(true);
    setError('');

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(imageFile);
      });

      const imageBase64 = await base64Promise;

      // Upload and process
      const result = await uploadCheck.mutateAsync({
        imageBase64,
        filename: imageFile.name,
      });

      setExtractedData(result.extractedData as ExtractedCheck);
      setMatchingInvoices(result.matchingInvoices);
      setAutoMatched(result.autoMatched);
      setMatchedInvoiceId(result.matchedInvoiceId);
    } catch (err: any) {
      setError(err.message || 'Failed to process check');
    } finally {
      setIsProcessing(false);
    }
  };

  const viewInvoice = (invoiceId: string) => {
    router.push(`/invoices/${invoiceId}`);
  };

  const viewAllChecks = () => {
    router.push('/checks');
  };

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
          <h1 className="text-3xl font-bold text-gray-900">💵 Upload Check Payment</h1>
          <p className="mt-1 text-sm text-gray-500">
            Take a photo of a check to automatically mark invoices as paid
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Upload */}
          <div className="space-y-6">
            {/* Upload Area */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Check Image</h2>

              {!selectedImage ? (
                <div
                  className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-500 transition-colors cursor-pointer"
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onPaste={handlePaste}
                  onClick={() => fileInputRef.current?.click()}
                  tabIndex={0}
                >
                  <div className="text-6xl mb-4">📸</div>
                  <p className="text-lg font-medium text-gray-900 mb-2">
                    Drop check image here
                  </p>
                  <p className="text-sm text-gray-500 mb-4">
                    or click to browse files
                  </p>
                  <p className="text-xs text-gray-400">
                    Supports: JPG, PNG, HEIC • Max 10MB
                  </p>

                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="relative rounded-lg overflow-hidden border border-gray-200">
                    <img
                      src={selectedImage}
                      alt="Check preview"
                      className="w-full h-auto max-h-96 object-contain bg-gray-100"
                    />
                    <button
                      onClick={() => {
                        setSelectedImage(null);
                        setImageFile(null);
                        setExtractedData(null);
                        setMatchingInvoices([]);
                        setAutoMatched(false);
                        setMatchedInvoiceId(null);
                      }}
                      className="absolute top-2 right-2 bg-red-500 text-white p-2 rounded-full hover:bg-red-600"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>

                  {!extractedData && (
                    <button
                      onClick={processCheck}
                      disabled={isProcessing}
                      className="w-full px-4 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {isProcessing ? (
                        <span className="flex items-center justify-center">
                          <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          Processing with AI...
                        </span>
                      ) : (
                        '🤖 Extract Check Data & Match Invoice'
                      )}
                    </button>
                  )}
                </div>
              )}

              {error && (
                <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                  <p className="text-sm text-red-600">{error}</p>
                </div>
              )}
            </div>

            {/* Quick Actions */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">Quick Actions</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="text-3xl mb-2">📱</div>
                  <span className="text-sm font-medium text-gray-700">Take Photo</span>
                  <input
                    ref={cameraInputRef}
                    type="file"
                    accept="image/*"
                    capture="environment"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) handleFileSelect(file);
                    }}
                  />
                </button>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition-colors"
                >
                  <div className="text-3xl mb-2">📁</div>
                  <span className="text-sm font-medium text-gray-700">Choose File</span>
                </button>
              </div>

              <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs text-blue-800">
                  💡 <strong>Tip:</strong> You can also paste an image from clipboard (Ctrl/Cmd + V)
                </p>
              </div>
            </div>
          </div>

          {/* Right Column - Extracted Data & Matching */}
          <div>
            {extractedData ? (
              <div className="space-y-6">
                {/* Auto-Match Success Banner */}
                {autoMatched && matchedInvoiceId && (
                  <div className="bg-green-50 border-2 border-green-500 rounded-lg p-6">
                    <div className="flex items-center mb-3">
                      <div className="text-3xl mr-3">✅</div>
                      <div>
                        <h3 className="text-lg font-bold text-green-900">Invoice Automatically Marked as PAID!</h3>
                        <p className="text-sm text-green-700 mt-1">
                          We found a perfect match and updated the invoice status.
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={() => viewInvoice(matchedInvoiceId)}
                      className="w-full px-4 py-2 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 mt-3"
                    >
                      View Updated Invoice
                    </button>
                  </div>
                )}

                {/* Extracted Check Data */}
                <div className={`bg-white shadow rounded-lg p-6 ${autoMatched ? 'border-2 border-green-500' : 'border-2 border-blue-500'}`}>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900">Extracted Check Data</h2>
                    <span className="px-3 py-1 bg-blue-100 text-blue-800 text-sm font-medium rounded-full">
                      {(extractedData.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>

                  <div className="space-y-4">
                    {/* Check Number & Amount */}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="p-4 bg-purple-50 rounded-lg">
                        <label className="text-xs font-medium text-purple-600 uppercase">Check Number</label>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{extractedData.checkNumber}</p>
                      </div>

                      <div className="p-4 bg-green-50 rounded-lg">
                        <label className="text-xs font-medium text-green-600 uppercase">Amount</label>
                        <p className="text-2xl font-bold text-green-600 mt-1">
                          ${extractedData.amount.toFixed(2)}
                        </p>
                      </div>
                    </div>

                    {/* Date */}
                    <div className="p-4 bg-blue-50 rounded-lg">
                      <label className="text-xs font-medium text-blue-600 uppercase">Date</label>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {new Date(extractedData.date).toLocaleDateString()}
                      </p>
                    </div>

                    {/* Payee */}
                    {extractedData.payee && (
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <label className="text-xs font-medium text-gray-600 uppercase">Pay to the Order of</label>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{extractedData.payee}</p>
                      </div>
                    )}

                    {/* Memo */}
                    {extractedData.memo && (
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <label className="text-xs font-medium text-gray-600 uppercase">Memo</label>
                        <p className="text-lg font-semibold text-gray-900 mt-1">{extractedData.memo}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Matching Invoices */}
                {matchingInvoices.length > 0 && !autoMatched && (
                  <div className="bg-white shadow rounded-lg p-6">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">
                      Possible Matching Invoices ({matchingInvoices.length})
                    </h3>
                    <div className="space-y-3">
                      {matchingInvoices.map((invoice) => (
                        <div
                          key={invoice.id}
                          className="p-4 border-2 border-gray-200 rounded-lg hover:border-blue-500 transition-colors cursor-pointer"
                          onClick={() => viewInvoice(invoice.id)}
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="font-semibold text-gray-900">{invoice.invoiceNumber}</p>
                              <p className="text-sm text-gray-600">{invoice.customer.name}</p>
                              <p className="text-xs text-gray-500 mt-1">
                                {new Date(invoice.serviceDate).toLocaleDateString()}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-green-600">
                                ${Number(invoice.total).toFixed(2)}
                              </p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                    <p className="text-xs text-gray-500 mt-4">
                      💡 Click an invoice to view details and manually confirm payment
                    </p>
                  </div>
                )}

                {/* No Matches Found */}
                {matchingInvoices.length === 0 && !autoMatched && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                    <div className="flex items-start">
                      <div className="text-3xl mr-3">⚠️</div>
                      <div>
                        <h3 className="text-lg font-semibold text-yellow-900 mb-2">No Matching Invoices Found</h3>
                        <p className="text-sm text-yellow-800">
                          We couldn't automatically match this check to an invoice. This could be because:
                        </p>
                        <ul className="text-sm text-yellow-800 mt-2 space-y-1 ml-4 list-disc">
                          <li>The amount doesn't match any open invoices</li>
                          <li>The invoice is already marked as paid</li>
                          <li>The check date is outside the matching window</li>
                        </ul>
                        <p className="text-sm text-yellow-800 mt-3">
                          You can manually match this check from the checks list.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="space-y-3">
                  <button
                    onClick={viewAllChecks}
                    className="w-full px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                  >
                    💾 View All Checks
                  </button>

                  <button
                    onClick={() => {
                      setExtractedData(null);
                      setSelectedImage(null);
                      setImageFile(null);
                      setMatchingInvoices([]);
                      setAutoMatched(false);
                      setMatchedInvoiceId(null);
                    }}
                    className="w-full px-4 py-3 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Upload Another Check
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white shadow rounded-lg p-6 h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-4">💵</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No check processed yet
                  </h3>
                  <p className="text-sm text-gray-500">
                    Upload a check image to extract payment data
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">How Check Payment Recognition Works</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start">
              <span className="font-bold mr-2">1.</span>
              <span>Take a photo of the check or upload an existing image</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">2.</span>
              <span>AI extracts check number, amount, date, payee, and memo</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">3.</span>
              <span>System automatically searches for matching invoices by amount and date</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">4.</span>
              <span>If there's a clear match, the invoice is automatically marked as PAID ✅</span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-xs text-blue-700">
              💡 <strong>Pro tip:</strong> For best results, ensure the entire check is visible with good lighting. The system matches checks within ±30 days of the invoice date.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

interface ExtractedReceipt {
  vendor: string;
  amount: number;
  date: string;
  category?: string;
  items?: Array<{ description: string; amount: number }>;
  confidence: number;
}

export default function ReceiptUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [extractedData, setExtractedData] = useState<ExtractedReceipt | null>(null);
  const [error, setError] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<'credit_card' | 'debit_card' | 'cash' | 'check' | 'other'>('credit_card');
  const [editedCategory, setEditedCategory] = useState<string>('');
  const [notes, setNotes] = useState<string>('');
  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('');
  const [categorySearch, setCategorySearch] = useState<string>('');
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  // Fetch expense categories
  const { data: categoriesData } = trpc.expenseCategory.list.useQuery({ active: true });
  const categories = categoriesData || [];

  // Categorize receipt mutation
  const categorizeReceipt = trpc.receipt.categorizeReceipt.useMutation();

  const handleFileSelect = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setError('Please select an image file');
      return;
    }

    setImageFile(file);
    setError('');
    setExtractedData(null);

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

  const uploadReceipt = trpc.receipt.upload.useMutation();
  const updateReceipt = trpc.receipt.update.useMutation();
  const utils = trpc.useUtils();

  const processReceipt = async () => {
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
      const result = await uploadReceipt.mutateAsync({
        imageBase64,
        filename: imageFile.name,
        paymentMethod,
        notes: notes || undefined,
      });

      const data = result.extractedData as ExtractedReceipt;
      setExtractedData(data);
      setEditedCategory(data.category || '');
      setReceiptId(result.receipt.id); // Store the receipt ID
    } catch (err: any) {
      setError(err.message || 'Failed to process receipt');
    } finally {
      setIsProcessing(false);
    }
  };

  const createInvoiceFromReceipt = () => {
    if (!extractedData) return;
    // Navigate to invoice creation with pre-filled data
    router.push(`/invoices/new?receipt=true`);
  };

  const saveReceipt = async () => {
    console.log('saveReceipt called!', { extractedData, receiptId, selectedCategoryId });

    if (!extractedData || !receiptId) {
      const errorMsg = 'No receipt data to save - missing: ' + (!extractedData ? 'extractedData ' : '') + (!receiptId ? 'receiptId' : '');
      console.error(errorMsg);
      setError(errorMsg);
      alert(errorMsg);
      return;
    }

    try {
      console.log('Updating receipt with:', { id: receiptId, category: editedCategory, notes });

      // Update receipt with edited category and notes
      const result = await updateReceipt.mutateAsync({
        id: receiptId,
        category: editedCategory || undefined,
        notes: notes || undefined,
      });

      // If a category is selected, categorize the receipt (creates journal entry)
      if (selectedCategoryId) {
        await categorizeReceipt.mutateAsync({
          receiptId,
          expenseCategoryId: selectedCategoryId,
        });
      }

      console.log('Update successful:', result);

      // Invalidate receipt list cache to force refresh
      console.log('Invalidating cache...');
      await utils.receipt.list.invalidate();
      console.log('Cache invalidated, navigating to /receipts');

      // Navigate to receipts list
      router.push('/receipts');
    } catch (err: any) {
      console.error('Save error:', err);
      const errorMsg = 'Failed to save changes: ' + (err.message || 'Unknown error');
      setError(errorMsg);
      alert(errorMsg);
    }
  };

  // Filter categories based on search
  const filteredCategories = categories.filter((cat: any) =>
    cat.name.toLowerCase().includes(categorySearch.toLowerCase()) ||
    (cat.code && cat.code.toLowerCase().includes(categorySearch.toLowerCase()))
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/receipts"
            className="text-sm text-blue-600 hover:text-blue-800 mb-2 inline-block"
          >
            ← Back to Receipts
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">📷 Upload Receipt</h1>
          <p className="mt-1 text-sm text-gray-500">
            Take a photo or upload an image to extract receipt data
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Upload */}
          <div className="space-y-6">
            {/* Upload Area */}
            <div className="bg-white shadow rounded-lg p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Upload Receipt Image</h2>

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
                    Drop receipt image here
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
                      alt="Receipt preview"
                      className="w-full h-auto max-h-96 object-contain bg-gray-100"
                    />
                    <button
                      onClick={() => {
                        setSelectedImage(null);
                        setImageFile(null);
                        setExtractedData(null);
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
                      onClick={processReceipt}
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
                        '🤖 Extract Receipt Data'
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

            {/* Payment Method Selector */}
            <div className="bg-white shadow rounded-lg p-6">
              <h3 className="text-sm font-semibold text-gray-900 mb-4">💳 Payment Method</h3>
              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => setPaymentMethod('credit_card')}
                  className={`p-4 border-2 rounded-lg transition-colors ${
                    paymentMethod === 'credit_card'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-2xl mb-1">💳</div>
                  <span className="text-sm font-medium">Credit Card</span>
                </button>

                <button
                  onClick={() => setPaymentMethod('debit_card')}
                  className={`p-4 border-2 rounded-lg transition-colors ${
                    paymentMethod === 'debit_card'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-2xl mb-1">💰</div>
                  <span className="text-sm font-medium">Debit Card</span>
                </button>

                <button
                  onClick={() => setPaymentMethod('cash')}
                  className={`p-4 border-2 rounded-lg transition-colors ${
                    paymentMethod === 'cash'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-2xl mb-1">💵</div>
                  <span className="text-sm font-medium">Cash</span>
                </button>

                <button
                  onClick={() => setPaymentMethod('check')}
                  className={`p-4 border-2 rounded-lg transition-colors ${
                    paymentMethod === 'check'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-2xl mb-1">🏦</div>
                  <span className="text-sm font-medium">Check</span>
                </button>

                <button
                  onClick={() => setPaymentMethod('other')}
                  className={`col-span-2 p-4 border-2 rounded-lg transition-colors ${
                    paymentMethod === 'other'
                      ? 'border-blue-500 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="text-2xl mb-1">📝</div>
                  <span className="text-sm font-medium">Other</span>
                </button>
              </div>
            </div>
          </div>

          {/* Right Column - Extracted Data */}
          <div>
            {extractedData ? (
              <div className="bg-white shadow rounded-lg p-6 border-2 border-green-500">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900">Extracted Data</h2>
                  <span className="px-3 py-1 bg-green-100 text-green-800 text-sm font-medium rounded-full">
                    {(extractedData.confidence * 100).toFixed(0)}% confidence
                  </span>
                </div>

                <div className="space-y-4">
                  {/* Vendor */}
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <label className="text-xs font-medium text-purple-600 uppercase">Vendor</label>
                    <p className="text-lg font-semibold text-gray-900 mt-1">{extractedData.vendor}</p>
                  </div>

                  {/* Amount & Date */}
                  <div className="grid grid-cols-2 gap-4">
                    <div className="p-4 bg-green-50 rounded-lg">
                      <label className="text-xs font-medium text-green-600 uppercase">Total Amount</label>
                      <p className="text-2xl font-bold text-green-600 mt-1">
                        ${extractedData.amount.toFixed(2)}
                      </p>
                    </div>

                    <div className="p-4 bg-blue-50 rounded-lg">
                      <label className="text-xs font-medium text-blue-600 uppercase">Date</label>
                      <p className="text-lg font-semibold text-gray-900 mt-1">
                        {new Date(extractedData.date).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  {/* Expense Category Selector (NEW) */}
                  <div className="p-4 bg-indigo-50 rounded-lg border-2 border-indigo-300">
                    <label className="text-xs font-medium text-indigo-700 uppercase block mb-2">
                      🏷️ Expense Category (for accounting)
                    </label>
                    <div className="relative">
                      <input
                        type="text"
                        value={categorySearch}
                        onChange={(e) => {
                          setCategorySearch(e.target.value);
                          setShowCategoryDropdown(true);
                        }}
                        onFocus={() => setShowCategoryDropdown(true)}
                        placeholder="Search categories... (e.g., Office Supplies, Fuel)"
                        className="w-full px-3 py-2 border border-indigo-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                      />
                      
                      {/* Dropdown */}
                      {showCategoryDropdown && filteredCategories.length > 0 && (
                        <div className="absolute z-10 mt-1 w-full bg-white border border-gray-300 rounded-lg shadow-lg max-h-60 overflow-y-auto">
                          {filteredCategories.map((cat: any) => (
                            <button
                              key={cat.id}
                              onClick={() => {
                                setSelectedCategoryId(cat.id);
                                setCategorySearch(cat.name);
                                setShowCategoryDropdown(false);
                              }}
                              className={`w-full text-left px-4 py-2 hover:bg-indigo-50 transition-colors ${
                                selectedCategoryId === cat.id ? 'bg-indigo-100 font-semibold' : ''
                              }`}
                            >
                              <div className="flex justify-between items-center">
                                <span>{cat.name}</span>
                                {cat.code && (
                                  <span className="text-xs text-gray-500 font-mono">{cat.code}</span>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    
                    {selectedCategoryId && (
                      <div className="mt-2 p-2 bg-indigo-100 rounded flex justify-between items-center">
                        <span className="text-sm text-indigo-900 font-medium">
                          Selected: {categories.find((c: any) => c.id === selectedCategoryId)?.name}
                        </span>
                        <button
                          onClick={() => {
                            setSelectedCategoryId('');
                            setCategorySearch('');
                          }}
                          className="text-xs text-indigo-700 hover:text-indigo-900"
                        >
                          Clear
                        </button>
                      </div>
                    )}

                    <p className="text-xs text-indigo-700 mt-2">
                      💡 Categorizing creates a journal entry for accounting reports
                    </p>
                    
                    <Link
                      href="/accounts"
                      className="text-xs text-indigo-600 hover:text-indigo-800 underline block mt-1"
                      target="_blank"
                    >
                      + Create new category
                    </Link>
                  </div>

                  {/* Category (Editable - for simple tagging) */}
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <label className="text-xs font-medium text-gray-600 uppercase block mb-2">
                      Category Tag (simple label)
                    </label>
                    <input
                      type="text"
                      value={editedCategory}
                      onChange={(e) => setEditedCategory(e.target.value)}
                      placeholder="e.g., Office Supplies, Fuel, Meals"
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    />
                  </div>

                  {/* Business Purpose / Notes */}
                  <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                    <label className="text-xs font-medium text-yellow-800 uppercase block mb-2">
                      📝 Business Purpose / Notes
                    </label>
                    <textarea
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="For business meals: Who did you meet with? What was discussed?"
                      rows={3}
                      className="w-full px-3 py-2 border border-yellow-300 rounded-lg focus:ring-2 focus:ring-yellow-500 focus:border-transparent resize-none"
                    />
                    <p className="text-xs text-yellow-700 mt-2">
                      💡 Important for tax deductions on business meals & entertainment
                    </p>
                  </div>

                  {/* Line Items */}
                  {extractedData.items && extractedData.items.length > 0 && (
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <label className="text-xs font-medium text-gray-600 uppercase mb-3 block">Items</label>
                      <div className="space-y-2">
                        {extractedData.items.map((item, index) => (
                          <div key={index} className="flex justify-between items-center p-2 bg-white rounded">
                            <span className="text-sm text-gray-900">{item.description}</span>
                            <span className="text-sm font-semibold text-gray-900">
                              ${item.amount.toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="mt-6 space-y-3">
                  <button
                    onClick={saveReceipt}
                    disabled={!selectedCategoryId}
                    className="w-full px-4 py-3 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {selectedCategoryId ? '✅ Save & Categorize Expense' : '⚠️ Select Category to Save'}
                  </button>

                  <button
                    onClick={createInvoiceFromReceipt}
                    className="w-full px-4 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-50"
                  >
                    📄 Create Invoice from Receipt
                  </button>

                  <button
                    onClick={() => {
                      setExtractedData(null);
                      setSelectedImage(null);
                      setImageFile(null);
                    }}
                    className="w-full px-4 py-3 text-sm text-gray-600 hover:text-gray-900"
                  >
                    Upload Another Receipt
                  </button>
                </div>
              </div>
            ) : (
              <div className="bg-white shadow rounded-lg p-6 h-full flex items-center justify-center">
                <div className="text-center">
                  <div className="text-6xl mb-4">📄</div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">
                    No receipt processed yet
                  </h3>
                  <p className="text-sm text-gray-500">
                    Upload an image to extract receipt data
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Info Section */}
        <div className="mt-8 bg-blue-50 border border-blue-200 rounded-lg p-6">
          <h3 className="text-sm font-semibold text-blue-900 mb-3">How Receipt OCR Works</h3>
          <ul className="space-y-2 text-sm text-blue-800">
            <li className="flex items-start">
              <span className="font-bold mr-2">1.</span>
              <span>Take a photo of your receipt or upload an existing image</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">2.</span>
              <span>AI extracts vendor name, total amount, date, and line items</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">3.</span>
              <span>Review the extracted data and confidence score</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">4.</span>
              <span>Select an expense category to create journal entry for accounting</span>
            </li>
            <li className="flex items-start">
              <span className="font-bold mr-2">5.</span>
              <span>Save the receipt or create an invoice</span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t border-blue-200">
            <p className="text-xs text-blue-700">
              💡 <strong>Pro tip:</strong> For best results, take photos in good lighting with the entire receipt visible.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

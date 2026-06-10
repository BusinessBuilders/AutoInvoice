'use client';

import { trpc } from '@/lib/trpc';
import Link from 'next/link';
import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';

export default function ImportServicesPage() {
  const { isLoading: authLoading, requireAuth } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [filePreview, setFilePreview] = useState<string | null>(null);
  const [isDryRun, setIsDryRun] = useState(true);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.85);
  const [result, setResult] = useState<any>(null);
  const [customerTag, setCustomerTag] = useState(''); // Customer tag for imported services
  const [addedServices, setAddedServices] = useState<Set<number>>(new Set()); // Track which skipped services were added
  const [excludedServices, setExcludedServices] = useState<Set<number>>(new Set()); // Track which services to skip during import
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    requireAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const importMutation = trpc.service.importFromPdf.useMutation({
    onSuccess: (data) => {
      setResult(data);
      setAddedServices(new Set()); // Reset added services on new import
      setExcludedServices(new Set()); // Reset excluded services on new import
    },
  });

  const forceAddMutation = trpc.service.forceAdd.useMutation({
    onSuccess: () => {
      // Service added successfully
    },
  });

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      setFile(selectedFile);
      setResult(null);
      setAddedServices(new Set());

      // Create preview for images
      if (selectedFile.type.startsWith('image/')) {
        const reader = new FileReader();
        reader.onloadend = () => {
          setFilePreview(reader.result as string);
        };
        reader.readAsDataURL(selectedFile);
      } else {
        setFilePreview(null);
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    // Convert file to base64
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      importMutation.mutate({
        fileBase64: base64,
        similarityThreshold,
        dryRun: isDryRun,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleConfirmImport = async () => {
    if (!result?.created) return;

    // Get services that are not excluded
    const servicesToImport = result.created.filter((_: any, index: number) => !excludedServices.has(index));

    if (servicesToImport.length === 0) return;

    setIsDryRun(false);

    // Import each service using forceAdd
    let successCount = 0;
    for (const service of servicesToImport) {
      try {
        await forceAddMutation.mutateAsync({
          name: service.name,
          code: service.code,
          category: service.category,
          description: service.description,
          basePrice: service.basePrice,
          priceUnit: service.priceUnit,
          customerTag: customerTag || undefined,
        });
        successCount++;
      } catch (error) {
        console.error('Failed to add service:', service.name, error);
      }
    }

    // Update result to show what was imported
    setResult({
      ...result,
      created: servicesToImport,
      message: `Successfully imported ${successCount} of ${servicesToImport.length} services`,
    });
  };

  const handleForceAdd = async (service: any, index: number) => {
    try {
      await forceAddMutation.mutateAsync({
        name: service.name,
        code: service.code,
        category: service.category,
        description: service.description,
        basePrice: service.basePrice,
        priceUnit: service.priceUnit,
        customerTag: customerTag || undefined,
      });
      // Mark this service as added
      setAddedServices(prev => new Set([...prev, index]));
    } catch (error) {
      console.error('Failed to add service:', error);
    }
  };

  if (authLoading) return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        <p className="mt-4 text-gray-600">Loading...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Back Navigation */}
        <Link href="/services" className="text-blue-600 hover:text-blue-700 mb-4 inline-block">
          &larr; Back to Services
        </Link>

        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Import Services from PDF</h1>
          <p className="mt-1 text-sm text-gray-500">
            Upload a pricing document or rate card to automatically import services
          </p>
        </div>

        {/* Upload Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <form onSubmit={handleSubmit}>
            {/* File Upload Area */}
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                file ? 'border-green-400 bg-green-50' : 'border-gray-300 hover:border-blue-400'
              }`}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileChange}
                className="hidden"
              />

              {file ? (
                <div>
                  <svg className="mx-auto h-12 w-12 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-900">{file.name}</p>
                  <p className="text-xs text-gray-500">{(file.size / 1024).toFixed(1)} KB</p>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                      setFilePreview(null);
                      setResult(null);
                    }}
                    className="mt-2 text-sm text-red-600 hover:text-red-700"
                  >
                    Remove file
                  </button>
                </div>
              ) : (
                <div>
                  <svg className="mx-auto h-12 w-12 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="mt-2 text-sm font-medium text-gray-900">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-gray-500">PDF, PNG, JPG up to 10MB</p>
                </div>
              )}
            </div>

            {/* Image Preview */}
            {filePreview && (
              <div className="mt-4">
                <p className="text-sm font-medium text-gray-700 mb-2">Preview:</p>
                <img
                  src={filePreview}
                  alt="File preview"
                  className="max-h-64 mx-auto rounded border border-gray-300"
                />
              </div>
            )}

            {/* Options */}
            <div className="mt-6 space-y-4">
              {/* Customer Tag */}
              <div>
                <label className="text-sm font-medium text-gray-700">
                  Customer Tag (optional)
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Tag services for a specific customer (e.g., &quot;Westview&quot;, &quot;Hawthorn&quot;)
                </p>
                <input
                  type="text"
                  value={customerTag}
                  onChange={(e) => setCustomerTag(e.target.value)}
                  placeholder="e.g., Westview"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div className="flex items-center justify-between">
                <div>
                  <label className="text-sm font-medium text-gray-700">Preview Mode (Dry Run)</label>
                  <p className="text-xs text-gray-500">Check what will be imported before saving</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={isDryRun}
                    onChange={(e) => setIsDryRun(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
                </label>
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700">
                  Similarity Threshold: {(similarityThreshold * 100).toFixed(0)}%
                </label>
                <p className="text-xs text-gray-500 mb-2">
                  Skip services that are {(similarityThreshold * 100).toFixed(0)}% similar to existing ones
                </p>
                <input
                  type="range"
                  min="0.5"
                  max="0.99"
                  step="0.01"
                  value={similarityThreshold}
                  onChange={(e) => setSimilarityThreshold(parseFloat(e.target.value))}
                  className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer"
                />
              </div>
            </div>

            {/* Submit Button */}
            <div className="mt-6">
              <button
                type="submit"
                disabled={!file || importMutation.isPending}
                className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importMutation.isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Processing...
                  </>
                ) : (
                  <>
                    {isDryRun ? 'Preview Import' : 'Import Services'}
                  </>
                )}
              </button>
            </div>
          </form>

          {importMutation.error && (
            <div className="mt-4 p-4 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-600">{importMutation.error.message}</p>
            </div>
          )}
        </div>

        {/* Results Section */}
        {result && (
          <div className="bg-white shadow rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">
                {isDryRun ? 'Preview Results' : 'Import Results'}
              </h2>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                result.confidence >= 0.8 ? 'bg-green-100 text-green-800' :
                result.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-800' :
                'bg-red-100 text-red-800'
              }`}>
                {(result.confidence * 100).toFixed(0)}% confidence
              </span>
            </div>

            <p className="text-sm text-gray-600 mb-4">{result.message}</p>

            {/* Services to Create */}
            {result.created && result.created.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  {isDryRun ? 'Services to be created' : 'Services created'} ({result.created.length - excludedServices.size} of {result.created.length})
                </h3>
                <div className="bg-green-50 rounded-lg p-4 space-y-2">
                  {result.created.map((service: any, index: number) => {
                    const isExcluded = excludedServices.has(index);
                    return (
                      <div key={index} className={`flex items-center justify-between text-sm ${isExcluded ? 'opacity-50' : ''}`}>
                        <div className="flex-1">
                          <span className={`font-medium ${isExcluded ? 'text-gray-500 line-through' : 'text-gray-900'}`}>{service.name}</span>
                          <span className="ml-2 text-gray-500">({service.code})</span>
                          <span className="ml-2 text-gray-400">{service.category}</span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`font-medium ${isExcluded ? 'text-gray-400' : 'text-green-600'}`}>
                            ${service.basePrice?.toFixed(2) || '0.00'}
                          </span>
                          {isDryRun && (
                            <button
                              type="button"
                              onClick={() => {
                                setExcludedServices(prev => {
                                  const next = new Set(prev);
                                  if (next.has(index)) {
                                    next.delete(index);
                                  } else {
                                    next.add(index);
                                  }
                                  return next;
                                });
                              }}
                              className={`px-2 py-1 text-xs font-medium rounded ${
                                isExcluded
                                  ? 'text-green-700 bg-green-100 hover:bg-green-200'
                                  : 'text-red-700 bg-red-100 hover:bg-red-200'
                              }`}
                            >
                              {isExcluded ? 'Include' : 'Skip'}
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Skipped Services with Add Anyway */}
            {result.skipped && result.skipped.length > 0 && (
              <div className="mb-6">
                <h3 className="text-sm font-medium text-gray-700 mb-2">
                  Skipped (duplicates) ({result.skipped.length})
                </h3>
                <div className="bg-yellow-50 rounded-lg p-4 space-y-3">
                  {result.skipped.map((service: any, index: number) => (
                    <div key={index} className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-gray-900">{service.name}</span>
                          <span className="text-gray-500">({service.code})</span>
                          <span className="font-medium text-amber-600">
                            ${service.basePrice?.toFixed(2) || '0.00'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          Similar to &quot;{service.matchedService}&quot; ({(service.similarity * 100).toFixed(0)}% match)
                        </p>
                      </div>
                      <div>
                        {addedServices.has(index) ? (
                          <span className="inline-flex items-center px-3 py-1 text-sm font-medium text-green-700 bg-green-100 rounded-md">
                            <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Added
                          </span>
                        ) : (
                          <button
                            onClick={() => handleForceAdd(service, index)}
                            disabled={forceAddMutation.isPending}
                            className="inline-flex items-center px-3 py-1 text-sm font-medium text-blue-700 bg-blue-100 hover:bg-blue-200 rounded-md disabled:opacity-50"
                          >
                            {forceAddMutation.isPending ? 'Adding...' : 'Add Anyway'}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Confirm Import Button (only in dry run mode) */}
            {isDryRun && result.created && result.created.length > 0 && (result.created.length - excludedServices.size) > 0 && (
              <button
                onClick={handleConfirmImport}
                disabled={importMutation.isPending}
                className="w-full inline-flex justify-center items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
              >
                {importMutation.isPending ? 'Importing...' : `Confirm Import (${result.created.length - excludedServices.size} services)`}
              </button>
            )}

            {/* Back to Services Link (after successful import) */}
            {!isDryRun && (
              <Link
                href="/services"
                className="mt-4 w-full inline-flex justify-center items-center px-6 py-3 border border-gray-300 text-base font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
              >
                View Services
              </Link>
            )}
          </div>
        )}

        {/* Tip */}
        <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <p className="text-sm text-blue-800">
            <strong>Tip:</strong> Use customer tags to organize services by customer (e.g., &quot;Westview&quot;, &quot;Hawthorn&quot;). Services flagged as duplicates can still be added using the &quot;Add Anyway&quot; button.
          </p>
        </div>
      </div>
    </div>
  );
}

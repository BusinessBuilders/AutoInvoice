'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { trpc } from '@/lib/trpc';

interface BusinessCardImage {
  id: string;
  file: File;
  preview: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  extractedData?: {
    name: string;
    phone?: string;
    email?: string;
    company?: string;
    title?: string;
    website?: string;
    linkedIn?: string;
    twitter?: string;
    facebook?: string;
    instagram?: string;
    addressLine1?: string;
    addressLine2?: string;
    city?: string;
    state?: string;
    zipCode?: string;
    country?: string;
    confidence: number;
  };
  error?: string;
  contactId?: string;
}

export default function NetworkContactUploadPage() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  const [images, setImages] = useState<BusinessCardImage[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const uploadMutation = trpc.contact.upload.useMutation();

  const generateId = () => Math.random().toString(36).substring(7);

  const handleFilesSelect = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newImages: BusinessCardImage[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!file.type.startsWith('image/')) continue;

      const reader = new FileReader();
      const id = generateId();

      reader.onload = (e) => {
        setImages((prev) => {
          const updated = [...prev];
          const img = updated.find((i) => i.id === id);
          if (img) {
            img.preview = e.target?.result as string;
          }
          return updated;
        });
      };
      reader.readAsDataURL(file);

      newImages.push({
        id,
        file,
        preview: '',
        status: 'pending',
      });
    }

    setImages((prev) => [...prev, ...newImages]);
  };

  const removeImage = (id: string) => {
    setImages((prev) => prev.filter((img) => img.id !== id));
  };

  const processAllCards = async () => {
    if (images.length === 0) return;

    setIsProcessing(true);

    try {
      // Convert all images to base64
      const imagePromises = images.map(async (img) => {
        const base64 = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => {
            const base64 = (reader.result as string).split(',')[1];
            resolve(base64);
          };
          reader.onerror = reject;
          reader.readAsDataURL(img.file);
        });

        return {
          imageBase64: base64,
          filename: img.file.name,
        };
      });

      const imagesData = await Promise.all(imagePromises);

      // Mark all as processing
      setImages((prev) =>
        prev.map((img) => ({ ...img, status: 'processing' as const }))
      );

      // Upload batch
      const result = await uploadMutation.mutateAsync({
        images: imagesData,
      });

      // Update each image with its result
      setImages((prev) =>
        prev.map((img, index) => {
          const uploadResult = result.results[index];
          if (uploadResult && 'success' in uploadResult && uploadResult.success) {
            return {
              ...img,
              status: 'success' as const,
              extractedData: (uploadResult as any).extractedData,
              contactId: (uploadResult as any).contact?.id,
            };
          } else {
            return {
              ...img,
              status: 'error' as const,
              error: uploadResult && 'error' in uploadResult ? uploadResult.error : 'Unknown error',
            };
          }
        })
      );

      // Show summary
      const successCount = result.summary.successful;
      const failureCount = result.summary.failed;

      if (failureCount === 0) {
        setTimeout(() => {
          router.push('/network');
        }, 2000);
      }
    } catch (error) {
      console.error('Failed to process business cards:', error);
      setImages((prev) =>
        prev.map((img) =>
          img.status === 'processing'
            ? { ...img, status: 'error' as const, error: 'Processing failed' }
            : img
        )
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const successCount = images.filter((i) => i.status === 'success').length;
  const errorCount = images.filter((i) => i.status === 'error').length;
  const pendingCount = images.filter((i) => i.status === 'pending').length;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="max-w-6xl mx-auto px-4">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-4 mb-4">
            <Link
              href="/network"
              className="text-blue-600 hover:text-blue-700"
            >
              ← Back to Network
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            Add Network Contacts
          </h1>
          <p className="text-gray-600 mt-2">
            Scan business cards to build your professional network
          </p>
        </div>

        {/* Upload Area */}
        {images.length === 0 && (
          <div className="bg-white rounded-lg shadow-md p-8 mb-6">
            <div
              className="border-2 border-dashed border-gray-300 rounded-lg p-12 text-center hover:border-blue-400 transition-colors cursor-pointer"
              onClick={() => fileInputRef.current?.click()}
              onDrop={(e) => {
                e.preventDefault();
                handleFilesSelect(e.dataTransfer.files);
              }}
              onDragOver={(e) => e.preventDefault()}
            >
              <div className="text-6xl mb-4">🌐</div>
              <h3 className="text-xl font-semibold mb-2">
                Upload Business Card Photos
              </h3>
              <p className="text-gray-600 mb-4">
                Select multiple images or drag and drop here
              </p>
              <div className="flex gap-4 justify-center">
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                  className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Choose Files
                </button>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    cameraInputRef.current?.click();
                  }}
                  className="px-6 py-3 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
                >
                  Take Photos
                </button>
              </div>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelect(e.target.files)}
            />
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="hidden"
              onChange={(e) => handleFilesSelect(e.target.files)}
            />
          </div>
        )}

        {/* Images Grid */}
        {images.length > 0 && (
          <div className="space-y-6">
            {/* Summary Stats */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-xl font-semibold">
                    {images.length} Business Card{images.length !== 1 ? 's' : ''}
                  </h2>
                  <p className="text-sm text-gray-600">
                    {successCount > 0 && (
                      <span className="text-green-600 font-medium">
                        {successCount} processed
                      </span>
                    )}
                    {errorCount > 0 && (
                      <span className="text-red-600 font-medium ml-3">
                        {errorCount} failed
                      </span>
                    )}
                    {pendingCount > 0 && (
                      <span className="text-gray-600 ml-3">
                        {pendingCount} pending
                      </span>
                    )}
                  </p>
                </div>
                <div className="flex gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                  >
                    Add More
                  </button>
                  <button
                    onClick={processAllCards}
                    disabled={isProcessing || images.length === 0}
                    className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {isProcessing ? 'Processing...' : 'Process All Cards'}
                  </button>
                </div>
              </div>

              {/* Progress Bar */}
              {isProcessing && (
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                    style={{
                      width: `${((successCount + errorCount) / images.length) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Cards Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {images.map((img) => (
                <div
                  key={img.id}
                  className="bg-white rounded-lg shadow-md overflow-hidden"
                >
                  {/* Image Preview */}
                  {img.preview && (
                    <div className="relative h-48 bg-gray-100">
                      <img
                        src={img.preview}
                        alt="Business card"
                        className="w-full h-full object-contain"
                      />
                      {img.status === 'pending' && (
                        <button
                          onClick={() => removeImage(img.id)}
                          className="absolute top-2 right-2 bg-red-600 text-white rounded-full w-8 h-8 flex items-center justify-center hover:bg-red-700"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  )}

                  {/* Status & Data */}
                  <div className="p-4">
                    {img.status === 'pending' && (
                      <div className="text-gray-600 text-sm">
                        Ready to process
                      </div>
                    )}

                    {img.status === 'processing' && (
                      <div className="flex items-center gap-2 text-blue-600">
                        <div className="animate-spin rounded-full h-4 w-4 border-2 border-blue-600 border-t-transparent" />
                        <span className="text-sm">Processing...</span>
                      </div>
                    )}

                    {img.status === 'success' && img.extractedData && (
                      <div className="space-y-2">
                        <div className="flex items-center gap-2 text-green-600 text-sm font-medium mb-2">
                          <span>✓</span>
                          <span>Extracted Successfully</span>
                        </div>
                        <div className="text-sm space-y-1">
                          <div className="font-semibold text-gray-900">
                            {img.extractedData.name}
                          </div>
                          {img.extractedData.title && (
                            <div className="text-gray-600">
                              {img.extractedData.title}
                            </div>
                          )}
                          {img.extractedData.company && (
                            <div className="text-gray-600">
                              {img.extractedData.company}
                            </div>
                          )}
                          {img.extractedData.phone && (
                            <div className="text-gray-500 text-xs">
                              📞 {img.extractedData.phone}
                            </div>
                          )}
                          {img.extractedData.email && (
                            <div className="text-gray-500 text-xs">
                              ✉️ {img.extractedData.email}
                            </div>
                          )}
                          <div className="text-gray-400 text-xs mt-2">
                            Confidence: {Math.round(img.extractedData.confidence * 100)}%
                          </div>
                        </div>
                      </div>
                    )}

                    {img.status === 'error' && (
                      <div className="text-red-600 text-sm">
                        <div className="font-medium mb-1">Failed to process</div>
                        <div className="text-xs">{img.error}</div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Success Message */}
            {successCount > 0 && successCount === images.length && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-center">
                <div className="text-green-800 font-semibold mb-2">
                  All business cards processed successfully!
                </div>
                <div className="text-green-700 text-sm">
                  Redirecting to network contacts...
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hidden inputs for adding more */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelect(e.target.files)}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          multiple
          className="hidden"
          onChange={(e) => handleFilesSelect(e.target.files)}
        />
      </div>
    </div>
  );
}

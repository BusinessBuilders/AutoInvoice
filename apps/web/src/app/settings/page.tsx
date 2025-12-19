'use client';

import { trpc } from '@/lib/trpc';
import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const router = useRouter();
  const { requireAuth } = useAuth();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string>('');
  const [companyInfo, setCompanyInfo] = useState({
    companyName: '',
    companyAddress: '',
    companyPhone: '',
    companyEmail: '',
    companyWebsite: '',
    companyTaxId: '',
  });

  useEffect(() => {
    requireAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const { data: branding, isLoading } = trpc.branding.get.useQuery();
  const uploadLogoMutation = trpc.branding.uploadLogo.useMutation();
  const updateInfoMutation = trpc.branding.updateInfo.useMutation();
  const deleteLogoMutation = trpc.branding.deleteLogo.useMutation();

  // Data backup/restore
  const [importFile, setImportFile] = useState<File | null>(null);
  const [clearExisting, setClearExisting] = useState(false);
  const exportDataQuery = trpc.gdpr.exportData.useQuery(undefined, { enabled: false });
  const importDataMutation = trpc.gdpr.importData.useMutation();

  // Load existing branding data
  useEffect(() => {
    if (branding) {
      setCompanyInfo({
        companyName: branding.companyName || '',
        companyAddress: branding.companyAddress || '',
        companyPhone: branding.companyPhone || '',
        companyEmail: branding.companyEmail || '',
        companyWebsite: branding.companyWebsite || '',
        companyTaxId: branding.companyTaxId || '',
      });
      if (branding.logoPath) {
        setLogoPreview(`http://localhost:4000${branding.logoPath}`);
      }
    }
  }, [branding]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setLogoFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoPreview(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleUploadLogo = async () => {
    if (!logoFile) return;

    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const base64Image = reader.result as string;
        await uploadLogoMutation.mutateAsync({
          image: base64Image,
          filename: logoFile.name,
        });
        alert('Logo uploaded successfully! Brand colors extracted.');
        setLogoFile(null);
      } catch (error: any) {
        alert(`Failed to upload logo: ${error.message}`);
      }
    };
    reader.readAsDataURL(logoFile);
  };

  const handleDeleteLogo = async () => {
    if (!confirm('Are you sure you want to delete the logo?')) return;

    try {
      await deleteLogoMutation.mutateAsync();
      setLogoPreview('');
      alert('Logo deleted successfully');
    } catch (error: any) {
      alert(`Failed to delete logo: ${error.message}`);
    }
  };

  const handleSaveInfo = async () => {
    try {
      await updateInfoMutation.mutateAsync(companyInfo);
      alert('Company information updated successfully');
    } catch (error: any) {
      alert(`Failed to update information: ${error.message}`);
    }
  };

  const handleExportData = async () => {
    try {
      const data = await exportDataQuery.refetch();

      if (!data.data) {
        throw new Error('No data to export');
      }

      // Create JSON file and download
      const jsonString = JSON.stringify(data.data, null, 2);
      const blob = new Blob([jsonString], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `autoinvoice-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      alert('Data exported successfully!');
    } catch (error: any) {
      alert(`Failed to export data: ${error.message}`);
    }
  };

  const handleImportFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setImportFile(file);
    }
  };

  const handleImportData = async () => {
    if (!importFile) return;

    if (!confirm(
      clearExisting
        ? 'This will DELETE all existing data and replace it with the imported data. Are you sure?'
        : 'This will import the data and merge it with your existing data. Continue?'
    )) {
      return;
    }

    try {
      const fileContent = await importFile.text();
      const parsedData = JSON.parse(fileContent);

      await importDataMutation.mutateAsync({
        data: parsedData,
        clearExisting,
      });

      alert('Data imported successfully! Refresh the page to see changes.');
      setImportFile(null);
      router.refresh();
    } catch (error: any) {
      alert(`Failed to import data: ${error.message}`);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading settings...</p>
        </div>
      </div>
    );
  }

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
          <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
          <p className="mt-1 text-sm text-gray-500">
            Customize your branding and company information
          </p>
        </div>

        {/* Logo Upload Section */}
        <div className="bg-white shadow rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Logo & Branding</h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo Upload */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Logo
              </label>
              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition-colors"
              >
                {logoPreview ? (
                  <img
                    src={logoPreview}
                    alt="Logo preview"
                    className="max-h-32 mx-auto mb-2"
                  />
                ) : (
                  <div className="text-gray-400 mb-2">
                    <svg
                      className="mx-auto h-12 w-12"
                      stroke="currentColor"
                      fill="none"
                      viewBox="0 0 48 48"
                    >
                      <path
                        d="M28 8H12a4 4 0 00-4 4v20m32-12v8m0 0v8a4 4 0 01-4 4H12a4 4 0 01-4-4v-4m32-4l-3.172-3.172a4 4 0 00-5.656 0L28 28M8 32l9.172-9.172a4 4 0 015.656 0L28 28m0 0l4 4m4-24h8m-4-4v8m-12 4h.02"
                        strokeWidth={2}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  </div>
                )}
                <p className="text-sm text-gray-600">
                  {logoFile ? logoFile.name : 'Click to upload logo'}
                </p>
                <p className="text-xs text-gray-500 mt-1">PNG, JPG up to 5MB</p>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                onChange={handleFileSelect}
                className="hidden"
              />

              {logoFile && (
                <button
                  onClick={handleUploadLogo}
                  disabled={uploadLogoMutation.isPending}
                  className="mt-3 w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  {uploadLogoMutation.isPending ? 'Uploading...' : 'Upload & Extract Colors'}
                </button>
              )}

              {branding?.logoPath && !logoFile && (
                <button
                  onClick={handleDeleteLogo}
                  disabled={deleteLogoMutation.isPending}
                  className="mt-3 w-full px-4 py-2 border border-red-300 text-red-600 rounded-lg hover:bg-red-50"
                >
                  Delete Logo
                </button>
              )}
            </div>

            {/* Brand Colors */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Brand Colors (Auto-extracted)
              </label>
              {branding?.brandColors ? (
                <div className="space-y-3">
                  {Object.entries(branding.brandColors as Record<string, string>).map(
                    ([key, value]) => (
                      <div key={key} className="flex items-center space-x-3">
                        <div
                          className="w-12 h-12 rounded-lg border border-gray-300 shadow-sm"
                          style={{ backgroundColor: value }}
                        ></div>
                        <div className="flex-1">
                          <p className="text-sm font-medium text-gray-900 capitalize">
                            {key}
                          </p>
                          <p className="text-xs text-gray-500 font-mono">{value}</p>
                        </div>
                      </div>
                    )
                  )}
                </div>
              ) : (
                <div className="border border-gray-200 rounded-lg p-4 text-center text-sm text-gray-500">
                  Upload a logo to extract brand colors automatically
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Company Information */}
        <div className="bg-white shadow rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Company Information
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Company Name
              </label>
              <input
                type="text"
                value={companyInfo.companyName}
                onChange={(e) =>
                  setCompanyInfo({ ...companyInfo, companyName: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="Acme Inc."
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Email
              </label>
              <input
                type="email"
                value={companyInfo.companyEmail}
                onChange={(e) =>
                  setCompanyInfo({ ...companyInfo, companyEmail: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="billing@company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Phone
              </label>
              <input
                type="tel"
                value={companyInfo.companyPhone}
                onChange={(e) =>
                  setCompanyInfo({ ...companyInfo, companyPhone: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="(555) 123-4567"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Website
              </label>
              <input
                type="url"
                value={companyInfo.companyWebsite}
                onChange={(e) =>
                  setCompanyInfo({ ...companyInfo, companyWebsite: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="https://company.com"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Tax ID / EIN
              </label>
              <input
                type="text"
                value={companyInfo.companyTaxId}
                onChange={(e) =>
                  setCompanyInfo({ ...companyInfo, companyTaxId: e.target.value })
                }
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="12-3456789"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Address
              </label>
              <textarea
                value={companyInfo.companyAddress}
                onChange={(e) =>
                  setCompanyInfo({ ...companyInfo, companyAddress: e.target.value })
                }
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                placeholder="123 Business Street, Suite 100&#10;City, State 12345"
              />
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button
              onClick={handleSaveInfo}
              disabled={updateInfoMutation.isPending}
              className="px-6 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {updateInfoMutation.isPending ? 'Saving...' : 'Save Information'}
            </button>
          </div>
        </div>

        {/* Data Backup & Restore */}
        <div className="bg-white shadow rounded-lg p-6 mt-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">
            Data Backup & Restore
          </h2>
          <p className="text-sm text-gray-600 mb-6">
            Export all your data to a JSON file for backup, or restore from a previous backup.
          </p>

          {/* Export Section */}
          <div className="border-b border-gray-200 pb-6 mb-6">
            <h3 className="text-lg font-medium text-gray-900 mb-3">Export Data</h3>
            <p className="text-sm text-gray-600 mb-4">
              Download all your invoices, customers, services, receipts, leads, and quotes as a JSON file.
            </p>
            <button
              onClick={handleExportData}
              disabled={exportDataQuery.isFetching}
              className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-green-600 hover:bg-green-700 disabled:opacity-50"
            >
              {exportDataQuery.isFetching ? (
                <>
                  <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Exporting...
                </>
              ) : (
                <>📥 Download Backup</>
              )}
            </button>
          </div>

          {/* Import Section */}
          <div>
            <h3 className="text-lg font-medium text-gray-900 mb-3">Import Data</h3>
            <p className="text-sm text-gray-600 mb-4">
              Restore your data from a previously exported JSON backup file.
            </p>

            <div className="space-y-4">
              <div className="flex items-start">
                <input
                  type="checkbox"
                  id="clearExisting"
                  checked={clearExisting}
                  onChange={(e) => setClearExisting(e.target.checked)}
                  className="mt-1 h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                />
                <label htmlFor="clearExisting" className="ml-2">
                  <span className="text-sm font-medium text-gray-900">Clear existing data before import</span>
                  <p className="text-xs text-red-600 mt-1">
                    Warning: This will permanently delete all your current data!
                  </p>
                </label>
              </div>

              <div>
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportFileSelect}
                  className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
                />
                {importFile && (
                  <p className="mt-2 text-sm text-gray-600">
                    Selected: {importFile.name}
                  </p>
                )}
              </div>

              <button
                onClick={handleImportData}
                disabled={!importFile || importDataMutation.isPending}
                className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importDataMutation.isPending ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-3 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Importing...
                  </>
                ) : (
                  <>📤 Import Backup</>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

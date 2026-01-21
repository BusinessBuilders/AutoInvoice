'use client';

import { useState, useEffect, useCallback } from 'react';
import { trpc } from '@/lib/trpc';
import { useAuth } from '@/hooks/useAuth';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  balance: number;
}

export default function ImportTransactionsPage() {
  const router = useRouter();
  const { requireAuth, isLoading: authLoading } = useAuth();
  const [companyId] = useState('donovan-farms');
  const [bankAccountId, setBankAccountId] = useState('');
  const [autoCategorize, setAutoCategorize] = useState(true);
  const [rawData, setRawData] = useState('');
  const [parsedTransactions, setParsedTransactions] = useState<ParsedTransaction[]>([]);
  const [parseError, setParseError] = useState('');
  const [importResult, setImportResult] = useState<{ imported: number; skipped?: number; categorized: number; uncategorized: number } | null>(null);
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [fileParsing, setFileParsing] = useState(false);
  const [pdfInfo, setPdfInfo] = useState<{ bankName?: string; accountNumber?: string; period?: { start: string; end: string } } | null>(null);

  useEffect(() => {
    requireAuth();
  }, [requireAuth]);

  // Get bank accounts for dropdown
  const { data: bankAccounts } = trpc.bankAccounts.list.useQuery(
    { companyId },
    { enabled: !!companyId }
  );

  // Don't auto-select - let user choose or use auto-detect
  // useEffect removed to allow "Auto-detect from PDF" to be default

  // Check for duplicates when we have transactions and a bank account
  const effectiveBankAccountId = bankAccountId || bankAccounts?.find(
    ba => pdfInfo?.accountNumber && ba.accountNumber === pdfInfo.accountNumber
  )?.id;

  const { data: duplicateCheck } = trpc.bankTransactions.checkDuplicates.useQuery(
    {
      bankAccountId: effectiveBankAccountId || '',
      transactions: parsedTransactions.map(t => ({
        date: t.date,
        description: t.description,
        amount: t.amount,
      })),
    },
    {
      enabled: parsedTransactions.length > 0 && !!effectiveBankAccountId,
    }
  );

  // Import mutation
  const importMutation = trpc.bankTransactions.import.useMutation({
    onSuccess: (result) => {
      setImportResult(result);
      // Auto-redirect to General Ledger after 2 seconds
      setTimeout(() => {
        router.push('/accounting/general-ledger');
      }, 2000);
    },
  });

  // PDF parsing mutation
  const parsePdfMutation = trpc.bankTransactions.parsePDF.useMutation({
    onSuccess: (result) => {
      setFileParsing(false);
      if (result.success && result.transactions.length > 0) {
        const mapped = result.transactions.map((t) => ({
          date: t.date,
          description: t.description,
          amount: t.amount,
          balance: t.balance || 0,
        }));
        setParsedTransactions(mapped);
        setPdfInfo({
          bankName: result.bankName,
          accountNumber: result.accountNumber,
          period: result.statementPeriod,
        });
        setParseError('');
      } else {
        setParseError(result.error || 'Failed to parse PDF');
      }
    },
    onError: (error) => {
      setFileParsing(false);
      setParseError(error.message);
    },
  });

  // Handle file upload (PDF or CSV)
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setParseError('');
    setParsedTransactions([]);
    setPdfInfo(null);

    const isCSV = file.name.toLowerCase().endsWith('.csv');

    if (isCSV) {
      // Read CSV as text and parse locally
      const reader = new FileReader();
      reader.onload = () => {
        const text = reader.result as string;
        setRawData(text);
        // Trigger parse after setting data
        setTimeout(() => {
          // Parse inline since we can't call parseData directly with new value
          try {
            const lines = text.trim().split('\n');
            if (lines.length < 2) {
              setParseError('CSV must have a header row and at least one data row');
              return;
            }

            const header = lines[0].toLowerCase();
            const hasHeader = header.includes('date') || header.includes('description') || header.includes('amount');
            const dataLines = hasHeader ? lines.slice(1) : lines;
            const parsed: ParsedTransaction[] = [];

            for (const line of dataLines) {
              if (!line.trim()) continue;

              // CSV parsing (handles quoted strings)
              const cells: string[] = [];
              let current = '';
              let inQuotes = false;

              for (const char of line) {
                if (char === '"') {
                  inQuotes = !inQuotes;
                } else if (char === ',' && !inQuotes) {
                  cells.push(current.trim());
                  current = '';
                } else {
                  current += char;
                }
              }
              cells.push(current.trim());

              if (cells.length >= 3) {
                parsed.push({
                  date: cells[0],
                  description: cells[1],
                  amount: parseFloat(cells[2].replace(/[$,]/g, '')) || 0,
                  balance: parseFloat((cells[3] || '0').replace(/[$,]/g, '')) || 0,
                });
              }
            }

            if (parsed.length === 0) {
              setParseError('No valid transactions found in CSV');
              return;
            }

            setParsedTransactions(parsed);
          } catch (err: any) {
            setParseError(`CSV parse error: ${err.message}`);
          }
        }, 0);
      };
      reader.readAsText(file);
    } else {
      // PDF - use AI parsing
      setFileParsing(true);
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = (reader.result as string).split(',')[1];
        parsePdfMutation.mutate({ pdfBase64: base64 });
      };
      reader.readAsDataURL(file);
    }
  };

  // Parse CSV/JSON data
  const parseData = useCallback(() => {
    setParseError('');
    setParsedTransactions([]);

    if (!rawData.trim()) {
      return;
    }

    try {
      // Try JSON first
      if (rawData.trim().startsWith('[') || rawData.trim().startsWith('{')) {
        const json = JSON.parse(rawData);
        const transactions = Array.isArray(json) ? json : [json];

        const parsed: ParsedTransaction[] = transactions.map((t: any) => ({
          date: t.date || t.Date || '',
          description: t.description || t.Description || t.memo || t.Memo || '',
          amount: parseFloat(t.amount || t.Amount || 0),
          balance: parseFloat(t.balance || t.Balance || t.runningBalance || 0),
        }));

        setParsedTransactions(parsed);
        return;
      }

      // Try CSV
      const lines = rawData.trim().split('\n');
      if (lines.length < 2) {
        setParseError('CSV must have a header row and at least one data row');
        return;
      }

      const header = lines[0].toLowerCase();
      const hasHeader = header.includes('date') || header.includes('description') || header.includes('amount');

      const dataLines = hasHeader ? lines.slice(1) : lines;
      const parsed: ParsedTransaction[] = [];

      for (const line of dataLines) {
        if (!line.trim()) continue;

        // Simple CSV parsing (handles quoted strings with commas)
        const cells: string[] = [];
        let current = '';
        let inQuotes = false;

        for (const char of line) {
          if (char === '"') {
            inQuotes = !inQuotes;
          } else if (char === ',' && !inQuotes) {
            cells.push(current.trim());
            current = '';
          } else {
            current += char;
          }
        }
        cells.push(current.trim());

        // Assume format: Date, Description, Amount, Balance
        if (cells.length >= 3) {
          parsed.push({
            date: cells[0],
            description: cells[1],
            amount: parseFloat(cells[2].replace(/[$,]/g, '')) || 0,
            balance: parseFloat((cells[3] || '0').replace(/[$,]/g, '')) || 0,
          });
        }
      }

      if (parsed.length === 0) {
        setParseError('No valid transactions found. Check the format.');
        return;
      }

      setParsedTransactions(parsed);
    } catch (e: any) {
      setParseError(`Parse error: ${e.message}`);
    }
  }, [rawData]);

  // Handle import
  const handleImport = async () => {
    if (parsedTransactions.length === 0) {
      setParseError('No transactions to import');
      return;
    }

    // Use a fallback bank name if not detected
    const effectiveBankName = pdfInfo?.bankName ||
      (pdfInfo?.accountNumber ? `Bank Account ****${pdfInfo.accountNumber}` : 'Imported Bank Account');

    // Detect if it's a credit card based on bank name
    const bankNameLower = effectiveBankName.toLowerCase();
    const isCreditCard = bankNameLower.includes('credit') ||
                         bankNameLower.includes('card') ||
                         bankNameLower.includes('amex') ||
                         bankNameLower.includes('american express') ||
                         bankNameLower.includes('visa') ||
                         bankNameLower.includes('mastercard') ||
                         bankNameLower.includes('discover') ||
                         bankNameLower.includes('capital one');

    // If no bank account selected and we have pdfInfo (even with fallback name), auto-create
    const bankInfo = (!bankAccountId && pdfInfo) ? {
      bankName: effectiveBankName,
      accountNumber: pdfInfo.accountNumber,
      accountType: isCreditCard ? 'credit_card' as const : 'checking' as const,
    } : undefined;

    // Require either a selected bank account OR parsed PDF data
    if (!bankAccountId && !pdfInfo) {
      setParseError('Please select a bank account or upload a PDF statement');
      return;
    }

    importMutation.mutate({
      companyId,
      bankAccountId: bankAccountId || undefined,
      bankInfo,
      transactions: parsedTransactions,
      autoCategorize,
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  // Success state
  if (importResult) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="max-w-3xl mx-auto px-4 py-16">
          <div className="bg-white rounded-lg shadow-lg p-8 text-center">
            <div className="text-6xl mb-4">🎉</div>
            <h2 className="text-2xl font-bold text-gray-900 mb-4">Import Complete!</h2>
            <div className={`grid gap-4 mb-6 ${importResult.skipped ? 'grid-cols-4' : 'grid-cols-3'}`}>
              <div className="bg-gray-100 rounded-lg p-4">
                <div className="text-3xl font-bold text-gray-900">{importResult.imported}</div>
                <div className="text-sm text-gray-600">Imported</div>
              </div>
              {importResult.skipped !== undefined && importResult.skipped > 0 && (
                <div className="bg-blue-100 rounded-lg p-4">
                  <div className="text-3xl font-bold text-blue-600">{importResult.skipped}</div>
                  <div className="text-sm text-blue-600">Duplicates Skipped</div>
                </div>
              )}
              <div className="bg-green-100 rounded-lg p-4">
                <div className="text-3xl font-bold text-green-600">{importResult.categorized}</div>
                <div className="text-sm text-green-600">Auto-categorized</div>
              </div>
              <div className="bg-yellow-100 rounded-lg p-4">
                <div className="text-3xl font-bold text-yellow-600">{importResult.uncategorized}</div>
                <div className="text-sm text-yellow-600">Needs Review</div>
              </div>
            </div>
            <div className="text-center">
              <p className="text-gray-600 mb-4">Redirecting to General Ledger...</p>
              <div className="flex justify-center space-x-4">
                <Link
                  href="/accounting/general-ledger"
                  className="px-8 py-4 bg-blue-600 text-white text-lg font-medium rounded-lg hover:bg-blue-700 shadow-lg"
                >
                  🏦 Go to General Ledger Now
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center space-x-4 mb-2">
            <Link href="/accounting/general-ledger" className="text-gray-500 hover:text-gray-700">
              &larr; General Ledger
            </Link>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">Import Transactions</h1>
          <p className="mt-1 text-gray-600">
            Upload a PDF bank or credit card statement, or paste CSV/JSON data
          </p>
        </div>

        {/* Settings */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">Import Settings</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Bank Account
              </label>
              <select
                value={bankAccountId}
                onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
              >
                <option value="">✨ Auto-detect from PDF (creates new account if needed)</option>
                <option disabled>───────────────</option>
                {bankAccounts?.map((acc: any) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.accountType === 'credit_card' ? '💳' : '🏦'} {acc.name}
                    {acc.accountNumber ? ` (****${acc.accountNumber})` : ''}
                    {acc.isPrimary ? ' ★' : ''}
                  </option>
                ))}
              </select>
              {bankAccounts?.length === 0 && (
                <p className="text-xs text-yellow-600 mt-1">
                  No bank accounts found. <Link href="/accounting/chart-of-accounts" className="underline">Create one first</Link>
                </p>
              )}
            </div>
            <div className="flex items-center">
              <label className="flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={autoCategorize}
                  onChange={(e) => setAutoCategorize(e.target.checked)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 mr-2"
                />
                <span className="text-sm text-gray-700">
                  Auto-categorize using saved rules
                </span>
              </label>
            </div>
          </div>
        </div>

        {/* File Upload (PDF or CSV) */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">📄 Upload Statement (PDF or CSV)</h2>
          <p className="text-sm text-gray-600 mb-4">
            Upload a bank or credit card statement. PDF uses AI extraction, CSV is parsed directly.
          </p>
          <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center hover:border-blue-400 transition-colors">
            <input
              type="file"
              accept=".pdf,.csv"
              onChange={handleFileUpload}
              className="hidden"
              id="file-upload"
              disabled={fileParsing}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              {fileParsing ? (
                <div>
                  <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mb-2"></div>
                  <p className="text-blue-600">Parsing PDF with AI... This may take 30-60 seconds</p>
                </div>
              ) : (
                <div>
                  <div className="text-4xl mb-2">📤</div>
                  <p className="text-gray-700 font-medium">
                    {uploadedFile ? uploadedFile.name : 'Click to upload statement (PDF or CSV)'}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    PDF: AI extracts transactions • CSV: Date, Description, Amount, Balance
                  </p>
                </div>
              )}
            </label>
          </div>
          {pdfInfo && (
            <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="text-sm text-blue-800">
                <span className="font-medium">
                  Detected: {pdfInfo.bankName || (pdfInfo.accountNumber ? `Bank Account ****${pdfInfo.accountNumber}` : 'Bank Account (auto-create)')}
                </span>
                {pdfInfo.accountNumber && !pdfInfo.bankName && <span> • Will create new account</span>}
                {pdfInfo.accountNumber && pdfInfo.bankName && <span> • Account ****{pdfInfo.accountNumber}</span>}
                {pdfInfo.period && (
                  <span> • {pdfInfo.period.start} to {pdfInfo.period.end}</span>
                )}
              </div>
              {!bankAccountId && (
                <div className="text-xs text-green-700 mt-1">
                  ✅ Will create new "{pdfInfo.bankName}" account automatically
                </div>
              )}
              {bankAccountId && (
                <div className="text-xs text-yellow-700 mt-1">
                  ⚠️ Importing to selected account (change to "Auto-detect" to create new account)
                </div>
              )}
            </div>
          )}
        </div>

        <div className="text-center text-gray-500 my-4">— OR —</div>

        {/* Data Input */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-medium text-gray-900 mb-4">📋 Paste Transaction Data</h2>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Paste CSV or JSON data
            </label>
            <textarea
              value={rawData}
              onChange={(e) => setRawData(e.target.value)}
              rows={10}
              placeholder={`CSV format:
Date,Description,Amount,Balance
2023-06-01,DEPOSIT BY CHECK,1500.00,5000.00
2023-06-02,PRO LAWN SUPPLY,-423.94,4576.06

JSON format:
[
  {"date": "2023-06-01", "description": "DEPOSIT BY CHECK", "amount": 1500.00, "balance": 5000.00}
]`}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
            />
          </div>
          <div className="mt-4 flex space-x-4">
            <button
              onClick={parseData}
              className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700"
            >
              Parse Data
            </button>
          </div>

          {parseError && (
            <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
              {parseError}
            </div>
          )}
        </div>

        {/* Preview */}
        {parsedTransactions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Preview ({parsedTransactions.length} transactions)
              {duplicateCheck && duplicateCheck.duplicates > 0 && (
                <span className="ml-2 text-sm font-normal">
                  <span className="text-blue-600">• {duplicateCheck.duplicates} duplicates</span>
                  <span className="text-green-600 ml-2">• {duplicateCheck.newTransactions} new</span>
                </span>
              )}
            </h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Date
                    </th>
                    <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                      Description
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Amount
                    </th>
                    <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {parsedTransactions.slice(0, 10).map((t, i) => (
                    <tr key={i}>
                      <td className="px-4 py-2 text-sm text-gray-900">{t.date}</td>
                      <td className="px-4 py-2 text-sm text-gray-900 truncate max-w-xs">
                        {t.description}
                      </td>
                      <td className={`px-4 py-2 text-sm text-right ${t.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        ${t.amount.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-sm text-right text-gray-900">
                        ${t.balance.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {parsedTransactions.length > 10 && (
                <div className="text-center text-sm text-gray-500 py-2">
                  ... and {parsedTransactions.length - 10} more transactions
                </div>
              )}
            </div>

            <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  {duplicateCheck ? (
                    <>
                      <p className="text-green-800 font-medium">
                        Importing {duplicateCheck.newTransactions} new transactions
                        {duplicateCheck.duplicates > 0 && (
                          <span className="text-blue-600 ml-2">
                            (ignoring {duplicateCheck.duplicates} duplicates)
                          </span>
                        )}
                      </p>
                      <p className="text-green-600 text-sm">
                        {duplicateCheck.newTransactions > 0
                          ? 'New transactions will be auto-categorized using your saved rules'
                          : 'All transactions already exist - nothing new to import'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="text-green-800 font-medium">
                        Ready to import {parsedTransactions.length} transactions
                      </p>
                      <p className="text-green-600 text-sm">
                        {effectiveBankAccountId
                          ? 'Transactions will be auto-categorized using your saved rules'
                          : 'Select a bank account to check for duplicates'}
                      </p>
                    </>
                  )}
                </div>
                <button
                  onClick={handleImport}
                  disabled={importMutation.isPending || (!bankAccountId && !pdfInfo) || (duplicateCheck?.newTransactions === 0)}
                  className="px-8 py-4 bg-green-600 text-white text-lg font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 shadow-lg"
                >
                  {importMutation.isPending ? (
                    <span className="flex items-center">
                      <span className="animate-spin mr-2">⏳</span> Importing & Categorizing...
                    </span>
                  ) : (
                    '🚀 Import & Categorize'
                  )}
                </button>
              </div>
            </div>

            {importMutation.error && (
              <div className="mt-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700">
                Import failed: {importMutation.error.message}
              </div>
            )}
          </div>
        )}

        {/* Help */}
        <div className="bg-gray-100 rounded-lg p-4">
          <h3 className="font-medium text-gray-900 mb-2">Data Format Help</h3>
          <div className="text-sm text-gray-600 space-y-2">
            <p>
              <strong>CSV:</strong> Date, Description, Amount, Balance (header row optional)
            </p>
            <p>
              <strong>JSON:</strong> Array of objects with date, description, amount, balance fields
            </p>
            <p>
              <strong>Amount sign:</strong> Use negative for expenses, positive for income
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

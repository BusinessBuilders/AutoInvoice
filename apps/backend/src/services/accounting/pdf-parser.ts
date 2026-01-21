/**
 * Bank/Credit Card Statement PDF Parser
 * Production-grade PDF text extraction using pdf-parse (Node.js standard)
 * Extracts transactions from statement PDFs using AI
 */

import { PDFParse } from 'pdf-parse';
import OpenAI from 'openai';
import logger from '../../utils/logger';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface ParsedTransaction {
  date: string;
  description: string;
  amount: number;
  balance?: number;
  type: 'credit' | 'debit';
}

export interface PDFParseResult {
  success: boolean;
  transactions: ParsedTransaction[];
  rawText?: string;
  error?: string;
  bankName?: string;
  accountNumber?: string;
  statementPeriod?: {
    start: string;
    end: string;
  };
  pageCount?: number;
}

/**
 * Extract text from PDF buffer using pdf-parse v2.x
 * Production-grade Node.js PDF parsing with class-based API
 */
export async function extractPDFText(pdfBuffer: Buffer): Promise<{ text: string; pageCount: number }> {
  const parser = new PDFParse({ data: pdfBuffer });

  try {
    // Get document info for page count
    const info = await parser.getInfo();
    const pageCount = info.total || 1;

    // Extract text from all pages
    const textResult = await parser.getText();
    const text = textResult.text || '';

    logger.info('PDF loaded', { pageCount, textLength: text.length });

    return {
      text,
      pageCount,
    };
  } finally {
    // Clean up resources
    await parser.destroy();
  }
}

/**
 * Parse a chunk of statement text with AI
 */
async function parseTextChunk(chunkText: string, chunkIndex: number): Promise<ParsedTransaction[]> {
  const prompt = `You are an expert bank statement parser. Extract ALL transactions from this statement section.

For EACH transaction, extract:
- date (YYYY-MM-DD format)
- description (COMPLETE description including merchant names from adjacent lines)
- amount (negative for debits/withdrawals, positive for credits/deposits)
- balance (if shown)
- type ("credit" or "debit")

CRITICAL RULES:
1. MULTI-LINE TRANSACTIONS: Combine all related lines into one description
2. ACH transactions span 4-5 lines - include TYPE:, DATA:, CO: info in description
3. Remove $ signs and commas from amounts
4. This may be a PARTIAL statement - extract everything you see

Return ONLY valid JSON array (no markdown, no explanation):
[{"date":"YYYY-MM-DD","description":"Full description","amount":-123.45,"balance":1234.56,"type":"debit"}]

STATEMENT TEXT:
${chunkText}`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 8000,
    });

    let response = completion.choices[0].message.content || '';

    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.warn(`Chunk ${chunkIndex}: No JSON array found`);
      return [];
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const transactions: ParsedTransaction[] = (parsed || [])
      .filter((t: any) => t.date && t.description && typeof t.amount === 'number')
      .map((t: any) => ({
        date: t.date,
        description: t.description.trim(),
        amount: Number(t.amount),
        balance: t.balance ? Number(t.balance) : undefined,
        type: t.amount >= 0 ? 'credit' as const : 'debit' as const,
      }));

    logger.info(`Chunk ${chunkIndex} parsed: ${transactions.length} transactions`);
    return transactions;
  } catch (error) {
    logger.error(`Chunk ${chunkIndex} error:`, error);
    return [];
  }
}

/**
 * Parse bank/credit card statement PDF using AI
 * For large statements, splits into chunks and parses each separately
 */
export async function parseBankStatementPDF(pdfBuffer: Buffer): Promise<PDFParseResult> {
  try {
    // Extract text from PDF
    const { text: rawText, pageCount } = await extractPDFText(pdfBuffer);

    if (!rawText || rawText.trim().length < 50) {
      return {
        success: false,
        transactions: [],
        error: 'PDF appears to be empty or contains only images. Text-based extraction found no content.',
        pageCount,
      };
    }

    logger.info('PDF text extracted', {
      length: rawText.length,
      pageCount,
      preview: rawText.slice(0, 200).replace(/\n/g, ' ')
    });

    // For large statements (>30K chars or 4+ pages), split into chunks
    const CHUNK_SIZE = 25000; // ~3 pages worth
    const needsChunking = rawText.length > 30000 || pageCount >= 4;

    if (needsChunking) {
      logger.info(`Large statement detected (${rawText.length} chars, ${pageCount} pages). Chunking...`);

      const chunks: string[] = [];
      for (let i = 0; i < rawText.length; i += CHUNK_SIZE) {
        // Find a good break point (newline) near the chunk boundary
        let end = Math.min(i + CHUNK_SIZE, rawText.length);
        if (end < rawText.length) {
          const newlinePos = rawText.lastIndexOf('\n', end);
          if (newlinePos > i + CHUNK_SIZE * 0.8) {
            end = newlinePos;
          }
        }
        chunks.push(rawText.slice(i, end));
      }

      logger.info(`Split into ${chunks.length} chunks: ${chunks.map(c => c.length).join(', ')} chars`);

      // Parse each chunk
      const allTransactions: ParsedTransaction[] = [];
      for (let i = 0; i < chunks.length; i++) {
        const chunkTransactions = await parseTextChunk(chunks[i], i);
        allTransactions.push(...chunkTransactions);
      }

      // Remove duplicates
      const unique = allTransactions.filter((tx, idx, arr) =>
        idx === arr.findIndex(t =>
          t.date === tx.date && t.description === tx.description && t.amount === tx.amount
        )
      );

      logger.info(`Chunked parsing complete: ${unique.length} unique transactions from ${chunks.length} chunks`);

      return {
        success: unique.length > 0,
        transactions: unique,
        rawText,
        pageCount,
      };
    }

    // Small statement - parse in one shot
    const prompt = `You are an expert bank statement parser. Extract ALL transactions.

For EACH transaction extract:
- date (YYYY-MM-DD format)
- description (COMPLETE - combine multi-line transactions, include merchant names)
- amount (negative for debits, positive for credits)
- balance (if shown)
- type ("credit" or "debit")

RULES:
1. Multi-line transactions: Combine all related lines (transaction type + merchant + location)
2. ACH transactions span 4-5 lines - include TYPE:, DATA:, CO: in description
3. Remove $ signs and commas from amounts

Return ONLY valid JSON array (no markdown):
[{"date":"YYYY-MM-DD","description":"Full description","amount":-123.45,"balance":1234.56,"type":"debit"}]

STATEMENT TEXT:
${rawText.slice(0, 40000)}`;

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.1,
      max_tokens: 8000,
    });

    const response = completion.choices[0].message.content || '';

    // Extract JSON array
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      logger.error('AI response did not contain valid JSON', { response: response.slice(0, 500) });
      return {
        success: false,
        transactions: [],
        rawText,
        error: 'AI could not parse transactions from this PDF format',
        pageCount,
      };
    }

    let parsed: any[];
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      logger.error('JSON parse failed');
      return {
        success: false,
        transactions: [],
        rawText,
        error: 'AI response could not be parsed as JSON',
        pageCount,
      };
    }

    // Validate and clean transactions
    const transactions: ParsedTransaction[] = (parsed || [])
      .filter((t: any) => t.date && t.description && typeof t.amount === 'number')
      .map((t: any) => ({
        date: t.date,
        description: t.description.trim(),
        amount: Number(t.amount),
        balance: t.balance ? Number(t.balance) : undefined,
        type: t.amount >= 0 ? 'credit' as const : 'debit' as const,
      }));

    logger.info('PDF parsed successfully', {
      transactionCount: transactions.length,
      pageCount,
    });

    return {
      success: true,
      transactions,
      rawText,
      pageCount,
    };

  } catch (error) {
    logger.error('PDF parsing error:', error);
    return {
      success: false,
      transactions: [],
      error: error instanceof Error ? error.message : 'Unknown error parsing PDF',
    };
  }
}

/**
 * Parse multiple PDFs and combine transactions
 */
export async function parseMultiplePDFs(pdfBuffers: Buffer[]): Promise<PDFParseResult> {
  const allTransactions: ParsedTransaction[] = [];
  const errors: string[] = [];
  let bankName: string | undefined;
  let accountNumber: string | undefined;
  let totalPages = 0;

  for (const buffer of pdfBuffers) {
    const result = await parseBankStatementPDF(buffer);
    if (result.success) {
      allTransactions.push(...result.transactions);
      if (result.bankName) bankName = result.bankName;
      if (result.accountNumber) accountNumber = result.accountNumber;
      if (result.pageCount) totalPages += result.pageCount;
    } else if (result.error) {
      errors.push(result.error);
    }
  }

  // Sort by date
  allTransactions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Remove duplicates (same date, description, amount)
  const unique = allTransactions.filter((tx, index, arr) =>
    index === arr.findIndex(t =>
      t.date === tx.date &&
      t.description === tx.description &&
      t.amount === tx.amount
    )
  );

  return {
    success: unique.length > 0,
    transactions: unique,
    bankName,
    accountNumber,
    pageCount: totalPages,
    error: errors.length > 0 ? errors.join('; ') : undefined,
  };
}

import { prisma } from '../../utils/db';
import logger from '../../utils/logger';
import { JournalSourceType, JournalStatus, Prisma } from '@prisma/client';
import type { Receipt, Check, Invoice } from '@prisma/client';

/**
 * Journal Entry Auto-Generation Service
 *
 * Handles automatic creation of journal entries for:
 * - Invoice recognition (AR/Revenue)
 * - Invoice payment (Cash/AR)
 * - Receipt expenses (Expense/Cash)
 * - Check deposits (Cash/AR)
 *
 * All entries follow double-entry bookkeeping principles.
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// SYSTEM ACCOUNT CODES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export const SYSTEM_ACCOUNTS = {
  CASH: '1010',
  ACCOUNTS_RECEIVABLE: '1200',
  SERVICE_REVENUE: '4000',
  SALES_TAX_PAYABLE: '2100',
} as const;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// TYPES
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

interface JournalLineInput {
  accountCode: string;
  debit: number;
  credit: number;
  description?: string;
  customerId?: string;
}

interface CreateJournalEntryParams {
  entryDate: Date;
  description: string;
  sourceType: JournalSourceType;
  sourceId?: string;
  referenceNumber?: string;
  lines: JournalLineInput[];
  notes?: string;
  tags?: string[];
  userId?: string;
  autoPost?: boolean; // Auto-post to POSTED status
}

export interface JournalEntryResult {
  id: string;
  entryNumber: string;
  status: JournalStatus;
  totalDebits: number;
  totalCredits: number;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VALIDATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function validateDebitsEqualCredits(lines: JournalLineInput[]): void {
  const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
  const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

  if (Math.abs(totalDebits - totalCredits) > 0.01) {
    throw new Error(
      `Journal entry not balanced. Debits: ${totalDebits.toFixed(2)}, Credits: ${totalCredits.toFixed(2)}`
    );
  }
}

function validateLineAmounts(lines: JournalLineInput[]): void {
  for (const line of lines) {
    if (line.debit < 0 || line.credit < 0) {
      throw new Error('Debit and credit amounts must be non-negative');
    }
    if (line.debit > 0 && line.credit > 0) {
      throw new Error('Each line must have either debit or credit, not both');
    }
    if (line.debit === 0 && line.credit === 0) {
      throw new Error('Each line must have either debit or credit amount');
    }
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACCOUNT LOOKUP
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function getAccountByCode(code: string, userId: string) {
  const account = await prisma.account.findFirst({
    where: {
      userId,
      code,
    },
  });

  if (!account) {
    throw new Error(`Account with code "${code}" not found for user`);
  }

  if (!account.active) {
    throw new Error(`Account "${code}" is inactive`);
  }

  return account;
}

async function validateAllAccounts(lines: JournalLineInput[], userId: string): Promise<void> {
  const codes = Array.from(new Set(lines.map(l => l.accountCode)));
  await Promise.all(codes.map(code => getAccountByCode(code, userId)));
}

/**
 * Get or create system accounts
 * Ensures required accounts exist in the chart of accounts for a specific user
 */
async function getSystemAccounts(userId: string) {
  // Get or create core accounts for this user
  const [cashAccount, arAccount, revenueAccount, taxAccount] = await Promise.all([
    prisma.account.upsert({
      where: {
        userId_code: {
          userId,
          code: SYSTEM_ACCOUNTS.CASH,
        }
      },
      update: {},
      create: {
        userId,
        code: SYSTEM_ACCOUNTS.CASH,
        name: 'Cash',
        accountType: 'ASSET',
        balanceType: 'DEBIT',
        systemAccount: true,
        allowManualEntries: false,
        description: 'Primary cash account for operating funds',
      },
    }),
    prisma.account.upsert({
      where: {
        userId_code: {
          userId,
          code: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        }
      },
      update: {},
      create: {
        userId,
        code: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        name: 'Accounts Receivable',
        accountType: 'ASSET',
        balanceType: 'DEBIT',
        systemAccount: true,
        allowManualEntries: false,
        description: 'Outstanding customer invoices',
      },
    }),
    prisma.account.upsert({
      where: {
        userId_code: {
          userId,
          code: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
        }
      },
      update: {},
      create: {
        userId,
        code: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
        name: 'Service Revenue',
        accountType: 'REVENUE',
        balanceType: 'CREDIT',
        systemAccount: true,
        allowManualEntries: false,
        description: 'Revenue from services rendered',
      },
    }),
    prisma.account.upsert({
      where: {
        userId_code: {
          userId,
          code: SYSTEM_ACCOUNTS.SALES_TAX_PAYABLE,
        }
      },
      update: {},
      create: {
        userId,
        code: SYSTEM_ACCOUNTS.SALES_TAX_PAYABLE,
        name: 'Sales Tax Payable',
        accountType: 'LIABILITY',
        balanceType: 'CREDIT',
        systemAccount: true,
        allowManualEntries: false,
        description: 'Sales tax collected from customers',
      },
    }),
  ]);

  return { cashAccount, arAccount, revenueAccount, taxAccount };
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ENTRY NUMBER GENERATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Get next journal entry number for a specific user
 */
async function getNextEntryNumber(userId: string): Promise<string> {
  const lastEntry = await prisma.journalEntry.findFirst({
    where: { userId },
    orderBy: { entryNumber: 'desc' },
    select: { entryNumber: true },
  });

  if (!lastEntry) {
    return 'JE-000001';
  }

  const match = lastEntry.entryNumber.match(/^JE-(\d+)$/);
  if (!match) {
    logger.warn(`Unexpected entry number format: ${lastEntry.entryNumber}`);
    return 'JE-000001';
  }

  const nextNumber = parseInt(match[1], 10) + 1;
  return `JE-${nextNumber.toString().padStart(6, '0')}`;
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// ACCOUNT BALANCE UPDATE
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

async function updateAccountBalances(
  lines: Array<{ accountId: string; debit: number; credit: number }>,
  tx: Prisma.TransactionClient
): Promise<void> {
  // Group lines by account
  const accountUpdates = new Map<string, { debit: number; credit: number }>();

  for (const line of lines) {
    const existing = accountUpdates.get(line.accountId) || { debit: 0, credit: 0 };
    accountUpdates.set(line.accountId, {
      debit: existing.debit + line.debit,
      credit: existing.credit + line.credit,
    });
  }

  // Update each account balance
  for (const [accountId, amounts] of Array.from(accountUpdates.entries())) {
    const account = await tx.account.findUnique({
      where: { id: accountId },
      select: { balance: true, balanceType: true },
    });

    if (!account) {
      throw new Error(`Account ${accountId} not found`);
    }

    // Calculate new balance based on account's natural balance type
    const currentBalance = parseFloat(account.balance.toString());
    let newBalance: number;

    if (account.balanceType === 'DEBIT') {
      // Debit balance accounts: debits increase, credits decrease
      newBalance = currentBalance + amounts.debit - amounts.credit;
    } else {
      // Credit balance accounts: credits increase, debits decrease
      newBalance = currentBalance + amounts.credit - amounts.debit;
    }

    await tx.account.update({
      where: { id: accountId },
      data: {
        balance: new Prisma.Decimal(newBalance),
        balanceAsOf: new Date(),
      },
    });
  }
}

async function reverseAccountBalances(
  entryId: string,
  tx: Prisma.TransactionClient
): Promise<void> {
  const lines = await tx.journalLine.findMany({
    where: { journalEntryId: entryId },
    include: { account: true },
  });

  for (const line of lines) {
    const currentBalance = parseFloat(line.account.balance.toString());
    let newBalance: number;

    if (line.account.balanceType === 'DEBIT') {
      // Reverse: subtract debits, add credits
      newBalance = currentBalance - parseFloat(line.debit.toString()) + parseFloat(line.credit.toString());
    } else {
      // Reverse: subtract credits, add debits
      newBalance = currentBalance - parseFloat(line.credit.toString()) + parseFloat(line.debit.toString());
    }

    await tx.account.update({
      where: { id: line.accountId },
      data: {
        balance: new Prisma.Decimal(newBalance),
        balanceAsOf: new Date(),
      },
    });
  }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CORE JOURNAL ENTRY CREATION
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Create a journal entry with validation and optional auto-posting
 */
export async function createJournalEntry(
  params: CreateJournalEntryParams
): Promise<JournalEntryResult> {
  const {
    entryDate,
    description,
    sourceType,
    sourceId,
    referenceNumber,
    lines,
    notes,
    tags = [],
    userId,
    autoPost = false,
  } = params;

  // Validate userId is provided
  if (!userId) {
    throw new Error('userId is required for creating journal entries');
  }

  // Validate
  validateLineAmounts(lines);
  validateDebitsEqualCredits(lines);
  await validateAllAccounts(lines, userId);

  return await prisma.$transaction(async (tx) => {
    // Generate entry number for this user
    const entryNumber = await getNextEntryNumber(userId);

    // Resolve account IDs for this user
    const linesWithAccountIds = await Promise.all(
      lines.map(async (line) => {
        const account = await tx.account.findFirst({
          where: {
            userId,
            code: line.accountCode,
          },
        });
        if (!account) {
          throw new Error(`Account ${line.accountCode} not found for user`);
        }
        return {
          ...line,
          accountId: account.id,
        };
      })
    );

    // Create journal entry
    const status = autoPost ? JournalStatus.POSTED : JournalStatus.DRAFT;
    const postedAt = autoPost ? new Date() : null;

    const entry = await tx.journalEntry.create({
      data: {
        userId,
        entryNumber,
        entryDate,
        description,
        sourceType,
        sourceId,
        referenceNumber,
        notes,
        tags,
        status,
        postedAt,
        postedBy: autoPost ? userId : null,
        createdBy: userId,
        lines: {
          create: linesWithAccountIds.map((line, index) => ({
            accountId: line.accountId,
            debit: new Prisma.Decimal(line.debit),
            credit: new Prisma.Decimal(line.credit),
            description: line.description,
            customerId: line.customerId,
            lineOrder: index,
          })),
        },
      },
      include: {
        lines: true,
      },
    });

    // Update account balances if posted
    if (autoPost) {
      await updateAccountBalances(
        linesWithAccountIds.map(l => ({
          accountId: l.accountId,
          debit: l.debit,
          credit: l.credit,
        })),
        tx
      );
    }

    const totalDebits = lines.reduce((sum, line) => sum + line.debit, 0);
    const totalCredits = lines.reduce((sum, line) => sum + line.credit, 0);

    logger.info('Journal entry created', {
      entryNumber,
      sourceType,
      sourceId,
      status,
      totalDebits,
      totalCredits,
    });

    return {
      id: entry.id,
      entryNumber: entry.entryNumber,
      status: entry.status,
      totalDebits,
      totalCredits,
    };
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVOICE RECOGNITION ENTRY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Create journal entry when invoice is sent/recognized
 * DR: Accounts Receivable
 * CR: Service Revenue
 * CR: Sales Tax Payable (if applicable)
 */
export async function createInvoiceRecognitionEntry(
  invoice: Invoice,
  userId?: string
): Promise<JournalEntryResult> {
  const subtotal = parseFloat(invoice.subtotal.toString());
  const taxAmount = parseFloat(invoice.taxAmount.toString());
  const total = parseFloat(invoice.total.toString());

  const lines: JournalLineInput[] = [
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: total,
      credit: 0,
      description: `Invoice ${invoice.invoiceNumber} - Accounts Receivable`,
      customerId: invoice.customerId,
    },
    {
      accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
      debit: 0,
      credit: subtotal,
      description: `Invoice ${invoice.invoiceNumber} - Service Revenue`,
    },
  ];

  // Add sales tax line if applicable
  if (taxAmount > 0) {
    lines.push({
      accountCode: SYSTEM_ACCOUNTS.SALES_TAX_PAYABLE,
      debit: 0,
      credit: taxAmount,
      description: `Invoice ${invoice.invoiceNumber} - Sales Tax`,
    });
  }

  return createJournalEntry({
    entryDate: invoice.issueDate || new Date(),
    description: `Revenue recognition for invoice ${invoice.invoiceNumber}`,
    sourceType: JournalSourceType.INVOICE,
    sourceId: invoice.id,
    referenceNumber: invoice.invoiceNumber,
    lines,
    notes: `Customer: ${invoice.customerId}`,
    tags: ['revenue', 'invoice'],
    userId,
    autoPost: true, // Auto-post revenue recognition entries
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// INVOICE PAYMENT ENTRY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Create journal entry when invoice is paid
 * DR: Cash
 * CR: Accounts Receivable
 */
export async function createInvoicePaymentEntry(
  invoice: Invoice,
  userId?: string
): Promise<JournalEntryResult> {
  const total = parseFloat(invoice.total.toString());

  const lines: JournalLineInput[] = [
    {
      accountCode: SYSTEM_ACCOUNTS.CASH,
      debit: total,
      credit: 0,
      description: `Payment received for invoice ${invoice.invoiceNumber}`,
    },
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: 0,
      credit: total,
      description: `Invoice ${invoice.invoiceNumber} - Payment applied`,
      customerId: invoice.customerId,
    },
  ];

  return createJournalEntry({
    entryDate: invoice.paidDate || new Date(),
    description: `Payment received for invoice ${invoice.invoiceNumber}`,
    sourceType: JournalSourceType.INVOICE,
    sourceId: invoice.id,
    referenceNumber: invoice.invoiceNumber,
    lines,
    notes: `Customer: ${invoice.customerId}`,
    tags: ['payment', 'cash-receipt'],
    userId,
    autoPost: true, // Auto-post payment entries
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPENSE ENTRY (RECEIPT)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Create journal entry for expense receipt
 * DR: Expense Account (from ExpenseCategory)
 * CR: Cash
 */
export async function createExpenseEntry(
  receipt: Receipt,
  userId: string,
  expenseCategoryId: string
): Promise<JournalEntryResult> {
  // Get expense category to find the account
  const category = await prisma.expenseCategory.findUnique({
    where: { id: expenseCategoryId },
    include: { account: true },
  });

  if (!category) {
    throw new Error(`Expense category ${expenseCategoryId} not found`);
  }

  if (!category.account) {
    throw new Error(`Expense category "${category.name}" has no linked account`);
  }

  const amount = parseFloat(receipt.amount.toString());

  const lines: JournalLineInput[] = [
    {
      accountCode: category.account.code,
      debit: amount,
      credit: 0,
      description: `Expense: ${receipt.vendor} - ${category.name}`,
    },
    {
      accountCode: SYSTEM_ACCOUNTS.CASH,
      debit: 0,
      credit: amount,
      description: `Payment to ${receipt.vendor}`,
    },
  ];

  return createJournalEntry({
    entryDate: receipt.date,
    description: `Expense: ${receipt.vendor} - ${category.name}`,
    sourceType: JournalSourceType.RECEIPT,
    sourceId: receipt.id,
    referenceNumber: receipt.id.substring(0, 8),
    lines,
    notes: receipt.notes || `Vendor: ${receipt.vendor}`,
    tags: ['expense', category.name.toLowerCase().replace(/\s+/g, '-')],
    userId,
    autoPost: true, // Auto-post expense entries
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// CHECK DEPOSIT ENTRY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Create journal entry for check deposit
 * DR: Cash
 * CR: Accounts Receivable
 */
export async function createCheckDepositEntry(
  check: Check,
  userId: string,
  invoiceId?: string
): Promise<JournalEntryResult> {
  const amount = parseFloat(check.amount.toString());

  // Get invoice to link customer if available
  let customerId: string | undefined;
  let invoiceNumber: string | undefined;

  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({
      where: { id: invoiceId },
      select: { customerId: true, invoiceNumber: true },
    });
    if (invoice) {
      customerId = invoice.customerId;
      invoiceNumber = invoice.invoiceNumber;
    }
  }

  const lines: JournalLineInput[] = [
    {
      accountCode: SYSTEM_ACCOUNTS.CASH,
      debit: amount,
      credit: 0,
      description: `Check deposit #${check.checkNumber}${check.payee ? ` from ${check.payee}` : ''}`,
    },
    {
      accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
      debit: 0,
      credit: amount,
      description: invoiceNumber
        ? `Payment applied to invoice ${invoiceNumber}`
        : `Check payment received`,
      customerId,
    },
  ];

  return createJournalEntry({
    entryDate: check.date,
    description: `Check deposit #${check.checkNumber}${invoiceNumber ? ` for invoice ${invoiceNumber}` : ''}`,
    sourceType: JournalSourceType.CHECK,
    sourceId: check.id,
    referenceNumber: check.checkNumber,
    lines,
    notes: check.memo || `Payee: ${check.payee || 'Unknown'}`,
    tags: ['payment', 'check-deposit'],
    userId,
    autoPost: true, // Auto-post check deposits
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// VOID ENTRY
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Void a journal entry
 * - Sets status to VOIDED
 * - Reverses account balances if entry was POSTED
 * - Records void reason and timestamp
 */
export async function voidEntry(
  entryId: string,
  userId: string,
  reason: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findUnique({
      where: { id: entryId },
      select: { status: true, entryNumber: true },
    });

    if (!entry) {
      throw new Error(`Journal entry ${entryId} not found`);
    }

    if (entry.status === JournalStatus.VOIDED) {
      throw new Error(`Journal entry ${entry.entryNumber} is already voided`);
    }

    // Reverse balances if entry was posted
    if (entry.status === JournalStatus.POSTED) {
      await reverseAccountBalances(entryId, tx);
    }

    // Update entry status
    await tx.journalEntry.update({
      where: { id: entryId },
      data: {
        status: JournalStatus.VOIDED,
        voidedAt: new Date(),
        voidedBy: userId,
        voidReason: reason,
      },
    });

    logger.info('Journal entry voided', {
      entryNumber: entry.entryNumber,
      userId,
      reason,
    });
  });
}

// Alias for backward compatibility
export const voidJournalEntry = voidEntry;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// POST ENTRY (DRAFT -> POSTED)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/**
 * Post a draft journal entry
 * - Sets status to POSTED
 * - Updates account balances
 */
export async function postEntry(
  entryId: string,
  userId: string
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const entry = await tx.journalEntry.findUnique({
      where: { id: entryId },
      include: { lines: true },
    });

    if (!entry) {
      throw new Error(`Journal entry ${entryId} not found`);
    }

    if (entry.status !== JournalStatus.DRAFT) {
      throw new Error(`Journal entry ${entry.entryNumber} cannot be posted (status: ${entry.status})`);
    }

    // Update account balances
    await updateAccountBalances(
      entry.lines.map(l => ({
        accountId: l.accountId,
        debit: parseFloat(l.debit.toString()),
        credit: parseFloat(l.credit.toString()),
      })),
      tx
    );

    // Update entry status
    await tx.journalEntry.update({
      where: { id: entryId },
      data: {
        status: JournalStatus.POSTED,
        postedAt: new Date(),
        postedBy: userId,
      },
    });

    logger.info('Journal entry posted', {
      entryNumber: entry.entryNumber,
      userId,
    });
  });
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// EXPORTS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

export default {
  createJournalEntry,
  createInvoiceRecognitionEntry,
  createInvoicePaymentEntry,
  createExpenseEntry,
  createCheckDepositEntry,
  voidEntry,
  voidJournalEntry, // Alias for backward compatibility
  postEntry,
  SYSTEM_ACCOUNTS,
};

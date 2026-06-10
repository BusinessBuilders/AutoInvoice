import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { PrismaClient, JournalStatus, JournalSourceType, AccountType, BalanceType } from '@prisma/client';
import {
  createJournalEntry,
  createInvoiceRecognitionEntry,
  createInvoicePaymentEntry,
  createExpenseEntry,
  createCheckDepositEntry,
  voidEntry,
  postEntry,
  SYSTEM_ACCOUNTS,
} from '../../services/accounting/journal-service';

const prisma = new PrismaClient();

describe('Journal Service', () => {
  let userId: string;
  let cashAccountId: string;
  let arAccountId: string;
  let revenueAccountId: string;
  let expenseAccountId: string;
  let taxAccountId: string;

  beforeEach(async () => {
    // Clean up accounting tables
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.expenseCategory.deleteMany();
    await prisma.account.deleteMany();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@accounting.com',
        password: 'hashedpassword',
        name: 'Test User',
      },
    });
    userId = user.id;

    // Create test accounts (system will also create these, but we need IDs)
    const cashAccount = await prisma.account.create({
      data: {
        code: SYSTEM_ACCOUNTS.CASH,
        name: 'Cash',
        accountType: AccountType.ASSET,
        balanceType: BalanceType.DEBIT,
        systemAccount: true,
        allowManualEntries: false,
      },
    });
    cashAccountId = cashAccount.id;

    const arAccount = await prisma.account.create({
      data: {
        code: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        name: 'Accounts Receivable',
        accountType: AccountType.ASSET,
        balanceType: BalanceType.DEBIT,
        systemAccount: true,
        allowManualEntries: false,
      },
    });
    arAccountId = arAccount.id;

    const revenueAccount = await prisma.account.create({
      data: {
        code: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
        name: 'Service Revenue',
        accountType: AccountType.REVENUE,
        balanceType: BalanceType.CREDIT,
        systemAccount: true,
        allowManualEntries: false,
      },
    });
    revenueAccountId = revenueAccount.id;

    const taxAccount = await prisma.account.create({
      data: {
        code: SYSTEM_ACCOUNTS.SALES_TAX_PAYABLE,
        name: 'Sales Tax Payable',
        accountType: AccountType.LIABILITY,
        balanceType: BalanceType.CREDIT,
        systemAccount: true,
        allowManualEntries: false,
      },
    });
    taxAccountId = taxAccount.id;

    const expenseAccount = await prisma.account.create({
      data: {
        code: '5000',
        name: 'Operating Expenses',
        accountType: AccountType.EXPENSE,
        balanceType: BalanceType.DEBIT,
        allowManualEntries: true,
      },
    });
    expenseAccountId = expenseAccount.id;
  });

  describe('createJournalEntry', () => {
    it('should create a balanced journal entry successfully', async () => {
      const result = await createJournalEntry({
        entryDate: new Date('2024-01-15'),
        description: 'Test balanced entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          {
            accountCode: SYSTEM_ACCOUNTS.CASH,
            debit: 100,
            credit: 0,
            description: 'Debit cash',
          },
          {
            accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
            debit: 0,
            credit: 100,
            description: 'Credit revenue',
          },
        ],
        userId,
      });

      expect(result).toHaveProperty('id');
      expect(result.entryNumber).toMatch(/^JE-\d{6}$/);
      expect(result.status).toBe(JournalStatus.DRAFT);
      expect(result.totalDebits).toBe(100);
      expect(result.totalCredits).toBe(100);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry).toBeTruthy();
      expect(entry?.lines).toHaveLength(2);
    });

    it('should reject unbalanced journal entry', async () => {
      await expect(
        createJournalEntry({
          entryDate: new Date(),
          description: 'Unbalanced entry',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountCode: SYSTEM_ACCOUNTS.CASH,
              debit: 100,
              credit: 0,
            },
            {
              accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
              debit: 0,
              credit: 50, // Unbalanced!
            },
          ],
          userId,
        })
      ).rejects.toThrow(/not balanced/i);
    });

    it('should reject lines with invalid amounts', async () => {
      await expect(
        createJournalEntry({
          entryDate: new Date(),
          description: 'Invalid line',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountCode: SYSTEM_ACCOUNTS.CASH,
              debit: -100, // Negative not allowed
              credit: 0,
            },
            {
              accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
              debit: 0,
              credit: -100,
            },
          ],
          userId,
        })
      ).rejects.toThrow(/non-negative/i);
    });

    it('should reject lines with both debit and credit', async () => {
      await expect(
        createJournalEntry({
          entryDate: new Date(),
          description: 'Both debit and credit',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountCode: SYSTEM_ACCOUNTS.CASH,
              debit: 100,
              credit: 100, // Both not allowed
            },
          ],
          userId,
        })
      ).rejects.toThrow(/either debit or credit, not both/i);
    });

    it('should reject lines with neither debit nor credit', async () => {
      await expect(
        createJournalEntry({
          entryDate: new Date(),
          description: 'No amounts',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountCode: SYSTEM_ACCOUNTS.CASH,
              debit: 0,
              credit: 0, // Must have one
            },
          ],
          userId,
        })
      ).rejects.toThrow(/either debit or credit amount/i);
    });

    it('should generate sequential entry numbers', async () => {
      const result1 = await createJournalEntry({
        entryDate: new Date(),
        description: 'Entry 1',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 100, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 100 },
        ],
        userId,
      });

      const result2 = await createJournalEntry({
        entryDate: new Date(),
        description: 'Entry 2',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 50, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 50 },
        ],
        userId,
      });

      expect(result1.entryNumber).toBe('JE-000001');
      expect(result2.entryNumber).toBe('JE-000002');
    });

    it('should auto-post when autoPost is true', async () => {
      const result = await createJournalEntry({
        entryDate: new Date(),
        description: 'Auto-posted entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 100, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 100 },
        ],
        userId,
        autoPost: true,
      });

      expect(result.status).toBe(JournalStatus.POSTED);

      const cashAccount = await prisma.account.findUnique({
        where: { id: cashAccountId },
      });
      expect(Number(cashAccount?.balance)).toBe(100);

      const revenueAccount = await prisma.account.findUnique({
        where: { id: revenueAccountId },
      });
      expect(Number(revenueAccount?.balance)).toBe(100);
    });
  });

  describe('createInvoiceRecognitionEntry', () => {
    it('should create DR AR, CR Revenue entry', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Test Customer',
          email: 'customer@test.com',
          phone: '555-1234',
        },
      });

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'INV-001',
          customerId: customer.id,
          issueDate: new Date('2024-01-15'),
          dueDate: new Date('2024-02-15'),
          serviceDate: new Date('2024-01-15'),
          subtotal: 100,
          taxAmount: 0,
          total: 100,
          status: 'SENT',
        },
      });

      const result = await createInvoiceRecognitionEntry(invoice, userId);

      expect(result.status).toBe(JournalStatus.POSTED); // Auto-posted
      expect(result.totalDebits).toBe(100);
      expect(result.totalCredits).toBe(100);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.sourceType).toBe(JournalSourceType.INVOICE);
      expect(entry?.sourceId).toBe(invoice.id);
      expect(entry?.lines).toHaveLength(2);

      const arLine = entry?.lines.find(l => l.accountId === arAccountId);
      expect(Number(arLine?.debit)).toBe(100);
      expect(Number(arLine?.credit)).toBe(0);

      const revenueLine = entry?.lines.find(l => l.accountId === revenueAccountId);
      expect(Number(revenueLine?.debit)).toBe(0);
      expect(Number(revenueLine?.credit)).toBe(100);
    });

    it('should handle sales tax correctly', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Test Customer',
          email: 'customer@test.com',
          phone: '555-1234',
        },
      });

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'INV-002',
          customerId: customer.id,
          issueDate: new Date('2024-01-15'),
          dueDate: new Date('2024-02-15'),
          serviceDate: new Date('2024-01-15'),
          subtotal: 100,
          taxAmount: 10,
          total: 110,
          status: 'SENT',
        },
      });

      const result = await createInvoiceRecognitionEntry(invoice, userId);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.lines).toHaveLength(3); // AR, Revenue, Tax

      const arLine = entry?.lines.find(l => l.accountId === arAccountId);
      expect(Number(arLine?.debit)).toBe(110);

      const revenueLine = entry?.lines.find(l => l.accountId === revenueAccountId);
      expect(Number(revenueLine?.credit)).toBe(100);

      const taxLine = entry?.lines.find(l => l.accountId === taxAccountId);
      expect(Number(taxLine?.credit)).toBe(10);
    });
  });

  describe('createInvoicePaymentEntry', () => {
    it('should create DR Cash, CR AR entry', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Test Customer',
          email: 'customer@test.com',
          phone: '555-1234',
        },
      });

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'INV-003',
          customerId: customer.id,
          issueDate: new Date('2024-01-15'),
          dueDate: new Date('2024-02-15'),
          serviceDate: new Date('2024-01-15'),
          paidDate: new Date('2024-02-10'),
          subtotal: 200,
          taxAmount: 0,
          total: 200,
          status: 'PAID',
        },
      });

      const result = await createInvoicePaymentEntry(invoice, userId);

      expect(result.status).toBe(JournalStatus.POSTED);
      expect(result.totalDebits).toBe(200);
      expect(result.totalCredits).toBe(200);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.lines).toHaveLength(2);

      const cashLine = entry?.lines.find(l => l.accountId === cashAccountId);
      expect(Number(cashLine?.debit)).toBe(200);

      const arLine = entry?.lines.find(l => l.accountId === arAccountId);
      expect(Number(arLine?.credit)).toBe(200);
    });
  });

  describe('createExpenseEntry', () => {
    it('should create DR Expense, CR Cash entry', async () => {
      const expenseCategory = await prisma.expenseCategory.create({
        data: {
          name: 'Materials',
          accountId: expenseAccountId,
        },
      });

      const receipt = await prisma.receipt.create({
        data: {
          vendor: 'Home Depot',
          date: new Date('2024-01-20'),
          amount: 75.50,
          category: 'Materials',
        },
      });

      const result = await createExpenseEntry(receipt, userId, expenseCategory.id);

      expect(result.status).toBe(JournalStatus.POSTED);
      expect(result.totalDebits).toBe(75.50);
      expect(result.totalCredits).toBe(75.50);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.sourceType).toBe(JournalSourceType.RECEIPT);
      expect(entry?.lines).toHaveLength(2);

      const expenseLine = entry?.lines.find(l => l.accountId === expenseAccountId);
      expect(Number(expenseLine?.debit)).toBe(75.50);

      const cashLine = entry?.lines.find(l => l.accountId === cashAccountId);
      expect(Number(cashLine?.credit)).toBe(75.50);
    });

    it('should throw error if expense category not found', async () => {
      const receipt = await prisma.receipt.create({
        data: {
          vendor: 'Test Vendor',
          date: new Date(),
          amount: 50,
          category: 'Test',
        },
      });

      await expect(
        createExpenseEntry(receipt, userId, 'invalid-id')
      ).rejects.toThrow(/not found/i);
    });

    it('should throw error if category has no linked account', async () => {
      const categoryNoAccount = await prisma.expenseCategory.create({
        data: {
          name: 'No Account Category',
          // No accountId linked
        },
      });

      const receipt = await prisma.receipt.create({
        data: {
          vendor: 'Test Vendor',
          date: new Date(),
          amount: 50,
          category: 'Test',
        },
      });

      await expect(
        createExpenseEntry(receipt, userId, categoryNoAccount.id)
      ).rejects.toThrow(/no linked account/i);
    });
  });

  describe('createCheckDepositEntry', () => {
    it('should create DR Cash, CR AR entry', async () => {
      const check = await prisma.check.create({
        data: {
          checkNumber: '1234',
          amount: 150,
          date: new Date('2024-01-25'),
          payee: 'John Doe',
        },
      });

      const result = await createCheckDepositEntry(check, userId);

      expect(result.status).toBe(JournalStatus.POSTED);
      expect(result.totalDebits).toBe(150);
      expect(result.totalCredits).toBe(150);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.sourceType).toBe(JournalSourceType.CHECK);
      expect(entry?.lines).toHaveLength(2);

      const cashLine = entry?.lines.find(l => l.accountId === cashAccountId);
      expect(Number(cashLine?.debit)).toBe(150);

      const arLine = entry?.lines.find(l => l.accountId === arAccountId);
      expect(Number(arLine?.credit)).toBe(150);
    });

    it('should link to invoice when provided', async () => {
      const customer = await prisma.customer.create({
        data: {
          name: 'Test Customer',
          email: 'customer@test.com',
          phone: '555-1234',
        },
      });

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber: 'INV-004',
          customerId: customer.id,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 150,
          taxAmount: 0,
          total: 150,
          status: 'SENT',
        },
      });

      const check = await prisma.check.create({
        data: {
          checkNumber: '5678',
          amount: 150,
          date: new Date(),
          payee: 'Test Customer',
        },
      });

      const result = await createCheckDepositEntry(check, userId, invoice.id);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      const arLine = entry?.lines.find(l => l.accountId === arAccountId);
      expect(arLine?.customerId).toBe(customer.id);
      expect(arLine?.description).toContain('INV-004');
    });
  });

  describe('voidEntry', () => {
    it('should void a draft entry without reversing balances', async () => {
      const entry = await createJournalEntry({
        entryDate: new Date(),
        description: 'Entry to void',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 100, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 100 },
        ],
        userId,
        autoPost: false, // Keep as DRAFT
      });

      await voidEntry(entry.id, userId, 'Testing void');

      const voidedEntry = await prisma.journalEntry.findUnique({
        where: { id: entry.id },
      });

      expect(voidedEntry?.status).toBe(JournalStatus.VOIDED);
      expect(voidedEntry?.voidedBy).toBe(userId);
      expect(voidedEntry?.voidReason).toBe('Testing void');
      expect(voidedEntry?.voidedAt).toBeTruthy();

      // Balances should be unchanged (was never posted)
      const cashAccount = await prisma.account.findUnique({
        where: { id: cashAccountId },
      });
      expect(Number(cashAccount?.balance)).toBe(0);
    });

    it('should void a posted entry and reverse balances', async () => {
      const entry = await createJournalEntry({
        entryDate: new Date(),
        description: 'Posted entry to void',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 100, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 100 },
        ],
        userId,
        autoPost: true,
      });

      // Verify balances before void
      let cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });
      expect(Number(cashAccount?.balance)).toBe(100);

      await voidEntry(entry.id, userId, 'Reversing posted entry');

      const voidedEntry = await prisma.journalEntry.findUnique({
        where: { id: entry.id },
      });

      expect(voidedEntry?.status).toBe(JournalStatus.VOIDED);

      // Balances should be reversed
      cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });
      const revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });
      expect(Number(cashAccount?.balance)).toBe(0);
      expect(Number(revenueAccount?.balance)).toBe(0);
    });

    it('should reject voiding an already voided entry', async () => {
      const entry = await createJournalEntry({
        entryDate: new Date(),
        description: 'Entry to void',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 100, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 100 },
        ],
        userId,
      });

      await voidEntry(entry.id, userId, 'First void');

      await expect(
        voidEntry(entry.id, userId, 'Second void')
      ).rejects.toThrow(/already voided/i);
    });
  });

  describe('postEntry', () => {
    it('should post a draft entry and update account balances', async () => {
      const entry = await createJournalEntry({
        entryDate: new Date(),
        description: 'Entry to post',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 250, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 250 },
        ],
        userId,
        autoPost: false,
      });

      expect(entry.status).toBe(JournalStatus.DRAFT);

      await postEntry(entry.id, userId);

      const postedEntry = await prisma.journalEntry.findUnique({
        where: { id: entry.id },
      });

      expect(postedEntry?.status).toBe(JournalStatus.POSTED);
      expect(postedEntry?.postedAt).toBeTruthy();
      expect(postedEntry?.postedBy).toBe(userId);

      // Verify account balances updated
      const cashAccount = await prisma.account.findUnique({
        where: { id: cashAccountId },
      });
      expect(Number(cashAccount?.balance)).toBe(250);

      const revenueAccount = await prisma.account.findUnique({
        where: { id: revenueAccountId },
      });
      expect(Number(revenueAccount?.balance)).toBe(250);
    });

    it('should reject posting an already posted entry', async () => {
      const entry = await createJournalEntry({
        entryDate: new Date(),
        description: 'Already posted',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 100, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 100 },
        ],
        userId,
        autoPost: true,
      });

      await expect(
        postEntry(entry.id, userId)
      ).rejects.toThrow(/cannot be posted/i);
    });

    it('should correctly update debit and credit account balances', async () => {
      // DR Cash (asset, debit balance) increases
      // CR Revenue (revenue, credit balance) increases
      const entry = await createJournalEntry({
        entryDate: new Date(),
        description: 'Balance test',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountCode: SYSTEM_ACCOUNTS.CASH, debit: 300, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE, debit: 200, credit: 0 },
          { accountCode: SYSTEM_ACCOUNTS.SERVICE_REVENUE, debit: 0, credit: 500 },
        ],
        userId,
        autoPost: false,
      });

      await postEntry(entry.id, userId);

      const cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });
      const arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      const revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });

      // Both asset accounts (debit balance) should increase
      expect(Number(cashAccount?.balance)).toBe(300);
      expect(Number(arAccount?.balance)).toBe(200);

      // Revenue account (credit balance) should increase
      expect(Number(revenueAccount?.balance)).toBe(500);
    });
  });
});

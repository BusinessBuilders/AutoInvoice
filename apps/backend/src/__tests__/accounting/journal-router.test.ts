import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient, AccountType, BalanceType, JournalStatus, JournalSourceType } from '@prisma/client';

const prisma = new PrismaClient();

// NOTE: This file tests the business logic that would be used by the journal router.
// For full tRPC router testing, consider integration tests with a test server.

describe('Journal Router Logic', () => {
  let userId: string;
  let cashAccountId: string;
  let revenueAccountId: string;
  let arAccountId: string;
  let expenseAccountId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@journal.com',
        password: 'hashedpassword',
        name: 'Test User',
      },
    });
    userId = user.id;

    // Create test accounts
    const cashAccount = await prisma.account.create({
      data: {
        code: '1010',
        name: 'Cash',
        accountType: AccountType.ASSET,
        balanceType: BalanceType.DEBIT,
        allowManualEntries: true,
      },
    });
    cashAccountId = cashAccount.id;

    const revenueAccount = await prisma.account.create({
      data: {
        code: '4000',
        name: 'Service Revenue',
        accountType: AccountType.REVENUE,
        balanceType: BalanceType.CREDIT,
        allowManualEntries: true,
      },
    });
    revenueAccountId = revenueAccount.id;

    const arAccount = await prisma.account.create({
      data: {
        code: '1200',
        name: 'Accounts Receivable',
        accountType: AccountType.ASSET,
        balanceType: BalanceType.DEBIT,
        allowManualEntries: false,
        systemAccount: true,
      },
    });
    arAccountId = arAccount.id;

    const expenseAccount = await prisma.account.create({
      data: {
        code: '5000',
        name: 'Expenses',
        accountType: AccountType.EXPENSE,
        balanceType: BalanceType.DEBIT,
        allowManualEntries: true,
      },
    });
    expenseAccountId = expenseAccount.id;
  });

  describe('create', () => {
    it('should create a balanced journal entry', async () => {
      const result = await caller.create({
        entryDate: new Date('2024-01-15'),
        description: 'Test journal entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          {
            accountId: cashAccountId,
            debit: 100,
            credit: 0,
            description: 'Cash received',
          },
          {
            accountId: revenueAccountId,
            debit: 0,
            credit: 100,
            description: 'Service revenue',
          },
        ],
      });

      expect(result.id).toBeTruthy();
      expect(result.entryNumber).toMatch(/^JE-\d{6}$/);
      expect(result.status).toBe(JournalStatus.DRAFT);
      expect(result.lines).toHaveLength(2);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
      });
      expect(entry).toBeTruthy();
    });

    it('should validate that debits equal credits', async () => {
      await expect(
        caller.create({
          entryDate: new Date(),
          description: 'Unbalanced entry',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: cashAccountId,
              debit: 100,
              credit: 0,
            },
            {
              accountId: revenueAccountId,
              debit: 0,
              credit: 75, // Unbalanced
            },
          ],
        })
      ).rejects.toThrow(/must balance/i);
    });

    it('should prevent invalid line amounts (both debit and credit)', async () => {
      await expect(
        caller.create({
          entryDate: new Date(),
          description: 'Invalid line',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: cashAccountId,
              debit: 100,
              credit: 100, // Both not allowed
            },
          ],
        })
      ).rejects.toThrow(/cannot have both/i);
    });

    it('should prevent invalid line amounts (neither debit nor credit)', async () => {
      await expect(
        caller.create({
          entryDate: new Date(),
          description: 'Invalid line',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: cashAccountId,
              debit: 0,
              credit: 0, // Must have one
            },
          ],
        })
      ).rejects.toThrow(/must have either/i);
    });

    it('should validate all accounts exist', async () => {
      await expect(
        caller.create({
          entryDate: new Date(),
          description: 'Invalid account',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: 'non-existent-id',
              debit: 100,
              credit: 0,
            },
            {
              accountId: revenueAccountId,
              debit: 0,
              credit: 100,
            },
          ],
        })
      ).rejects.toThrow(/not found/i);
    });

    it('should prevent manual entries to system accounts', async () => {
      await expect(
        caller.create({
          entryDate: new Date(),
          description: 'Manual entry to system account',
          sourceType: JournalSourceType.MANUAL,
          lines: [
            {
              accountId: cashAccountId,
              debit: 100,
              credit: 0,
            },
            {
              accountId: arAccountId, // System account, no manual entries
              debit: 0,
              credit: 100,
            },
          ],
        })
      ).rejects.toThrow(/does not allow manual entries/i);
    });

    it('should generate sequential entry numbers', async () => {
      const result1 = await caller.create({
        entryDate: new Date(),
        description: 'Entry 1',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 100 },
        ],
      });

      const result2 = await caller.create({
        entryDate: new Date(),
        description: 'Entry 2',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 50, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 50 },
        ],
      });

      expect(result1.entryNumber).toBe('JE-000001');
      expect(result2.entryNumber).toBe('JE-000002');
    });

    it('should support multi-line entries', async () => {
      const result = await caller.create({
        entryDate: new Date(),
        description: 'Complex entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: expenseAccountId, debit: 50, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 150 },
        ],
      });

      expect(result.lines).toHaveLength(3);
    });
  });

  describe('post', () => {
    it('should post a draft entry and update account balances', async () => {
      // Create draft entry
      const entry = await caller.create({
        entryDate: new Date(),
        description: 'Entry to post',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 200, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 200 },
        ],
      });

      expect(entry.status).toBe(JournalStatus.DRAFT);

      // Post the entry
      const result = await caller.post({ id: entry.id });

      expect(result.status).toBe(JournalStatus.POSTED);
      expect(result.postedAt).toBeTruthy();
      expect(result.postedBy).toBe(userId);

      // Verify balances updated
      const cashAccount = await prisma.account.findUnique({
        where: { id: cashAccountId },
      });
      expect(Number(cashAccount?.balance)).toBe(200);

      const revenueAccount = await prisma.account.findUnique({
        where: { id: revenueAccountId },
      });
      expect(Number(revenueAccount?.balance)).toBe(200);
    });

    it('should reject posting already posted entry', async () => {
      const entry = await caller.create({
        entryDate: new Date(),
        description: 'Entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 100 },
        ],
      });

      await caller.post({ id: entry.id });

      await expect(
        caller.post({ id: entry.id })
      ).rejects.toThrow(/already posted/i);
    });

    it('should reject posting voided entry', async () => {
      const entry = await caller.create({
        entryDate: new Date(),
        description: 'Entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 100 },
        ],
      });

      await caller.void({ id: entry.id, reason: 'Test void' });

      await expect(
        caller.post({ id: entry.id })
      ).rejects.toThrow(/voided/i);
    });

    it('should correctly update multiple account balances', async () => {
      const entry = await caller.create({
        entryDate: new Date(),
        description: 'Multi-account entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 300, credit: 0 },
          { accountId: expenseAccountId, debit: 100, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 400 },
        ],
      });

      await caller.post({ id: entry.id });

      const cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });
      const expenseAccount = await prisma.account.findUnique({ where: { id: expenseAccountId } });
      const revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });

      expect(Number(cashAccount?.balance)).toBe(300);
      expect(Number(expenseAccount?.balance)).toBe(100);
      expect(Number(revenueAccount?.balance)).toBe(400);
    });
  });

  describe('void', () => {
    it('should void a draft entry without reversing balances', async () => {
      const entry = await caller.create({
        entryDate: new Date(),
        description: 'Draft to void',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 100 },
        ],
      });

      const result = await caller.void({
        id: entry.id,
        reason: 'Testing void',
      });

      expect(result.status).toBe(JournalStatus.VOIDED);
      expect(result.voidedBy).toBe(userId);
      expect(result.voidReason).toBe('Testing void');
      expect(result.voidedAt).toBeTruthy();

      // Balances should be unchanged (never posted)
      const cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });
      expect(Number(cashAccount?.balance)).toBe(0);
    });

    it('should void a posted entry and reverse balances', async () => {
      const entry = await caller.create({
        entryDate: new Date(),
        description: 'Posted to void',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 150, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 150 },
        ],
      });

      await caller.post({ id: entry.id });

      // Verify balances before void
      let cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });
      expect(Number(cashAccount?.balance)).toBe(150);

      const result = await caller.void({
        id: entry.id,
        reason: 'Reversing transaction',
      });

      expect(result.status).toBe(JournalStatus.VOIDED);

      // Balances should be reversed
      cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });
      const revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });
      expect(Number(cashAccount?.balance)).toBe(0);
      expect(Number(revenueAccount?.balance)).toBe(0);
    });

    it('should reject voiding already voided entry', async () => {
      const entry = await caller.create({
        entryDate: new Date(),
        description: 'Entry',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 100 },
        ],
      });

      await caller.void({ id: entry.id, reason: 'First void' });

      await expect(
        caller.void({ id: entry.id, reason: 'Second void' })
      ).rejects.toThrow(/already voided/i);
    });
  });

  describe('getBySource', () => {
    it('should find entries by source document', async () => {
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
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 100,
          taxAmount: 0,
          total: 100,
          status: 'SENT',
        },
      });

      // Create entries for this invoice
      await prisma.journalEntry.createMany({
        data: [
          {
            entryNumber: 'JE-000001',
            entryDate: new Date(),
            description: 'Recognition',
            sourceType: JournalSourceType.INVOICE,
            sourceId: invoice.id,
            status: JournalStatus.POSTED,
          },
          {
            entryNumber: 'JE-000002',
            entryDate: new Date(),
            description: 'Payment',
            sourceType: JournalSourceType.INVOICE,
            sourceId: invoice.id,
            status: JournalStatus.POSTED,
          },
        ],
      });

      const result = await caller.getBySource({
        sourceType: JournalSourceType.INVOICE,
        sourceId: invoice.id,
      });

      expect(result).toHaveLength(2);
      expect(result.every(e => e.sourceType === JournalSourceType.INVOICE)).toBe(true);
      expect(result.every(e => e.sourceId === invoice.id)).toBe(true);
    });

    it('should return empty array when no entries found', async () => {
      const result = await caller.getBySource({
        sourceType: JournalSourceType.INVOICE,
        sourceId: 'non-existent-id',
      });

      expect(result).toHaveLength(0);
    });

    it('should order entries by date descending', async () => {
      const receipt = await prisma.receipt.create({
        data: {
          vendor: 'Test Vendor',
          date: new Date(),
          amount: 50,
          category: 'Test',
        },
      });

      await prisma.journalEntry.createMany({
        data: [
          {
            entryNumber: 'JE-000001',
            entryDate: new Date('2024-01-10'),
            description: 'Older',
            sourceType: JournalSourceType.RECEIPT,
            sourceId: receipt.id,
            status: JournalStatus.POSTED,
          },
          {
            entryNumber: 'JE-000002',
            entryDate: new Date('2024-01-20'),
            description: 'Newer',
            sourceType: JournalSourceType.RECEIPT,
            sourceId: receipt.id,
            status: JournalStatus.POSTED,
          },
        ],
      });

      const result = await caller.getBySource({
        sourceType: JournalSourceType.RECEIPT,
        sourceId: receipt.id,
      });

      expect(result[0].description).toBe('Newer');
      expect(result[1].description).toBe('Older');
    });
  });

  describe('list', () => {
    it('should list all journal entries with pagination', async () => {
      // Create multiple entries
      for (let i = 1; i <= 3; i++) {
        await caller.create({
          entryDate: new Date(),
          description: `Entry ${i}`,
          sourceType: JournalSourceType.MANUAL,
          lines: [
            { accountId: cashAccountId, debit: 100, credit: 0 },
            { accountId: revenueAccountId, debit: 0, credit: 100 },
          ],
        });
      }

      const result = await caller.list({ limit: 10 });

      expect(result.entries).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const draft = await caller.create({
        entryDate: new Date(),
        description: 'Draft',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 100, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 100 },
        ],
      });

      const posted = await caller.create({
        entryDate: new Date(),
        description: 'Posted',
        sourceType: JournalSourceType.MANUAL,
        lines: [
          { accountId: cashAccountId, debit: 50, credit: 0 },
          { accountId: revenueAccountId, debit: 0, credit: 50 },
        ],
      });
      await caller.post({ id: posted.id });

      const result = await caller.list({ status: JournalStatus.POSTED });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].status).toBe(JournalStatus.POSTED);
    });

    it('should filter by source type', async () => {
      await prisma.journalEntry.createMany({
        data: [
          {
            entryNumber: 'JE-000001',
            entryDate: new Date(),
            description: 'Manual',
            sourceType: JournalSourceType.MANUAL,
            status: JournalStatus.DRAFT,
          },
          {
            entryNumber: 'JE-000002',
            entryDate: new Date(),
            description: 'Invoice',
            sourceType: JournalSourceType.INVOICE,
            status: JournalStatus.POSTED,
          },
        ],
      });

      const result = await caller.list({ sourceType: JournalSourceType.INVOICE });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].sourceType).toBe(JournalSourceType.INVOICE);
    });

    it('should filter by date range', async () => {
      await prisma.journalEntry.createMany({
        data: [
          {
            entryNumber: 'JE-000001',
            entryDate: new Date('2024-01-05'),
            description: 'Before',
            sourceType: JournalSourceType.MANUAL,
            status: JournalStatus.DRAFT,
          },
          {
            entryNumber: 'JE-000002',
            entryDate: new Date('2024-01-15'),
            description: 'In range',
            sourceType: JournalSourceType.MANUAL,
            status: JournalStatus.DRAFT,
          },
          {
            entryNumber: 'JE-000003',
            entryDate: new Date('2024-01-25'),
            description: 'After',
            sourceType: JournalSourceType.MANUAL,
            status: JournalStatus.DRAFT,
          },
        ],
      });

      const result = await caller.list({
        startDate: new Date('2024-01-10'),
        endDate: new Date('2024-01-20'),
      });

      expect(result.entries).toHaveLength(1);
      expect(result.entries[0].description).toBe('In range');
    });
  });
});

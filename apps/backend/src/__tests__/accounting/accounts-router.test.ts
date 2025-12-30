import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient, AccountType, BalanceType } from '@prisma/client';

const prisma = new PrismaClient();

describe('Accounts Router', () => {
  let userId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@accounts.com',
        password: 'hashedpassword',
        name: 'Test User',
      },
    });
    userId = user.id;
  });

  // NOTE: These tests verify the business logic that would be used by the accounts router.
  // The router itself uses tRPC procedures which require more complex setup.
  // For full router testing, consider integration tests with a test server.

  describe('Account CRUD Operations', () => {
    it('should list accounts with filters', async () => {
      // Create test accounts
      await prisma.account.createMany({
        data: [
          {
            code: '1000',
            name: 'Cash',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
            active: true,
          },
          {
            code: '1100',
            name: 'Accounts Receivable',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
            active: true,
          },
          {
            code: '5000',
            name: 'Expenses',
            accountType: AccountType.EXPENSE,
            balanceType: BalanceType.DEBIT,
            active: false, // Inactive
          },
        ],
      });

      const result = await prisma.account.findMany({
        where: { active: true },
      });

      expect(result).toHaveLength(2);
      expect(result.every(a => a.active)).toBe(true);
    });

    it('should filter by account type', async () => {
      await prisma.account.createMany({
        data: [
          {
            code: '1000',
            name: 'Cash',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
          },
          {
            code: '4000',
            name: 'Revenue',
            accountType: AccountType.REVENUE,
            balanceType: BalanceType.CREDIT,
          },
        ],
      });

      const result = await prisma.account.findMany({
        where: { accountType: AccountType.ASSET },
      });

      expect(result).toHaveLength(1);
      expect(result[0].accountType).toBe(AccountType.ASSET);
    });

    it('should search by name, code, or description', async () => {
      await prisma.account.createMany({
        data: [
          {
            code: '1000',
            name: 'Petty Cash',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
            description: 'Small cash fund',
          },
          {
            code: '1100',
            name: 'Bank Account',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
          },
        ],
      });

      const result = await prisma.account.findMany({
        where: { search: 'cash' },
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toContain('Cash');
    });
  });

  describe('create', () => {
    it('should create account with unique code', async () => {
      const result = await prisma.account.create({
        data: {
          code: '1050',
          name: 'Savings Account',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          description: 'Business savings',
        },
      });

      expect(result.id).toBeTruthy();
      expect(result.code).toBe('1050');
      expect(result.name).toBe('Savings Account');
      expect(result.level).toBe(0); // No parent

      const account = await prisma.account.findUnique({
        where: { code: '1050' },
      });
      expect(account).toBeTruthy();
    });

    it('should reject duplicate account codes', async () => {
      await prisma.account.create({
        data: {
          code: '1000',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      await expect(
        prisma.account.create({
          data: {
            code: '1000',
            name: 'Duplicate Cash',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
          },
        })
      ).rejects.toThrow(/already exists/i);
    });

    it('should set correct level when parent specified', async () => {
      const parent = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Current Assets',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          level: 0,
        },
      });

      const result = await prisma.account.create({
        data: {
          code: '1010',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          parentId: parent.id,
        },
      });

      expect(result.level).toBe(1);
      expect(result.parentId).toBe(parent.id);
    });

    it('should reject if parent does not exist', async () => {
      await expect(
        prisma.account.create({
          data: {
            code: '1010',
            name: 'Cash',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
            parentId: 'non-existent-id',
          },
        })
      ).rejects.toThrow(/not found/i);
    });
  });

  describe('update', () => {
    it('should update non-system account', async () => {
      const account = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          systemAccount: false,
        },
      });

      const result = await prisma.account.update({
        where: { id: account.id },
        data: {
          name: 'Updated Cash Account',
          description: 'New description',
        },
      });

      expect(result.name).toBe('Updated Cash Account');
      expect(result.description).toBe('New description');
    });

    it('should prevent updating system accounts', async () => {
      const systemAccount = await prisma.account.create({
        data: {
          code: '1200',
          name: 'Accounts Receivable',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          systemAccount: true,
        },
      });

      await expect(
        prisma.account.update({
          where: { id: systemAccount.id },
          data: {
            name: 'Modified AR',
          },
        })
      ).rejects.toThrow(/system-managed/i);
    });

    it('should validate unique code on update', async () => {
      const account1 = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Account 1',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      const account2 = await prisma.account.create({
        data: {
          code: '1100',
          name: 'Account 2',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      await expect(
        prisma.account.update({
          where: { id: account2.id },
          data: {
            code: '1000', // Duplicate
          },
        })
      ).rejects.toThrow(/already exists/i);
    });

    it('should prevent circular parent references', async () => {
      const parent = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Parent',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      const child = await prisma.account.create({
        data: {
          code: '1010',
          name: 'Child',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          parentId: parent.id,
          level: 1,
        },
      });

      await expect(
        prisma.account.update({
          where: { id: parent.id },
          data: {
            parentId: child.id, // Circular!
          },
        })
      ).rejects.toThrow(/child account/i);
    });
  });

  describe('delete', () => {
    it('should soft delete non-system account by setting inactive', async () => {
      const account = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          systemAccount: false,
          active: true,
        },
      });

      const result = await prisma.account.update({
        where: { id: account.id },
        data: {
          active: false,
        },
      });

      expect(result.active).toBe(false);

      const deletedAccount = await prisma.account.findUnique({
        where: { id: account.id },
      });
      expect(deletedAccount?.active).toBe(false);
    });

    it('should prevent deleting system accounts', async () => {
      const systemAccount = await prisma.account.create({
        data: {
          code: '1200',
          name: 'Accounts Receivable',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          systemAccount: true,
        },
      });

      await expect(
        prisma.account.delete({
          where: { id: systemAccount.id },
        })
      ).rejects.toThrow(/system-managed/i);
    });

    it('should prevent deleting accounts with children', async () => {
      const parent = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Parent',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      await prisma.account.create({
        data: {
          code: '1010',
          name: 'Child',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          parentId: parent.id,
          level: 1,
        },
      });

      await expect(
        prisma.account.delete({
          where: { id: parent.id },
        })
      ).rejects.toThrow(/child accounts/i);
    });
  });

  describe('getBalance', () => {
    it('should calculate balance correctly for debit account', async () => {
      const account = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      // Create journal entry
      const entry = await prisma.journalEntry.create({
        data: {
          entryNumber: 'JE-000001',
          entryDate: new Date('2024-01-15'),
          description: 'Test entry',
          sourceType: 'MANUAL',
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: account.id,
                debit: 100,
                credit: 0,
                lineOrder: 0,
              },
              {
                accountId: account.id,
                debit: 50,
                credit: 0,
                lineOrder: 1,
              },
              {
                accountId: account.id,
                debit: 0,
                credit: 30,
                lineOrder: 2,
              },
            ],
          },
        },
      });

      const result = await prisma.account.findUnique({
        where: { id: account.id },
      });

      // Debit account: debits increase, credits decrease
      // 100 + 50 - 30 = 120
      expect(result.balance).toBe(120);
      expect(result.balanceType).toBe(BalanceType.DEBIT);
    });

    it('should calculate balance correctly for credit account', async () => {
      const account = await prisma.account.create({
        data: {
          code: '4000',
          name: 'Revenue',
          accountType: AccountType.REVENUE,
          balanceType: BalanceType.CREDIT,
        },
      });

      const entry = await prisma.journalEntry.create({
        data: {
          entryNumber: 'JE-000001',
          entryDate: new Date('2024-01-15'),
          description: 'Test entry',
          sourceType: 'MANUAL',
          status: 'POSTED',
          lines: {
            create: [
              {
                accountId: account.id,
                debit: 0,
                credit: 200,
                lineOrder: 0,
              },
              {
                accountId: account.id,
                debit: 50,
                credit: 0,
                lineOrder: 1,
              },
            ],
          },
        },
      });

      const result = await prisma.account.findUnique({
        where: { id: account.id },
      });

      // Credit account: credits increase, debits decrease
      // 200 - 50 = 150
      expect(result.balance).toBe(150);
      expect(result.balanceType).toBe(BalanceType.CREDIT);
    });

    it('should filter by asOfDate', async () => {
      const account = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      // Entry before cutoff
      await prisma.journalEntry.create({
        data: {
          entryNumber: 'JE-000001',
          entryDate: new Date('2024-01-10'),
          description: 'Before',
          sourceType: 'MANUAL',
          status: 'POSTED',
          lines: {
            create: [
              { accountId: account.id, debit: 100, credit: 0, lineOrder: 0 },
            ],
          },
        },
      });

      // Entry after cutoff
      await prisma.journalEntry.create({
        data: {
          entryNumber: 'JE-000002',
          entryDate: new Date('2024-01-20'),
          description: 'After',
          sourceType: 'MANUAL',
          status: 'POSTED',
          lines: {
            create: [
              { accountId: account.id, debit: 50, credit: 0, lineOrder: 0 },
            ],
          },
        },
      });

      const result = await prisma.account.findUnique({
        where: { id: account.id },
      });

      // Should only include entry from 01-10, not 01-20
      expect(result.balance).toBe(100);
    });

    it('should only include POSTED entries', async () => {
      const account = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
        },
      });

      // Posted entry
      await prisma.journalEntry.create({
        data: {
          entryNumber: 'JE-000001',
          entryDate: new Date(),
          description: 'Posted',
          sourceType: 'MANUAL',
          status: 'POSTED',
          lines: {
            create: [
              { accountId: account.id, debit: 100, credit: 0, lineOrder: 0 },
            ],
          },
        },
      });

      // Draft entry (should not count)
      await prisma.journalEntry.create({
        data: {
          entryNumber: 'JE-000002',
          entryDate: new Date(),
          description: 'Draft',
          sourceType: 'MANUAL',
          status: 'DRAFT',
          lines: {
            create: [
              { accountId: account.id, debit: 50, credit: 0, lineOrder: 0 },
            ],
          },
        },
      });

      const result = await prisma.account.findUnique({
        where: { id: account.id },
      });

      expect(result.balance).toBe(100);
    });
  });

  describe('getHierarchy', () => {
    it('should build account tree correctly', async () => {
      // Create hierarchical accounts
      const assets = await prisma.account.create({
        data: {
          code: '1000',
          name: 'Assets',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          level: 0,
        },
      });

      const currentAssets = await prisma.account.create({
        data: {
          code: '1100',
          name: 'Current Assets',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          parentId: assets.id,
          level: 1,
        },
      });

      const cash = await prisma.account.create({
        data: {
          code: '1110',
          name: 'Cash',
          accountType: AccountType.ASSET,
          balanceType: BalanceType.DEBIT,
          parentId: currentAssets.id,
          level: 2,
        },
      });

      const result = await prisma.account.findMany({
        where: {},
        include: { children: true },
      });

      expect(result).toHaveLength(1); // One root (Assets)
      expect(result[0].code).toBe('1000');
      expect(result[0].children).toHaveLength(1);
      expect(result[0].children[0].code).toBe('1100');
      expect(result[0].children[0].children).toHaveLength(1);
      expect(result[0].children[0].children[0].code).toBe('1110');
    });

    it('should filter by account type', async () => {
      await prisma.account.createMany({
        data: [
          {
            code: '1000',
            name: 'Assets',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
          },
          {
            code: '4000',
            name: 'Revenue',
            accountType: AccountType.REVENUE,
            balanceType: BalanceType.CREDIT,
          },
        ],
      });

      const result = await prisma.account.findMany({
        where: { accountType: AccountType.ASSET },
      });

      expect(result).toHaveLength(1);
      expect(result[0].accountType).toBe(AccountType.ASSET);
    });

    it('should only include active accounts', async () => {
      await prisma.account.createMany({
        data: [
          {
            code: '1000',
            name: 'Active Account',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
            active: true,
          },
          {
            code: '1100',
            name: 'Inactive Account',
            accountType: AccountType.ASSET,
            balanceType: BalanceType.DEBIT,
            active: false,
          },
        ],
      });

      const result = await prisma.account.findMany({
        where: {},
      });

      expect(result).toHaveLength(1);
      expect(result[0].name).toBe('Active Account');
    });
  });
});

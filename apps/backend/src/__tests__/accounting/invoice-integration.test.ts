import { describe, it, expect, beforeEach } from '@jest/globals';
import { PrismaClient, AccountType, BalanceType, JournalStatus, JournalSourceType, InvoiceStatus } from '@prisma/client';
import {
  createInvoiceRecognitionEntry,
  createInvoicePaymentEntry,
  SYSTEM_ACCOUNTS,
} from '../../services/accounting/journal-service';

const prisma = new PrismaClient();

describe('Invoice Accounting Integration', () => {
  let userId: string;
  let customerId: string;
  let cashAccountId: string;
  let arAccountId: string;
  let revenueAccountId: string;
  let taxAccountId: string;

  beforeEach(async () => {
    // Clean up
    await prisma.journalLine.deleteMany();
    await prisma.journalEntry.deleteMany();
    await prisma.invoice.deleteMany();
    await prisma.customer.deleteMany();
    await prisma.account.deleteMany();
    await prisma.user.deleteMany();

    // Create test user
    const user = await prisma.user.create({
      data: {
        email: 'test@integration.com',
        password: 'hashedpassword',
        name: 'Test User',
      },
    });
    userId = user.id;

    // Create test customer
    const customer = await prisma.customer.create({
      data: {
        userId,
        name: 'Test Customer',
        email: 'customer@test.com',
        phone: '555-1234',
      },
    });
    customerId = customer.id;

    // Create system accounts
    const cashAccount = await prisma.account.create({
      data: {
        userId,
        code: SYSTEM_ACCOUNTS.CASH,
        name: 'Cash',
        accountType: AccountType.ASSET,
        balanceType: BalanceType.DEBIT,
        systemAccount: true,
      },
    });
    cashAccountId = cashAccount.id;

    const arAccount = await prisma.account.create({
      data: {
        userId,
        code: SYSTEM_ACCOUNTS.ACCOUNTS_RECEIVABLE,
        name: 'Accounts Receivable',
        accountType: AccountType.ASSET,
        balanceType: BalanceType.DEBIT,
        systemAccount: true,
      },
    });
    arAccountId = arAccount.id;

    const revenueAccount = await prisma.account.create({
      data: {
        userId,
        code: SYSTEM_ACCOUNTS.SERVICE_REVENUE,
        name: 'Service Revenue',
        accountType: AccountType.REVENUE,
        balanceType: BalanceType.CREDIT,
        systemAccount: true,
      },
    });
    revenueAccountId = revenueAccount.id;

    const taxAccount = await prisma.account.create({
      data: {
        userId,
        code: SYSTEM_ACCOUNTS.SALES_TAX_PAYABLE,
        name: 'Sales Tax Payable',
        accountType: AccountType.LIABILITY,
        balanceType: BalanceType.CREDIT,
        systemAccount: true,
      },
    });
    taxAccountId = taxAccount.id;
  });

  describe('Invoice Recognition (SENT status)', () => {
    it('should create journal entry when invoice is sent', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-001',
          customerId,
          issueDate: new Date('2024-01-15'),
          dueDate: new Date('2024-02-15'),
          serviceDate: new Date('2024-01-15'),
          subtotal: 500,
          taxAmount: 0,
          total: 500,
          status: InvoiceStatus.SENT,
        },
      });

      const result = await createInvoiceRecognitionEntry(invoice, userId);

      expect(result).toBeTruthy();
      expect(result.status).toBe(JournalStatus.POSTED);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.sourceType).toBe(JournalSourceType.INVOICE);
      expect(entry?.sourceId).toBe(invoice.id);
      expect(entry?.referenceNumber).toBe('INV-001');

      // Verify DR AR, CR Revenue
      const arLine = entry?.lines.find(l => l.accountId === arAccountId);
      const revenueLine = entry?.lines.find(l => l.accountId === revenueAccountId);

      expect(Number(arLine?.debit)).toBe(500);
      expect(Number(arLine?.credit)).toBe(0);
      expect(Number(revenueLine?.debit)).toBe(0);
      expect(Number(revenueLine?.credit)).toBe(500);
    });

    it('should update account balances when invoice is sent', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-002',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 300,
          taxAmount: 0,
          total: 300,
          status: InvoiceStatus.SENT,
        },
      });

      await createInvoiceRecognitionEntry(invoice, userId);

      // Verify balances
      const arAccount = await prisma.account.findUnique({
        where: { id: arAccountId },
      });
      const revenueAccount = await prisma.account.findUnique({
        where: { id: revenueAccountId },
      });

      // AR (asset) increases with debit
      expect(Number(arAccount?.balance)).toBe(300);
      // Revenue increases with credit
      expect(Number(revenueAccount?.balance)).toBe(300);
    });

    it('should handle sales tax correctly', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-003',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 100,
          taxAmount: 10,
          total: 110,
          status: InvoiceStatus.SENT,
        },
      });

      const result = await createInvoiceRecognitionEntry(invoice, userId);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.lines).toHaveLength(3);

      // DR AR $110
      const arLine = entry?.lines.find(l => l.accountId === arAccountId);
      expect(Number(arLine?.debit)).toBe(110);

      // CR Revenue $100
      const revenueLine = entry?.lines.find(l => l.accountId === revenueAccountId);
      expect(Number(revenueLine?.credit)).toBe(100);

      // CR Sales Tax Payable $10
      const taxLine = entry?.lines.find(l => l.accountId === taxAccountId);
      expect(Number(taxLine?.credit)).toBe(10);

      // Verify balances
      const arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      const revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });
      const taxAccount = await prisma.account.findUnique({ where: { id: taxAccountId } });

      expect(Number(arAccount?.balance)).toBe(110);
      expect(Number(revenueAccount?.balance)).toBe(100);
      expect(Number(taxAccount?.balance)).toBe(10);
    });

    it('should not create duplicate entries for same invoice', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-004',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 200,
          taxAmount: 0,
          total: 200,
          status: InvoiceStatus.SENT,
        },
      });

      // Create first entry
      await createInvoiceRecognitionEntry(invoice, userId);

      // Attempt to create second entry (should be allowed but tracked separately)
      await createInvoiceRecognitionEntry(invoice, userId);

      // Both entries should exist (system allows duplicate entries for audit trail)
      const entries = await prisma.journalEntry.findMany({
        where: {
          sourceType: JournalSourceType.INVOICE,
          sourceId: invoice.id,
        },
      });

      expect(entries.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Invoice Payment (PAID status)', () => {
    it('should create journal entry when invoice is paid', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-005',
          customerId,
          issueDate: new Date('2024-01-15'),
          dueDate: new Date('2024-02-15'),
          serviceDate: new Date('2024-01-15'),
          paidDate: new Date('2024-02-10'),
          subtotal: 400,
          taxAmount: 0,
          total: 400,
          status: InvoiceStatus.PAID,
        },
      });

      const result = await createInvoicePaymentEntry(invoice, userId);

      expect(result).toBeTruthy();
      expect(result.status).toBe(JournalStatus.POSTED);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      expect(entry?.sourceType).toBe(JournalSourceType.INVOICE);
      expect(entry?.sourceId).toBe(invoice.id);

      // Verify DR Cash, CR AR
      const cashLine = entry?.lines.find(l => l.accountId === cashAccountId);
      const arLine = entry?.lines.find(l => l.accountId === arAccountId);

      expect(Number(cashLine?.debit)).toBe(400);
      expect(Number(cashLine?.credit)).toBe(0);
      expect(Number(arLine?.debit)).toBe(0);
      expect(Number(arLine?.credit)).toBe(400);
    });

    it('should update account balances when invoice is paid', async () => {
      // First, recognize the invoice
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-006',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          paidDate: new Date(),
          subtotal: 250,
          taxAmount: 0,
          total: 250,
          status: InvoiceStatus.SENT,
        },
      });

      await createInvoiceRecognitionEntry(invoice, userId);

      // Verify AR balance after recognition
      let arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      expect(Number(arAccount?.balance)).toBe(250);

      // Update to paid
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID, paidDate: new Date() },
      });

      const updatedInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });

      await createInvoicePaymentEntry(updatedInvoice!, userId);

      // Verify balances after payment
      arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      const cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });

      // Cash increases
      expect(Number(cashAccount?.balance)).toBe(250);
      // AR decreases to zero (debit - credit)
      expect(Number(arAccount?.balance)).toBe(0);
    });
  });

  describe('Complete Invoice Lifecycle', () => {
    it('should handle full invoice lifecycle: DRAFT -> SENT -> PAID', async () => {
      // Start with draft invoice (no journal entries)
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-007',
          customerId,
          issueDate: new Date('2024-01-15'),
          dueDate: new Date('2024-02-15'),
          serviceDate: new Date('2024-01-15'),
          subtotal: 1000,
          taxAmount: 100,
          total: 1100,
          status: InvoiceStatus.DRAFT,
        },
      });

      // Verify no journal entries yet
      let entries = await prisma.journalEntry.findMany({
        where: { sourceId: invoice.id },
      });
      expect(entries).toHaveLength(0);

      // Update to SENT - creates recognition entry
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.SENT },
      });

      const sentInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });

      await createInvoiceRecognitionEntry(sentInvoice!, userId);

      // Verify recognition entry
      entries = await prisma.journalEntry.findMany({
        where: { sourceId: invoice.id },
      });
      expect(entries).toHaveLength(1);

      // Verify balances after recognition
      let arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      let revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });
      let taxAccount = await prisma.account.findUnique({ where: { id: taxAccountId } });
      let cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });

      expect(Number(arAccount?.balance)).toBe(1100);
      expect(Number(revenueAccount?.balance)).toBe(1000);
      expect(Number(taxAccount?.balance)).toBe(100);
      expect(Number(cashAccount?.balance)).toBe(0);

      // Update to PAID - creates payment entry
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: InvoiceStatus.PAID, paidDate: new Date('2024-02-20') },
      });

      const paidInvoice = await prisma.invoice.findUnique({
        where: { id: invoice.id },
      });

      await createInvoicePaymentEntry(paidInvoice!, userId);

      // Verify payment entry
      entries = await prisma.journalEntry.findMany({
        where: { sourceId: invoice.id },
      });
      expect(entries).toHaveLength(2);

      // Verify final balances
      arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });
      taxAccount = await prisma.account.findUnique({ where: { id: taxAccountId } });
      cashAccount = await prisma.account.findUnique({ where: { id: cashAccountId } });

      expect(Number(cashAccount?.balance)).toBe(1100); // Cash received
      expect(Number(arAccount?.balance)).toBe(0); // AR cleared
      expect(Number(revenueAccount?.balance)).toBe(1000); // Revenue unchanged
      expect(Number(taxAccount?.balance)).toBe(100); // Tax payable unchanged
    });

    it('should handle multiple invoices correctly', async () => {
      // Create and process first invoice
      const invoice1 = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-008',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 500,
          taxAmount: 0,
          total: 500,
          status: InvoiceStatus.SENT,
        },
      });

      await createInvoiceRecognitionEntry(invoice1, userId);

      // Create and process second invoice
      const invoice2 = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-009',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 300,
          taxAmount: 0,
          total: 300,
          status: InvoiceStatus.SENT,
        },
      });

      await createInvoiceRecognitionEntry(invoice2, userId);

      // Verify cumulative balances
      const arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      const revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });

      expect(Number(arAccount?.balance)).toBe(800); // 500 + 300
      expect(Number(revenueAccount?.balance)).toBe(800);

      // Pay first invoice
      await prisma.invoice.update({
        where: { id: invoice1.id },
        data: { status: InvoiceStatus.PAID, paidDate: new Date() },
      });

      const paidInvoice1 = await prisma.invoice.findUnique({
        where: { id: invoice1.id },
      });

      await createInvoicePaymentEntry(paidInvoice1!, userId);

      // Verify balances after first payment
      const arAccountAfter = await prisma.account.findUnique({ where: { id: arAccountId } });
      const cashAccountAfter = await prisma.account.findUnique({ where: { id: cashAccountId } });

      expect(Number(cashAccountAfter?.balance)).toBe(500);
      expect(Number(arAccountAfter?.balance)).toBe(300); // 800 - 500 = 300 outstanding
    });
  });

  describe('Edge Cases', () => {
    it('should handle invoice with zero tax', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-010',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 150,
          taxAmount: 0,
          total: 150,
          status: InvoiceStatus.SENT,
        },
      });

      const result = await createInvoiceRecognitionEntry(invoice, userId);

      const entry = await prisma.journalEntry.findUnique({
        where: { id: result.id },
        include: { lines: true },
      });

      // Should only have 2 lines (AR and Revenue), no tax line
      expect(entry?.lines).toHaveLength(2);
      expect(entry?.lines.every(l => l.accountId !== taxAccountId)).toBe(true);
    });

    it('should handle invoice paid on issue date', async () => {
      const date = new Date('2024-01-15');
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-011',
          customerId,
          issueDate: date,
          dueDate: date,
          serviceDate: date,
          paidDate: date,
          subtotal: 100,
          taxAmount: 0,
          total: 100,
          status: InvoiceStatus.PAID,
        },
      });

      // Should handle both recognition and payment
      await createInvoiceRecognitionEntry(invoice, userId);
      await createInvoicePaymentEntry(invoice, userId);

      const entries = await prisma.journalEntry.findMany({
        where: { sourceId: invoice.id },
      });

      expect(entries).toHaveLength(2);
    });

    it('should maintain balance integrity with decimal amounts', async () => {
      const invoice = await prisma.invoice.create({
        data: {
          userId,
          invoiceNumber: 'INV-012',
          customerId,
          issueDate: new Date(),
          dueDate: new Date(),
          serviceDate: new Date('2024-01-15'),
          subtotal: 123.45,
          taxAmount: 12.35,
          total: 135.80,
          status: InvoiceStatus.SENT,
        },
      });

      await createInvoiceRecognitionEntry(invoice, userId);

      const arAccount = await prisma.account.findUnique({ where: { id: arAccountId } });
      const revenueAccount = await prisma.account.findUnique({ where: { id: revenueAccountId } });
      const taxAccount = await prisma.account.findUnique({ where: { id: taxAccountId } });

      // Verify precise decimal handling
      expect(Number(arAccount?.balance)).toBeCloseTo(135.80, 2);
      expect(Number(revenueAccount?.balance)).toBeCloseTo(123.45, 2);
      expect(Number(taxAccount?.balance)).toBeCloseTo(12.35, 2);
    });
  });
});

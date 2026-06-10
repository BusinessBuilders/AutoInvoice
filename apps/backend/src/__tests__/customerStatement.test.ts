import { generateCustomerStatement } from '../services/pdf/statement-generator';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Customer Statement Tests
 * Tests PDF generation and data formatting
 */

describe('Customer Statement PDF Generator', () => {
  it('should generate a statement PDF with invoices', async () => {
    const customer = {
      name: 'John Doe',
      email: 'john@example.com',
      company: 'Doe Enterprises',
    };

    const invoices = [
      {
        invoiceNumber: 'INV-001',
        date: new Date('2024-12-01'),
        dueDate: new Date('2024-12-15'),
        total: { toString: () => '500.00' } as any,
        status: 'SENT',
        daysOverdue: 0,
      },
      {
        invoiceNumber: 'INV-002',
        date: new Date('2024-11-20'),
        dueDate: new Date('2024-12-04'),
        total: { toString: () => '750.00' } as any,
        status: 'OVERDUE',
        daysOverdue: 15,
      },
    ];

    const summary = {
      totalAmount: '1250.00',
      overdueAmount: '750.00',
    };

    const companyInfo = {
      name: 'AutoInvoice',
      email: 'billing@autoinvoice.app',
      phone: '(555) 123-4567',
      address: '123 Business St',
    };

    const pdfPath = await generateCustomerStatement(
      customer,
      invoices,
      summary,
      companyInfo
    );

    // Verify file was created
    expect(fs.existsSync(pdfPath)).toBe(true);

    // Verify file is a PDF
    const fileContent = fs.readFileSync(pdfPath);
    expect(fileContent.toString('utf-8', 0, 4)).toBe('%PDF');

    // Verify file size is reasonable (at least 5KB for a statement)
    expect(fileContent.length).toBeGreaterThan(5000);

    // Cleanup
    fs.unlinkSync(pdfPath);
  });

  it('should handle empty invoice list', async () => {
    const customer = {
      name: 'Jane Smith',
      email: 'jane@example.com',
    };

    const summary = {
      totalAmount: '0.00',
      overdueAmount: '0.00',
    };

    const companyInfo = {
      name: 'AutoInvoice',
      email: 'billing@autoinvoice.app',
    };

    const pdfPath = await generateCustomerStatement(
      customer,
      [],
      summary,
      companyInfo
    );

    expect(fs.existsSync(pdfPath)).toBe(true);

    const fileContent = fs.readFileSync(pdfPath);
    expect(fileContent.toString('utf-8', 0, 4)).toBe('%PDF');

    // Cleanup
    fs.unlinkSync(pdfPath);
  });
});

import { generateCustomerStatement } from '../services/pdf/statement-generator';
import { PDFParse } from 'pdf-parse';
import * as fs from 'fs';

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

    // Verify file size is reasonable. pdf-lib uses non-embedded standard
    // fonts (Helvetica), so a complete one-page statement is ~2.5KB — assert
    // it is non-trivial rather than an arbitrary 5KB floor, and verify the
    // actual rendered content below instead.
    expect(fileContent.length).toBeGreaterThan(2000);

    // Verify the statement actually rendered the invoices and summary by
    // extracting the PDF text content.
    const parser = new PDFParse({ data: new Uint8Array(fileContent) });
    const { text } = await parser.getText();

    expect(text).toContain('STATEMENT OF ACCOUNT');
    expect(text).toContain('John Doe');
    expect(text).toContain('Doe Enterprises');

    // Summary amounts
    expect(text).toContain('$1250.00');
    expect(text).toContain('$750.00');

    // Both invoice rows rendered
    expect(text).toContain('INV-001');
    expect(text).toContain('$500.00');
    expect(text).toContain('SENT');
    expect(text).toContain('INV-002');
    expect(text).toContain('OVERDUE (15d)');

    // Overdue notice rendered (overdueAmount > 0)
    expect(text).toContain('PAYMENT PAST DUE');

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

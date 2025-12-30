import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import logger from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';
import { Decimal } from '@prisma/client/runtime/library';

/**
 * Customer Statement PDF Generator
 * Creates professional statements showing outstanding invoices
 */

export interface StatementCustomer {
  name: string;
  email?: string;
  company?: string;
}

export interface StatementInvoice {
  invoiceNumber: string;
  date: Date;
  dueDate: Date;
  total: Decimal;
  status: string;
  daysOverdue: number;
}

export interface StatementSummary {
  totalAmount: string;
  overdueAmount: string;
}

export interface StatementCompanyInfo {
  name: string;
  email: string;
  phone?: string;
  address?: string;
}

/**
 * Generate customer statement PDF
 */
export async function generateCustomerStatement(
  customer: StatementCustomer,
  invoices: StatementInvoice[],
  summary: StatementSummary,
  companyInfo: StatementCompanyInfo
): Promise<string> {
  logger.info('Generating customer statement PDF', {
    customerName: customer.name,
    invoiceCount: invoices.length,
  });

  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size

  // Fonts
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const brandColor = rgb(0.15, 0.39, 0.92); // #2563eb
  const redColor = rgb(0.86, 0.15, 0.15); // #dc2626
  const grayColor = rgb(0.4, 0.4, 0.4);

  let currentY = height - 40;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // COMPANY INFO (Top Right)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const companyLines = [
    companyInfo.name,
    companyInfo.address,
    companyInfo.phone,
    companyInfo.email,
  ].filter(Boolean);

  let companyY = currentY;
  companyLines.forEach((line, i) => {
    page.drawText(line!, {
      x: width - 220,
      y: companyY - i * 12,
      size: 9,
      font: regularFont,
      color: grayColor,
    });
  });

  currentY -= 20;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // STATEMENT HEADER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Background bar
  page.drawRectangle({
    x: 0,
    y: currentY - 60,
    width: width,
    height: 60,
    color: brandColor,
  });

  page.drawText('STATEMENT OF ACCOUNT', {
    x: 50,
    y: currentY - 35,
    size: 24,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  const statementDate = new Date().toLocaleDateString();
  page.drawText(`Date: ${statementDate}`, {
    x: width - 200,
    y: currentY - 35,
    size: 12,
    font: regularFont,
    color: rgb(1, 1, 1),
  });

  currentY -= 80;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // CUSTOMER INFO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  page.drawText('TO:', {
    x: 50,
    y: currentY,
    size: 10,
    font: boldFont,
    color: grayColor,
  });

  currentY -= 20;

  page.drawText(customer.name, {
    x: 50,
    y: currentY,
    size: 12,
    font: boldFont,
  });

  if (customer.company) {
    currentY -= 15;
    page.drawText(customer.company, {
      x: 50,
      y: currentY,
      size: 10,
      font: regularFont,
    });
  }

  if (customer.email) {
    currentY -= 15;
    page.drawText(customer.email, {
      x: 50,
      y: currentY,
      size: 10,
      font: regularFont,
      color: grayColor,
    });
  }

  currentY -= 40;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SUMMARY BOX
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const summaryBoxHeight = 80;
  const summaryBoxY = currentY - summaryBoxHeight;

  // Background
  page.drawRectangle({
    x: 50,
    y: summaryBoxY,
    width: width - 100,
    height: summaryBoxHeight,
    color: rgb(0.97, 0.98, 1),
    borderColor: brandColor,
    borderWidth: 2,
  });

  page.drawText('Account Summary', {
    x: 65,
    y: currentY - 20,
    size: 12,
    font: boldFont,
    color: brandColor,
  });

  page.drawText('Total Amount Due:', {
    x: 65,
    y: currentY - 45,
    size: 11,
    font: regularFont,
  });

  page.drawText(`$${parseFloat(summary.totalAmount).toFixed(2)}`, {
    x: width - 180,
    y: currentY - 45,
    size: 16,
    font: boldFont,
    color: brandColor,
  });

  const overdueAmount = parseFloat(summary.overdueAmount);
  if (overdueAmount > 0) {
    page.drawText('Overdue Amount:', {
      x: 65,
      y: currentY - 65,
      size: 11,
      font: regularFont,
      color: redColor,
    });

    page.drawText(`$${overdueAmount.toFixed(2)}`, {
      x: width - 180,
      y: currentY - 65,
      size: 14,
      font: boldFont,
      color: redColor,
    });
  }

  currentY -= summaryBoxHeight + 30;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // INVOICE TABLE
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Table header
  page.drawRectangle({
    x: 50,
    y: currentY - 25,
    width: width - 100,
    height: 25,
    color: rgb(0.95, 0.95, 0.95),
  });

  const headers = [
    { text: 'INVOICE #', x: 60 },
    { text: 'DATE', x: 180 },
    { text: 'DUE DATE', x: 280 },
    { text: 'AMOUNT', x: 400 },
    { text: 'STATUS', x: 490 },
  ];

  headers.forEach(({ text, x }) => {
    page.drawText(text, {
      x,
      y: currentY - 17,
      size: 9,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });
  });

  currentY -= 30;

  // Invoice rows
  if (invoices.length === 0) {
    page.drawText('No outstanding invoices', {
      x: 60,
      y: currentY - 20,
      size: 11,
      font: regularFont,
      color: grayColor,
    });
    currentY -= 40;
  } else {
    invoices.forEach((invoice, index) => {
      // Check if we need a new page
      if (currentY < 150) {
        const newPage = pdfDoc.addPage([612, 792]);
        currentY = height - 50;

        // Repeat table header on new page
        newPage.drawRectangle({
          x: 50,
          y: currentY - 25,
          width: width - 100,
          height: 25,
          color: rgb(0.95, 0.95, 0.95),
        });

        headers.forEach(({ text, x }) => {
          newPage.drawText(text, {
            x,
            y: currentY - 17,
            size: 9,
            font: boldFont,
            color: rgb(0.3, 0.3, 0.3),
          });
        });

        currentY -= 30;
      }

      // Alternate row colors
      if (index % 2 === 0) {
        page.drawRectangle({
          x: 50,
          y: currentY - 18,
          width: width - 100,
          height: 20,
          color: rgb(0.98, 0.98, 0.98),
        });
      }

      // Invoice number
      page.drawText(invoice.invoiceNumber, {
        x: 60,
        y: currentY - 12,
        size: 10,
        font: regularFont,
      });

      // Date
      page.drawText(invoice.date.toLocaleDateString(), {
        x: 180,
        y: currentY - 12,
        size: 10,
        font: regularFont,
      });

      // Due date
      page.drawText(invoice.dueDate.toLocaleDateString(), {
        x: 280,
        y: currentY - 12,
        size: 10,
        font: regularFont,
      });

      // Amount
      page.drawText(`$${parseFloat(invoice.total.toString()).toFixed(2)}`, {
        x: 400,
        y: currentY - 12,
        size: 10,
        font: boldFont,
      });

      // Status
      const statusText =
        invoice.status === 'OVERDUE'
          ? `OVERDUE (${invoice.daysOverdue}d)`
          : invoice.status;
      const statusColor = invoice.status === 'OVERDUE' ? redColor : grayColor;

      page.drawText(statusText, {
        x: 490,
        y: currentY - 12,
        size: 9,
        font: invoice.status === 'OVERDUE' ? boldFont : regularFont,
        color: statusColor,
      });

      currentY -= 25;
    });
  }

  currentY -= 30;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // PAYMENT INSTRUCTIONS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (currentY < 200) {
    const newPage = pdfDoc.addPage([612, 792]);
    currentY = height - 50;
  }

  page.drawText('PAYMENT INSTRUCTIONS', {
    x: 50,
    y: currentY,
    size: 12,
    font: boldFont,
    color: brandColor,
  });

  currentY -= 20;

  const instructions = [
    'Please remit payment to the address above.',
    'Make checks payable to: ' + companyInfo.name,
    'Include your invoice number(s) with payment.',
    'For questions, contact us at: ' + companyInfo.email,
  ];

  instructions.forEach((instruction) => {
    page.drawText(instruction, {
      x: 50,
      y: currentY,
      size: 10,
      font: regularFont,
    });
    currentY -= 16;
  });

  currentY -= 20;

  // Overdue notice
  if (parseFloat(summary.overdueAmount) > 0) {
    page.drawRectangle({
      x: 50,
      y: currentY - 50,
      width: width - 100,
      height: 50,
      color: rgb(1, 0.97, 0.97),
      borderColor: redColor,
      borderWidth: 2,
    });

    page.drawText('PAYMENT PAST DUE', {
      x: 60,
      y: currentY - 20,
      size: 11,
      font: boldFont,
      color: redColor,
    });

    page.drawText(
      'Please remit payment immediately to avoid service interruption.',
      {
        x: 60,
        y: currentY - 38,
        size: 9,
        font: regularFont,
        color: rgb(0.5, 0.1, 0.1),
      }
    );

    currentY -= 70;
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // FOOTER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  page.drawLine({
    start: { x: 50, y: 60 },
    end: { x: width - 50, y: 60 },
    thickness: 1,
    color: rgb(0.8, 0.8, 0.8),
  });

  page.drawText('Thank you for your business!', {
    x: width / 2 - 70,
    y: 40,
    size: 10,
    font: regularFont,
    color: grayColor,
  });

  page.drawText(`Statement Date: ${statementDate}`, {
    x: 50,
    y: 25,
    size: 8,
    font: regularFont,
    color: rgb(0.6, 0.6, 0.6),
  });

  // Save PDF
  const pdfBytes = await pdfDoc.save();

  // Ensure statements directory exists
  const statementsDir = path.join(process.cwd(), 'statements');
  if (!fs.existsSync(statementsDir)) {
    fs.mkdirSync(statementsDir, { recursive: true });
  }

  // Generate filename
  const dateStr = new Date().toISOString().split('T')[0];
  const customerSlug = customer.name.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
  const filename = `statement-${customerSlug}-${dateStr}.pdf`;
  const filePath = path.join(statementsDir, filename);

  // Write file
  fs.writeFileSync(filePath, pdfBytes);

  logger.info('Customer statement PDF saved', {
    customerName: customer.name,
    invoiceCount: invoices.length,
    filePath,
  });

  return filePath;
}

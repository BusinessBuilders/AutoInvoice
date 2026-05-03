import { PDFDocument, rgb, StandardFonts, PDFImage } from 'pdf-lib';
import { prisma } from '../../utils/db';
import logger from '../../utils/logger';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Professional PDF Invoice Generator
 * Supports custom letterhead, branding, and templates
 */

export interface InvoicePdfOptions {
  invoiceId: string;
  template?: 'standard' | 'professional' | 'minimal';
  includeLetterhead?: boolean;
  letterheadPath?: string; // Path to letterhead image
  brandColor?: string; // Hex color for branding
  logoPath?: string; // Path to company logo
  companyInfo?: CompanyInfo; // Custom company info from user branding
}

export interface CompanyInfo {
  name: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  taxId?: string;
}

/**
 * Generate professional invoice PDF with custom branding
 */
export async function generateInvoicePdf(options: InvoicePdfOptions): Promise<Buffer> {
  const { invoiceId, template = 'professional', includeLetterhead = false } = options;

  logger.info(`Generating ${template} PDF for invoice: ${invoiceId}`);

  // Fetch invoice data
  const invoice = await prisma.invoice.findUnique({
    where: { id: invoiceId },
    include: {
      customer: true,
      lineItems: {
        orderBy: { order: 'asc' },
      },
    },
  });

  if (!invoice) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  // Create PDF based on template
  switch (template) {
    case 'professional':
      return generateProfessionalTemplate(invoice, options);
    case 'minimal':
      return generateMinimalTemplate(invoice, options);
    case 'standard':
    default:
      return generateStandardTemplate(invoice, options);
  }
}

/**
 * Professional template with full branding
 */
async function generateProfessionalTemplate(invoice: any, options: InvoicePdfOptions): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size

  // Fonts
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

  const { width, height } = page.getSize();
  const brandColor = hexToRgb(options.brandColor || '#2563eb');

  let currentY = height - 40;
  const startY = currentY; // Save the starting Y position for company info

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LETTERHEAD / LOGO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (options.logoPath && fs.existsSync(options.logoPath)) {
    try {
      const logoBytes = fs.readFileSync(options.logoPath);
      const logoImage = await pdfDoc.embedPng(logoBytes);
      const logoDims = logoImage.scale(0.3);

      page.drawImage(logoImage, {
        x: 50,
        y: currentY - logoDims.height,
        width: logoDims.width,
        height: logoDims.height,
      });

      currentY -= logoDims.height + 20;
    } catch (error) {
      logger.warn('Failed to embed logo:', error);
    }
  }

  // Company Info (right side) - draw at the top
  const companyInfo = options.companyInfo || getCompanyInfo();
  drawCompanyInfo(page, regularFont, companyInfo, width - 50, startY);

  currentY -= 100;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // INVOICE HEADER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Background bar
  page.drawRectangle({
    x: 0,
    y: currentY - 60,
    width: width,
    height: 60,
    color: brandColor,
  });

  page.drawText('INVOICE', {
    x: 50,
    y: currentY - 35,
    size: 28,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  page.drawText(invoice.invoiceNumber, {
    x: width - 200,
    y: currentY - 30,
    size: 16,
    font: boldFont,
    color: rgb(1, 1, 1),
  });

  currentY -= 80;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // INVOICE DETAILS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  // Left side - Bill To
  page.drawText('BILL TO:', {
    x: 50,
    y: currentY,
    size: 10,
    font: boldFont,
    color: rgb(0.4, 0.4, 0.4),
  });

  currentY -= 20;

  page.drawText(invoice.customer.name, {
    x: 50,
    y: currentY,
    size: 12,
    font: boldFont,
  });

  if (invoice.customer.company) {
    currentY -= 15;
    page.drawText(invoice.customer.company, {
      x: 50,
      y: currentY,
      size: 10,
      font: regularFont,
    });
  }

  if (invoice.customer.email) {
    currentY -= 15;
    page.drawText(invoice.customer.email, {
      x: 50,
      y: currentY,
      size: 10,
      font: regularFont,
    });
  }

  if (invoice.customer.phone) {
    currentY -= 15;
    page.drawText(invoice.customer.phone, {
      x: 50,
      y: currentY,
      size: 10,
      font: regularFont,
    });
  }

  if (invoice.customer.addressLine1) {
    currentY -= 15;
    page.drawText(invoice.customer.addressLine1, {
      x: 50,
      y: currentY,
      size: 10,
      font: regularFont,
    });

    if (invoice.customer.addressLine2) {
      currentY -= 15;
      page.drawText(invoice.customer.addressLine2, {
        x: 50,
        y: currentY,
        size: 10,
        font: regularFont,
      });
    }

    if (invoice.customer.city && invoice.customer.state) {
      currentY -= 15;
      page.drawText(`${invoice.customer.city}, ${invoice.customer.state} ${invoice.customer.zipCode || ''}`, {
        x: 50,
        y: currentY,
        size: 10,
        font: regularFont,
      });
    }
  }

  if (invoice.serviceAddress) {
    currentY -= 20;
    page.drawText('SERVICE ADDRESS:', {
      x: 50,
      y: currentY,
      size: 9,
      font: boldFont,
      color: rgb(0.4, 0.4, 0.4),
    });
    currentY -= 14;
    const serviceAddressLines = wrapText(invoice.serviceAddress, 240, regularFont, 10);
    serviceAddressLines.forEach((line: string) => {
      page.drawText(line, {
        x: 50,
        y: currentY,
        size: 10,
        font: regularFont,
      });
      currentY -= 14;
    });
  }

  // Right side - Dates
  let rightY = height - 220;

  const dateInfo = [
    { label: 'Invoice Date:', value: invoice.issueDate.toLocaleDateString() },
    { label: 'Service Date:', value: invoice.serviceDate.toLocaleDateString() },
    { label: 'Due Date:', value: invoice.dueDate.toLocaleDateString() },
    ...(invoice.paymentTerms ? [{ label: 'Terms:', value: invoice.paymentTerms }] : []),
  ];

  dateInfo.forEach(({ label, value }) => {
    page.drawText(label, {
      x: width - 200,
      y: rightY,
      size: 10,
      font: regularFont,
      color: rgb(0.4, 0.4, 0.4),
    });

    page.drawText(value, {
      x: width - 100,
      y: rightY,
      size: 10,
      font: boldFont,
    });

    rightY -= 20;
  });

  currentY = Math.min(currentY, rightY) - 40;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // LINE ITEMS TABLE
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
    { text: 'DESCRIPTION', x: 60 },
    { text: 'QTY', x: 350 },
    { text: 'RATE', x: 420 },
    { text: 'AMOUNT', x: 500 },
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

  // Line items
  invoice.lineItems.forEach((item: any, index: number) => {
    if (currentY < 150) {
      // Need new page
      const newPage = pdfDoc.addPage([612, 792]);
      currentY = height - 50;
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

    page.drawText(item.description, {
      x: 60,
      y: currentY - 12,
      size: 10,
      font: regularFont,
      maxWidth: 280,
    });

    page.drawText(item.quantity.toString(), {
      x: 360,
      y: currentY - 12,
      size: 10,
      font: regularFont,
    });

    page.drawText(`$${parseFloat(item.rate).toFixed(2)}`, {
      x: 420,
      y: currentY - 12,
      size: 10,
      font: regularFont,
    });

    page.drawText(`$${parseFloat(item.amount).toFixed(2)}`, {
      x: 500,
      y: currentY - 12,
      size: 10,
      font: boldFont,
    });

    currentY -= 25;
  });

  currentY -= 20;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // TOTALS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  const totals = [
    { label: 'Subtotal:', amount: invoice.subtotal },
  ];

  if (invoice.taxAmount > 0) {
    totals.push({ label: `Tax (${invoice.taxRate}%):`, amount: invoice.taxAmount });
  }

  if (invoice.discount > 0) {
    totals.push({ label: 'Discount:', amount: -invoice.discount });
  }

  totals.forEach(({ label, amount }) => {
    page.drawText(label, {
      x: 420,
      y: currentY,
      size: 10,
      font: regularFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    page.drawText(`$${Math.abs(parseFloat(amount)).toFixed(2)}`, {
      x: 500,
      y: currentY,
      size: 10,
      font: regularFont,
    });

    currentY -= 18;
  });

  // Total line
  page.drawLine({
    start: { x: 420, y: currentY + 5 },
    end: { x: width - 50, y: currentY + 5 },
    thickness: 1,
    color: rgb(0.7, 0.7, 0.7),
  });

  currentY -= 15;

  page.drawText('TOTAL:', {
    x: 420,
    y: currentY,
    size: 14,
    font: boldFont,
  });

  page.drawText(`$${parseFloat(invoice.total).toFixed(2)}`, {
    x: 500,
    y: currentY,
    size: 16,
    font: boldFont,
    color: brandColor,
  });

  currentY -= 40;

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // NOTES & PAYMENT INFO
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  if (invoice.notes) {
    page.drawText('NOTES:', {
      x: 50,
      y: currentY,
      size: 10,
      font: boldFont,
      color: rgb(0.3, 0.3, 0.3),
    });

    currentY -= 15;

    const notesLines = wrapText(invoice.notes, 500, regularFont, 10);
    notesLines.forEach((line: string) => {
      page.drawText(line, {
        x: 50,
        y: currentY,
        size: 10,
        font: regularFont,
      });
      currentY -= 15;
    });

    currentY -= 10;
  }

  // Payment box
  page.drawRectangle({
    x: 50,
    y: currentY - 60,
    width: width - 100,
    height: 60,
    color: rgb(0.95, 0.97, 1),
    borderColor: brandColor,
    borderWidth: 2,
  });

  page.drawText('Payment Information', {
    x: 60,
    y: currentY - 25,
    size: 11,
    font: boldFont,
    color: brandColor,
  });

  page.drawText(`Please make payment by ${invoice.dueDate.toLocaleDateString()}`, {
    x: 60,
    y: currentY - 45,
    size: 9,
    font: regularFont,
  });

  // Footer
  page.drawText('Thank you for your business!', {
    x: width / 2 - 70,
    y: 30,
    size: 10,
    font: regularFont,
    color: rgb(0.5, 0.5, 0.5),
  });

  // Save and return
  const pdfBytes = await pdfDoc.save();
  logger.info(`Professional PDF generated for invoice ${invoice.invoiceNumber}`);

  return Buffer.from(pdfBytes);
}

/**
 * Minimal clean template
 */
async function generateMinimalTemplate(invoice: any, options: InvoicePdfOptions): Promise<Buffer> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]);

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let y = height - 60;

  // Simple header
  page.drawText('INVOICE', {
    x: 50,
    y,
    size: 24,
    font: boldFont,
  });

  page.drawText(invoice.invoiceNumber, {
    x: width - 150,
    y,
    size: 14,
    font,
  });

  y -= 50;

  // Customer
  page.drawText(invoice.customer.name, {
    x: 50,
    y,
    size: 12,
    font: boldFont,
  });

  y -= 20;

  page.drawText(`Date: ${invoice.serviceDate.toLocaleDateString()}`, {
    x: 50,
    y,
    size: 10,
    font,
  });

  y -= 40;

  // Line items
  invoice.lineItems.forEach((item: any) => {
    page.drawText(item.description, { x: 50, y, size: 10, font });
    page.drawText(`$${parseFloat(item.amount).toFixed(2)}`, { x: width - 100, y, size: 10, font: boldFont });
    y -= 20;
  });

  y -= 20;

  // Total
  page.drawText('TOTAL:', { x: 50, y, size: 14, font: boldFont });
  page.drawText(`$${parseFloat(invoice.total).toFixed(2)}`, { x: width - 100, y, size: 16, font: boldFont });

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

/**
 * Standard template (existing implementation)
 */
async function generateStandardTemplate(invoice: any, options: InvoicePdfOptions): Promise<Buffer> {
  // Use existing implementation from generator.ts
  return generateProfessionalTemplate(invoice, options);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// HELPER FUNCTIONS
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function getCompanyInfo(): CompanyInfo {
  return {
    name: process.env.COMPANY_NAME || 'AutoInvoice',
    address: process.env.COMPANY_ADDRESS || '123 Business St',
    phone: process.env.COMPANY_PHONE || '(555) 123-4567',
    email: process.env.COMPANY_EMAIL || 'billing@autoinvoice.app',
    website: process.env.COMPANY_WEBSITE || 'www.autoinvoice.app',
    taxId: process.env.COMPANY_TAX_ID,
  };
}

function drawCompanyInfo(page: any, font: any, info: CompanyInfo, x: number, y: number) {
  const lines = [
    info.name,
    info.address,
    info.phone,
    info.email,
    info.website,
  ];

  if (info.taxId) {
    lines.push(`Tax ID: ${info.taxId}`);
  }

  lines.forEach((line, i) => {
    if (line) {
      page.drawText(line, {
        x: x - 150,
        y: y - (i * 12),
        size: 9,
        font,
      });
    }
  });
}

function hexToRgb(hex: string) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (result) {
    return rgb(
      parseInt(result[1], 16) / 255,
      parseInt(result[2], 16) / 255,
      parseInt(result[3], 16) / 255
    );
  }
  return rgb(0.15, 0.39, 0.92); // Default blue
}

function wrapText(text: string, maxWidth: number, font: any, size: number): string[] {
  // Handle newlines first by splitting them
  const paragraphs = text.split('\n');
  const allLines: string[] = [];

  paragraphs.forEach((paragraph) => {
    // Skip empty paragraphs but preserve them as blank lines
    if (!paragraph.trim()) {
      allLines.push('');
      return;
    }

    const words = paragraph.split(' ');
    let currentLine = '';

    words.forEach((word) => {
      const testLine = currentLine + (currentLine ? ' ' : '') + word;
      // Only measure width if we have content
      if (testLine.trim() && font.widthOfTextAtSize(testLine.trim(), size) < maxWidth) {
        currentLine = testLine;
      } else {
        if (currentLine) allLines.push(currentLine);
        currentLine = word;
      }
    });

    if (currentLine) allLines.push(currentLine);
  });

  return allLines;
}

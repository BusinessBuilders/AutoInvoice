import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { prisma } from '../../utils/db';
import logger from '../../utils/logger';

export interface InvoicePdfOptions {
  invoiceId: string;
}

export async function generateInvoicePdf(options: InvoicePdfOptions): Promise<Buffer> {
  const { invoiceId } = options;

  logger.info(`Generating PDF for invoice: ${invoiceId}`);

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

  // Create PDF
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([612, 792]); // Letter size
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  const { width, height } = page.getSize();
  let y = height - 50;

  // Title
  page.drawText('INVOICE', {
    x: 50,
    y,
    size: 24,
    font: boldFont,
    color: rgb(0, 0, 0),
  });

  y -= 30;

  // Invoice number and date
  page.drawText(`Invoice #: ${invoice.invoiceNumber}`, {
    x: 50,
    y,
    size: 12,
    font,
  });

  page.drawText(`Date: ${invoice.issueDate.toLocaleDateString()}`, {
    x: 400,
    y,
    size: 12,
    font,
  });

  y -= 20;
  page.drawText(`Due Date: ${invoice.dueDate.toLocaleDateString()}`, {
    x: 400,
    y,
    size: 12,
    font,
  });

  y -= 40;

  // Customer info
  page.drawText('Bill To:', {
    x: 50,
    y,
    size: 12,
    font: boldFont,
  });

  y -= 20;
  page.drawText(invoice.customer.name, {
    x: 50,
    y,
    size: 12,
    font,
  });

  if (invoice.customer.email) {
    y -= 15;
    page.drawText(invoice.customer.email, {
      x: 50,
      y,
      size: 10,
      font,
    });
  }

  y -= 40;

  // Line items header
  page.drawText('Description', { x: 50, y, size: 12, font: boldFont });
  page.drawText('Qty', { x: 300, y, size: 12, font: boldFont });
  page.drawText('Rate', { x: 350, y, size: 12, font: boldFont });
  page.drawText('Amount', { x: 450, y, size: 12, font: boldFont });

  y -= 20;

  // Line items
  for (const item of invoice.lineItems) {
    page.drawText(item.description, { x: 50, y, size: 10, font });
    page.drawText(item.quantity.toString(), { x: 300, y, size: 10, font });
    page.drawText(`$${item.rate.toFixed(2)}`, { x: 350, y, size: 10, font });
    page.drawText(`$${item.amount.toFixed(2)}`, { x: 450, y, size: 10, font });
    y -= 20;
  }

  y -= 20;

  // Totals
  page.drawText(`Subtotal:`, { x: 350, y, size: 12, font: boldFont });
  page.drawText(`$${invoice.subtotal.toFixed(2)}`, { x: 450, y, size: 12, font });

  if (Number(invoice.taxAmount) > 0) {
    y -= 20;
    page.drawText(`Tax (${invoice.taxRate}%):`, { x: 350, y, size: 12, font });
    page.drawText(`$${invoice.taxAmount.toFixed(2)}`, { x: 450, y, size: 12, font });
  }

  if (Number(invoice.discount) > 0) {
    y -= 20;
    page.drawText(`Discount:`, { x: 350, y, size: 12, font });
    page.drawText(`-$${invoice.discount.toFixed(2)}`, { x: 450, y, size: 12, font });
  }

  y -= 20;
  page.drawText(`Total:`, { x: 350, y, size: 14, font: boldFont });
  page.drawText(`$${invoice.total.toFixed(2)}`, { x: 450, y, size: 14, font: boldFont });

  // Notes
  if (invoice.notes) {
    y -= 40;
    page.drawText('Notes:', { x: 50, y, size: 12, font: boldFont });
    y -= 15;
    page.drawText(invoice.notes, { x: 50, y, size: 10, font });
  }

  const pdfBytes = await pdfDoc.save();

  logger.info(`PDF generated successfully for invoice ${invoice.invoiceNumber}`);

  return Buffer.from(pdfBytes);
}

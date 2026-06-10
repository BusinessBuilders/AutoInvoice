import { Worker, Job } from 'bullmq';
import { connection, QueueName } from '../client';
import { prisma } from '../../../utils/db';
import logger from '../../../utils/logger';
import { generateInvoicePdf } from '../../pdf/professional-generator';
import * as fs from 'fs';
import * as path from 'path';

export interface PdfGenerationJob {
  invoiceId: string;
  template?: 'professional' | 'minimal' | 'standard';
}

export const pdfGenerationWorker = new Worker<PdfGenerationJob>(
  QueueName.PDF_GENERATION,
  async (job: Job<PdfGenerationJob>) => {
    const { invoiceId, template = 'professional' } = job.data;

    logger.info(`Processing PDF generation for invoice: ${invoiceId}`);

    try {
      // Fetch invoice data
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
          lineItems: {
            include: { service: true },
          },
        },
      });

      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      // Fetch user branding (single-user system, get first user)
      const user = await prisma.user.findFirst({
        select: {
          logoPath: true,
          brandColors: true,
          companyName: true,
          companyAddress: true,
          companyPhone: true,
          companyEmail: true,
          companyWebsite: true,
          companyTaxId: true,
        },
      });

      // Prepare branding options
      const uploadDir = process.env.UPLOAD_DIR || './uploads';
      const logoPath = user?.logoPath ? path.join(uploadDir, user.logoPath) : undefined;
      const brandColors = user?.brandColors as any;
      const primaryColor = brandColors?.primary || process.env.BRAND_COLOR || '#2563eb';

      // Generate PDF
      const pdfBuffer = await generateInvoicePdf({
        invoiceId,
        template,
        logoPath,
        brandColor: primaryColor,
        companyInfo: user ? {
          name: user.companyName || process.env.COMPANY_NAME || 'AutoInvoice',
          address: user.companyAddress || process.env.COMPANY_ADDRESS,
          phone: user.companyPhone || process.env.COMPANY_PHONE,
          email: user.companyEmail || process.env.COMPANY_EMAIL,
          website: user.companyWebsite || process.env.COMPANY_WEBSITE,
          taxId: user.companyTaxId || process.env.COMPANY_TAX_ID,
        } : undefined,
      });

      // Save PDF to disk
      const pdfDir = process.env.PDF_OUTPUT_DIR || './invoices';
      if (!fs.existsSync(pdfDir)) {
        fs.mkdirSync(pdfDir, { recursive: true });
      }

      const filename = `${invoice.invoiceNumber}.pdf`;
      const pdfPath = path.join(pdfDir, filename);
      fs.writeFileSync(pdfPath, pdfBuffer);

      // Update invoice with PDF path
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: { pdfUrl: pdfPath },
      });

      logger.info(`PDF generated successfully: ${pdfPath}`);

      return { success: true, invoiceId, pdfPath };
    } catch (error) {
      logger.error(`PDF generation failed for invoice ${invoiceId}:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

pdfGenerationWorker.on('completed', (job) => {
  logger.info(`PDF generation completed for job ${job.id}`);
});

pdfGenerationWorker.on('failed', (job, err) => {
  logger.error(`PDF generation failed for job ${job?.id}:`, err);
});

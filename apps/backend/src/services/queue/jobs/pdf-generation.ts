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

      // Generate PDF
      const pdfBuffer = await generateInvoicePdf({
        invoiceId,
        template,
        logoPath: process.env.COMPANY_LOGO_PATH,
        brandColor: process.env.BRAND_COLOR,
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

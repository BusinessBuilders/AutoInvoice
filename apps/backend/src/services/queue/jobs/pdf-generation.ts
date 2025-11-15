import { Worker, Job } from 'bullmq';
import { connection, QueueName } from '../client';
import { prisma } from '../../../utils/db';
import logger from '../../../utils/logger';

export interface PdfGenerationJob {
  invoiceId: string;
}

export const pdfGenerationWorker = new Worker<PdfGenerationJob>(
  QueueName.PDF_GENERATION,
  async (job: Job<PdfGenerationJob>) => {
    const { invoiceId } = job.data;

    logger.info(`Processing PDF generation for invoice: ${invoiceId}`);

    try {
      // Fetch invoice data
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
          lineItems: true,
        },
      });

      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      // TODO: Implement PDF generation using @react-pdf/renderer
      // For now, just log
      logger.info(`PDF would be generated for invoice ${invoice.invoiceNumber}`);

      // Update invoice with PDF path/data
      // await prisma.invoice.update({
      //   where: { id: invoiceId },
      //   data: { pdfUrl: pdfPath },
      // });

      return { success: true, invoiceId };
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

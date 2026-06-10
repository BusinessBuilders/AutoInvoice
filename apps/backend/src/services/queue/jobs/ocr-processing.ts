import { Worker, Job } from 'bullmq';
import { connection, QueueName } from '../client';
import { prisma } from '../../../utils/db';
import { aiRouter } from '../../ai';
import logger from '../../../utils/logger';

export interface OcrProcessingJob {
  receiptId: string;
  imageBuffer: Buffer;
}

export const ocrProcessingWorker = new Worker<OcrProcessingJob>(
  QueueName.OCR_PROCESSING,
  async (job: Job<OcrProcessingJob>) => {
    const { receiptId, imageBuffer } = job.data;

    logger.info(`Processing OCR for receipt: ${receiptId}`);

    try {
      // Use AI router to extract receipt data
      const receiptData = await aiRouter.extractReceipt(imageBuffer);

      // Update receipt with extracted data
      await prisma.receipt.update({
        where: { id: receiptId },
        data: {
          vendor: receiptData.vendor,
          amount: receiptData.amount,
          date: new Date(receiptData.date),
          category: receiptData.category,
          items: receiptData.items,
          ocrData: receiptData,
          processed: true,
          confidence: receiptData.confidence,
        },
      });

      logger.info(`OCR completed for receipt ${receiptId}`, { confidence: receiptData.confidence });

      return { success: true, receiptId, receiptData };
    } catch (error) {
      logger.error(`OCR processing failed for receipt ${receiptId}:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 3,
  }
);

ocrProcessingWorker.on('completed', (job) => {
  logger.info(`OCR processing completed for job ${job.id}`);
});

ocrProcessingWorker.on('failed', (job, err) => {
  logger.error(`OCR processing failed for job ${job?.id}:`, err);
});

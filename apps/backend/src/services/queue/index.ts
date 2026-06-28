import { queues, QueueName } from './client';
import { pdfGenerationWorker } from './jobs/pdf-generation';
import { emailSendingWorker } from './jobs/email-sending';
import { ocrProcessingWorker } from './jobs/ocr-processing';
import { paymentReminderWorker } from './jobs/payment-reminders';
import { automationsWorker, scheduleAutomations } from './jobs/automations';
import logger from '../../utils/logger';

// Initialize all workers
export function initializeWorkers() {
  logger.info('🔄 Initializing BullMQ workers...');

  // Workers are already initialized in their respective files
  // This function serves as a central initialization point

  // Business OS automations: hourly repeatable sweep (spec §3.10)
  scheduleAutomations().catch((err) =>
    logger.error('Failed to schedule automations sweep', { error: err?.message })
  );

  logger.info('✅ All BullMQ workers initialized');
}

// Export queues and workers for use in other parts of the application
export {
  queues,
  QueueName,
  pdfGenerationWorker,
  emailSendingWorker,
  ocrProcessingWorker,
  paymentReminderWorker,
};

// Helper functions to add jobs to queues
export const queueHelpers = {
  async generatePdf(invoiceId: string) {
    await queues.pdfGeneration.add('generate', { invoiceId });
    logger.info(`PDF generation job queued for invoice ${invoiceId}`);
  },

  async sendEmail(data: {
    invoiceId: string;
    recipientEmail: string;
    subject: string;
    body: string;
  }) {
    await queues.emailSending.add('send', data);
    logger.info(`Email sending job queued for invoice ${data.invoiceId}`);
  },

  async processOcr(receiptId: string, imageBuffer: Buffer) {
    await queues.ocrProcessing.add('process', { receiptId, imageBuffer });
    logger.info(`OCR processing job queued for receipt ${receiptId}`);
  },

  async schedulePaymentReminder(invoiceId: string, delay?: number) {
    await queues.paymentReminders.add(
      'remind',
      { invoiceId },
      { delay: delay || 24 * 60 * 60 * 1000 } // Default 24 hours
    );
    logger.info(`Payment reminder scheduled for invoice ${invoiceId}`);
  },
};

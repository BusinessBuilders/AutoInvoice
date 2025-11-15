import { Worker, Job } from 'bullmq';
import { connection, QueueName } from '../client';
import { prisma } from '../../../utils/db';
import logger from '../../../utils/logger';

export interface EmailSendingJob {
  invoiceId: string;
  recipientEmail: string;
  subject: string;
  body: string;
}

export const emailSendingWorker = new Worker<EmailSendingJob>(
  QueueName.EMAIL_SENDING,
  async (job: Job<EmailSendingJob>) => {
    const { invoiceId, recipientEmail, subject, body } = job.data;

    logger.info(`Processing email sending for invoice: ${invoiceId} to ${recipientEmail}`);

    try {
      // Send email using Gmail API
      const { sendInvoiceEmail } = await import('../../google/gmail');
      await sendInvoiceEmail(invoiceId);

      // Update invoice status
      await prisma.invoice.update({
        where: { id: invoiceId },
        data: {
          sentAt: new Date(),
          status: 'SENT',
        },
      });

      logger.info(`Email sent successfully to ${recipientEmail}`);

      return { success: true, invoiceId, recipientEmail };
    } catch (error) {
      logger.error(`Email sending failed for invoice ${invoiceId}:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 10,
  }
);

emailSendingWorker.on('completed', (job) => {
  logger.info(`Email sending completed for job ${job.id}`);
});

emailSendingWorker.on('failed', (job, err) => {
  logger.error(`Email sending failed for job ${job?.id}:`, err);
});

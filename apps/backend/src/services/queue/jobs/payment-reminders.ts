import { Worker, Job } from 'bullmq';
import { connection, QueueName } from '../client';
import { prisma } from '../../../utils/db';
import logger from '../../../utils/logger';

export interface PaymentReminderJob {
  invoiceId: string;
}

export const paymentReminderWorker = new Worker<PaymentReminderJob>(
  QueueName.PAYMENT_REMINDERS,
  async (job: Job<PaymentReminderJob>) => {
    const { invoiceId } = job.data;

    logger.info(`Processing payment reminder for invoice: ${invoiceId}`);

    try {
      const invoice = await prisma.invoice.findUnique({
        where: { id: invoiceId },
        include: {
          customer: true,
        },
      });

      if (!invoice) {
        throw new Error(`Invoice ${invoiceId} not found`);
      }

      // Check if invoice is overdue
      const now = new Date();
      const isOverdue = invoice.dueDate < now && invoice.status !== 'PAID';

      if (isOverdue) {
        // Update status to OVERDUE
        await prisma.invoice.update({
          where: { id: invoiceId },
          data: { status: 'OVERDUE' },
        });

        // TODO: Send reminder email/SMS
        logger.info(`Payment reminder sent for invoice ${invoice.invoiceNumber}`);
      }

      return { success: true, invoiceId, isOverdue };
    } catch (error) {
      logger.error(`Payment reminder failed for invoice ${invoiceId}:`, error);
      throw error;
    }
  },
  {
    connection,
    concurrency: 5,
  }
);

paymentReminderWorker.on('completed', (job) => {
  logger.info(`Payment reminder completed for job ${job.id}`);
});

paymentReminderWorker.on('failed', (job, err) => {
  logger.error(`Payment reminder failed for job ${job?.id}:`, err);
});

import { Queue, Worker, QueueEvents } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../../utils/env';
import logger from '../../utils/logger';

// Redis connection
const connection = new Redis(env.REDIS_URL, {
  maxRetriesPerRequest: null,
});

connection.on('error', (error) => {
  logger.error('Redis connection error:', error);
});

connection.on('connect', () => {
  logger.info('✅ Connected to Redis');
});

export { connection };

// Queue names
export enum QueueName {
  PDF_GENERATION = 'pdf-generation',
  EMAIL_SENDING = 'email-sending',
  OCR_PROCESSING = 'ocr-processing',
  PAYMENT_REMINDERS = 'payment-reminders',
  DATA_BACKUP = 'data-backup',
}

// Create queues
export const queues = {
  pdfGeneration: new Queue(QueueName.PDF_GENERATION, { connection }),
  emailSending: new Queue(QueueName.EMAIL_SENDING, { connection }),
  ocrProcessing: new Queue(QueueName.OCR_PROCESSING, { connection }),
  paymentReminders: new Queue(QueueName.PAYMENT_REMINDERS, { connection }),
  dataBackup: new Queue(QueueName.DATA_BACKUP, { connection }),
};

logger.info('✅ BullMQ queues initialized');

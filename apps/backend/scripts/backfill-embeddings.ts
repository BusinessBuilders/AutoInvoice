import { prisma } from '../src/utils/db';
import { generateServiceEmbedding, generateCustomerEmbedding } from '../src/services/embeddings';
import logger from '../src/utils/logger';
import { Prisma } from '@prisma/client';

/**
 * Backfill script to generate embeddings for existing Services and Customers
 * Run with: npx tsx scripts/backfill-embeddings.ts
 */

async function backfillServiceEmbeddings() {
  logger.info('Starting service embeddings backfill...');

  const services = await prisma.service.findMany({
    where: {
      embedding: null,
    },
  });

  logger.info(`Found ${services.length} services without embeddings`);

  let successCount = 0;
  let failCount = 0;

  for (const service of services) {
    try {
      const embedding = await generateServiceEmbedding({
        name: service.name,
        code: service.code,
        description: service.description,
        category: service.category,
      });

      if (embedding) {
        await prisma.$executeRaw`
          UPDATE "Service"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${service.id}
        `;

        successCount++;
        logger.info(`Generated embedding for service: ${service.name} (${service.code})`);
      } else {
        failCount++;
        logger.warn(`Failed to generate embedding for service: ${service.name} (${service.code})`);
      }
    } catch (error: any) {
      failCount++;
      logger.error(`Error processing service ${service.id}:`, error.message);
    }
  }

  logger.info(`Service embeddings backfill complete: ${successCount} success, ${failCount} failed`);
}

async function backfillCustomerEmbeddings() {
  logger.info('Starting customer embeddings backfill...');

  const customers = await prisma.customer.findMany({
    where: {
      embedding: null,
    },
  });

  logger.info(`Found ${customers.length} customers without embeddings`);

  let successCount = 0;
  let failCount = 0;

  for (const customer of customers) {
    try {
      const embedding = await generateCustomerEmbedding({
        name: customer.name,
        nickname: customer.nickname,
        company: customer.company,
      });

      if (embedding) {
        await prisma.$executeRaw`
          UPDATE "Customer"
          SET embedding = ARRAY[${Prisma.join(embedding)}]::vector(1536)
          WHERE id = ${customer.id}
        `;

        successCount++;
        logger.info(`Generated embedding for customer: ${customer.name}`);
      } else {
        failCount++;
        logger.warn(`Failed to generate embedding for customer: ${customer.name}`);
      }
    } catch (error: any) {
      failCount++;
      logger.error(`Error processing customer ${customer.id}:`, error.message);
    }
  }

  logger.info(`Customer embeddings backfill complete: ${successCount} success, ${failCount} failed`);
}

async function main() {
  try {
    logger.info('=== Starting Embeddings Backfill ===');

    await backfillServiceEmbeddings();
    await backfillCustomerEmbeddings();

    logger.info('=== Embeddings Backfill Complete ===');
  } catch (error: any) {
    logger.error('Backfill failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();

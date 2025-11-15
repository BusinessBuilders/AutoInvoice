import app from './server';
import { env } from './utils/env';
import { prisma, enableExtensions } from './utils/db';
import { initializeWorkers } from './services/queue';
import logger from './utils/logger';

const PORT = parseInt(env.PORT);

async function main() {
  try {
    // Enable PostgreSQL extensions
    await enableExtensions();

    // Test database connection
    await prisma.$connect();
    logger.info('✅ Connected to PostgreSQL');

    // Initialize BullMQ workers
    initializeWorkers();

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 Server running on http://0.0.0.0:${PORT}`);
      logger.info(`📡 tRPC endpoint: http://0.0.0.0:${PORT}/trpc`);
      logger.info(`🏥 Health check: http://0.0.0.0:${PORT}/health`);
    });
  } catch (error) {
    logger.error('Failed to start server:', error);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  logger.info('Shutting down gracefully...');
  await prisma.$disconnect();
  process.exit(0);
});

main();

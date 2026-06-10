import { PrismaClient, Prisma } from '@prisma/client';
import { prisma } from './prisma';

/**
 * Database utility functions for backups, migrations, and maintenance
 */

/**
 * Soft delete helper
 * Adds deletedAt timestamp instead of hard delete
 */
export async function softDelete<T extends { deletedAt?: Date | null }>(
  model: any,
  where: any
): Promise<T> {
  return await model.update({
    where,
    data: { deletedAt: new Date() },
  });
}

/**
 * Restore soft-deleted record
 */
export async function restoreSoftDeleted<T>(model: any, where: any): Promise<T> {
  return await model.update({
    where,
    data: { deletedAt: null },
  });
}

/**
 * Permanently delete soft-deleted records older than X days
 */
export async function permanentlyDeleteOld(days: number = 90): Promise<number> {
  // TODO: Implement soft delete functionality
  // Requires adding deletedAt DateTime? field to Invoice, Lead, Customer models in schema.prisma

  /*
  const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  let totalDeleted = 0;

  // Delete old invoices
  const deletedInvoices = await prisma.invoice.deleteMany({
    where: {
      deletedAt: { lte: cutoffDate, not: null },
    },
  });
  totalDeleted += deletedInvoices.count;

  // Delete old leads
  const deletedLeads = await prisma.lead.deleteMany({
    where: {
      deletedAt: { lte: cutoffDate, not: null },
    },
  });
  totalDeleted += deletedLeads.count;

  // Delete old customers
  const deletedCustomers = await prisma.customer.deleteMany({
    where: {
      deletedAt: { lte: cutoffDate, not: null },
    },
  });
  totalDeleted += deletedCustomers.count;

  return totalDeleted;
  */

  return 0; // Placeholder until soft delete is implemented
}

/**
 * Database health check
 */
export async function checkDatabaseHealth(): Promise<{
  healthy: boolean;
  latency: number;
  error?: string;
}> {
  const start = Date.now();

  try {
    await prisma.$queryRaw`SELECT 1`;
    const latency = Date.now() - start;

    return {
      healthy: true,
      latency,
    };
  } catch (error) {
    return {
      healthy: false,
      latency: Date.now() - start,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Get database statistics
 */
export async function getDatabaseStats(): Promise<{
  users: number;
  customers: number;
  leads: number;
  invoices: number;
  tasks: number;
  totalRecords: number;
}> {
  const [users, customers, leads, invoices, tasks] = await Promise.all([
    prisma.user.count(),
    prisma.customer.count(),
    prisma.lead.count(),
    prisma.invoice.count(),
    prisma.task.count(),
  ]);

  return {
    users,
    customers,
    leads,
    invoices,
    tasks,
    totalRecords: users + customers + leads + invoices + tasks,
  };
}

/**
 * Vacuum analyze database (PostgreSQL optimization)
 */
export async function optimizeDatabase(): Promise<void> {
  try {
    // Analyze all tables for query optimization
    await prisma.$executeRawUnsafe('VACUUM ANALYZE');
    console.log('✅ Database optimized successfully');
  } catch (error) {
    console.error('❌ Database optimization failed:', error);
    throw error;
  }
}

/**
 * Create database backup (PostgreSQL dump)
 */
export async function createBackup(): Promise<string> {
  const { execSync } = require('child_process');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupFile = `backup-${timestamp}.sql`;

  try {
    const databaseUrl = process.env.DATABASE_URL;
    if (!databaseUrl) {
      throw new Error('DATABASE_URL not set');
    }

    const command = `pg_dump "${databaseUrl}" > /backups/${backupFile}`;
    execSync(command);

    console.log(`✅ Backup created: ${backupFile}`);
    return backupFile;
  } catch (error) {
    console.error('❌ Backup failed:', error);
    throw error;
  }
}

/**
 * Run pending migrations
 */
export async function runMigrations(): Promise<void> {
  const { execSync } = require('child_process');

  try {
    execSync('npx prisma migrate deploy', { stdio: 'inherit' });
    console.log('✅ Migrations completed successfully');
  } catch (error) {
    console.error('❌ Migration failed:', error);
    throw error;
  }
}

/**
 * Get slow queries (requires pg_stat_statements extension)
 */
export async function getSlowQueries(limit: number = 10): Promise<any[]> {
  try {
    const slowQueries = await prisma.$queryRaw`
      SELECT
        query,
        calls,
        total_exec_time,
        mean_exec_time,
        max_exec_time
      FROM pg_stat_statements
      WHERE query NOT LIKE '%pg_stat_statements%'
      ORDER BY mean_exec_time DESC
      LIMIT ${limit}
    `;

    return slowQueries as any[];
  } catch (error) {
    console.error('pg_stat_statements extension not enabled');
    return [];
  }
}

/**
 * Transaction helper with retry logic
 */
export async function withTransaction<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
  maxRetries: number = 3
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await prisma.$transaction(fn, {
        maxWait: 5000, // 5 seconds
        timeout: 10000, // 10 seconds
        isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
      });
    } catch (error) {
      lastError = error as Error;

      // Only retry on deadlock or timeout errors
      if (
        error instanceof Error &&
        (error.message.includes('deadlock') || error.message.includes('timeout'))
      ) {
        if (attempt < maxRetries) {
          // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 100));
          continue;
        }
      }

      throw error;
    }
  }

  throw lastError || new Error('Transaction failed after retries');
}

/**
 * Batch insert helper (optimized for large datasets)
 */
export async function batchInsert<T>(
  model: any,
  data: T[],
  batchSize: number = 1000
): Promise<number> {
  let inserted = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const result = await model.createMany({
      data: batch,
      skipDuplicates: true,
    });
    inserted += result.count;
  }

  return inserted;
}

/**
 * Connection pool stats
 */
export async function getConnectionPoolStats(): Promise<{
  active: number;
  idle: number;
  total: number;
}> {
  try {
    const stats = await prisma.$queryRaw<Array<{ count: number; state: string }>>`
      SELECT count(*), state
      FROM pg_stat_activity
      WHERE datname = current_database()
      GROUP BY state
    `;

    const active = stats.find(s => s.state === 'active')?.count || 0;
    const idle = stats.find(s => s.state === 'idle')?.count || 0;

    return {
      active: Number(active),
      idle: Number(idle),
      total: Number(active) + Number(idle),
    };
  } catch (error) {
    return { active: 0, idle: 0, total: 0 };
  }
}

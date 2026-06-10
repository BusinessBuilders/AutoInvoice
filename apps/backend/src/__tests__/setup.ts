import * as fs from 'fs';
import * as path from 'path';
import { PrismaClient } from '@prisma/client';

// SAFETY GUARD: tests run ONLY against the testcontainers database started by
// global-setup.ts. If the URL file is missing we refuse to run rather than
// fall back to whatever DATABASE_URL happens to be in the environment — the
// old harness could bind to the real database and wipe it in beforeEach.
const TEST_DB_URL_FILE = path.join(__dirname, '..', '..', '.jest-test-db-url');
if (!fs.existsSync(TEST_DB_URL_FILE)) {
  throw new Error(
    'Test database not initialized (missing .jest-test-db-url). ' +
      'Refusing to run tests against ambient DATABASE_URL.'
  );
}
const testDbUrl = fs.readFileSync(TEST_DB_URL_FILE, 'utf8').trim();
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = testDbUrl;

// URL passed explicitly so this client can never bind to an ambient database.
const prisma = new PrismaClient({
  datasources: { db: { url: testDbUrl } },
});

afterAll(async () => {
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean container database before each test (FK-safe order: children first).
  // Business OS tables (optional chaining: models exist once Phase 1 schema lands)
  await (prisma as any).revenueEvent?.deleteMany?.();
  await (prisma as any).activity?.deleteMany?.();
  await (prisma as any).subscription?.deleteMany?.();
  await (prisma as any).orderItem?.deleteMany?.();
  await (prisma as any).order?.deleteMany?.();
  await (prisma as any).product?.deleteMany?.();
  await (prisma as any).ingestSource?.deleteMany?.();
  await (prisma as any).jobPhoto?.deleteMany?.();
  await (prisma as any).jobAssignment?.deleteMany?.();
  await (prisma as any).job?.deleteMany?.();
  await (prisma as any).quoteLineItem?.deleteMany?.();
  await (prisma as any).quote?.deleteMany?.();

  // Accounting tables
  await prisma.journalLine.deleteMany();
  await prisma.journalEntry.deleteMany();
  await prisma.expenseCategory.deleteMany();
  await prisma.account.deleteMany();

  // Other tables
  await prisma.refreshToken.deleteMany();
  await prisma.passwordReset.deleteMany();
  await prisma.task.deleteMany();
  await prisma.lead.deleteMany();
  await prisma.receipt.deleteMany();
  await prisma.check.deleteMany();
  await prisma.invoice.deleteMany();
  await prisma.customer.deleteMany();
  await (prisma as any).company?.deleteMany?.();
  await prisma.user.deleteMany();
});

// Mock functions
global.console = {
  ...console,
  error: jest.fn(), // Silence error logs in tests
  warn: jest.fn(),
};

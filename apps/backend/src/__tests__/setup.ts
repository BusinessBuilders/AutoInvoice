import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient();

beforeAll(async () => {
  // Set test environment
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test';

  // Run migrations
  execSync('npx prisma migrate deploy', { stdio: 'inherit' });
});

afterAll(async () => {
  // Cleanup
  await prisma.$disconnect();
});

beforeEach(async () => {
  // Clean database before each test
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
  await prisma.user.deleteMany();
});

// Mock functions
global.console = {
  ...console,
  error: jest.fn(), // Silence error logs in tests
  warn: jest.fn(),
};

import { PrismaClient, JournalStatus, JournalSourceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEED DEFAULT CHART OF ACCOUNTS
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('💰 Seeding Chart of Accounts...');

  const accountsToSeed = [
    // Assets
    { code: '1000', name: 'Cash', accountType: 'ASSET', balanceType: 'DEBIT', systemAccount: true },
    { code: '1010', name: 'Checking Account', accountType: 'ASSET', balanceType: 'DEBIT', systemAccount: true },
    { code: '1100', name: 'Accounts Receivable', accountType: 'ASSET', balanceType: 'DEBIT', systemAccount: true },
    // Liabilities
    { code: '2000', name: 'Accounts Payable', accountType: 'LIABILITY', balanceType: 'CREDIT', systemAccount: true },
    { code: '2200', name: 'Sales Tax Payable', accountType: 'LIABILITY', balanceType: 'CREDIT', systemAccount: true },
    // Equity
    { code: '3000', name: "Owner's Equity", accountType: 'EQUITY', balanceType: 'CREDIT', systemAccount: true },
    { code: '3100', name: 'Retained Earnings', accountType: 'EQUITY', balanceType: 'CREDIT', systemAccount: true },
    // Revenue
    { code: '4000', name: 'Service Revenue', accountType: 'REVENUE', balanceType: 'CREDIT', systemAccount: true },
    { code: '4100', name: 'Materials Revenue', accountType: 'REVENUE', balanceType: 'CREDIT', systemAccount: false },
    // Expenses
    { code: '5000', name: 'Materials Cost', accountType: 'EXPENSE', balanceType: 'DEBIT', systemAccount: false },
    { code: '6000', name: 'Advertising', accountType: 'EXPENSE', balanceType: 'DEBIT', systemAccount: false },
    { code: '6100', name: 'Auto & Truck', accountType: 'EXPENSE', balanceType: 'DEBIT', systemAccount: false },
    { code: '6400', name: 'Fuel', accountType: 'EXPENSE', balanceType: 'DEBIT', systemAccount: false },
    { code: '6600', name: 'Office Supplies', accountType: 'EXPENSE', balanceType: 'DEBIT', systemAccount: false },
  ] as const;

  for (const account of accountsToSeed) {
    await prisma.account.upsert({
      where: { code: account.code },
      update: {},
      create: {
        code: account.code,
        name: account.name,
        accountType: account.accountType,
        balanceType: account.balanceType,
        systemAccount: account.systemAccount,
        active: true,
        allowManualEntries: true,
        balance: 0,
      },
    });
  }

  console.log(`✅ Seeded ${accountsToSeed.length} accounts in Chart of Accounts`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEED SERVICES
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('🛠️  Seeding services...');

  // Get first user ID for service ownership
  const firstUser = await prisma.user.findFirst();
  const userId = firstUser?.id || 'system';

  const services = await Promise.all([
    prisma.service.upsert({
      where: { userId_code: { userId, code: 'LAWN_MOW' } },
      update: {},
      create: {
        userId,
        code: 'LAWN_MOW',
        name: 'Lawn Mowing',
        category: 'Lawn Care',
        description: 'Standard lawn mowing service',
        basePrice: 50.00,
        priceUnit: 'visit',
      },
    }),
    prisma.service.upsert({
      where: { userId_code: { userId, code: 'LAWN_EDGE' } },
      update: {},
      create: {
        userId,
        code: 'LAWN_EDGE',
        name: 'Lawn Edging',
        category: 'Lawn Care',
        description: 'Edge trimming around walkways and driveways',
        basePrice: 25.00,
        priceUnit: 'visit',
      },
    }),
    prisma.service.upsert({
      where: { userId_code: { userId, code: 'LAWN_FERT' } },
      update: {},
      create: {
        userId,
        code: 'LAWN_FERT',
        name: 'Fertilization',
        category: 'Lawn Care',
        description: 'Lawn fertilization treatment',
        basePrice: 75.00,
        priceUnit: 'treatment',
      },
    }),
    prisma.service.upsert({
      where: { userId_code: { userId, code: 'TREE_TRIM' } },
      update: {},
      create: {
        userId,
        code: 'TREE_TRIM',
        name: 'Tree Trimming',
        category: 'Tree Care',
        description: 'Professional tree trimming service',
        basePrice: 150.00,
        priceUnit: 'hour',
      },
    }),
  ]);

  console.log(`✅ Created ${services.length} services`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEED CUSTOMER
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('👤 Seeding customers...');

  const customer = await prisma.customer.upsert({
    where: { email: 'john@example.com' },
    update: {},
    create: {
      name: 'John Smith',
      email: 'john@example.com',
      phone: '+1234567890',
      company: 'Smith Residence',
      nickname: ['John', 'Johnny', 'the Smith house'],
      addressLine1: '123 Main Street',
      city: 'Springfield',
      state: 'IL',
      zipCode: '62701',
      defaultRate: 50.00,
      paymentTerms: 'NET30',
      tags: ['residential', 'weekly'],
    },
  });

  console.log(`✅ Created customer: ${customer.name}`);

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEED SAMPLE JOURNAL ENTRIES (for P&L reporting)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('📊 Seeding sample journal entries for demo...');

  // Helper to get account ID by code
  const getAccountId = async (code: string) => {
    const account = await prisma.account.findUnique({ where: { code } });
    if (!account) throw new Error(`Account ${code} not found`);
    return account.id;
  };

  const now = new Date();
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const twentyDaysAgo = new Date(now.getTime() - 20 * 24 * 60 * 60 * 1000);
  const fifteenDaysAgo = new Date(now.getTime() - 15 * 24 * 60 * 60 * 1000);
  const tenDaysAgo = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000);
  const fiveDaysAgo = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000);

  // Entry 1: Invoice Revenue Recognition (DR AR, CR Service Revenue)
  await prisma.journalEntry.create({
    data: {
      entryNumber: 'JE-SEED-001',
      entryDate: thirtyDaysAgo,
      status: JournalStatus.POSTED,
      sourceType: JournalSourceType.MANUAL,
      description: 'Invoice #INV-001 - Lawn mowing service',
      postedAt: thirtyDaysAgo,
      postedBy: userId,
      lines: {
        create: [
          {
            accountId: await getAccountId('1100'), // AR
            debit: 250.00,
            credit: 0,
            description: 'Billed customer for lawn services',
            customerId: customer.id,
          },
          {
            accountId: await getAccountId('4000'), // Service Revenue
            debit: 0,
            credit: 250.00,
            description: 'Lawn mowing revenue',
          },
        ],
      },
    },
  });

  // Entry 2: Invoice Payment (DR Cash, CR AR)
  await prisma.journalEntry.create({
    data: {
      entryNumber: 'JE-SEED-002',
      entryDate: twentyDaysAgo,
      status: JournalStatus.POSTED,
      sourceType: JournalSourceType.MANUAL,
      description: 'Payment received for Invoice #INV-001',
      referenceNumber: 'CHECK-1234',
      postedAt: twentyDaysAgo,
      postedBy: userId,
      lines: {
        create: [
          {
            accountId: await getAccountId('1010'), // Checking
            debit: 250.00,
            credit: 0,
            description: 'Check received',
            customerId: customer.id,
          },
          {
            accountId: await getAccountId('1100'), // AR
            debit: 0,
            credit: 250.00,
            description: 'Cleared outstanding invoice',
            customerId: customer.id,
          },
        ],
      },
    },
  });

  // Entry 3: Materials Expense (DR Materials Cost, CR Cash)
  await prisma.journalEntry.create({
    data: {
      entryNumber: 'JE-SEED-003',
      entryDate: fifteenDaysAgo,
      status: JournalStatus.POSTED,
      sourceType: JournalSourceType.RECEIPT,
      description: 'Purchased fertilizer and supplies',
      referenceNumber: 'RECEIPT-001',
      postedAt: fifteenDaysAgo,
      postedBy: userId,
      lines: {
        create: [
          {
            accountId: await getAccountId('5000'), // Materials Cost
            debit: 125.50,
            credit: 0,
            description: 'Fertilizer purchase at Home Depot',
          },
          {
            accountId: await getAccountId('1010'), // Checking
            debit: 0,
            credit: 125.50,
            description: 'Debit card payment',
          },
        ],
      },
    },
  });

  // Entry 4: Fuel Expense (DR Fuel, CR Cash)
  await prisma.journalEntry.create({
    data: {
      entryNumber: 'JE-SEED-004',
      entryDate: tenDaysAgo,
      status: JournalStatus.POSTED,
      sourceType: JournalSourceType.RECEIPT,
      description: 'Fuel for truck and equipment',
      referenceNumber: 'RECEIPT-002',
      postedAt: tenDaysAgo,
      postedBy: userId,
      lines: {
        create: [
          {
            accountId: await getAccountId('6400'), // Fuel
            debit: 85.00,
            credit: 0,
            description: 'Gas station fill-up',
          },
          {
            accountId: await getAccountId('1010'), // Checking
            debit: 0,
            credit: 85.00,
            description: 'Debit card payment',
          },
        ],
      },
    },
  });

  // Entry 5: Service Revenue #2 (DR AR, CR Service Revenue)
  await prisma.journalEntry.create({
    data: {
      entryNumber: 'JE-SEED-005',
      entryDate: fiveDaysAgo,
      status: JournalStatus.POSTED,
      sourceType: JournalSourceType.INVOICE,
      description: 'Invoice #INV-002 - Tree trimming service',
      postedAt: fiveDaysAgo,
      postedBy: userId,
      lines: {
        create: [
          {
            accountId: await getAccountId('1100'), // AR
            debit: 350.00,
            credit: 0,
            description: 'Billed for tree trimming',
            customerId: customer.id,
          },
          {
            accountId: await getAccountId('4000'), // Service Revenue
            debit: 0,
            credit: 350.00,
            description: 'Tree trimming revenue',
          },
        ],
      },
    },
  });

  // Entry 6: Office Supplies Expense (DR Office Supplies, CR Cash)
  await prisma.journalEntry.create({
    data: {
      entryNumber: 'JE-SEED-006',
      entryDate: fiveDaysAgo,
      status: JournalStatus.POSTED,
      sourceType: JournalSourceType.RECEIPT,
      description: 'Office supplies purchase',
      referenceNumber: 'RECEIPT-003',
      postedAt: fiveDaysAgo,
      postedBy: userId,
      lines: {
        create: [
          {
            accountId: await getAccountId('6600'), // Office Supplies
            debit: 42.75,
            credit: 0,
            description: 'Pens, paper, and invoice books',
          },
          {
            accountId: await getAccountId('1010'), // Checking
            debit: 0,
            credit: 42.75,
            description: 'Credit card payment',
          },
        ],
      },
    },
  });

  // Entry 7: Auto & Truck Expense (DR Auto & Truck, CR Cash)
  await prisma.journalEntry.create({
    data: {
      entryNumber: 'JE-SEED-007',
      entryDate: now,
      status: JournalStatus.POSTED,
      sourceType: JournalSourceType.RECEIPT,
      description: 'Truck maintenance and oil change',
      referenceNumber: 'RECEIPT-004',
      postedAt: now,
      postedBy: userId,
      lines: {
        create: [
          {
            accountId: await getAccountId('6100'), // Auto & Truck
            debit: 95.00,
            credit: 0,
            description: 'Oil change and filter at Jiffy Lube',
          },
          {
            accountId: await getAccountId('1010'), // Checking
            debit: 0,
            credit: 95.00,
            description: 'Debit card payment',
          },
        ],
      },
    },
  });

  console.log('✅ Created 7 sample journal entries (revenue & expenses)');

  console.log('\n🎉 Database seeded successfully!');
  console.log('\n📈 Sample data created:');
  console.log(`   - ${accountsToSeed.length} accounts in Chart of Accounts`);
  console.log(`   - ${services.length} services`);
  console.log(`   - 1 customer`);
  console.log(`   - 7 posted journal entries`);
  console.log(`\n💡 You can now test the P&L report with data from the last 30 days!`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

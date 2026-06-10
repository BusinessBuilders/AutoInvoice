import { PrismaClient, JournalStatus, JournalSourceType } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Seeding database...');

  // Get or create a default user for seeding
  let firstUser = await prisma.user.findFirst();
  if (!firstUser) {
    console.log('👤 Creating default user for seed data...');
    firstUser = await prisma.user.create({
      data: {
        email: 'admin@dovanfarms.com',
        password: '$2b$10$placeholder_hash', // Should be updated with real bcrypt hash
        name: 'Admin',
        role: 'OWNER',
        active: true,
      },
    });
  }
  const userId = firstUser.id;

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
      where: { userId_code: { userId, code: account.code } },
      update: {},
      create: {
        userId,
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
    const account = await prisma.account.findUnique({ where: { userId_code: { userId, code } } });
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
      userId,
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
      userId,
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
      userId,
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
      userId,
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
      userId,
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
      userId,
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
      userId,
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
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // SEED DONOVAN FARMS TAX ACCOUNTING (2023 S-CORP)
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  console.log('🏢 Seeding Donovan Farms accounting...');

  // Create company
  const dovanFarms = await prisma.company.upsert({
    where: { id: 'donovan-farms' },
    update: {},
    create: {
      id: 'donovan-farms',
      userId,
      name: 'DONOVAN FARMS INC',
      legalName: 'DONOVAN FARMS INC',
      taxId: '**-*******', // Redacted
      taxType: 'S-Corp',
      fiscalYearStart: '04-01', // April 1st
      address: 'Massachusetts',
      state: 'MA',
      active: true,
    },
  });

  // Create tax accounts (Chart of Accounts for tax reporting)
  const taxAccounts = [
    // ASSETS
    { code: '1010', name: 'Cash - Operating Account (x0055)', type: 'ASSET', treatment: '100%', schedule: 'Balance Sheet' },
    { code: '1020', name: 'Cash - Payroll Account (x0056)', type: 'ASSET', treatment: '100%', schedule: 'Balance Sheet' },

    // LIABILITIES
    { code: '2010', name: 'Credit Card Payable - AMEX', type: 'LIABILITY', treatment: '100%', schedule: 'Balance Sheet' },
    { code: '2020', name: 'Credit Card Payable - Chase', type: 'LIABILITY', treatment: '100%', schedule: 'Balance Sheet' },

    // EQUITY
    { code: '3010', name: "Owner's Capital", type: 'EQUITY', treatment: '100%', schedule: 'Balance Sheet' },
    { code: '3020', name: 'Retained Earnings', type: 'EQUITY', treatment: '100%', schedule: 'Balance Sheet' },
    { code: '3030', name: 'Owner Distributions', type: 'EQUITY', treatment: 'NON_DEDUCTIBLE', schedule: 'K-1' },

    // INCOME
    { code: '4010', name: 'Gross Receipts', type: 'INCOME', treatment: '100%', schedule: '1120-S Line 1a' },

    // EXPENSES - COGS
    { code: '5010', name: 'Landscaping Supplies', type: 'EXPENSE_COGS', treatment: '100%', schedule: '1120-S Line 2' },

    // EXPENSES - OPERATING
    { code: '6010', name: 'Payroll - Harpers', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 7' },
    { code: '6020', name: 'Meals - Business', type: 'EXPENSE_OPERATING', treatment: '50%', schedule: '1120-S Line 15' },
    { code: '6030', name: 'Insurance', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 15' },
    { code: '6040', name: 'Utilities', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 25' },
    { code: '6050', name: 'Hardware & Tools', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 23' },
    { code: '6060', name: 'Fuel', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 9' },
    { code: '6070', name: 'Government Fees', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 24' },
    { code: '6080', name: 'Office Supplies', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 18' },
    { code: '6090', name: 'Bank Fees', type: 'EXPENSE_OPERATING', treatment: '100%', schedule: '1120-S Line 18' },

    // PERSONAL USE (NON-DEDUCTIBLE)
    { code: '6100', name: 'Groceries - Personal', type: 'EXPENSE_OPERATING', treatment: 'NON_DEDUCTIBLE', schedule: 'Owner Distribution' },
    { code: '6110', name: 'Liquor - Personal', type: 'EXPENSE_OPERATING', treatment: 'NON_DEDUCTIBLE', schedule: 'Owner Distribution' },
    { code: '6120', name: 'Personal Shopping', type: 'EXPENSE_OPERATING', treatment: 'NON_DEDUCTIBLE', schedule: 'Owner Distribution' },

    // SPECIAL
    { code: '9999', name: 'TRANSFER (Not Income/Expense)', type: 'ASSET', treatment: 'TRANSFER', schedule: 'Excluded' },
  ];

  for (const acc of taxAccounts) {
    await prisma.taxAccount.upsert({
      where: { companyId_code: { companyId: dovanFarms.id, code: acc.code } },
      update: {},
      create: {
        companyId: dovanFarms.id,
        code: acc.code,
        name: acc.name,
        accountType: acc.type as any,
        taxTreatment: acc.treatment,
        scheduleC: acc.schedule,
        active: true,
        isSystemAccount: false,
      },
    });
  }

  console.log(`✅ Seeded ${taxAccounts.length} tax accounts`);

  // Create bank accounts
  const operatingAcct = await prisma.bankAccount.upsert({
    where: { companyId_accountNumber: { companyId: dovanFarms.id, accountNumber: '0055' } },
    update: {},
    create: {
      companyId: dovanFarms.id,
      name: 'Operating Account',
      accountNumber: '0055',
      bankName: 'Webster First',
      accountType: 'checking',
      currentBalance: 3188.62, // December 2023 ending balance
      balanceAsOf: new Date('2023-12-31'),
      active: true,
    },
  });

  const payrollAcct = await prisma.bankAccount.upsert({
    where: { companyId_accountNumber: { companyId: dovanFarms.id, accountNumber: '0056' } },
    update: {},
    create: {
      companyId: dovanFarms.id,
      name: 'Payroll Account',
      accountNumber: '0056',
      bankName: 'Webster First',
      accountType: 'checking',
      currentBalance: 306.97, // December 2023 ending balance
      balanceAsOf: new Date('2023-12-31'),
      active: true,
    },
  });

  console.log(`✅ Seeded 2 bank accounts`);

  // Get account IDs for rules
  const grossReceipts = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '4010' } });
  const landscapingSupplies = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '5010' } });
  const payroll = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6010' } });
  const meals = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6020' } });
  const insurance = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6030' } });
  const utilities = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6040' } });
  const hardware = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6050' } });
  const fuel = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6060' } });
  const govFees = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6070' } });
  const officeSupplies = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6080' } });
  const bankFees = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6090' } });
  const groceries = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6100' } });
  const liquor = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6110' } });
  const personalShopping = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '6120' } });
  const transfer = await prisma.taxAccount.findFirst({ where: { companyId: dovanFarms.id, code: '9999' } });

  // Create categorization rules (based on user's CLAUDE.md)
  const rules = [
    // INCOME
    { name: 'Customer Deposits', match: 'CONTAINS', value: 'DEPOSIT BY CHECK', accountId: grossReceipts!.id, priority: 100 },

    // PAYROLL
    { name: 'Harpers Payroll Service', match: 'CONTAINS', value: '9782 DONOVAN FAR', accountId: payroll!.id, priority: 90 },
    { name: 'Harpers Direct', match: 'CONTAINS', value: 'HARPERS PAYROLL', accountId: payroll!.id, priority: 90 },

    // LANDSCAPING SUPPLIES
    { name: 'Pro Lawn Supply', match: 'CONTAINS', value: 'PRO LAWN SUPPLY', accountId: landscapingSupplies!.id, priority: 80 },
    { name: 'Busy Bee', match: 'CONTAINS', value: 'BUSY BEE', accountId: landscapingSupplies!.id, priority: 80 },
    { name: 'SiteOne', match: 'CONTAINS', value: 'SITEONE', accountId: landscapingSupplies!.id, priority: 80 },
    { name: 'Valley Green', match: 'CONTAINS', value: 'VALLEY GREEN', accountId: landscapingSupplies!.id, priority: 80 },

    // HARDWARE & TOOLS
    { name: 'Klem\'s', match: 'CONTAINS', value: 'KLEM', accountId: hardware!.id, priority: 70 },
    { name: 'Rutland Hardware', match: 'CONTAINS', value: 'RUTLAND HARDWARE', accountId: hardware!.id, priority: 70 },
    { name: 'Harbor Freight', match: 'CONTAINS', value: 'HARBOR FREIGHT', accountId: hardware!.id, priority: 70 },
    { name: 'Tractor Supply', match: 'CONTAINS', value: 'TRACTOR SUPPLY', accountId: hardware!.id, priority: 70 },
    { name: 'NAPA', match: 'CONTAINS', value: 'NAPA', accountId: hardware!.id, priority: 70 },

    // FUEL
    { name: 'Saveway Gas', match: 'CONTAINS', value: 'SAVEWAY', accountId: fuel!.id, priority: 70 },
    { name: 'Shell', match: 'CONTAINS', value: 'SHELL', accountId: fuel!.id, priority: 70 },
    { name: 'Mobil', match: 'CONTAINS', value: 'MOBIL', accountId: fuel!.id, priority: 70 },
    { name: 'Cumberland Farms', match: 'CONTAINS', value: 'CUMBERLAND', accountId: fuel!.id, priority: 70 },

    // MEALS (50% deductible)
    { name: 'The Specialty Shoppe', match: 'CONTAINS', value: 'SPECIALTY SHOPPE', accountId: meals!.id, priority: 60 },
    { name: 'Thai House', match: 'CONTAINS', value: 'THAI HOUSE', accountId: meals!.id, priority: 60 },
    { name: 'Wong Dynasty', match: 'CONTAINS', value: 'WONG DYNASTY', accountId: meals!.id, priority: 60 },
    { name: 'McDonald\'s', match: 'CONTAINS', value: 'MCDONALD', accountId: meals!.id, priority: 60 },
    { name: 'Dunkin', match: 'CONTAINS', value: 'DUNKIN', accountId: meals!.id, priority: 60 },
    { name: 'Dippin Donuts', match: 'CONTAINS', value: 'DIPPIN DONUTS', accountId: meals!.id, priority: 60 },
    { name: 'Jimmy\'s Tavern', match: 'CONTAINS', value: 'JIMMY', accountId: meals!.id, priority: 60 },
    { name: 'Chick-fil-A', match: 'CONTAINS', value: 'CHICK-FIL-A', accountId: meals!.id, priority: 60 },

    // LIQUOR (personal/non-deductible)
    { name: 'Main Street Discount Liquor', match: 'CONTAINS', value: 'MAIN STREET DIS', accountId: liquor!.id, priority: 65 },
    { name: 'Holden Discount Liquor', match: 'CONTAINS', value: 'HOLDEN DISCOUNT', accountId: liquor!.id, priority: 65 },
    { name: 'Total Wine', match: 'CONTAINS', value: 'TOTAL WINE', accountId: liquor!.id, priority: 65 },
    { name: 'Wachusett Wine', match: 'CONTAINS', value: 'WACHUSETT WINE', accountId: liquor!.id, priority: 65 },

    // PERSONAL GROCERIES (non-deductible)
    { name: 'Walmart', match: 'CONTAINS', value: 'WALMART', accountId: groceries!.id, priority: 50 },
    { name: 'BJ\'s Wholesale', match: 'CONTAINS', value: 'BJS WHOLESALE', accountId: groceries!.id, priority: 50 },
    { name: 'Trader Joe\'s', match: 'CONTAINS', value: 'TRADER JOE', accountId: groceries!.id, priority: 50 },
    { name: 'Big Y', match: 'CONTAINS', value: 'BIG Y', accountId: groceries!.id, priority: 50 },

    // INSURANCE
    { name: 'Safety Insurance', match: 'CONTAINS', value: 'SAFETY INSURANCE', accountId: insurance!.id, priority: 70 },

    // UTILITIES
    { name: 'Verizon', match: 'CONTAINS', value: 'VERIZON', accountId: utilities!.id, priority: 70 },

    // GOVERNMENT FEES
    { name: 'RMV Fees', match: 'CONTAINS', value: 'RMV', accountId: govFees!.id, priority: 70 },
    { name: 'Excise Tax', match: 'CONTAINS', value: 'EXCISE', accountId: govFees!.id, priority: 70 },

    // OFFICE SUPPLIES
    { name: 'Staples', match: 'CONTAINS', value: 'STAPLES', accountId: officeSupplies!.id, priority: 60 },
    { name: 'Office Depot', match: 'CONTAINS', value: 'OFFICE DEPOT', accountId: officeSupplies!.id, priority: 60 },

    // BANK FEES
    { name: 'Bank Service Charge', match: 'CONTAINS', value: 'SERVICE CHARGE', accountId: bankFees!.id, priority: 70 },

    // TRANSFERS (exclude from income/expense)
    { name: 'Internal Transfers', match: 'CONTAINS', value: 'PC BRANCH TRANSFER', accountId: transfer!.id, priority: 95 },
    { name: 'Account Transfers', match: 'CONTAINS', value: 'XFER FROM', accountId: transfer!.id, priority: 95 },
    { name: 'Account Transfers Out', match: 'CONTAINS', value: 'XFER TO', accountId: transfer!.id, priority: 95 },
  ];

  for (const rule of rules) {
    await prisma.categorizationRule.create({
      data: {
        companyId: dovanFarms.id,
        name: rule.name,
        matchType: rule.match as any,
        matchValue: rule.value,
        taxAccountId: rule.accountId,
        priority: rule.priority,
        enabled: true,
        autoCreated: false,
      },
    });
  }

  console.log(`✅ Seeded ${rules.length} categorization rules`);

  console.log('\n📈 Sample data created:');
  console.log(`   - ${accountsToSeed.length} accounts in Chart of Accounts`);
  console.log(`   - ${services.length} services`);
  console.log(`   - 1 customer`);
  console.log(`   - 7 posted journal entries`);
  console.log(`   - 1 company (Donovan Farms Inc)`);
  console.log(`   - ${taxAccounts.length} tax accounts`);
  console.log(`   - 2 bank accounts`);
  console.log(`   - ${rules.length} categorization rules`);
  console.log(`\n💡 You can now import 2023 bank transactions and generate tax reports!`);
}

main()
  .catch((e) => {
    console.error('❌ Error seeding database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

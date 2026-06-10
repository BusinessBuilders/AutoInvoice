# Chart of Accounts Setup Guide

This guide explains how to initialize the Chart of Accounts for AutoInvoice.

## Initial Setup

### Step 1: Ensure Database Schema is Up-to-Date

Make sure your database has the latest accounting schema:

```bash
cd /home/magiccat/AutoInvoice
npm run db:migrate
```

### Step 2: Seed the Chart of Accounts

The Chart of Accounts must be seeded **once** during initial system deployment.

#### Option A: Using the Backend CLI

```bash
# Navigate to backend
cd apps/backend

# Run the seeding command (when implemented)
npm run cli -- seed-accounts
```

#### Option B: Programmatically in Code

Add to your startup/initialization script:

```typescript
import { seedDefaultAccounts, validateSystemAccounts } from './services/accounting';

async function initializeAccounting() {
  try {
    console.log('Initializing Chart of Accounts...');

    const result = await seedDefaultAccounts();
    console.log(`✓ Created ${result.created} accounts`);
    console.log(`✓ Skipped ${result.skipped} existing accounts`);

    // Validate system accounts
    const missing = await validateSystemAccounts();
    if (missing.length > 0) {
      console.error('❌ Missing system accounts:', missing);
      throw new Error('System accounts missing!');
    }

    console.log('✓ All system accounts validated');
  } catch (error) {
    console.error('Failed to initialize accounting:', error);
    throw error;
  }
}

// Call during app startup
initializeAccounting();
```

#### Option C: Using Prisma Seed Script

Create a seed script at `apps/backend/prisma/seed-accounts.ts`:

```typescript
import { seedDefaultAccounts, validateSystemAccounts } from '../src/services/accounting';

async function main() {
  console.log('Seeding Chart of Accounts...');

  const result = await seedDefaultAccounts();

  console.log(`Created: ${result.created}`);
  console.log(`Skipped: ${result.skipped}`);
  console.log(`Total: ${result.total}`);

  const missing = await validateSystemAccounts();
  if (missing.length > 0) {
    throw new Error(`Missing system accounts: ${missing.join(', ')}`);
  }

  console.log('✓ Chart of Accounts ready');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
```

Then run:

```bash
npx tsx apps/backend/prisma/seed-accounts.ts
```

## Verification

After seeding, verify the accounts were created:

```bash
# Open Prisma Studio
npm run db:studio

# Navigate to Account model
# You should see 25 accounts (codes 1000-6900)
```

Or verify programmatically:

```typescript
import { prisma } from './utils/db';

const accountCount = await prisma.account.count();
console.log(`Total accounts: ${accountCount}`); // Should be 25

const systemAccounts = await prisma.account.count({
  where: { systemAccount: true }
});
console.log(`System accounts: ${systemAccounts}`); // Should be 6
```

## Using System Accounts

After seeding, you can reference system accounts in your code:

```typescript
import { ACCOUNT_CODES, getSystemAccount } from './services/accounting';

// Get the Cash account
const cashAccount = await getSystemAccount(ACCOUNT_CODES.CASH);
console.log(cashAccount?.name); // "Cash"

// Get Accounts Receivable
const arAccount = await getSystemAccount(ACCOUNT_CODES.ACCOUNTS_RECEIVABLE);
console.log(arAccount?.code); // "1100"
```

## Default Account List

After seeding, you will have the following accounts:

| Code | Name | Type | Balance | System |
|------|------|------|---------|--------|
| 1000 | Cash | ASSET | DEBIT | ✓ |
| 1010 | Checking Account | ASSET | DEBIT | |
| 1100 | Accounts Receivable | ASSET | DEBIT | ✓ |
| 1500 | Equipment | ASSET | DEBIT | |
| 1600 | Vehicles | ASSET | DEBIT | |
| 2000 | Accounts Payable | LIABILITY | CREDIT | ✓ |
| 2100 | Credit Card | LIABILITY | CREDIT | |
| 2200 | Sales Tax Payable | LIABILITY | CREDIT | (tax) |
| 3000 | Owner's Equity | EQUITY | CREDIT | ✓ |
| 3100 | Retained Earnings | EQUITY | CREDIT | ✓ |
| 3200 | Owner's Draw | EQUITY | DEBIT | |
| 4000 | Service Revenue | REVENUE | CREDIT | ✓ |
| 4100 | Materials Revenue | REVENUE | CREDIT | |
| 5000 | Materials Cost | EXPENSE | DEBIT | |
| 5100 | Subcontractor Costs | EXPENSE | DEBIT | |
| 6000 | Advertising | EXPENSE | DEBIT | |
| 6100 | Auto & Truck | EXPENSE | DEBIT | |
| 6200 | Bank Fees | EXPENSE | DEBIT | |
| 6300 | Equipment Rental | EXPENSE | DEBIT | |
| 6400 | Fuel | EXPENSE | DEBIT | |
| 6500 | Insurance | EXPENSE | DEBIT | |
| 6600 | Office Supplies | EXPENSE | DEBIT | |
| 6700 | Repairs & Maintenance | EXPENSE | DEBIT | |
| 6800 | Tools & Equipment | EXPENSE | DEBIT | |
| 6900 | Utilities | EXPENSE | DEBIT | |

## Troubleshooting

### "Missing system accounts" error

If validation fails, re-run the seeding:

```bash
# The seeding is idempotent - safe to run multiple times
npx tsx apps/backend/prisma/seed-accounts.ts
```

### Duplicate key errors

This shouldn't happen due to idempotent design, but if it does:

```typescript
// The function checks for existing accounts before creating
// Check your database for duplicate account codes
SELECT code, COUNT(*) as count
FROM "Account"
GROUP BY code
HAVING COUNT(*) > 1;
```

### Wrong account codes in journal entries

If you see errors about missing accounts during journal entry creation, ensure:

1. Chart of Accounts has been seeded
2. All system accounts exist
3. Account codes match between seed-accounts.ts and journal-service.ts

```typescript
import { validateSystemAccounts } from './services/accounting';

const missing = await validateSystemAccounts();
if (missing.length > 0) {
  console.error('Missing accounts:', missing);
  // Re-run seeding
}
```

## Adding Custom Accounts

Users can add custom accounts after initial seeding:

```typescript
import { prisma } from './utils/db';
import { AccountType, BalanceType } from '@prisma/client';

await prisma.account.create({
  data: {
    code: '1700',
    name: 'Custom Asset Account',
    accountType: 'ASSET',
    balanceType: 'DEBIT',
    description: 'User-defined account',
    active: true,
    systemAccount: false,
  },
});
```

**Recommended code ranges for custom accounts:**
- Assets: 1700-1999
- Liabilities: 2300-2999
- Equity: 3300-3999
- Revenue: 4200-4999
- Expenses: 7000-9999

## Multi-Tenancy Note

⚠️ **IMPORTANT**: The current schema does not support multi-tenancy. All users share the same Chart of Accounts.

If you need per-user Charts of Accounts, you must:

1. Add `userId` field to Account model
2. Update seeding to create accounts per user
3. Update all accounting queries to filter by userId
4. Migrate existing accounts to a default user

See the TODO comment in `seed-accounts.ts` for the required schema changes.

## Next Steps

After seeding:

1. ✓ Chart of Accounts is ready
2. Create your first journal entry (see journal-service.ts)
3. Set up expense categories (link to ExpenseCategory)
4. Configure tax rates on tax accounts
5. Start recording transactions!

## Related Documentation

- [Accounting Services README](./README.md)
- [Journal Entry Service](./journal-service.ts)
- [Prisma Schema - Account Model](../../prisma/schema.prisma)

# Quick Start: Chart of Accounts Seeding

## TL;DR

```bash
# 1. Run migrations
npm run db:migrate

# 2. Seed accounts (choose one method)
npx tsx apps/backend/src/services/accounting/seed-cli.example.ts

# 3. Verify in Prisma Studio
npm run db:studio
```

## One-Liner Usage

```typescript
import { seedDefaultAccounts } from './services/accounting';
await seedDefaultAccounts();
```

## What You Get

25 pre-configured accounts:
- 5 Asset accounts (1000-1600)
- 3 Liability accounts (2000-2200)
- 3 Equity accounts (3000-3200)
- 2 Revenue accounts (4000-4100)
- 12 Expense accounts (5000-6900)

## Essential Accounts

```typescript
import { ACCOUNT_CODES, getSystemAccount } from './services/accounting';

// These accounts are essential for journal entries:
ACCOUNT_CODES.CASH                   // 1000
ACCOUNT_CODES.CHECKING               // 1010
ACCOUNT_CODES.ACCOUNTS_RECEIVABLE    // 1100
ACCOUNT_CODES.ACCOUNTS_PAYABLE       // 2000
ACCOUNT_CODES.OWNERS_EQUITY          // 3000
ACCOUNT_CODES.RETAINED_EARNINGS      // 3100
ACCOUNT_CODES.SERVICE_REVENUE        // 4000
ACCOUNT_CODES.SALES_TAX_PAYABLE      // 2200
```

## Common Tasks

### Check if seeding is needed
```typescript
const count = await prisma.account.count();
if (count === 0) {
  await seedDefaultAccounts();
}
```

### Validate system accounts exist
```typescript
import { validateSystemAccounts } from './services/accounting';

const missing = await validateSystemAccounts();
if (missing.length > 0) {
  console.error('Missing:', missing);
  await seedDefaultAccounts(); // Re-seed to fix
}
```

### Get a specific account
```typescript
import { getSystemAccount, ACCOUNT_CODES } from './services/accounting';

const cash = await getSystemAccount(ACCOUNT_CODES.CASH);
console.log(cash?.name); // "Cash"
```

## Important Notes

⚠️ **Multi-Tenancy**: Currently, ALL users share the same Chart of Accounts.
- Seed **once** during system setup
- Do **not** seed per-user (until schema is updated)

✅ **Idempotent**: Safe to run multiple times - won't create duplicates

🔒 **Transaction-Safe**: All accounts created in a single transaction

## Need Help?

- Full documentation: [README.md](./README.md)
- Setup guide: [SETUP.md](./SETUP.md)
- CLI example: [seed-cli.example.ts](./seed-cli.example.ts)

# Accounting Services

This directory contains business logic services for the accounting module of AutoInvoice.

## Overview

The accounting services layer provides high-level functions for managing the Chart of Accounts, journal entries, and financial reports.

## Services

### `seed-accounts.ts`

Provides Chart of Accounts seeding functionality for initializing the accounting system with standard accounts.

#### Features

- **Idempotent seeding**: Safe to call multiple times without creating duplicates
- **Standard account structure**: Follows standard accounting numbering conventions
  - 1000-1999: Assets
  - 2000-2999: Liabilities
  - 3000-3999: Equity
  - 4000-4999: Revenue
  - 5000-6999: Expenses
- **System account identification**: Marks essential accounts (AR, AP, Revenue, etc.)
- **Proper balance types**: Automatically sets correct normal balance side (DEBIT/CREDIT)
- **Transaction safety**: All account creation happens within database transactions

#### Usage

```typescript
import { seedDefaultAccounts, validateSystemAccounts, SYSTEM_ACCOUNTS } from './accounting';

// Seed the Chart of Accounts (run once during system setup)
const result = await seedDefaultAccounts();
console.log(`Created ${result.created} accounts, skipped ${result.skipped}`);

// Validate system accounts exist
const missing = await validateSystemAccounts();
if (missing.length > 0) {
  console.error('Missing system accounts:', missing);
}

// Get a specific system account
import { getSystemAccount } from './accounting';
const cashAccount = await getSystemAccount(SYSTEM_ACCOUNTS.CASH);
```

#### System Accounts

The following accounts are marked as system accounts and are essential for automated journal entries:

| Code | Name | Purpose |
|------|------|---------|
| 1000 | Cash | Cash transactions |
| 1100 | Accounts Receivable | Invoice revenue recognition |
| 2000 | Accounts Payable | Bill/expense payables |
| 3000 | Owner's Equity | Initial capital contributions |
| 3100 | Retained Earnings | Profit/loss accumulation |
| 4000 | Service Revenue | Service income |

#### Default Accounts

The complete list of default accounts includes:

**Assets:**
- 1000: Cash (system)
- 1010: Checking Account
- 1100: Accounts Receivable (system)
- 1500: Equipment
- 1600: Vehicles

**Liabilities:**
- 2000: Accounts Payable (system)
- 2100: Credit Card
- 2200: Sales Tax Payable (tax-enabled)

**Equity:**
- 3000: Owner's Equity (system)
- 3100: Retained Earnings (system)
- 3200: Owner's Draw

**Revenue:**
- 4000: Service Revenue (system)
- 4100: Materials Revenue

**Expenses (COGS):**
- 5000: Materials Cost
- 5100: Subcontractor Costs

**Expenses (Operating):**
- 6000: Advertising
- 6100: Auto & Truck
- 6200: Bank Fees
- 6300: Equipment Rental
- 6400: Fuel
- 6500: Insurance
- 6600: Office Supplies
- 6700: Repairs & Maintenance
- 6800: Tools & Equipment
- 6900: Utilities

## Important Notes

### ⚠️ Multi-Tenancy Limitation

**CRITICAL**: The current `Account` schema does **not** include a `userId` field. This means:

- All users share the same Chart of Accounts
- `seedDefaultAccounts()` should be called **once** during initial system setup
- It should **not** be called per-user during registration

This is a known limitation that should be addressed by adding multi-tenancy support to the accounting schema:

```prisma
model Account {
  id          String  @id @default(cuid())
  userId      String  // ADD THIS FIELD
  user        User    @relation(fields: [userId], references: [id])
  // ... rest of fields

  @@unique([userId, code]) // Ensure unique codes per user
}
```

Until multi-tenancy is implemented, the accounting module is only suitable for single-tenant deployments.

### When to Run Seeding

```bash
# During initial system deployment
npm run db:migrate
npm run cli -- seed-accounts

# Or programmatically in your deployment script
import { seedDefaultAccounts } from './services/accounting';
await seedDefaultAccounts();
```

### Customization by Industry

The `seedDefaultAccounts()` function accepts an optional `companyType` parameter for future customization:

```typescript
// Future enhancement - add industry-specific accounts
await seedDefaultAccounts('landscaping'); // Could add specific accounts
await seedDefaultAccounts('construction'); // Could add specific accounts
```

Currently this parameter is not used, but it's included for future extensibility.

## API Reference

### Functions

#### `seedDefaultAccounts(companyType?: string)`

Seeds the default Chart of Accounts.

**Parameters:**
- `companyType` (optional): Company type for future industry-specific customization

**Returns:** `Promise<{ created: number; skipped: number; total: number }>`

**Throws:** Error if database operation fails

#### `getSystemAccount(accountCode: string)`

Gets a system account by its code.

**Parameters:**
- `accountCode`: Account code (use `SYSTEM_ACCOUNTS` constants)

**Returns:** `Promise<Account | null>`

#### `validateSystemAccounts()`

Validates that all required system accounts exist.

**Returns:** `Promise<string[]>` - Array of missing account codes (empty if all exist)

### Constants

#### `SYSTEM_ACCOUNTS`

Object containing codes for essential system accounts:

```typescript
{
  CASH: '1000',
  ACCOUNTS_RECEIVABLE: '1100',
  ACCOUNTS_PAYABLE: '2000',
  OWNERS_EQUITY: '3000',
  RETAINED_EARNINGS: '3100',
  SERVICE_REVENUE: '4000',
}
```

## Error Handling

All functions include comprehensive error handling:

- Database errors are caught and logged with Winston
- Errors are re-thrown with descriptive messages
- All operations are wrapped in try-catch blocks
- Transaction rollback on failure

## Logging

All operations are logged at appropriate levels:

- `info`: Seeding start/completion, account counts
- `warn`: Missing system accounts detected
- `debug`: Individual account operations (skipping existing accounts)
- `error`: Database failures, validation errors

## Testing

To test the seeding service:

```typescript
// Test idempotency
const result1 = await seedDefaultAccounts();
const result2 = await seedDefaultAccounts();
expect(result2.created).toBe(0); // All should be skipped
expect(result2.skipped).toBe(result1.total);

// Test validation
const missing = await validateSystemAccounts();
expect(missing.length).toBe(0);

// Test system account retrieval
const cash = await getSystemAccount(SYSTEM_ACCOUNTS.CASH);
expect(cash?.code).toBe('1000');
expect(cash?.systemAccount).toBe(true);
```

## Future Enhancements

1. **Add multi-tenancy**: Include `userId` in Account schema
2. **Industry templates**: Different default accounts by business type
3. **Account hierarchy**: Support parent-child account relationships
4. **Custom account creation**: API endpoints for users to add custom accounts
5. **Import/Export**: Allow importing custom Charts of Accounts from CSV/JSON
6. **Account archiving**: Soft-delete accounts instead of hard deletion

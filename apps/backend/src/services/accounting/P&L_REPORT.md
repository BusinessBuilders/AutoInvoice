# Profit & Loss (P&L) Report

## Overview

The P&L report (Income Statement) shows revenue and expenses over a given period to calculate net income. It's a fundamental financial report for understanding business profitability.

## Implementation

### Service Layer

**File**: `apps/backend/src/services/accounting/reports.ts`

**Function**: `generateProfitAndLoss(userId, startDate, endDate)`

**Returns**:
```typescript
{
  period: { start: Date, end: Date },
  revenue: {
    accounts: Array<{ code, name, amount }>,
    total: number
  },
  expenses: {
    accounts: Array<{ code, name, amount }>,
    total: number
  },
  netIncome: number,
  profitMargin: number  // Net income as % of revenue
}
```

### API Endpoint

**Router**: `apps/backend/src/routers/reporting.ts`

**Endpoint**: `reporting.profitAndLoss`

**Input**:
```typescript
{
  startDate: Date,
  endDate: Date
}
```

**Example Usage** (tRPC client):
```typescript
const report = await trpc.reporting.profitAndLoss.query({
  startDate: new Date('2025-01-01'),
  endDate: new Date('2025-12-31')
});

console.log(`Total Revenue: $${report.revenue.total}`);
console.log(`Total Expenses: $${report.expenses.total}`);
console.log(`Net Income: $${report.netIncome}`);
console.log(`Profit Margin: ${report.profitMargin.toFixed(2)}%`);
```

## How It Works

### 1. Data Source
- Queries **only POSTED** journal entries in the date range
- Ignores DRAFT and VOIDED entries to ensure accuracy
- Uses `entryDate` field for period filtering

### 2. Account Aggregation
- Groups journal lines by account
- Separates REVENUE and EXPENSE account types
- Calculates net balance for each account

### 3. Calculation Logic

**Revenue**:
- Uses REVENUE account type
- Amount = Credits - Debits (natural credit balance)
- Only accounts with non-zero balances are included

**Expenses**:
- Uses EXPENSE account type
- Amount = Debits - Credits (natural debit balance)
- Only accounts with non-zero balances are included

**Net Income**:
```
Net Income = Total Revenue - Total Expenses
Profit Margin = (Net Income / Total Revenue) × 100
```

### 4. Sorting
- Revenue accounts sorted by amount (largest first)
- Expense accounts sorted by amount (largest first)

## Sample Data

The seed script (`apps/backend/prisma/seed.ts`) creates sample journal entries:

**Revenue Entries**:
- Invoice #INV-001: $250 (lawn mowing)
- Invoice #INV-002: $350 (tree trimming)
- **Total Revenue**: $600

**Expense Entries**:
- Materials Cost: $125.50 (fertilizer)
- Fuel: $85.00
- Office Supplies: $42.75
- Auto & Truck: $95.00
- **Total Expenses**: $348.25

**Net Income**: $251.75 (41.96% profit margin)

## Testing

### Run Seed Script
```bash
npm run db:seed
```

### Test P&L Endpoint
After seeding, query the P&L for the last 30 days:

```typescript
const report = await trpc.reporting.profitAndLoss.query({
  startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
  endDate: new Date()
});
```

## Frontend Integration

### Example React Component
```typescript
import { trpc } from '@/lib/trpc';

function ProfitAndLossReport() {
  const [dateRange, setDateRange] = useState({
    startDate: new Date('2025-01-01'),
    endDate: new Date('2025-12-31')
  });

  const { data: report, isLoading } = trpc.reporting.profitAndLoss.useQuery({
    startDate: dateRange.startDate,
    endDate: dateRange.endDate
  });

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="p-6">
      <h1>Profit & Loss Statement</h1>
      <p>Period: {report.period.start.toLocaleDateString()} - {report.period.end.toLocaleDateString()}</p>

      <section className="mt-4">
        <h2>Revenue</h2>
        {report.revenue.accounts.map(account => (
          <div key={account.code}>
            {account.name}: ${account.amount.toFixed(2)}
          </div>
        ))}
        <div className="font-bold">Total Revenue: ${report.revenue.total.toFixed(2)}</div>
      </section>

      <section className="mt-4">
        <h2>Expenses</h2>
        {report.expenses.accounts.map(account => (
          <div key={account.code}>
            {account.name}: ${account.amount.toFixed(2)}
          </div>
        ))}
        <div className="font-bold">Total Expenses: ${report.expenses.total.toFixed(2)}</div>
      </section>

      <section className="mt-4 p-4 bg-green-50 border border-green-200">
        <div className="text-xl font-bold">Net Income: ${report.netIncome.toFixed(2)}</div>
        <div className="text-sm">Profit Margin: {report.profitMargin.toFixed(2)}%</div>
      </section>
    </div>
  );
}
```

## Edge Cases Handled

1. **No journal entries in period**: Returns empty report with zeros
2. **Account with zero balance**: Excluded from results
3. **Only revenue or only expenses**: Still calculates net income correctly
4. **Negative net income (loss)**: Properly displays negative values

## Future Enhancements

- [ ] Multi-period comparison (Year-over-Year)
- [ ] Drill-down to journal entries for each account
- [ ] Export to PDF/Excel
- [ ] Budget vs. Actual comparison
- [ ] Monthly/Quarterly/Yearly presets
- [ ] Cost of Goods Sold (COGS) section
- [ ] Operating Income vs. Net Income separation
- [ ] Chart visualization (revenue/expense trends)

## Related Files

- **Service**: `apps/backend/src/services/accounting/reports.ts`
- **Router**: `apps/backend/src/routers/reporting.ts`
- **Seed**: `apps/backend/prisma/seed.ts`
- **Accounts**: `apps/backend/src/services/accounting/seed-accounts.ts`
- **Journal Service**: `apps/backend/src/services/accounting/journal-service.ts`

## Notes

- P&L uses **accrual accounting** (records when earned/incurred, not when cash changes hands)
- Only POSTED entries are included for accuracy
- Multi-tenancy is not yet implemented (userId parameter exists for future use)
- Report follows GAAP principles for income statement presentation

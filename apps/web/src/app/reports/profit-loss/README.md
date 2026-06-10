# Profit & Loss (Income Statement) Report

## Overview
Professional financial report page that displays revenue, expenses, and net income from journal entries. Built with Next.js 14, TypeScript, Tailwind CSS, and Chart.js.

## Location
`/home/magiccat/AutoInvoice/apps/web/src/app/reports/profit-loss/page.tsx`

## Features

### 1. Date Range Selection
- **Presets**: This Month, Last Month, This Quarter, This Year
- **Custom Range**: Date pickers for custom start/end dates
- **Auto-refresh**: Report updates automatically when date range changes

### 2. Report Sections

#### Revenue Section
- Lists all revenue accounts with account codes and names
- Shows individual account amounts
- Displays total revenue with green highlighting
- Sorted by amount (largest first)

#### Expenses Section
- Lists all expense accounts with account codes and names
- Shows individual expense amounts
- Displays total expenses with red highlighting
- Sorted by amount (largest first)

#### Summary Section
- **Net Income**: Total Revenue - Total Expenses
  - Green if positive (profit)
  - Red if negative (loss)
- **Profit Margin**: (Net Income / Total Revenue) × 100
  - Displayed as percentage with one decimal place

### 3. Visualizations

#### Revenue vs Expenses Bar Chart
- Side-by-side comparison of total revenue and expenses
- Green bar for revenue, red bar for expenses
- Hover tooltips show exact amounts
- Currency-formatted axis labels

#### Expense Breakdown Pie Chart
- Visual breakdown of all expense accounts
- Color-coded segments
- Hover tooltips show:
  - Account name
  - Amount
  - Percentage of total expenses

### 4. Export Options

#### CSV Export
- Downloads formatted CSV file
- Includes all report data:
  - Report header with date range
  - Revenue section with account details
  - Expense section with account details
  - Summary totals and margins
- Filename includes date range

#### Print
- Print-optimized layout
- Hides interactive elements (buttons, charts)
- Preserves exact colors with `print-color-adjust: exact`
- Professional 1-inch margins

#### PDF Export
- Placeholder for future implementation
- Shows "coming soon" alert

### 5. Empty State
- Friendly message when no journal entries exist in date range
- Large icon with clear explanation
- Suggests checking date range

### 6. Loading State
- Skeleton loading animation
- Shows while fetching data from backend
- Prevents layout shift

## Data Flow

### tRPC Query
```typescript
trpc.reporting.profitAndLoss.useQuery({
  startDate: Date,
  endDate: Date
})
```

### Response Type
```typescript
{
  period: {
    start: Date,
    end: Date
  },
  revenue: {
    accounts: Array<{
      code: string,      // e.g., "4000"
      name: string,      // e.g., "Service Revenue"
      amount: number     // Natural credit balance
    }>,
    total: number
  },
  expenses: {
    accounts: Array<{
      code: string,      // e.g., "5000"
      name: string,      // e.g., "Materials"
      amount: number     // Natural debit balance
    }>,
    total: number
  },
  netIncome: number,      // revenue.total - expenses.total
  profitMargin: number    // (netIncome / revenue.total) * 100
}
```

## Backend Integration

### Data Source
Report data comes from the **JournalEntry** table with status `POSTED`:
- Filters by `entryDate` between `startDate` and `endDate`
- Aggregates debits and credits by account
- Calculates balances based on account type natural balance:
  - **Revenue**: Credits - Debits
  - **Expenses**: Debits - Credits

### Location
Backend logic: `/home/magiccat/AutoInvoice/apps/backend/src/services/accounting/reports.ts`
- Function: `generateProfitAndLoss(userId, startDate, endDate)`
- Router: `apps/backend/src/routers/reporting.ts`
- Endpoint: `reporting.profitAndLoss`

## Styling

### Color Scheme
- **Positive/Revenue**: Green (`text-green-600`, `bg-green-600`)
- **Negative/Expenses**: Red (`text-red-600`, `bg-red-600`)
- **Neutral**: Gray shades
- **Primary Actions**: Blue (`bg-blue-600`)

### Responsive Design
- Mobile-first approach
- Stacks sections vertically on mobile
- Two-column chart layout on desktop (lg breakpoint)
- All amounts right-aligned with tabular numbers
- Account codes in monospace font

### Print Styles
Defined in `print.css`:
- Forces color preservation
- Hides interactive elements with `.print:hidden`
- Sets professional page margins

## Dependencies

### NPM Packages
```json
{
  "chart.js": "^4.x",           // Chart rendering
  "react-chartjs-2": "^5.x"     // React wrapper for Chart.js
}
```

### Chart.js Modules
- CategoryScale, LinearScale (axes)
- BarElement (bar charts)
- ArcElement (pie charts)
- LineElement, PointElement (future trend lines)
- Title, Tooltip, Legend (chart accessories)

## Usage

### Navigation
1. From Dashboard → Reports
2. Click "P&L Report" button in top-right
3. Or navigate directly to `/reports/profit-loss`

### Workflow
1. Select date range (preset or custom)
2. Review revenue and expense accounts
3. Check net income and profit margin
4. Visualize data with charts
5. Export to CSV or print as needed

## Future Enhancements

### Period Comparison
- Compare current period to previous period
- Show % change for each account
- Trend indicators (↑↓)

### PDF Export
- Generate professional PDF using jsPDF or similar
- Include charts and formatted tables
- Company branding and logo

### Drill-Down
- Click account to see journal entries
- Link to transactions that make up the balance

### Trends
- Net income trend line over multiple periods
- Revenue vs expenses over time
- Seasonality analysis

### Budgeting
- Show budgeted vs actual amounts
- Variance analysis
- Budget performance indicators

## Technical Notes

### Date Handling
- All dates normalized to start/end of day
- Timezone-aware comparisons
- Inclusive date ranges (gte/lte)

### Number Formatting
- Currency: `Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })`
- Always 2 decimal places for amounts
- Percentage: 1 decimal place

### Performance
- Chart.js renders on client only
- Memoized chart data to prevent re-renders
- Efficient date range calculations

### Accessibility
- Semantic HTML structure
- Clear heading hierarchy
- Keyboard-navigable buttons
- Screen-reader friendly labels
- High contrast colors

## Testing Checklist

- [ ] Report loads with default date range
- [ ] All presets change date range correctly
- [ ] Custom date picker works
- [ ] Empty state shows when no data
- [ ] Revenue accounts display correctly
- [ ] Expense accounts display correctly
- [ ] Net income calculates correctly
- [ ] Profit margin displays as percentage
- [ ] Charts render without errors
- [ ] CSV export downloads valid file
- [ ] Print preview looks professional
- [ ] Responsive on mobile devices
- [ ] Loading state displays smoothly
- [ ] Back navigation works

## Related Files
- Main reports dashboard: `apps/web/src/app/reports/page.tsx`
- Backend reports service: `apps/backend/src/services/accounting/reports.ts`
- tRPC router: `apps/backend/src/routers/reporting.ts`
- Print styles: `apps/web/src/app/reports/profit-loss/print.css`

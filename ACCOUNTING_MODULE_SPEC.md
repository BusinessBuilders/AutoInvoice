# Accounting Module Specification
**AutoInvoice - Bank Transaction Management & Reporting**

**Created**: 2026-01-14
**Author**: Claude Code + User
**Status**: Planning Phase

---

## 🎯 Executive Summary

Add QuickBooks-style accounting capabilities to AutoInvoice:
- User-defined chart of accounts
- Database-driven categorization rules
- Bank transaction import (CSV, JSON, PDF vision)
- General Ledger with edit/recategorize UI
- Automated report generation (10 reports for Form 1120-S)

**Goal**: Enable small S-Corp businesses to manage accounting without QuickBooks

---

## 🔑 Key Requirements

### Must Have (MVP)
1. ✅ User-defined chart of accounts (create/edit/delete)
2. ✅ Database-driven categorization rules (not hardcoded)
3. ✅ Seed script with Donovan Farms default accounts & rules
4. ✅ Bank transaction import (CSV, JSON)
5. ✅ General Ledger UI with filter/search
6. ✅ Edit/recategorize transactions individually or in bulk
7. ✅ Rule creation from manual categorizations ("Create rule for this?")
8. ✅ Generate 10 accountant reports (see below)

### Should Have (Phase 2)
- PDF vision import (upload bank statement PDF, extract transactions)
- Link bank transactions to invoices/receipts
- AI categorization suggestions (optional, user-controlled)
- Bulk import multiple months at once
- Export reports to PDF

### Nice to Have (Future)
- Plaid/Teller API integration (live bank sync)
- Multi-company support (switch between businesses)
- Recurring transaction templates
- Budget vs actual reporting
- Mobile app support

---

## 📊 User Stories

### Story 1: Import Bank Transactions
```
AS A business owner
I WANT TO upload my bank statement CSV
SO THAT I don't have to manually enter transactions

Acceptance Criteria:
- Upload CSV file
- System parses transactions (date, description, amount, balance)
- All transactions marked as "Needs Review"
- Success message shows count imported
```

### Story 2: Categorize Transactions
```
AS A business owner
I WANT TO assign categories to transactions
SO THAT my expenses are properly classified for taxes

Acceptance Criteria:
- View list of uncategorized transactions
- Select transaction, choose category from dropdown
- Option to "Create rule for future similar transactions"
- Transaction marked as categorized
```

### Story 3: Manage Rules
```
AS A business owner
I WANT TO create and edit categorization rules
SO THAT future transactions are automatically categorized

Acceptance Criteria:
- View all active rules
- Create new rule (match type, match value, category)
- Edit existing rule
- Disable/enable rules
- See how many times each rule was used
```

### Story 4: Generate Reports
```
AS A business owner
I WANT TO generate accounting reports
SO THAT I can give accurate data to my accountant

Acceptance Criteria:
- Select report type from dropdown
- Select date range
- View report in browser
- Export as CSV or PDF
- All 10 required reports available
```

---

## 🗄️ Database Schema

See main spec for full Prisma schema.

**Key Models**:
- `Company` - Business entity (supports future multi-company)
- `Account` - Chart of accounts entry (user-defined categories)
- `BankAccount` - Bank account info (Operating, Payroll, etc.)
- `CategorizationRule` - Matching rules for auto-categorization
- `BankTransaction` - Individual transaction with categorization

---

## 🎨 UI/UX Design

### Navigation
```
AutoInvoice Menu:
├── Dashboard
├── Invoices
├── Receipts
├── Customers
├── Services
└── 📊 Accounting (NEW)
    ├── Chart of Accounts
    ├── Categorization Rules
    ├── Bank Accounts
    ├── General Ledger
    └── Reports
```

### General Ledger UI (Key Screen)

```
┌─────────────────────────────────────────────────────────────────┐
│ General Ledger                                   [Import] [Export]│
├─────────────────────────────────────────────────────────────────┤
│ Filters:                                                          │
│ Date Range: [04/01/23] to [12/31/23]                            │
│ Account: [All Accounts ▼]                                        │
│ Status: [☐ Needs Review  ☐ Categorized  ☐ Uncategorized]       │
│ Search: [_________________________________] 🔍                   │
├─────────────────────────────────────────────────────────────────┤
│ [☐] Date     │ Description           │ Amount    │ Category      │
├─────────────────────────────────────────────────────────────────┤
│ [☐] 06/01/23 │ PRO LAWN SUPPLY       │ -$423.94  │ [Select...▼] │ ⚠️
│ [☐] 06/02/23 │ DEPOSIT BY CHECK      │ $6,112.34 │ Gross Receipts│ ✓
│ [☐] 06/02/23 │ MAIN STREET DIS       │  -$18.42  │ [Select...▼] │ ⚠️
│ [☐] 06/03/23 │ BIG Y 29 HOLDEN       │  -$46.94  │ [Select...▼] │ ⚠️
├─────────────────────────────────────────────────────────────────┤
│ Selected: 3 transactions                                          │
│ [Bulk Categorize] [Create Rule] [Delete]                         │
└─────────────────────────────────────────────────────────────────┘

Legend: ⚠️ Needs Review | ✓ Categorized | 🤖 Auto-categorized
```

**Interactions**:
- Click row → Edit modal opens
- Select multiple → Bulk operations available
- Change category → "Create rule?" prompt
- Filter by "Needs Review" → See only uncategorized

---

## 📈 Required Reports (10 Total)

### 1. Executive Summary
- Overview of financial position
- Key metrics (revenue, expenses, net income)
- Critical reconciliation proof

### 2. Payroll Taxes Detailed
- Quarterly breakdown (Form 941 data)
- Employer taxes vs employee withholding
- Total payroll expense

### 3. Shareholder vs Employee Analysis
- W-2 wages (deductible)
- Personal distributions (K-1)
- Tax treatment explanation

### 4. Balance Sheet Comparative
- Assets (cash accounts)
- Liabilities (credit cards)
- Equity (basis + retained earnings - distributions)
- Beginning vs Ending comparison

### 5. Income Statement Comparative
- Monthly breakdown (April-December)
- Gross receipts
- COGS
- Operating expenses
- Net income

### 6. General Ledger
- Complete transaction listing by account
- Format: Date | Description | Ref | Debit | Credit | Balance
- ALL accounts, ALL transactions

### 7. Trial Balance
- Summary of all account balances
- Total Debits = Total Credits (must balance)

### 8. Reconciliation Reports
- Monthly bank reconciliation (April-December)
- Book balance vs Bank balance proof

### 9. W-2 Summary
- All employees
- Total compensation breakdown

### 10. Summary and Journal Entries
- If needed by accountant

---

## 🔧 Technical Architecture

### Backend Services

```typescript
// apps/backend/src/services/accounting/

accountService.ts          // CRUD for accounts
ruleMatchingService.ts     // Match transactions to rules
importService.ts           // Import CSV/JSON/PDF
categorizationService.ts   // Auto-categorize with rules
reportGenerationService.ts // Generate all 10 reports
```

### tRPC Routers

```typescript
// apps/backend/src/routers/

accounting.ts       // Account CRUD
rules.ts            // Rule CRUD
bankTransactions.ts // Transaction CRUD + categorization
reports.ts          // Report generation endpoints
```

### Frontend Pages

```typescript
// apps/web/src/app/accounting/

accounts/           // Chart of Accounts management
rules/              // Categorization Rules management
bank-accounts/      // Bank Account management
general-ledger/     // General Ledger view (KEY PAGE)
reports/            // Report generation & viewing
```

---

## 🌱 Seed Data (Donovan Farms Defaults)

### Default Accounts (20+ accounts)

**Assets**:
- 1010: Cash - Operating Account
- 1020: Cash - Payroll Account

**Liabilities**:
- 2010: Credit Card Payable - AMEX
- 2020: Credit Card Payable - Chase

**Equity**:
- 3010: Owner's Capital
- 3020: Retained Earnings
- 3030: Owner Distributions

**Income**:
- 4010: Gross Receipts

**Expenses (COGS)**:
- 5010: Landscaping Supplies

**Expenses (Operating)**:
- 6010: Payroll - Harpers
- 6020: Meals - Business (50%)
- 6030: Insurance
- 6040: Utilities
- 6050: Hardware & Tools
- 6060: Fuel
- 6070: Government Fees
- 6080: Office Supplies
- 6090: Bank Fees
- 6100: Groceries - Personal (NON_DEDUCTIBLE)
- 6110: Liquor - Personal (NON_DEDUCTIBLE)
- 6120: Personal Shopping (NON_DEDUCTIBLE)

### Default Rules (30+ rules)

See `CLAUDE.md` in 2023bank directory for full list.

**Example Rules**:
```
Rule: "PRO LAWN" CONTAINS → Landscaping Supplies (100%)
Rule: "MAIN STREET DIS" CONTAINS → Liquor - Personal (NON_DEDUCTIBLE)
Rule: "9782 DONOVAN FAR" CONTAINS → Payroll - Harpers (100%)
Rule: "DEPOSIT BY CHECK" CONTAINS → Gross Receipts (100%)
Rule: "PC BRANCH TRANSFER" CONTAINS → TRANSFER (exclude from reports)
... (25 more rules)
```

---

## 🚀 Implementation Phases

### Phase 1: Database & API (Weekend 1)
**Goal**: Working backend with seed data

- [ ] Add Prisma models
- [ ] Create migrations
- [ ] Write seed script
- [ ] Build tRPC routers
- [ ] Test CRUD operations

**Deliverable**: API that can create accounts, rules, and transactions

### Phase 2: Import & Categorization (Weekend 2)
**Goal**: Import transactions and auto-categorize

- [ ] Build CSV import
- [ ] Build JSON import (for existing data)
- [ ] Rule matching engine
- [ ] Test with June 2023 (115 transactions)

**Deliverable**: June 2023 data imported and auto-categorized

### Phase 3: UI (Weekend 3)
**Goal**: User can manage everything via UI

- [ ] Chart of Accounts page
- [ ] Rules management page
- [ ] General Ledger page (KEY!)
- [ ] Bulk operations
- [ ] Rule creation prompt

**Deliverable**: Fully functional accounting UI

### Phase 4: Reports (Weekend 4)
**Goal**: Generate all 10 accountant reports

- [ ] Report generation service
- [ ] SQL queries for each report
- [ ] Report UI pages
- [ ] Export to CSV/PDF

**Deliverable**: All 10 reports working, ready for accountant

---

## 🎯 Success Criteria

**MVP Success = All of these work:**

1. ✅ Import 2023 bank transactions (April-December)
2. ✅ Auto-categorize with seed rules (95%+ accuracy)
3. ✅ Manually recategorize any transactions via UI
4. ✅ Generate all 10 accountant reports
5. ✅ December balance reconciliation: $3,188.62 ✓
6. ✅ Net income calculation: $30,246.38 ✓
7. ✅ Export reports to CSV for accountant
8. ✅ User can create/edit/delete accounts & rules

**Stretch Goals:**
- PDF vision import working
- Link transactions to invoices/receipts
- Mobile responsive UI

---

## 🧪 Testing Strategy

### Unit Tests
- Rule matching logic
- Report generation math
- Import parsing

### Integration Tests
- Full import → categorize → report flow
- CRUD operations via tRPC

### Manual Testing Checklist
- [ ] Import June 2023 (115 transactions)
- [ ] Verify auto-categorization accuracy
- [ ] Manually recategorize 10 transactions
- [ ] Generate all 10 reports
- [ ] Verify December balance: $3,188.62
- [ ] Export CSV and review with real data

---

## 📋 Open Questions

1. **Multi-currency support?** (Probably not needed - all USD)
2. **Audit log?** (Track who changed what when - nice to have)
3. **Permissions?** (Owner vs accountant access - future)
4. **API rate limits?** (Import could be heavy - use queue)

---

## 🔗 References

- **Existing Data**: `~/Downloads/Telegram Desktop/2023bank/2023bank/`
- **Rules**: See `CLAUDE.md` in above directory
- **AutoInvoice Repo**: `~/AutoInvoice/`
- **Prisma Schema**: `~/AutoInvoice/apps/backend/prisma/schema.prisma`

---

## 📝 Next Steps

**Before coding:**
1. Review this spec with user
2. Answer open questions
3. Get approval on UI mockups

**First commit:**
1. Create feature branch: `git checkout -b feature/accounting-module`
2. Add Prisma models
3. Run migration
4. Create seed script

**Let's build this! 🚀**

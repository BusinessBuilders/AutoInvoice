# Credit Card & Multi-Account Integration - Status

**Reference Plan**: `~/.claude/plans/bubbly-skipping-hanrahan.md`

## Current Status: Phase 2 In Progress

Last Updated: 2026-01-14

---

## Phase Checklist

### Phase 1: Link BankAccount to Account (Schema Change) ✅ COMPLETE

**Schema changes applied:**
- `apps/backend/prisma/schema.prisma`
  - Added `linkedAccountId` to BankAccount model
  - Added `isPrimary` boolean field
  - Added relation to Account model

```prisma
model BankAccount {
  linkedAccountId  String?
  linkedAccount    Account?   @relation(fields: [linkedAccountId], references: [id])
  isPrimary        Boolean    @default(false)
}
```

**Note**: Migration not yet applied - changes are in schema.prisma but need `npm run db:migrate`

---

### Phase 2: Auto-Create Chart of Accounts Entry 🔄 IN PROGRESS

**Completed:**
- Created `apps/backend/src/routers/bankAccounts.ts` with:
  - `create` mutation - creates BankAccount + auto-creates linked Account
  - `list` query - lists bank accounts with linked accounts
  - `getById` query
  - `update` mutation
  - `delete` mutation
  - `setPrimary` mutation

- Auto-creation logic in `bankTransactions.ts` import mutation:
  - Accepts optional `bankAccountId` parameter
  - Accepts optional `bankInfo` (bankName, accountNumber, accountType)
  - If no bankAccountId and bankInfo provided → auto-creates BankAccount + Account
  - Credit cards detected by name → creates LIABILITY account (code 2100+)
  - Bank accounts → creates ASSET account (code 1010+)

**Files modified:**
- `apps/backend/src/routers/bankAccounts.ts` (new)
- `apps/backend/src/routers/bankTransactions.ts` (import mutation updated)
- `apps/backend/src/routers/index.ts` (registered bankAccounts router)

**Pending:**
- Verify auto-creation works end-to-end
- Test credit card type detection

---

### Phase 3: Bank Account Management UI ❌ NOT STARTED

**Required:**
- Create `apps/web/src/app/accounting/bank-accounts/page.tsx`
- List all bank accounts
- Create new bank account with type selector
- Show linked Chart of Accounts entry
- Quick action to import statements

---

### Phase 4: General Ledger Account Selector 🔄 PARTIALLY DONE

**Completed:**
- Added bank account filter dropdown to General Ledger page
- Filter by "All Accounts" or specific bank accounts

**File:** `apps/web/src/app/accounting/general-ledger/page.tsx`

**Pending:**
- Test filter functionality

---

### Phase 5: Import Flow Enhancement ✅ COMPLETE

**Completed:**
- Added bank account selector to import page
- Updated labels to "Bank/Credit Card Statement"
- Import passes `bankInfo` from PDF parsing for auto-creation
- Credit cards auto-detected by name pattern

**File:** `apps/web/src/app/accounting/import/page.tsx`

---

## Technical Issues Being Resolved

### PDF Parsing - Production Solution

**Problem**: pdfjs-dist worker issues in Node.js environment

**Solution Implemented**: Switched to `pdf-parse` v2.x (npm package)

**File**: `apps/backend/src/services/accounting/pdf-parser.ts`

**Current Status**: ✅ Compiles successfully, needs runtime testing

**Changes made:**
```typescript
// Old (broken):
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// New (production):
import { PDFParse } from 'pdf-parse';

export async function extractPDFText(pdfBuffer: Buffer) {
  const parser = new PDFParse({ data: pdfBuffer });
  const info = await parser.getInfo();
  const textResult = await parser.getText();
  await parser.destroy();
  return { text: textResult.text, pageCount: info.total };
}
```

---

## Next Steps (In Order)

1. **Run database migration** to apply schema changes
   ```bash
   npm run db:migrate
   ```

2. **Restart backend** and test PDF import
   ```bash
   npm run build && npm run dev:backend
   ```

3. **Test credit card import flow**:
   - Upload a credit card PDF
   - Verify auto-creates BankAccount + LIABILITY Account
   - Check transactions appear in General Ledger

4. **Create Bank Accounts management page** (Phase 3)

---

## Files Modified This Session

| File | Status | Changes |
|------|--------|---------|
| `apps/backend/prisma/schema.prisma` | Modified | Added linkedAccountId, isPrimary |
| `apps/backend/src/routers/bankAccounts.ts` | New | Full CRUD router |
| `apps/backend/src/routers/bankTransactions.ts` | Modified | Import auto-creation |
| `apps/backend/src/routers/index.ts` | Modified | Registered router |
| `apps/backend/src/services/accounting/pdf-parser.ts` | Modified | pdf-parse v2.x |
| `apps/web/src/app/accounting/import/page.tsx` | Modified | Bank/CC labels, bankInfo |
| `apps/web/src/app/accounting/general-ledger/page.tsx` | Modified | Account filter, Rules link |
| `apps/web/src/app/accounting/rules/page.tsx` | New | Full rules management UI |

## Bug Fixes

### MOBIL → Fuel Rule Issue (Fixed)
- **Problem**: Rule `CONTAINS: MOBIL` was matching "MOBILE PAYMENT" transactions
- **Fix**: Changed rule to `CONTAINS: EXXONMOBIL` (more specific)
- **Reset**: 3 incorrectly categorized transactions marked for review

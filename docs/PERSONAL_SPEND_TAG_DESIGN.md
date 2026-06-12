# Personal-Spend Tag — Design (DESIGN ONLY, no implementation, no history changes)

**Status:** Proposed 2026-06-12 · **Decision needed from:** owner · **Implements:** nothing yet

## Problem

Personal-for-points charges go on business credit cards on purpose (points/cashback), but
today they either sit uncategorized ("needs review" forever) or get shoved into a business
expense category, which overstates expenses, distorts the P&L, and creates tax-time cleanup.
We need a first-class way to mark a charge (or part of one) as *personal*, so that:

1. Business reports (cash daily, P&L rollup, YTD pulse) exclude it automatically.
2. It stays visible and reportable ("how much personal spend ran through the business cards
   this quarter?") — for reimbursement/draw accounting and tax defense.
3. Mixed orders (one Amazon charge = business tools + personal items) work via the existing
   split system.

## Two candidate mechanisms

### Option A — Tax category: a "Personal (owner)" TaxAccount (RECOMMENDED)

One system TaxAccount per company:

```
code: 3300   name: "Personal (owner)"   accountType: EQUITY_CONTRA
```

`EQUITY_CONTRA` already exists in `TaxAccountType` ("Owner draws/distributions — reduces
equity") — a personal charge on a business card *is* an owner draw. No schema change at all.

Why it wins:

- **Zero changes to the frozen Wealth OS contract.** `v_company_cash_daily`, `v_ytd_pulse`,
  `v_company_pnl_rollup` all count expenses via `accountType LIKE 'EXPENSE%'` and income via
  `= 'INCOME'`. An `EQUITY_CONTRA` category is *already excluded* from both sides by every
  existing view. The byte-identical contract stays byte-identical.
- **Splits work today.** Amazon $100 = $60 Office Supplies + $40 Personal (owner) is exactly
  the existing split flow (`SUM(children) = parent` invariant enforced); the split-safe view
  predicate keeps the totals honest.
- **Vendors/rules compose.** A vendor that is always personal (e.g. a streaming service on
  the card for points) gets `defaultTaxAccountId` → Personal (owner); CategorizationRule
  patterns work unchanged.
- **Reportable now.** `v_transactions_search` / `search_transactions` already expose
  `category`, so `category ILIKE '%personal%'` answers the quarterly question with rows,
  count, and total_cents. A dedicated `v_personal_spend` rollup view (company × month ×
  card) can be added later if wanted — additive, like everything else.
- **Tax story is clean.** The bookkeeping convention (personal spend on business card =
  owner draw / shareholder distribution-or-loan depending on entity type) is standard;
  the category name maps 1:1 to what the accountant does with it.

### Option B — Boolean tag: `isPersonal` on BankTransaction (REJECTED)

Add `isPersonal Boolean @default(false)` and filter it everywhere.

Why it loses:

- **It breaks the frozen contract or silently lies.** The contract views cannot be altered
  (byte-identical regression baseline), so they would keep counting flagged charges as
  business expenses unless *also* categorized to a non-expense category — at which point the
  boolean is redundant with Option A.
- **Orthogonal-state bugs.** A transaction could be `isPersonal=true` AND categorized to
  EXPENSE_OPERATING; every report must then decide which signal wins. Two sources of truth.
- **Splits get weird.** Parent flagged, child not? Child flagged, parent not? The tax
  category already lives at the right grain (the split child).
- **Every future view/report must remember the flag.** Forgetting it = personal spend leaks
  back into business numbers with no error.

## Decision

**Option A.** One new system TaxAccount per company ("Personal (owner)", `EQUITY_CONTRA`,
`isSystemAccount=true`), created by a small seed/idempotent script at implementation time.
No schema migration. No view changes. No MCP changes (search_transactions already filters by
category).

## Implementation sketch (future session, ~small)

1. Idempotent script: upsert "Personal (owner)" (code 3300, EQUITY_CONTRA, system) for each
   active company.
2. UI: it appears in the existing category picker automatically (it's just a TaxAccount);
   optionally pin it near the top in the general-ledger categorize dropdown and split modal.
3. Optional later: `v_personal_spend` (company × month, cents) + grant — additive view, same
   guarded-GRANT pattern as `v_transactions_search`.
4. Optional later: a vendors flag ("usually personal") that pre-selects the category.

## Explicit non-goals

- **Do NOT recategorize history.** Existing transactions stay exactly as they are; the
  category is used going forward (and manually on specific past rows only if the owner
  chooses, one by one).
- No reimbursement workflow, no payroll integration, no per-user personal cards — out of
  scope until the simple category proves insufficient.

# Invoice Router Accounting Integration

## Summary

Successfully integrated automatic journal entry creation into the invoice router. When invoice status changes to SENT or PAID, the system now automatically creates corresponding journal entries for proper double-entry bookkeeping.

## Changes Made

### 1. Database Schema (`apps/backend/prisma/schema.prisma`)

Added two new optional fields to the `Invoice` model to track journal entries:

```prisma
model Invoice {
  // ... existing fields ...

  // Accounting Integration
  recognitionJournalEntryId String?  // Journal entry for revenue recognition (when SENT)
  paymentJournalEntryId     String?  // Journal entry for payment (when PAID)

  // ... relations ...
}
```

**Status**: ✅ Applied to database via `prisma db push`

### 2. Invoice Router (`apps/backend/src/routers/invoice.ts`)

#### Added Imports

```typescript
import {
  createInvoiceRecognitionEntry,
  createInvoicePaymentEntry
} from '../services/accounting/journal-service';
import logger from '../utils/logger';
```

#### Modified `updateStatus` Procedure

The `updateStatus` mutation now:

1. **Fetches current invoice** to check previous status and avoid duplicate entries
2. **Updates invoice status** as before
3. **Creates journal entries** based on status changes:

**When status changes to SENT:**
- Creates revenue recognition entry: `DR Accounts Receivable, CR Service Revenue (+ Sales Tax if applicable)`
- Stores `recognitionJournalEntryId` on invoice
- Only if:
  - Previous status was NOT SENT
  - No existing `recognitionJournalEntryId`

**When status changes to PAID:**
- Creates payment entry: `DR Cash, CR Accounts Receivable`
- Stores `paymentJournalEntryId` on invoice
- Only if:
  - Previous status was NOT PAID
  - No existing `paymentJournalEntryId`

#### Error Handling

```typescript
try {
  // Journal entry creation
} catch (error) {
  // Log error but don't fail invoice update
  // Ensures backward compatibility if accounting isn't set up
  logger.error('Failed to create journal entry for invoice', { ... });
}
```

**Graceful failure**: If journal entry creation fails (e.g., accounts not set up), the invoice status update still succeeds. Errors are logged for debugging.

## Accounting Flow

### Revenue Recognition (Invoice SENT)

```
Invoice Status: DRAFT → SENT

Journal Entry Created:
┌─────────────────────────────────────────┐
│ JE-XXXXXX: Revenue recognition for INV  │
├─────────────────────────────────────────┤
│ DR  Accounts Receivable    $100.00      │
│ CR  Service Revenue                $90.00│
│ CR  Sales Tax Payable              $10.00│
└─────────────────────────────────────────┘

Invoice.recognitionJournalEntryId = "JE-XXXXXX"
```

### Payment Receipt (Invoice PAID)

```
Invoice Status: SENT → PAID

Journal Entry Created:
┌─────────────────────────────────────────┐
│ JE-YYYYYY: Payment received for INV      │
├─────────────────────────────────────────┤
│ DR  Cash                       $100.00   │
│ CR  Accounts Receivable               $100.00│
└─────────────────────────────────────────┘

Invoice.paymentJournalEntryId = "JE-YYYYYY"
```

## Edge Cases Handled

### 1. Duplicate Prevention
- Checks `currentInvoice.status !== input.status` before creating entries
- Checks `!currentInvoice.recognitionJournalEntryId` and `!currentInvoice.paymentJournalEntryId`
- Prevents duplicate journal entries if status is updated multiple times

### 2. Status Change Order
- Works regardless of status change order
- Can go DRAFT → SENT → PAID (typical flow)
- Can go DRAFT → PAID directly (will only create payment entry, no recognition entry since it was never SENT)

### 3. Backward Compatibility
- Journal entry creation is wrapped in try-catch
- Invoice update succeeds even if accounting fails
- Existing invoices without journal entries continue to work
- System gracefully handles missing accounts

### 4. Re-sending or Re-paying
- If invoice is set to SENT multiple times, only first SENT creates entry
- If invoice is set to PAID multiple times, only first PAID creates entry
- Uses `!currentInvoice.recognitionJournalEntryId` check

## Testing Checklist

- [ ] Create invoice in DRAFT status → verify no journal entries created
- [ ] Update invoice to SENT → verify revenue recognition entry created
- [ ] Update invoice to PAID → verify payment entry created
- [ ] Check both journal entry IDs are stored on invoice
- [ ] Verify account balances are updated correctly:
  - [ ] Accounts Receivable increased when SENT
  - [ ] Service Revenue increased when SENT
  - [ ] Cash increased when PAID
  - [ ] Accounts Receivable decreased when PAID
- [ ] Test duplicate prevention:
  - [ ] Update to SENT twice → only one recognition entry
  - [ ] Update to PAID twice → only one payment entry
- [ ] Test backward compatibility:
  - [ ] Existing invoices without journal entries still work
  - [ ] Invoice update succeeds if accounting accounts don't exist
- [ ] Check logs for journal entry creation and errors

## Example Usage

```typescript
// Update invoice to SENT (creates revenue recognition entry)
const invoice = await trpc.invoice.updateStatus({
  id: 'inv_123',
  status: 'SENT'
});

// Check journal entry was created
console.log(invoice.recognitionJournalEntryId); // "JE-000001"

// Update invoice to PAID (creates payment entry)
const paidInvoice = await trpc.invoice.updateStatus({
  id: 'inv_123',
  status: 'PAID'
});

console.log(paidInvoice.paymentJournalEntryId); // "JE-000002"
```

## Related Files

- **Schema**: `/home/magiccat/AutoInvoice/apps/backend/prisma/schema.prisma`
- **Invoice Router**: `/home/magiccat/AutoInvoice/apps/backend/src/routers/invoice.ts`
- **Journal Service**: `/home/magiccat/AutoInvoice/apps/backend/src/services/accounting/journal-service.ts`

## Next Steps

1. **Test the integration**:
   - Create test invoice
   - Update status to SENT and PAID
   - Verify journal entries in database
   - Check account balances

2. **Setup accounting accounts** (if not already done):
   ```bash
   npm run cli --workspace=@autoinvoice/backend
   # Run account seeding or create manually
   ```

3. **Monitor logs** for any errors:
   ```bash
   # Look for: "Creating revenue recognition journal entry"
   # Look for: "Creating payment journal entry"
   # Look for: "Failed to create journal entry for invoice" (errors)
   ```

4. **Future enhancements**:
   - Add UI to view linked journal entries from invoice details
   - Support voiding invoices (void linked journal entries)
   - Support partial payments (create multiple payment entries)
   - Add invoice reversal (create reversing journal entries)

## Notes

- Journal entries are auto-posted (`autoPost: true`) for immediate balance updates
- All journal entry creation is logged with invoice ID and journal entry number
- System accounts (Cash, AR, Revenue, Sales Tax) are auto-created if they don't exist
- Journal service handles all double-entry validation and balance updates

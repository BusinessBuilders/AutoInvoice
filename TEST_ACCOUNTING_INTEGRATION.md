# Testing Invoice Accounting Integration

## Quick Manual Test

### Prerequisites

1. Start the development environment:
```bash
npm run docker:up
npm run dev:backend
```

2. Ensure accounting accounts are set up:
```bash
npm run cli --workspace=@autoinvoice/backend
# The system will auto-create required accounts on first journal entry
```

### Test Scenario 1: New Invoice Flow (DRAFT → SENT → PAID)

#### Step 1: Create a test invoice

```bash
# Using CLI or API
curl -X POST http://localhost:4000/invoice.create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer_id_here",
    "serviceDate": "2025-12-29",
    "dueDate": "2026-01-15",
    "lineItems": [
      {
        "description": "Test Service",
        "quantity": 1,
        "rate": 100,
        "amount": 100,
        "order": 0
      }
    ]
  }'
```

**Expected**:
- Invoice created in DRAFT status
- `recognitionJournalEntryId` = null
- `paymentJournalEntryId` = null
- No journal entries created

#### Step 2: Update invoice to SENT

```bash
curl -X POST http://localhost:4000/invoice.updateStatus \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "invoice_id_from_step_1",
    "status": "SENT"
  }'
```

**Expected**:
- Invoice status = SENT
- `recognitionJournalEntryId` = "JE-000001" (or similar)
- `sentAt` timestamp set
- Journal entry created:
  ```
  JE-000001: Revenue recognition for INV-000001
  DR  Accounts Receivable (1200)    $100.00
  CR  Service Revenue (4000)                 $100.00
  ```
- Account balances updated:
  - Accounts Receivable balance increased by $100
  - Service Revenue balance increased by $100

**Verify in database**:
```sql
-- Check invoice was updated
SELECT id, status, "recognitionJournalEntryId", "paymentJournalEntryId"
FROM "Invoice"
WHERE id = 'invoice_id_from_step_1';

-- Check journal entry was created
SELECT id, "entryNumber", description, status
FROM "JournalEntry"
WHERE "sourceType" = 'INVOICE'
  AND "sourceId" = 'invoice_id_from_step_1';

-- Check journal lines
SELECT jl.*, a.code, a.name
FROM "JournalLine" jl
JOIN "JournalEntry" je ON jl."journalEntryId" = je.id
JOIN "Account" a ON jl."accountId" = a.id
WHERE je."sourceId" = 'invoice_id_from_step_1'
ORDER BY jl."lineOrder";

-- Check account balances
SELECT code, name, balance, "balanceType"
FROM "Account"
WHERE code IN ('1200', '4000');
```

**Check logs**:
```bash
# Should see:
# "Creating revenue recognition journal entry" - invoiceId, invoiceNumber
# "Revenue recognition journal entry created" - journalEntryId, entryNumber
```

#### Step 3: Update invoice to PAID

```bash
curl -X POST http://localhost:4000/invoice.updateStatus \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "invoice_id_from_step_1",
    "status": "PAID"
  }'
```

**Expected**:
- Invoice status = PAID
- `paymentJournalEntryId` = "JE-000002" (or similar)
- `paidDate` timestamp set
- Journal entry created:
  ```
  JE-000002: Payment received for INV-000001
  DR  Cash (1010)                   $100.00
  CR  Accounts Receivable (1200)            $100.00
  ```
- Account balances updated:
  - Cash balance increased by $100
  - Accounts Receivable balance decreased by $100 (back to 0)

**Verify in database**:
```sql
-- Check invoice was updated
SELECT id, status, "recognitionJournalEntryId", "paymentJournalEntryId", "paidDate"
FROM "Invoice"
WHERE id = 'invoice_id_from_step_1';

-- Should show TWO journal entries now
SELECT id, "entryNumber", description, status
FROM "JournalEntry"
WHERE "sourceType" = 'INVOICE'
  AND "sourceId" = 'invoice_id_from_step_1'
ORDER BY "createdAt";

-- Check all journal lines for this invoice
SELECT je."entryNumber", jl.*, a.code, a.name
FROM "JournalLine" jl
JOIN "JournalEntry" je ON jl."journalEntryId" = je.id
JOIN "Account" a ON jl."accountId" = a.id
WHERE je."sourceId" = 'invoice_id_from_step_1'
ORDER BY je."createdAt", jl."lineOrder";

-- Final account balances (AR should be back to 0)
SELECT code, name, balance, "balanceType"
FROM "Account"
WHERE code IN ('1010', '1200', '4000');
```

**Expected Final Balances**:
- Cash (1010): +$100
- Accounts Receivable (1200): $0 (increased $100, then decreased $100)
- Service Revenue (4000): +$100

### Test Scenario 2: Duplicate Prevention

Try updating the invoice to SENT again:

```bash
curl -X POST http://localhost:4000/invoice.updateStatus \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "invoice_id_from_step_1",
    "status": "SENT"
  }'
```

**Expected**:
- Invoice remains in PAID status (or updates to SENT if you changed it back)
- NO new journal entry created
- `recognitionJournalEntryId` remains the same
- Account balances unchanged

### Test Scenario 3: Direct DRAFT → PAID (No SENT)

Create another invoice and mark it PAID directly:

```bash
# Create invoice (status = DRAFT)
# Then immediately mark as PAID

curl -X POST http://localhost:4000/invoice.updateStatus \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "new_invoice_id",
    "status": "PAID"
  }'
```

**Expected**:
- Invoice status = PAID
- `recognitionJournalEntryId` = null (was never SENT)
- `paymentJournalEntryId` = "JE-000003" (or similar)
- Only ONE journal entry created (payment entry)
- Accounts affected:
  - Cash increased by invoice total
  - Accounts Receivable increased by invoice total
  - NO Service Revenue entry (because invoice was never SENT)

**Note**: This might not be the desired behavior. If you want to require invoices to be SENT before PAID, add validation in the router.

### Test Scenario 4: Invoice with Tax

Create invoice with tax rate:

```bash
curl -X POST http://localhost:4000/invoice.create \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "customer_id_here",
    "serviceDate": "2025-12-29",
    "dueDate": "2026-01-15",
    "taxRate": 10,
    "lineItems": [
      {
        "description": "Test Service",
        "quantity": 1,
        "rate": 100,
        "amount": 100,
        "order": 0
      }
    ]
  }'

# Then update to SENT
```

**Expected when SENT**:
- Journal entry with 3 lines:
  ```
  DR  Accounts Receivable (1200)    $110.00
  CR  Service Revenue (4000)                 $100.00
  CR  Sales Tax Payable (2100)               $10.00
  ```

### Test Scenario 5: Backward Compatibility (No Accounting Setup)

If accounting accounts don't exist or journal service fails:

**Expected**:
- Invoice status update SUCCEEDS
- Error logged: "Failed to create journal entry for invoice"
- `recognitionJournalEntryId` and `paymentJournalEntryId` remain null
- Application doesn't crash

### Automated Test Script

```bash
#!/bin/bash
# test-accounting-integration.sh

echo "Testing Invoice Accounting Integration"
echo "======================================"

# Requires: jq, curl, psql

API_URL="http://localhost:4000"
TOKEN="your_token_here"

# Test 1: Create invoice
echo "Creating test invoice..."
INVOICE=$(curl -s -X POST "$API_URL/invoice.create" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "customerId": "test_customer",
    "serviceDate": "2025-12-29",
    "dueDate": "2026-01-15",
    "lineItems": [{
      "description": "Test Service",
      "quantity": 1,
      "rate": 100,
      "amount": 100,
      "order": 0
    }]
  }')

INVOICE_ID=$(echo "$INVOICE" | jq -r '.id')
echo "Invoice created: $INVOICE_ID"

# Test 2: Update to SENT
echo "Updating to SENT..."
SENT_INVOICE=$(curl -s -X POST "$API_URL/invoice.updateStatus" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"$INVOICE_ID\", \"status\": \"SENT\"}")

RECOGNITION_ENTRY=$(echo "$SENT_INVOICE" | jq -r '.recognitionJournalEntryId')
echo "Recognition journal entry: $RECOGNITION_ENTRY"

# Test 3: Update to PAID
echo "Updating to PAID..."
PAID_INVOICE=$(curl -s -X POST "$API_URL/invoice.updateStatus" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d "{\"id\": \"$INVOICE_ID\", \"status\": \"PAID\"}")

PAYMENT_ENTRY=$(echo "$PAID_INVOICE" | jq -r '.paymentJournalEntryId')
echo "Payment journal entry: $PAYMENT_ENTRY"

# Verify in database
echo "Verifying in database..."
psql -d invoice_platform -c "
  SELECT
    i.\"invoiceNumber\",
    i.status,
    i.\"recognitionJournalEntryId\",
    i.\"paymentJournalEntryId\",
    (SELECT COUNT(*) FROM \"JournalEntry\" WHERE \"sourceId\" = i.id) as journal_entry_count
  FROM \"Invoice\" i
  WHERE i.id = '$INVOICE_ID';
"

echo "✅ Test complete!"
```

## Expected Results Summary

| Action | Journal Entry | Account Debits | Account Credits |
|--------|--------------|----------------|-----------------|
| Invoice SENT | Revenue Recognition | AR +$100 | Revenue +$100 |
| Invoice PAID | Payment Receipt | Cash +$100 | AR -$100 |
| **Final Balances** | | Cash +$100, AR $0 | Revenue +$100 |

## Troubleshooting

### Issue: No journal entry created

**Check**:
1. Are accounting accounts set up?
   ```sql
   SELECT * FROM "Account" WHERE code IN ('1010', '1200', '4000');
   ```
2. Check application logs for errors
3. Verify journal service is imported correctly

### Issue: TypeScript errors

**Check**:
- Run `npm run generate --workspace=@autoinvoice/backend`
- Run `npm run build --workspace=@autoinvoice/backend`
- Ensure `JournalEntryResult` is exported in journal-service.ts

### Issue: Database out of sync

**Fix**:
```bash
cd apps/backend
npx prisma db push
npx prisma generate
```

### Issue: Duplicate journal entries

**Check**:
- Verify `recognitionJournalEntryId` and `paymentJournalEntryId` are set correctly
- Check duplicate prevention logic in router
- Verify current invoice status is fetched before creating entries

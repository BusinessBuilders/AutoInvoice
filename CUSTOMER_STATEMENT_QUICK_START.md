# Customer Statement - Quick Start Guide

## API Endpoints

### 1. Get Customer Statement

Fetch statement data for a customer.

```typescript
const statement = await trpc.customerStatement.getStatement.query({
  customerId: 'customer_id_here',
  includeStatuses: ['SENT', 'OVERDUE'], // Optional
  startDate: new Date('2024-01-01'),    // Optional
  endDate: new Date('2024-12-31'),      // Optional
});

// Response
{
  customer: { id, name, email, phone, company },
  invoices: [
    {
      id: string,
      invoiceNumber: string,
      date: Date,
      dueDate: Date,
      total: string,
      status: 'SENT' | 'OVERDUE' | 'PAID',
      daysOverdue: number
    }
  ],
  summary: {
    totalInvoices: number,
    totalAmount: string,
    overdueAmount: string,
    overdueCount: number
  }
}
```

### 2. Mark Invoice as Paid

```typescript
const invoice = await trpc.customerStatement.markInvoiceAsPaid.mutate({
  invoiceId: 'invoice_id_here',
  paidDate: new Date(),              // Optional (defaults to now)
  paymentMethod: 'check',            // Optional: 'cash' | 'check' | 'card' | 'bank_transfer' | 'other'
});

// Side Effects:
// - Sets invoice.status = 'PAID'
// - Records invoice.paidDate
// - Creates payment journal entry (if accounting enabled)
```

### 3. Send Customer Statement

Generate PDF and optionally email to customer.

```typescript
const result = await trpc.customerStatement.sendStatement.mutate({
  customerId: 'customer_id_here',
  sendEmail: true,  // Optional (defaults to true)
});

// Response
{
  pdfPath: string,        // Local file path: ./statements/statement-{name}-{date}.pdf
  emailSent: boolean,     // Whether email was sent
  invoiceCount: number,   // Number of invoices included
  totalAmount: string     // Total amount due
}
```

## Files Created

```
/home/magiccat/AutoInvoice/
├── apps/backend/src/
│   ├── routers/
│   │   ├── customerStatement.ts          ✅ NEW: tRPC router
│   │   └── index.ts                      ✅ UPDATED: Router registration
│   ├── services/pdf/
│   │   └── statement-generator.ts        ✅ NEW: PDF generator
│   └── __tests__/
│       └── customerStatement.test.ts     ✅ NEW: Unit tests
├── docs/features/
│   └── customer-statements.md            ✅ NEW: Full documentation
└── statements/                           ✅ NEW: PDF output directory
    └── statement-*.pdf
```

## Testing

```bash
# TypeScript compilation check
cd /home/magiccat/AutoInvoice/apps/backend
npx tsc --noEmit --skipLibCheck

# Run unit tests
npm run test -- customerStatement

# Generate Prisma client
npm run generate --workspace=@autoinvoice/backend
```

## Environment Variables

Required in `.env`:

```bash
# Company info (used in PDF statements)
COMPANY_NAME="Your Company Name"
COMPANY_EMAIL="billing@yourcompany.com"
COMPANY_PHONE="(555) 123-4567"
COMPANY_ADDRESS="123 Business St, City, ST 12345"

# Gmail API (for email delivery)
GOOGLE_CLIENT_ID="your_google_client_id"
GOOGLE_CLIENT_SECRET="your_google_client_secret"

# Optional
BRAND_COLOR="#2563eb"
```

## Next Steps

### Frontend Integration

Create a customer statement page:

```typescript
// pages/customers/[id]/statement.tsx
import { trpc } from '@/lib/trpc';

export default function CustomerStatement({ customerId }) {
  const { data } = trpc.customerStatement.getStatement.useQuery({ customerId });
  const sendStatement = trpc.customerStatement.sendStatement.useMutation();
  const markPaid = trpc.customerStatement.markInvoiceAsPaid.useMutation();

  return (
    <div>
      <h1>Statement for {data?.customer.name}</h1>
      
      <div className="summary">
        <p>Total Due: ${data?.summary.totalAmount}</p>
        <p>Overdue: ${data?.summary.overdueAmount}</p>
      </div>

      <table>
        {data?.invoices.map(invoice => (
          <tr key={invoice.id}>
            <td>{invoice.invoiceNumber}</td>
            <td>${invoice.total}</td>
            <td>{invoice.status}</td>
            <td>
              {invoice.status !== 'PAID' && (
                <button onClick={() => markPaid.mutate({ invoiceId: invoice.id })}>
                  Mark Paid
                </button>
              )}
            </td>
          </tr>
        ))}
      </table>

      <button onClick={() => sendStatement.mutate({ customerId })}>
        Email Statement
      </button>
    </div>
  );
}
```

### CLI Integration

```bash
# Add to apps/backend/src/cli.ts

import { generateCustomerStatement } from './services/pdf/statement-generator';

program
  .command('statement <customerName>')
  .option('--email', 'Send via email')
  .option('--no-email', 'Generate PDF only')
  .action(async (customerName, options) => {
    const customer = await findCustomerByName(customerName);
    const result = await trpc.customerStatement.sendStatement.mutate({
      customerId: customer.id,
      sendEmail: options.email,
    });
    console.log(`Statement generated: ${result.pdfPath}`);
    if (result.emailSent) {
      console.log(`Email sent to: ${customer.email}`);
    }
  });
```

## Full Documentation

See `/home/magiccat/AutoInvoice/docs/features/customer-statements.md` for:
- Complete API reference
- PDF format details
- Email template specification
- Advanced usage examples
- Error handling guide
- Future enhancements roadmap

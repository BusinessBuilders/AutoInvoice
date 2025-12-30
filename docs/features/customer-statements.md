# Customer Statement Feature

## Overview

The Customer Statement feature allows businesses to generate and send professional account statements to customers showing their unpaid invoices, payment history, and account status. This is essential for:

- Monthly billing cycles
- Following up on overdue payments
- Providing customers with account summaries
- Professional financial record-keeping

## Features

### 1. Statement Generation
- **Professional PDF format** with company branding
- **Invoice summary table** with dates, amounts, and status
- **Account summary** showing total due and overdue amounts
- **Overdue highlighting** with days overdue counter
- **Payment instructions** and company contact info

### 2. Statement Delivery
- **Email delivery** with PDF attachment
- **Automated email templates** with professional formatting
- **Local file storage** for record-keeping
- **Bulk statement generation** (planned)

### 3. Payment Tracking
- **Mark invoices as paid** from statement view
- **Payment method tracking** (cash, check, card, etc.)
- **Automatic journal entry creation** for accounting integration
- **Payment date recording**

## API Endpoints

### Get Customer Statement

Fetch statement data for a customer with filtering options.

```typescript
// tRPC endpoint
trpc.customerStatement.getStatement.query({
  customerId: string,
  includeStatuses?: ['SENT' | 'OVERDUE' | 'PAID'][], // Default: ['SENT', 'OVERDUE']
  startDate?: Date,
  endDate?: Date,
})

// Response
{
  customer: {
    id: string,
    name: string,
    email: string | null,
    phone: string | null,
    company: string | null,
  },
  invoices: Array<{
    id: string,
    invoiceNumber: string,
    date: Date,
    dueDate: Date,
    total: string, // Decimal as string
    status: InvoiceStatus,
    daysOverdue: number,
  }>,
  summary: {
    totalInvoices: number,
    totalAmount: string,
    overdueAmount: string,
    overdueCount: number,
  }
}
```

**Example Usage:**
```typescript
// Get unpaid invoices for customer
const statement = await trpc.customerStatement.getStatement.query({
  customerId: 'cust_123',
  includeStatuses: ['SENT', 'OVERDUE'],
});

// Get all invoices in date range
const yearStatement = await trpc.customerStatement.getStatement.query({
  customerId: 'cust_123',
  includeStatuses: ['SENT', 'OVERDUE', 'PAID'],
  startDate: new Date('2024-01-01'),
  endDate: new Date('2024-12-31'),
});
```

### Mark Invoice as Paid

Update invoice status to PAID and record payment details.

```typescript
// tRPC endpoint
trpc.customerStatement.markInvoiceAsPaid.mutation({
  invoiceId: string,
  paidDate?: Date, // Defaults to now
  paymentMethod?: 'cash' | 'check' | 'card' | 'bank_transfer' | 'other',
})

// Response
Invoice // Updated invoice with PAID status
```

**Example Usage:**
```typescript
// Mark invoice paid with default date (now)
const invoice = await trpc.customerStatement.markInvoiceAsPaid.mutate({
  invoiceId: 'inv_123',
  paymentMethod: 'check',
});

// Mark invoice paid with backdated payment
const invoice = await trpc.customerStatement.markInvoiceAsPaid.mutate({
  invoiceId: 'inv_456',
  paidDate: new Date('2024-12-15'),
  paymentMethod: 'cash',
});
```

**Side Effects:**
- Sets invoice status to `PAID`
- Records `paidDate`
- Creates payment journal entry (if accounting enabled)
- Links journal entry to invoice

### Send Customer Statement

Generate PDF statement and optionally email to customer.

```typescript
// tRPC endpoint
trpc.customerStatement.sendStatement.mutation({
  customerId: string,
  sendEmail?: boolean, // Default: true
})

// Response
{
  pdfPath: string, // Local file path to generated PDF
  emailSent: boolean, // Whether email was sent successfully
  invoiceCount: number, // Number of invoices included
  totalAmount: string, // Total amount due
}
```

**Example Usage:**
```typescript
// Generate and email statement
const result = await trpc.customerStatement.sendStatement.mutate({
  customerId: 'cust_123',
  sendEmail: true,
});

// Generate PDF only (no email)
const result = await trpc.customerStatement.sendStatement.mutate({
  customerId: 'cust_123',
  sendEmail: false,
});
```

**Requirements:**
- Customer must have valid email address (if `sendEmail: true`)
- Gmail API must be configured (if `sendEmail: true`)
- At least one unpaid invoice (SENT or OVERDUE status)

## PDF Statement Format

### Header Section
- Company name, address, phone, email (top right)
- "STATEMENT OF ACCOUNT" title (blue banner)
- Statement date

### Customer Section
- Customer name
- Company name (if applicable)
- Email address

### Summary Box
- Total amount due (highlighted in blue)
- Overdue amount (highlighted in red, if any)
- Clean bordered box with background color

### Invoice Table
- Invoice number
- Invoice date
- Due date
- Amount
- Status (SENT, OVERDUE with days counter, PAID)
- Alternating row colors for readability
- Auto-pagination for long invoice lists

### Payment Instructions
- Remittance address
- Make checks payable to
- Include invoice numbers
- Contact information

### Overdue Notice (if applicable)
- Red bordered warning box
- "PAYMENT PAST DUE" heading
- Urgent payment request

### Footer
- Thank you message
- Statement generation date

## Email Template

Professional HTML email with:

### Header
- "Statement of Account" title with date
- Company branding

### Body
- Personalized greeting
- Account summary box with key metrics
- Green box for current accounts ("Account Current")
- Red box for overdue accounts ("Payment Past Due")
- Payment options list
- Contact information

### Styling
- Responsive design (mobile-friendly)
- Professional color scheme (blue primary, red for overdue)
- Clear typography and spacing
- Branded footer

## File Storage

Statements are saved locally in `./statements/` directory:

**Naming Convention:**
```
statement-{customer-name-slug}-{YYYY-MM-DD}.pdf
```

**Example:**
```
statements/statement-john-doe-2024-12-30.pdf
statements/statement-acme-corp-2024-12-30.pdf
```

## Multi-Tenancy

All endpoints enforce multi-tenancy via `ctx.user.id`:
- Invoices are filtered by customer relationship
- Customers are implicitly filtered through invoices
- User branding is applied to PDFs and emails

## Accounting Integration

### Journal Entries

When marking invoice as paid, a journal entry is automatically created:

**Payment Entry:**
```
Dr. Cash/Bank Account         $XXX.XX
  Cr. Accounts Receivable             $XXX.XX
    (Payment received for INV-001)
```

**Entry Details:**
- Source type: `INVOICE`
- Source ID: Invoice ID
- Reference number: Invoice number
- Description: "Payment received for [invoice number]"
- Posted by: Current user ID

**Failure Handling:**
- Journal entry errors are logged but don't fail the payment update
- Ensures backward compatibility if accounting isn't fully set up

## Usage Examples

### CLI Commands

```bash
# Generate statement for customer (no email)
npm run cli --workspace=@autoinvoice/backend \
  statement "John Doe" --no-email

# Generate and email statement
npm run cli --workspace=@autoinvoice/backend \
  statement "Acme Corp" --email

# Mark invoice as paid
npm run cli --workspace=@autoinvoice/backend \
  pay-invoice INV-001 --method check
```

### Web App Integration

```typescript
// Statement page component
import { trpc } from '@/lib/trpc';

function CustomerStatementPage({ customerId }: { customerId: string }) {
  const { data: statement } = trpc.customerStatement.getStatement.useQuery({
    customerId,
  });

  const sendStatement = trpc.customerStatement.sendStatement.useMutation();
  const markPaid = trpc.customerStatement.markInvoiceAsPaid.useMutation();

  const handleSendStatement = async () => {
    await sendStatement.mutateAsync({ customerId, sendEmail: true });
    toast.success('Statement sent successfully');
  };

  const handleMarkPaid = async (invoiceId: string) => {
    await markPaid.mutateAsync({ invoiceId, paymentMethod: 'check' });
    toast.success('Invoice marked as paid');
  };

  return (
    <div>
      <h1>Statement for {statement?.customer.name}</h1>
      
      {/* Summary */}
      <div className="summary-box">
        <p>Total Due: ${statement?.summary.totalAmount}</p>
        <p>Overdue: ${statement?.summary.overdueAmount}</p>
      </div>

      {/* Invoice table */}
      <table>
        {statement?.invoices.map(inv => (
          <tr key={inv.id}>
            <td>{inv.invoiceNumber}</td>
            <td>{inv.total}</td>
            <td>{inv.status}</td>
            <td>
              <button onClick={() => handleMarkPaid(inv.id)}>
                Mark Paid
              </button>
            </td>
          </tr>
        ))}
      </table>

      <button onClick={handleSendStatement}>
        Email Statement
      </button>
    </div>
  );
}
```

### Telegram Bot Integration

```typescript
// Send statement via Telegram command
bot.command('statement', async (ctx) => {
  const customerName = ctx.message.text.split(' ').slice(1).join(' ');
  
  // Find customer
  const customer = await findCustomerByName(customerName);
  
  // Generate statement
  const result = await trpc.customerStatement.sendStatement.mutate({
    customerId: customer.id,
    sendEmail: true,
  });
  
  ctx.reply(
    `Statement generated for ${customer.name}\n` +
    `${result.invoiceCount} invoices, $${result.totalAmount} due\n` +
    `Email sent: ${result.emailSent ? 'Yes' : 'No'}`
  );
});
```

## Configuration

### Environment Variables

```bash
# Company info (used in statements)
COMPANY_NAME="Your Company Name"
COMPANY_EMAIL="billing@yourcompany.com"
COMPANY_PHONE="(555) 123-4567"
COMPANY_ADDRESS="123 Business St, City, ST 12345"

# Gmail API (for email delivery)
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."

# Optional: Brand color
BRAND_COLOR="#2563eb"
```

### User Branding

Users can override defaults via their profile:
- `companyName`
- `companyEmail`
- `companyPhone`
- `companyAddress`
- `logoPath` (planned)
- `brandColors` (planned)

## Error Handling

### Common Errors

**Customer not found:**
```typescript
throw new Error('Customer not found');
```

**No email address:**
```typescript
// Email sending is skipped
// PDF is still generated
return { pdfPath, emailSent: false };
```

**Gmail not configured:**
```typescript
throw new Error('Google OAuth2 not configured');
```

**Failed to send email:**
```typescript
// Error is logged but not thrown
// PDF path is still returned
logger.error('Failed to send statement email', { error });
```

## Testing

Run tests:
```bash
npm run test --workspace=@autoinvoice/backend -- customerStatement
```

Test files:
- `src/__tests__/customerStatement.test.ts`

## Future Enhancements

### Planned Features
- [ ] Bulk statement generation (all customers)
- [ ] Statement scheduling (monthly auto-send)
- [ ] Statement templates (multiple designs)
- [ ] Statement history tracking
- [ ] Payment links in statements
- [ ] Partial payment tracking
- [ ] Payment plans
- [ ] Statement-triggered automations

### UI Improvements
- [ ] Statement preview before sending
- [ ] Inline PDF viewer
- [ ] Print-friendly version
- [ ] Export to CSV/Excel
- [ ] Custom statement notes
- [ ] Logo upload for statements

### Integration Improvements
- [ ] QuickBooks sync
- [ ] Stripe payment links
- [ ] SMS statement delivery
- [ ] Statement analytics dashboard

## Related Features

- **Invoice Management**: `/docs/features/invoices.md`
- **Accounting System**: `/docs/features/accounting.md`
- **Email Service**: `/docs/features/email.md`
- **PDF Generation**: `/docs/features/pdf-generation.md`
- **Customer Management**: `/docs/features/customers.md`

## Support

For questions or issues:
- Check logs: `apps/backend/logs/`
- Review statement PDFs: `statements/`
- Test endpoints: Use Postman or tRPC DevTools
- Contact: support@autoinvoice.app

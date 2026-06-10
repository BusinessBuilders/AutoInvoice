# Quick Start Guide - Smart Invoice Templates

Get up and running in **5 minutes**! 🚀

## Setup (One Time)

### 1. Add Your Customers

```bash
cd apps/backend

# Add Blair
npm run cli customer:add "Blair" \
  --email blair@example.com \
  --phone "(555) 123-4567" \
  --nickname Blair "blair property"

# Add Hawthon
npm run cli customer:add "Hawthon" \
  --email hawthon@example.com \
  --nickname Hawthon "hawthon walks"
```

### 2. Add Your Services

```bash
# Hydroseeding
npm run cli service:add "Hydroseeding" HYDROSEED Landscaping \
  --price 0.15 \
  --unit sqft

# Salt/De-icing
npm run cli service:add "Salt & De-Ice" SALT Winter \
  --price 75 \
  --unit visit

# Lawn Mowing
npm run cli service:add "Lawn Mowing" LAWN_MOW "Lawn Care" \
  --price 50 \
  --unit visit
```

### 3. Set Custom Pricing (Optional)

```bash
# Blair gets special hydroseed pricing
npm run cli pricing:set Blair Hydroseeding 0.12 --unit sqft

# Hawthon gets package deal on salting
npm run cli pricing:set Hawthon Salt 65 --unit visit

# View pricing
npm run cli pricing:show Blair
```

## Daily Use - Create Invoices INSTANTLY!

### Method 1: CLI (Super Fast!)

```bash
# Hydroseed for Blair
npm run cli quick "9999 sqft of hydroseed for Blair today" --pdf

# Output:
# 🚀 Creating quick invoice...
#
# ✅ Invoice Created!
# 📄 Invoice #: INV-000042
# 👤 Customer: Blair
# 💰 Total: $1199.88
# 📅 Date: 11/15/2024
#
# 📄 Generating PDF...
# ✅ PDF saved: ./invoices/INV-000042.pdf
```

That's it! **One command = Invoice + PDF** 🎉

### Method 2: Telegram Bot (From Your Phone!)

1. Message your bot:
   ```
   "Salted walks at Hawthon today"
   ```

2. Bot responds:
   ```
   ✅ Invoice parsed!

   Customer: Hawthon
   Service: Salt & De-Ice
   Total: $65.00

   Confirm to create?
   ```

3. Reply: `confirm`

4. Done! PDF auto-generated.

### More Examples

```bash
# Lawn mowing
npm run cli quick "Mowed lawn for Blair yesterday" --pdf

# Custom amount
npm run cli quick "Tree trimming for Hawthon, 3 hours at $75/hr" --pdf

# Multiple properties
npm run cli quick "Salted Hawthon walks and driveway, $95 total" --pdf
```

## View & Manage

### List Everything

```bash
# View all customers
npm run cli customer:list

# View all services
npm run cli service:list

# View recent invoices
npm run cli invoice:list

# See stats
npm run cli stats
```

### Generate PDF Later

```bash
# Generate PDF for existing invoice
npm run cli pdf <invoice-id>

# Use different template
npm run cli pdf <invoice-id> --template minimal
```

## Natural Language Examples

The system understands natural language! Try:

✅ `"9999 square feet of hydroseeding for Blair today"`
✅ `"Salted walks at Hawthon"`
✅ `"Mowed lawn for Blair yesterday $50"`
✅ `"Tree trimming Hawthon 3 hours $75/hour"`
✅ `"Fertilized Blair property 5000 sqft"`

## Pro Tips

### 1. Use Nicknames

```bash
# These all work:
"Hydroseed for Blair"
"Hydroseed for blair property"
"Hydroseed for Blair's place"
```

### 2. Smart Service Matching

```bash
# These all match "Hydroseeding":
"hydroseed"
"hydroseeding"
"seed"

# These all match "Salt & De-Ice":
"salt"
"salting"
"de-ice"
```

### 3. Quick Price Checks

```bash
npm run cli pricing:show Blair
npm run cli pricing:show Hawthon
```

### 4. Batch Operations

```bash
# Create multiple invoices
npm run cli quick "Mowed Blair" --pdf
npm run cli quick "Salted Hawthon" --pdf
npm run cli quick "Trimmed Hawthon trees 2 hours" --pdf
```

## Common Workflows

### Morning Routine

```bash
# Check what's pending
npm run cli invoice:list --status=DRAFT

# Generate all PDFs
for id in invoice-id-1 invoice-id-2; do
  npm run cli pdf $id
done

# View stats
npm run cli stats
```

### End of Day

```bash
# Create today's invoices
npm run cli quick "Mowed Blair" --pdf
npm run cli quick "Salted Hawthon" --pdf

# Check totals
npm run cli stats
```

### Weekly Cleanup

```bash
# Send all draft invoices
npm run cli invoice:list --status=DRAFT

# Generate PDFs for all
# Email them out (when enabled)
```

## Troubleshooting

### "Customer not found"

```bash
# Add customer first
npm run cli customer:add "Customer Name" --email user@email.com
```

### "Service not found"

```bash
# Add service first
npm run cli service:add "Service Name" SERVICE_CODE Category --price 50
```

### "Wrong price calculated"

```bash
# Check pricing
npm run cli pricing:show "Customer Name"

# Set custom price
npm run cli pricing:set "Customer Name" "Service" 99.99
```

## Next Steps

1. **Add all your customers** (5 minutes)
2. **Add all your services** (5 minutes)
3. **Set custom pricing** (optional)
4. **Start creating invoices!** ⚡

## Example: Complete Setup

```bash
# Add 3 customers
npm run cli customer:add "Blair" --email blair@email.com --nickname Blair "blair property"
npm run cli customer:add "Hawthon" --email hawthon@email.com --nickname Hawthon
npm run cli customer:add "Johnson" --email johnson@email.com

# Add 3 services
npm run cli service:add "Hydroseeding" HYDROSEED Landscaping --price 0.15 --unit sqft
npm run cli service:add "Salt & De-Ice" SALT Winter --price 75 --unit visit
npm run cli service:add "Lawn Mowing" LAWN_MOW "Lawn Care" --price 50 --unit visit

# Set Blair's special pricing
npm run cli pricing:set Blair Hydroseeding 0.12 --unit sqft

# Create first invoice!
npm run cli quick "9999 sqft hydroseed for Blair today" --pdf

# 🎉 DONE!
```

## You're Ready!

Now you can create invoices in **seconds** instead of minutes!

Questions? Check the [full docs](./README.md) or open an issue.

**Happy Invoicing!** 💰

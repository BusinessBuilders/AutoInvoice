# How to Use Custom Letterhead and Templates

AutoInvoice supports custom branding for your invoices!

## 🎨 Setup Your Branding

### 1. Add Company Information

Edit your `.env` file:

```bash
# Company Branding
COMPANY_NAME="Your Company Name"
COMPANY_ADDRESS="123 Business Street, Suite 100"
COMPANY_PHONE="(555) 123-4567"
COMPANY_EMAIL="billing@yourcompany.com"
COMPANY_WEBSITE="www.yourcompany.com"
COMPANY_TAX_ID="12-3456789"

# Brand Colors (hex)
BRAND_COLOR="#2563eb"  # Your primary brand color
```

### 2. Add Your Logo

Place your company logo in the `assets` folder:

```bash
mkdir -p apps/backend/assets
cp /path/to/your-logo.png apps/backend/assets/logo.png
```

**Logo requirements:**
- Format: PNG (transparent background recommended)
- Size: 300x100px (or similar ratio)
- Max file size: 500KB

### 3. Add Custom Letterhead (Optional)

For full letterhead with header/footer:

```bash
cp /path/to/letterhead.png apps/backend/assets/letterhead.png
```

## 📄 Available Templates

### Professional (Default)
Full-featured invoice with:
- Company logo
- Branded color scheme
- Professional layout
- Payment info box
- Company details

### Minimal
Clean, simple invoice with:
- Basic header
- Line items
- Total
- No logo or branding

### Standard
Traditional invoice layout

## 🚀 How to Use

### Via Telegram Bot

1. **Create invoice naturally:**
   ```
   "Invoice John Smith for lawn service, $75"
   ```

2. **Bot generates PDF automatically** with your branding!

### Via CLI

```bash
npm run cli invoice:create "John, lawn mowing, $50"
```

### Via API

```typescript
import { generateInvoicePdf } from './services/pdf/professional-generator';

const pdf = await generateInvoicePdf({
  invoiceId: 'invoice-id',
  template: 'professional',  // or 'minimal', 'standard'
  includeLetterhead: true,
  logoPath: './assets/logo.png',
  brandColor: '#2563eb',
});
```

## 📸 Receipt OCR via Telegram

### How It Works

1. **Take a photo** of any receipt with your phone
2. **Send to Telegram bot**
3. **AI extracts data** automatically:
   - Vendor name
   - Total amount
   - Date
   - Individual items
   - Category

4. **Review & save** the extracted data

### Example Conversation

**You:** [Send photo of receipt]

**Bot:**
```
📷 Processing receipt image...

✅ Receipt Extracted!

━━━━━━━━━━━━━━━━━━━━━━
🏪 Vendor: Home Depot
💰 Amount: $156.43
📅 Date: 2024-01-15
📁 Category: Hardware
🎯 Confidence: 94.2%
━━━━━━━━━━━━━━━━━━━━━━

Reply "save" to save this receipt.
```

**You:** save

**Bot:** ✅ Receipt saved to your account!

## 🎯 Natural Language Invoice Creation

### Via Telegram

Just text naturally:

```
"Create invoice for Mike Johnson
Mowed lawn and trimmed edges
Today
Total $60"
```

Bot will:
1. Parse with AI
2. Show confirmation
3. Create invoice
4. Generate branded PDF
5. Ask if you want to email it

### Advanced Examples

**Multiple services:**
```
"Invoice Sarah - lawn mowing $40, fertilizer $30, total $70"
```

**With date:**
```
"Bill John Smith for tree trimming yesterday, 3 hours at $50/hr"
```

**Voice message:**
Record and send:
> "Hey, create an invoice for the Johnson property. We did lawn care today, fifty dollars."

Bot transcribes and processes!

## 🎨 Customization Options

### Colors

Choose your brand color:
```bash
BRAND_COLOR="#FF6B6B"  # Red
BRAND_COLOR="#4ECDC4"  # Teal
BRAND_COLOR="#95E1D3"  # Mint
BRAND_COLOR="#2563eb"  # Blue (default)
```

### Templates

**Professional** - Full branding
```typescript
template: 'professional'
```

**Minimal** - Clean and simple
```typescript
template: 'minimal'
```

**Standard** - Traditional
```typescript
template: 'standard'
```

## 📧 Email with Custom Template

Invoices sent via email include:
- Beautiful HTML template
- Your company branding
- PDF attachment
- Professional formatting

**To send:**
```bash
# Via CLI
npm run cli invoice:send <invoice-id>

# Via Telegram
/send INV-000123
```

## 💡 Pro Tips

1. **Use high-quality logo**: PNG with transparent background
2. **Keep colors professional**: Avoid bright neon colors
3. **Test templates**: Generate a sample invoice first
4. **Mobile receipts**: Take clear, well-lit photos for best OCR results
5. **Voice messages**: Speak clearly, mention customer name and amount

## 🔧 Troubleshooting

### Logo not showing?
- Check file path in `.env`
- Ensure PNG format
- Verify file permissions

### OCR not accurate?
- Take photo in good lighting
- Ensure receipt is flat and clear
- Avoid shadows and glare

### Template not loading?
- Check template name spelling
- Verify all environment variables set
- Check server logs: `npm run cli worker:start`

## 🎉 You're Ready!

Now you can:
✅ Take receipt photos → Auto-extract data
✅ Text bot naturally → Create invoices
✅ Send voice messages → Generate invoices
✅ Use custom branding → Professional PDFs
✅ Email clients → Branded templates

**Start using it NOW via Telegram!** 🚀

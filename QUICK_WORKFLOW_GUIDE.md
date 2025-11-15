# 🚀 Quick Workflow Guide - Web Setup + Telegram Invoicing

**Perfect for: Field workers who want to set up customers once, then create invoices on-the-go via Telegram**

---

## 📋 Your Workflow in 3 Steps

### Step 1️⃣: Set Up Customers & Pricing (Web - One Time)
### Step 2️⃣: Install Telegram Bot (One Time - 5 min)
### Step 3️⃣: Create Invoices (Telegram - Daily, 10 seconds)

---

# STEP 1: Setup Customers (Web UI - One Time)

## Start the Application

```bash
# Run setup script
./setup-database.sh

# Start backend (Terminal 1)
cd apps/backend
npm install
npm run dev

# Start web UI (Terminal 2)
cd apps/web
npm install
npm run dev

# Open browser
http://localhost:3000
```

## Add Your Customers

### Customer 1: John Smith

```
1. Go to: http://localhost:3000/customers
2. Click "Add Customer"
3. Fill in:

   Name: John Smith
   Email: john@example.com
   Phone: (555) 123-4567

   Nicknames (important!):
   - John
   - JS
   - Johnny

4. Click "Create Customer"
```

### Customer 2: Blair Property

```
1. Click "Add Customer" again
2. Fill in:

   Name: Blair Property Management LLC
   Email: blair@example.com
   Phone: (555) 987-6543

   Nicknames (important!):
   - Blair
   - Blair Property
   - BPM

3. Click "Create Customer"
```

### Add More Customers

**Repeat for all your regular customers**

---

## Add Services You Offer

```
1. Go to: http://localhost:3000/services
2. Click "Add Service"

Service 1:
   Name: Lawn Mowing
   Code: LAWN-MOW
   Category: Lawn Care
   Base Price: 50
   Unit: hour
   Click "Create"

Service 2:
   Name: Hydroseed
   Code: HYDRO
   Category: Lawn Care
   Base Price: 0.15
   Unit: sqft
   Click "Create"

Service 3:
   Name: Fertilizer Application
   Code: FERT
   Category: Lawn Care
   Base Price: 75
   Unit: application
   Click "Create"
```

---

## Set Custom Pricing (Optional but Recommended)

**Example: Give John a discount**

```
1. Go to: http://localhost:3000/customers
2. Click on "John Smith"
3. Click "Custom Pricing" tab
4. Click "Add Custom Price"
5. Fill in:

   Service: Lawn Mowing
   Price: 45  (instead of default $50)
   Unit: hour

6. Click "Save"
```

**Now when you invoice John, he automatically gets $45/hour instead of $50!**

**Repeat for other customers who need special pricing:**
- VIP customers: Lower prices
- Difficult properties: Higher prices
- Bulk customers: Volume discounts

---

# STEP 2: Setup Telegram Bot (One Time)

## Create Your Bot

```
1. Open Telegram
2. Search for: @BotFather
3. Start chat and send: /newbot
4. Bot asks: "Choose a name for your bot"
   You: My Invoice Bot

5. Bot asks: "Choose a username (must end in 'bot')"
   You: my_invoice_bot

6. BotFather sends you a TOKEN
   Example: 123456789:ABCdefGHIjklMNOpqrsTUVwxyz

7. COPY THIS TOKEN!
```

## Connect Bot to Your System

```bash
# Add token to backend .env file
cd apps/backend
echo "TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklMNOpqrsTUVwxyz" >> .env

# Restart backend
# Stop the running backend (Ctrl+C)
# Start again:
npm run dev
```

**You should see:**
```
✓ Telegram bot connected
✓ Bot username: @my_invoice_bot
```

## Test Your Bot

```
1. In Telegram, find your bot: @my_invoice_bot
2. Click "Start"
3. Send: /start

Bot should reply:
   👋 Welcome to AutoInvoice Bot!

   Commands:
   /invoice - Create invoice
   /customers - List customers
   /help - Show help
```

**✅ Bot is ready!**

---

# STEP 3: Create Invoices via Telegram (Daily Use)

## Simple Examples

### Example 1: Basic Invoice

```
You type in Telegram:
"Did 2 hours lawn mowing for John"

Bot replies:
✅ Invoice #1234 created!

Customer: John Smith
Service: Lawn Mowing
Quantity: 2 hours
Rate: $45/hour (custom pricing)
Total: $90.00
Date: Today

[Send Email] [View Invoice]
```

### Example 2: Even Shorter

```
You: "John - lawn mowing"

Bot: ✅ Invoice created!
     John Smith - Lawn Mowing
     Total: $45.00
     Invoice #1235
```

### Example 3: Multiple Services

```
You: "Blair - 5000 sqft hydroseed and fertilizer"

Bot: ✅ Invoice created!
     Customer: Blair Property Management LLC

     Line 1: Hydroseed (5,000 sqft × $0.15) = $750.00
     Line 2: Fertilizer (1 application × $75) = $75.00

     Total: $825.00
     Invoice #1236
```

### Example 4: With Date

```
You: "Lawn mowing for John yesterday - 3 hours"

Bot: ✅ Invoice created!
     John Smith - Lawn Mowing
     Quantity: 3 hours × $45
     Total: $135.00
     Date: 11/14/2025
```

---

## Natural Language - It Understands!

**All of these work:**

```
✅ "2 hours lawn mowing for John"
✅ "Did lawn mowing for John - 2 hours"
✅ "John - 2hr lawn mow"
✅ "Lawn mowing John 2 hours"
✅ "Invoice John lawn mowing 2h"
✅ "John 2 hours mowing"
```

**The AI understands:**
- Customer names (exact or nicknames)
- Service names (even abbreviated)
- Quantities (2, 2h, 2 hours, two hours)
- Dates (today, yesterday, 11/15)

---

## Voice Messages Work Too!

```
1. In Telegram chat with bot
2. Hold microphone icon
3. Say: "Did lawn mowing for John, two hours"
4. Release

Bot: 🎙️ Transcribed: "Did lawn mowing for John, two hours"
     ✅ Invoice created for John Smith - $90.00
```

**Perfect for when you're in the field!**

---

# 📊 Complete Daily Workflow

## Morning: Set Up (Web)

```
✅ Added new customer: "Sarah Johnson" with nickname "Sarah"
✅ Set custom pricing: Lawn Mowing $48/hour for Sarah
```

## During the Day: Create Invoices (Telegram)

```
9:00 AM - Job 1:
You: "2 hours lawn mowing for John"
Bot: ✅ Invoice #1234 - $90.00

11:30 AM - Job 2:
You: "Blair hydroseed 9999 sqft"
Bot: ✅ Invoice #1235 - $1,499.85

2:00 PM - Job 3:
You: "Sarah lawn mowing 1.5 hours"
Bot: ✅ Invoice #1236 - $72.00

4:30 PM - Job 4:
You: [Voice] "Did fertilizer for John"
Bot: ✅ Invoice #1237 - $75.00
```

## Evening: Send Invoices (Web or Telegram)

```
Option 1: From Telegram
Bot: Would you like to send these invoices?
You: Yes
Bot: ✅ 4 invoices sent via email

Option 2: From Web
Go to: http://localhost:3000/invoices
Select all invoices
Click "Send All"
✅ Emails sent with PDFs
```

---

# 🎯 Pro Tips

## 1. Use Nicknames Liberally

```
Customer: "Blair Property Management LLC"
Nicknames: ["Blair", "BPM", "Blair Property", "Property Management"]

Then ANY of these work:
- "Invoice for Blair"
- "BPM hydroseed"
- "Property Management lawn care"
```

## 2. Set Custom Pricing for Everyone

```
Even if it's the same as base price!

Why? Because you might change it later:
- Seasonal pricing
- Loyalty discounts
- Bulk discounts
- Difficult property surcharges
```

## 3. Quick Commands in Telegram

```
/customers          → See all your customers
/status 1234        → Check invoice #1234 status
/today              → See today's invoices
/week               → See this week's total
```

## 4. Review Before Sending

```
After bot creates invoice:

You: "Show invoice 1234"
Bot: [Displays full invoice details]

You: "Edit 1234 change amount to $95"
Bot: ✅ Updated

You: "Send 1234"
Bot: ✅ Emailed to john@example.com
```

## 5. Batch Processing

```
Create all invoices via Telegram during the day
Send all at once in the evening from web UI

Advantages:
- Quick entry in the field
- Review all before sending
- Send in one batch
```

---

# ⚡ Quick Reference

## Daily Telegram Templates

### Lawn Mowing
```
"[Customer] - lawn mowing [hours]"
Example: "John - lawn mowing 2"
```

### Hydroseed
```
"[Customer] - [sqft] hydroseed"
Example: "Blair - 5000 hydroseed"
```

### Multiple Services
```
"[Customer] - [service1] and [service2]"
Example: "Sarah - lawn mowing 2 hours and fertilizer"
```

### With Custom Amount
```
"[Customer] - [service] - $[amount]"
Example: "John - special project - $250"
```

---

# 🔧 Troubleshooting

## Bot Doesn't Respond

```
✅ Check backend is running: npm run dev
✅ Check .env has TELEGRAM_BOT_TOKEN
✅ Restart backend
✅ Send /start to bot again
```

## Bot Doesn't Find Customer

```
❌ "Invoice for Jon"
✅ "Invoice for John"

Or add nickname:
Go to web → Customer → Add nickname "Jon"
Then it works!
```

## Wrong Price Applied

```
Check custom pricing:
1. Go to customer detail page
2. Check "Custom Pricing" tab
3. Verify service and price
4. Update if needed
```

## Invoice Not Created

```
✅ Make sure customer exists
✅ Make sure service exists
✅ Check backend logs for errors
✅ Try simpler message: "Customer - Service"
```

---

# 📈 Scaling Up

## As Your Business Grows

### Week 1: Basic Setup
```
✅ 5 regular customers
✅ 3 common services
✅ Basic custom pricing
```

### Month 1: Optimize
```
✅ 20+ customers
✅ Nicknames for all customers
✅ Custom pricing for regulars
✅ Quick Telegram templates
```

### Month 3: Advanced
```
✅ 50+ customers
✅ 10+ services
✅ Automated payment tracking (checks)
✅ Receipt OCR for expenses
✅ Monthly revenue reports
```

### Year 1: Full System
```
✅ 100+ customers
✅ Multiple team members
✅ Automated everything
✅ Full accounting integration
```

---

# 🎉 Success Checklist

## Setup Complete ✅

- [ ] Backend running
- [ ] Web UI accessible
- [ ] Database migrated
- [ ] At least 3 customers added
- [ ] At least 3 services added
- [ ] Custom pricing set for 1 customer
- [ ] Telegram bot token configured
- [ ] Bot responding to messages
- [ ] Test invoice created via Telegram
- [ ] Test invoice sent via email

## Daily Workflow Ready ✅

- [ ] Can add customer via web in < 2 min
- [ ] Can create invoice via Telegram in < 10 sec
- [ ] Bot recognizes customer nicknames
- [ ] Custom pricing applies automatically
- [ ] Can send invoice via email
- [ ] Can view all invoices on web

---

# 💡 Your Typical Day

```
Morning:
- Check Telegram for any client messages
- Review yesterday's invoices on web

During Work:
- Finish job for John
  → Telegram: "John - 2 hours lawn mowing"
  → Invoice created instantly ✅

- Finish job for Blair
  → Telegram: "Blair - 9999 hydroseed"
  → Invoice created ✅

- Emergency job for Sarah
  → Telegram: "Sarah - special service - $150"
  → Invoice created ✅

Evening:
- Open web UI
- Review all today's invoices
- Click "Send All"
- All invoices emailed to customers ✅

Next Day:
- Customer sends check photo
- Upload to /checks/upload
- Invoice auto-marked PAID ✅
```

**Total time spent on invoicing: ~5 minutes/day**
**Time saved vs manual entry: ~45 minutes/day**

---

# 🚀 You're Ready!

**Recap:**

1. ✅ **Web**: Set up customers once with pricing
2. ✅ **Telegram**: Create invoices in 10 seconds
3. ✅ **AI**: Applies your custom pricing automatically
4. ✅ **Done**: Professional invoices instantly

**Your workflow is now:**
```
Do job → Send Telegram message → Invoice created → Email sent → Get paid
```

**No more:**
- ❌ Manual invoice entry
- ❌ Remembering prices
- ❌ Typing customer details
- ❌ Calculating totals
- ❌ Formatting invoices

**Just:**
- ✅ "Did job for [customer]" in Telegram
- ✅ AI handles everything

---

**🎊 Start invoicing in seconds, not minutes! 🎊**

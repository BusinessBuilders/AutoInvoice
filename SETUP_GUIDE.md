# AutoInvoice Setup Guide

## 🎯 Current Status

**Code:** 100% Complete ✅
**Database:** Needs migration ⚠️
**Ready to Run:** After following steps below

---

## 📋 Prerequisites

1. **Docker Desktop** - Must be installed and running
2. **Node.js** - v18 or higher
3. **npm** - Comes with Node.js

---

## 🚀 Quick Start (Automated)

### Option 1: Full Automated Setup

```bash
# Make scripts executable
chmod +x setup-database.sh create-migration.sh

# Run complete setup
./setup-database.sh
```

This will:
- Start PostgreSQL and Redis via Docker
- Run all database migrations
- Set up the Check payment tables
- Configure everything automatically

---

## 🔧 Manual Setup (Step by Step)

If you prefer to run each step manually:

### Step 1: Start Infrastructure

```bash
# Start PostgreSQL and Redis
docker compose up -d postgres redis

# Verify they're running
docker compose ps
```

### Step 2: Create Database Migration

```bash
cd apps/backend

# Create and apply migration
npx prisma migrate dev --name add_check_payment_feature
```

### Step 3: Verify Database

```bash
# Check tables were created
npx prisma studio
```

This opens a GUI where you can see all tables including the new `Check` table.

---

## 🔑 Environment Configuration

### Backend (.env)

Create `apps/backend/.env`:

```bash
# Database
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/autoinvoice
REDIS_URL=redis://localhost:6379

# Server
PORT=4000
FRONTEND_URL=http://localhost:3000
NODE_ENV=development

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=7d

# AI Providers (at least one required)
OPENAI_API_KEY=sk-...                    # Primary - most accurate
ANTHROPIC_API_KEY=sk-ant-...             # Fallback
OLLAMA_BASE_URL=http://localhost:11434   # Local fallback

# AI Models
OPENAI_MODEL=gpt-4-turbo-preview
ANTHROPIC_MODEL=claude-3-sonnet-20240229
OLLAMA_MODEL=llama2

# Company Branding
COMPANY_NAME=AutoInvoice
COMPANY_ADDRESS=123 Business Street, Suite 100
COMPANY_CITY=Your City
COMPANY_STATE=CA
COMPANY_ZIP=12345
COMPANY_PHONE=(555) 123-4567
COMPANY_EMAIL=billing@autoinvoice.app
COMPANY_WEBSITE=https://autoinvoice.app
BRAND_COLOR=#2563eb

# Optional: File Storage
PDF_OUTPUT_DIR=./invoices
UPLOAD_DIR=./uploads

# Optional: Google OAuth (for Gmail integration)
GOOGLE_CLIENT_ID=your-client-id
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:4000/auth/google/callback

# Optional: Telegram Bot
TELEGRAM_BOT_TOKEN=your-bot-token
```

### Frontend (.env.local)

Create `apps/web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

## 🎬 Running the Application

### Terminal 1: Backend

```bash
cd apps/backend
npm install
npm run dev
```

You should see:
```
✓ tRPC server listening on http://localhost:4000
✓ Connected to PostgreSQL
✓ Connected to Redis
```

### Terminal 2: Frontend

```bash
cd apps/web
npm install
npm run dev
```

You should see:
```
✓ Next.js ready on http://localhost:3000
```

---

## ✅ Testing the Check Payment Feature

### 1. Access the UI

Open browser to: `http://localhost:3000/checks/upload`

### 2. Upload a Check Photo

- Click "Take Photo" (mobile) or "Choose File" (desktop)
- Or drag & drop a check image
- Or paste from clipboard (Ctrl/Cmd + V)

### 3. AI Processing

The system will:
1. Extract check number, amount, date, payee, memo
2. Search for matching invoices (±30 days, same amount)
3. Auto-mark invoice as PAID if confident match found
4. Or show matching suggestions for manual confirmation

### 4. View Results

- See extracted check data with confidence score
- View matched invoice (if auto-matched)
- Review matching invoice suggestions
- Access all checks at: `http://localhost:3000/checks`

---

## 🔍 Verification Checklist

Run these commands to verify everything is working:

```bash
# Check database connection
cd apps/backend
npx prisma db pull

# Check migrations applied
npx prisma migrate status

# Verify tables exist
npx prisma studio
# Look for: User, Customer, Invoice, Service, Receipt, Check, etc.

# Test backend API
curl http://localhost:4000/health

# Check frontend
curl http://localhost:3000
```

---

## 🐛 Troubleshooting

### Database Connection Error

**Error:** `Can't reach database server at localhost:5432`

**Solution:**
```bash
# Check if PostgreSQL is running
docker compose ps

# If not running, start it
docker compose up -d postgres

# Check logs
docker compose logs postgres
```

### Migration Failed

**Error:** `Migration failed to apply`

**Solution:**
```bash
# Reset database (WARNING: deletes all data)
cd apps/backend
npx prisma migrate reset

# Or manually apply
npx prisma db push
```

### Port Already in Use

**Error:** `Port 4000 already in use`

**Solution:**
```bash
# Find what's using the port
lsof -i :4000

# Kill the process
kill -9 <PID>

# Or change port in .env
PORT=4001
```

### AI Provider Errors

**Error:** `OpenAI API key invalid`

**Solution:**
- Check your API key in `.env`
- System will fallback to Anthropic → Ollama
- At least one AI provider must be configured

---

## 📊 Database Schema

After migration, you'll have these tables:

### Core Tables
- `User` - User accounts
- `Customer` - Customer information
- `Service` - Service catalog
- `Invoice` - Invoices with line items
- `LineItem` - Invoice line items

### New Tables
- ✅ **`Check`** - Check payment records (NEW!)
- `Receipt` - Receipt OCR data (updated with userId, status)

### Supporting Tables
- `Location` - Customer locations
- `PriceOverride` - Custom pricing per customer
- `Conversation` - Multi-channel conversations
- `Message` - Conversation messages
- `AIInteraction` - AI usage tracking

---

## 🎉 What's Working

Once setup is complete, these features are LIVE:

### ✅ Quick Invoice Entry
- Navigate to `/quick`
- Type: "2 hours lawn mowing for John today"
- AI parses and creates invoice in seconds

### ✅ Receipt OCR
- Navigate to `/receipts/upload`
- Upload receipt photo
- AI extracts vendor, amount, date, categories

### ✅ Check Payment Auto-Matching 🆕
- Navigate to `/checks/upload`
- Upload check photo
- AI extracts check data
- **Auto-matches to invoice and marks as PAID**

### ✅ Customer Management
- Add/edit customers with custom pricing
- Track customer invoices and stats

### ✅ Service Catalog
- Manage services with base pricing
- Override prices per customer

### ✅ PDF Generation
- Professional invoice PDFs
- Company branding included

### ✅ Email Integration
- Send invoices via Gmail
- Track sent status

---

## 🚀 Production Deployment

See `QUICK_START_GUIDE.md` for:
- Kubernetes deployment
- CI/CD setup with GitHub Actions
- Environment configuration
- Scaling considerations

---

## 📝 Next Steps

After setup:

1. **Create test data:**
   ```bash
   cd apps/backend
   npm run seed
   ```

2. **Test the features:**
   - Create a customer
   - Add a service
   - Create an invoice
   - Upload a check photo
   - See auto-matching in action!

3. **Configure AI providers:**
   - Add your OpenAI API key for best results
   - Or use Ollama for local/free processing

---

## 💡 Pro Tips

1. **Use Prisma Studio** for easy database browsing:
   ```bash
   cd apps/backend
   npx prisma studio
   ```

2. **Monitor AI usage** in the AIInteraction table

3. **Check logs** for debugging:
   ```bash
   docker compose logs -f backend
   ```

4. **Backup database**:
   ```bash
   docker compose exec postgres pg_dump -U postgres autoinvoice > backup.sql
   ```

---

## 🆘 Need Help?

- Check `IMPLEMENTATION_STATUS.md` for feature details
- See `ARCHITECTURE.md` for system design
- Review `CLI_USAGE.md` for CLI commands
- Check GitHub issues: https://github.com/your-repo/issues

---

**🎊 You're all set! The check payment feature is ready to use!**

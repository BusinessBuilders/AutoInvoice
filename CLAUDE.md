# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AutoInvoice is an AI-powered invoice automation platform with multi-channel input support (voice, Telegram, web, mobile). It's a production-ready monorepo built with a database-first approach using PostgreSQL.

## Essential Commands

### Development
```bash
# Start all infrastructure (PostgreSQL, Redis, Ollama)
npm run docker:up

# Start backend dev server (http://localhost:4000)
npm run dev:backend

# Start web app dev server (http://localhost:3000)
npm run dev:web

# Start mobile app dev server (Expo)
npm run dev:mobile

# Start all dev servers together
npm run dev
```

### Database Operations
```bash
# Generate Prisma client after schema changes
npm run generate --workspace=@autoinvoice/backend

# Create and apply migrations
npm run db:migrate

# Open Prisma Studio (database GUI)
npm run db:studio

# Seed database with test data
npm run db:seed
```

### Testing & Quality
```bash
# Run all tests
npm run test

# Run backend tests only
npm run test:backend

# Run linting
npm run lint

# Build all workspaces
npm run build
```

### CLI Tools
```bash
# Access the backend CLI
npm run cli --workspace=@autoinvoice/backend

# CLI examples (run from apps/backend)
npm run cli customer:add "John Doe" --email john@example.com
npm run cli service:add "Lawn Mowing" MOWING Landscaping --price 50
npm run cli quick "2 hours mowing for John today" --pdf
```

## Architecture Overview

### Tech Stack Core
- **Backend**: Node.js + TypeScript + Express + tRPC
- **Frontend**: Next.js 14 (App Router) + Tailwind CSS
- **Mobile**: React Native + Expo
- **Database**: PostgreSQL 16 + pgvector (via Prisma ORM)
- **Queue**: BullMQ + Redis
- **AI**: OpenAI (primary) → Anthropic (fallback) → Ollama (local fallback)

### Workspace Structure
```
apps/
├── backend/          # Node.js API server
│   ├── src/
│   │   ├── routers/      # tRPC endpoints (auth, customer, invoice, service, receipt, check, etc.)
│   │   ├── services/
│   │   │   ├── ai/       # AI provider abstraction (OpenAI, Anthropic, Ollama)
│   │   │   ├── queue/    # BullMQ job processors
│   │   │   ├── telegram/ # Telegram bot
│   │   │   ├── google/   # Google Workspace integration
│   │   │   └── pdf/      # PDF generation
│   │   ├── middleware/   # Auth middleware
│   │   ├── utils/        # DB, logger, env validation
│   │   └── cli.ts        # CLI tool
│   └── prisma/
│       └── schema.prisma # Database schema (single source of truth)
├── web/              # Next.js web app
└── mobile/           # React Native + Expo app
```

### AI Provider Abstraction

The system uses a unified AI interface with automatic fallback:

**Fallback Chain**: OpenAI → Anthropic → Ollama

**AI Capabilities**:
- Natural language invoice parsing (`parseInvoice`)
- Voice transcription (`transcribe` - Whisper)
- Text-to-speech (`generateSpeech`)
- Receipt OCR via vision models (`extractReceipt`)
- Check payment recognition (`extractCheck`)

**Location**: `apps/backend/src/services/ai/`
- `router.ts` - Main abstraction layer
- `openai.ts` - OpenAI provider
- `anthropic.ts` - Anthropic provider
- `ollama.ts` - Ollama provider
- `types.ts` - Shared interfaces

All AI interactions are logged in the `AIInteraction` table for cost tracking and analytics.

### tRPC API Structure

The API uses tRPC for end-to-end type safety. All routers are in `apps/backend/src/routers/`:

- `auth.ts` - JWT authentication (register, login, refresh)
- `customer.ts` - Customer CRUD operations
- `service.ts` - Service catalog management
- `invoice.ts` - Invoice operations and stats
- `receipt.ts` - Receipt OCR and management
- `check.ts` - Check payment processing with auto-matching
- `smartTemplates.ts` - Quick invoice parsing from natural language
- `lead.ts`, `quote.ts`, `team.ts`, `payments.ts`, `gdpr.ts` - Additional features

**Protected vs Public Routes**:
```typescript
// Public (no auth required)
publicProcedure.input(schema).mutation(handler)

// Protected (JWT required)
protectedProcedure.use(authMiddleware).input(schema).mutation(handler)
```

### Queue System

Background jobs via BullMQ (Redis-backed):

**Workers in** `apps/backend/src/services/queue/workers/`:
- `pdf-worker.ts` - PDF generation from invoices
- `email-worker.ts` - Gmail integration for invoice delivery
- `ocr-worker.ts` - Async receipt processing
- `payment-reminder-worker.ts` - Scheduled payment reminders

**Job Flow**:
1. API endpoint queues job
2. Worker picks up job from Redis
3. Processes with retries and error handling
4. Updates database with result

### Database Schema

**Key Models** (see `apps/backend/prisma/schema.prisma`):
- `User` - System users with role-based access
- `Customer` - Invoice recipients with nicknames array for fuzzy matching
- `Service` - Service catalog with categories and base pricing
- `Invoice` - Invoices with status tracking (DRAFT/SENT/PAID/OVERDUE)
- `LineItem` - Invoice line items (links Invoice ↔ Service)
- `Receipt` - Expense receipts with OCR data and confidence scores
- `Check` - Check payments with auto-matching to invoices
- `Conversation` / `Message` - Multi-channel conversation state
- `AIInteraction` - AI usage tracking for cost/analytics
- `PriceOverride` - Customer-specific service pricing

**Important Relationships**:
- Customer has many Invoices, Locations, PriceOverrides
- Invoice has many LineItems, Receipts
- Service has many LineItems, PriceOverrides
- Check auto-matches to Invoice by amount + date (±30 days)

**Extensions**:
- pgvector enabled for future semantic search capabilities

### Authentication Flow

JWT-based with refresh token rotation:

1. User logs in → receives access token (15min) + refresh token (7 days)
2. Access token used for API requests
3. When access token expires, use refresh token to get new pair
4. Old refresh token is revoked and replaced (rotation security)

**Storage**: RefreshToken table tracks tokens with device info and expiry.

## Development Patterns

### Adding a New tRPC Endpoint

1. Define Zod schema for input validation
2. Create procedure in appropriate router file
3. Use `publicProcedure` or `protectedProcedure`
4. Export from `routers/index.ts`
5. Types auto-flow to frontend via tRPC

### Database Schema Changes

1. Edit `apps/backend/prisma/schema.prisma`
2. Run `npm run generate --workspace=@autoinvoice/backend` (generates Prisma client)
3. Run `npm run db:migrate` (creates and applies migration)
4. Types automatically update throughout the app

### Adding AI Capabilities

1. Define method in `services/ai/types.ts` interface
2. Implement in all three providers (openai.ts, anthropic.ts, ollama.ts)
3. Add to `services/ai/router.ts` for automatic fallback
4. Use via `AIRouter.methodName()` in business logic

### Queue Job Creation

1. Define job processor in `services/queue/workers/`
2. Register worker in queue initialization
3. Queue jobs using `queueService.addJob(jobName, data)`
4. Jobs auto-retry on failure with exponential backoff

## Important Conventions

### Type Safety
- All database access through Prisma (generates types)
- All API calls through tRPC (automatic type inference)
- All forms use React Hook Form + Zod validation
- Shared types can go in `packages/shared/` if needed across workspaces

### Error Handling
- tRPC errors use `TRPCError` with appropriate codes
- Queue workers catch and log errors with Winston
- AI providers return fallback on failure
- Never expose internal errors to client (sanitize via tRPC)

### Code Organization
- One router per domain concept (customer, invoice, etc.)
- Services handle business logic, not routers
- AI calls always go through the router abstraction
- Heavy operations always queue via BullMQ

### Environment Variables
Required in `.env`:
- `DATABASE_URL` - PostgreSQL connection
- `REDIS_URL` - Redis connection
- `JWT_SECRET` - Min 32 characters
- At least one AI provider key (OPENAI_API_KEY, ANTHROPIC_API_KEY, or OLLAMA_BASE_URL)

Optional but recommended:
- `TELEGRAM_BOT_TOKEN`
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`
- `COMPANY_NAME`, `COMPANY_EMAIL`, `BRAND_COLOR`

## Key Features to Understand

### Smart Templates Engine
Natural language → structured invoice data:
- Fuzzy customer matching (name + nicknames)
- Service keyword mapping
- Per-customer custom pricing lookup
- AI confidence scoring
- Location: `services/smart-templates.ts` + `routers/smartTemplates.ts`

### Receipt OCR
Image → structured expense data:
- Multi-provider vision AI (GPT-4 Vision → Claude Vision → Tesseract)
- Automatic categorization (Materials, Tools, etc.)
- Confidence scoring
- Location: `services/ai/` providers + `routers/receipt.ts`

### Check Auto-Matching
Check photo → auto-pay invoice:
- AI extracts: check number, amount, date, payer
- Matches invoices within ±30 days by amount
- Auto-marks invoice as PAID when confident
- Location: `routers/check.ts`

## Testing Approach

Current test files in `apps/backend/src/__tests__/`

When adding tests:
- Unit tests for business logic and utilities
- Integration tests for tRPC endpoints (mock Prisma)
- Use Jest + ts-jest setup (already configured)
- Mock AI providers to avoid API costs

## Deployment Notes

### Production Architecture (VPS + WireGuard)

The production setup uses a VPS as a gateway with WireGuard tunnel to a local server (bypasses CGNAT):

```
Internet → VPS (149.28.121.45) → WireGuard Tunnel → Local Server (10.0.0.2)
                                                    ├── Frontend :3000
                                                    └── Backend :4000
```

**VPS Role**: Public IP, SSL termination, nginx reverse proxy
**Local Server Role**: Runs Next.js frontend + Node.js backend
**WireGuard**: Creates tunnel so VPS can reach local server despite CGNAT

**Production Domain**: `accounting.business-builder.online`
- Frontend: `https://accounting.business-builder.online/` → proxied to `10.0.0.2:3000`
- API: `https://accounting.business-builder.online/api/*` → proxied to `10.0.0.2:4000/*`

### VPS Nginx Configuration

Located at `/etc/nginx/sites-available/accounting.business-builder.online` on VPS:

```nginx
location /api/ {
    rewrite ^/api/(.*) /$1 break;
    proxy_pass http://10.0.0.2:4000;
    # ... headers ...

    # CRITICAL: Extended timeouts for AI vision processing
    proxy_connect_timeout 180s;
    proxy_send_timeout 180s;
    proxy_read_timeout 180s;
    client_max_body_size 20M;
}
```

**Important**: AI vision endpoints (receipt scanning, check scanning, business cards) require 180s+ timeout because GPT-4 Vision processing can take 60-120 seconds.

### Local Development
- Docker Compose for local/staging (see `docker-compose.yml`)
- Kubernetes manifests in `k8s/` for production
- CI/CD via GitHub Actions (`.github/workflows/`)
- Database migrations run via `npm run migrate:deploy` in production
- Environment variables injected via secrets/ConfigMaps

### Starting Production Services

On local server:
```bash
# Build for production
npm run build

# Start backend (must use index.js, not server.js)
NODE_ENV=production node apps/backend/dist/index.js &

# Start frontend
cd apps/web && NODE_ENV=production npm run start &
```

### SSH Access
- VPS: `ssh mlb-vps` (149.28.121.45)
- Check WireGuard: `ssh mlb-vps "wg show"`
- Reload nginx: `ssh mlb-vps "sudo nginx -t && sudo systemctl reload nginx"`

## Active Development: Credit Card & Multi-Account Integration

**Status Document**: `CREDIT_CARD_INTEGRATION_STATUS.md`
**Full Plan**: `~/.claude/plans/bubbly-skipping-hanrahan.md`

### What We're Building

Following QuickBooks-style workflow where bank/credit card accounts are unified with Chart of Accounts:

1. **BankAccount ↔ Account link** - BankAccount now has `linkedAccountId` to tie to Chart of Accounts
2. **Auto-creation** - Creating a credit card auto-creates a LIABILITY account
3. **PDF Import** - Import bank/credit card statements with auto-account detection

### Key Files for This Feature

| File | Purpose |
|------|---------|
| `routers/bankAccounts.ts` | CRUD for bank accounts with auto-link logic |
| `routers/bankTransactions.ts` | Import transactions, auto-create accounts |
| `services/accounting/pdf-parser.ts` | PDF text extraction using pdf-parse v2.x |
| `app/accounting/import/page.tsx` | Statement import UI |
| `app/accounting/general-ledger/page.tsx` | Transaction view with account filter |

### Architecture: Two Tracks Unified

```
Before (disconnected):
  Account → JournalEntry → Financial Reports
  BankAccount → BankTransaction → Tax Reports

After (linked):
  BankAccount.linkedAccountId → Account
  - Credit cards → LIABILITY (2100)
  - Checking → ASSET (1010)
  - Both systems stay in sync
```

### Next Steps

See `CREDIT_CARD_INTEGRATION_STATUS.md` for current phase and remaining tasks.

---

## Completed: Vendor & Split Transaction System

### Overview

Vendors track WHO you paid (Amazon, Shell, Home Depot) separate from WHAT you bought (expense category). This enables:
- Auto-detecting vendors from bank transaction descriptions
- Splitting multi-category purchases (e.g., Amazon order → Office Supplies + Hardware + Owner Draw)
- Vendor-based reporting and filtering

### Key Files

| File | Purpose |
|------|---------|
| `routers/vendors.ts` | CRUD + pattern matching (`matchDescription`, `bulkMatch`, `testPatterns`) |
| `routers/bankTransactions.ts` | Split mutations (`splitTransaction`, `unsplitTransaction`) |
| `app/accounting/vendors/page.tsx` | Vendor management UI with tag-style pattern editor |
| `app/accounting/general-ledger/page.tsx` | Vendor column, filter, split modal |
| `app/accounting/income/page.tsx` | Income verification page |

### Database Schema

```prisma
model Vendor {
  id                    String    @id @default(cuid())
  companyId             String
  name                  String                // "Amazon", "Shell"
  matchPatterns         String[]              // ["AMAZON", "AMZN"] - auto-detect patterns
  defaultTaxAccountId   String?               // Default category for single-category vendors
  requiresSplit         Boolean   @default(false)  // Flag vendors that usually need splitting
  isActive              Boolean   @default(true)
  @@unique([companyId, name])
}

// Added to BankTransaction:
vendorId        String?           // Matched vendor
parentId        String?           // If this is a split child
isSplit         Boolean           // True if this is a split parent
splitIndex      Int?              // Order within split group
```

### Split Transaction Invariant

**CRITICAL**: `SUM(splits.amount) === parent.amount`

The API enforces this - you cannot create splits that don't add up to the original transaction amount.

### Income/Expense Stats (Category-Based)

**Fixed**: Stats now use `TaxAccountType` instead of amount sign:

```typescript
// CORRECT (what we do now):
Income = SUM where taxAccount.accountType = 'INCOME'
Expenses = SUM where taxAccount.accountType IN ('EXPENSE_COGS', 'EXPENSE_OPERATING')

// WRONG (old method):
Income = SUM(amount > 0)    // Treated all deposits as income
Expenses = SUM(amount < 0)  // Treated all withdrawals as expenses
```

This means:
- Credit card payments from checking → Excluded (ASSET/LIABILITY transfer)
- Refunds → Only income if categorized to INCOME account
- Uncategorized transactions → Not counted until properly categorized

### Verification

Visit `/accounting/income` to see exactly which transactions count as income. If the list is empty, you need INCOME-type tax accounts.

---

## Database Safety Rules

- **NEVER run destructive database commands** (DROP, DELETE FROM, TRUNCATE, ALTER TABLE ... DROP, prisma migrate reset, prisma db push --force-reset)
- **ALWAYS backup the database before running Prisma migrations** against production/staging
- **Use testcontainers** (ephemeral Docker PostgreSQL) for all automated testing — never test against the real DB
- **prisma migrate dev** is for generating migration files only (use `--create-only` flag) — do NOT auto-apply to prod
- **prisma migrate deploy** requires explicit user permission and a verified backup first

---

## Common Gotchas

1. **Prisma Client**: Run `npm run generate` after schema changes or weird type errors appear
2. **Port Conflicts**: Backend 4000, Web 3000, PostgreSQL 5432, Redis 6379
3. **AI Costs**: All providers logged in AIInteraction table - monitor usage
4. **Queue Workers**: Must be running separately or jobs pile up in Redis
5. **JWT Secret**: Must be same across all backend instances for distributed deployments
6. **Nginx Timeout for AI Vision**: Receipt/check/card scanning fails with "invalid JSON" error if nginx proxy_read_timeout is < 120s. AI vision processing takes 60-120s.
7. **Backend Entry Point**: Use `dist/index.js` not `dist/server.js` - server.js only exports the app, index.js calls listen()

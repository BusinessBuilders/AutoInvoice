# AutoInvoice

**AI-powered invoice automation platform for service businesses.** Create invoices in seconds using voice, natural language, or the web dashboard. Built for landscapers, contractors, and field service professionals who need fast, hands-free invoicing.

## What It Does

AutoInvoice turns spoken or typed descriptions into professional invoices:

```
"500 sqft hydroseed for Blair today" → Complete invoice with customer, service, pricing
```

### Key Capabilities

| Feature | Description |
|---------|-------------|
| **Voice Invoicing** | Speak your work, get an invoice. Uses OpenAI Whisper for transcription. |
| **AI Quick Entry** | Type natural language like "2 hours mowing for Acme Corp" |
| **Smart Matching** | Auto-matches customers by name or nickname, services by keywords |
| **Running Tallies** | Accumulate work items throughout the day, finalize when ready |
| **Receipt Scanning** | Photograph receipts, AI extracts vendor, amount, items |
| **Check Processing** | Scan checks, auto-match to unpaid invoices, mark as paid |
| **Business Card OCR** | Scan cards to create leads or contacts instantly |
| **Custom Pricing** | Per-customer pricing overrides for each service |

---

## Features

### Invoice Creation (4 Methods)

1. **Voice Entry** (`/voice`)
   - Tap to record, speak your work description
   - AI transcribes and parses into line items
   - Audio confirmation reads back what was added
   - Supports tally mode (accumulate) or immediate mode (create now)

2. **AI Quick Entry** (`/quick`)
   - Type natural language descriptions
   - AI identifies customer, service, quantity, and applies correct pricing
   - Review and confirm before creating

3. **Manual Quick Entry** (`/quick-manual`)
   - Select customer, click services from your catalog
   - Adjust quantities and see totals in real-time
   - Fastest method when you know exactly what to bill

4. **Full Invoice Form** (`/invoices/new`)
   - Complete control over all invoice fields
   - Add custom line items, notes, terms
   - Set specific dates, discounts, tax rates

### Running Tally System

Keep a running tally per customer throughout the day:

- Add items via voice or text as you complete work
- View accumulated items and running total
- Finalize to invoice when ready
- One open tally per customer at a time

### Customer Management

- **Nicknames**: Add alternate names for faster matching ("Blair", "Blair Property", "BP")
- **Multiple Locations**: Track different service addresses per customer
- **Custom Pricing**: Override base rates for specific customers
- **Payment Terms**: NET30, NET15, Due on Receipt, etc.
- **Contact Info**: Email, phone, full address with coordinates

### Service Catalog

- Organize services by category (Landscaping, Snow Removal, etc.)
- Set base pricing and unit types (per sqft, per hour, flat rate)
- Add keywords for AI matching
- Customer-specific services (e.g., "Salt Walks - Westview")
- Import services from spreadsheet

### Receipt & Expense Tracking

- Upload receipt photos from phone or web
- AI extracts: vendor, date, amount, items, payment method
- Categorize expenses (Materials, Tools, Fuel, etc.)
- Link receipts to invoices or jobs
- Track card last 4 digits for reconciliation

### Check Payment Processing

- Photograph received checks
- AI extracts: check number, amount, date, payer, memo
- Auto-matches to unpaid invoices by amount and date (±30 days)
- One-click to mark invoice as paid
- Confidence scoring for review

### Lead Management

- Capture leads from any source (SMS, call, web, referral)
- Full pipeline: New → Contacted → Qualified → Quoted → Won/Lost
- Priority levels and follow-up scheduling
- Convert leads to customers or quotes
- Track estimated project value

### Business Card Scanning

- Photograph business cards
- AI extracts: name, company, title, phone, email, address, social links
- Create as Lead (for potential customers) or Contact (for networking)
- Full OCR data stored for reference
- Confidence scoring

### Professional Network

- Store business contacts from cards, meetings, events
- Categorize: client, vendor, partner, colleague
- Tag and organize contacts
- Track last contact date
- Full address and social media links

### Quotes & Estimates

- Generate quotes from leads or customers
- Line items with quantities and pricing
- Validity period and expiration
- Track: sent, viewed, accepted, rejected
- Convert accepted quotes to invoices

### Reports & Analytics

- Revenue by period (daily, weekly, monthly, yearly)
- Status breakdown (draft, sent, paid, overdue)
- Customer analytics and top customers
- Service performance metrics

### Company Branding

- Upload company logo
- Auto-extract brand colors for PDF styling
- Company info: name, address, phone, email, website, tax ID
- Applied to all generated PDFs

---

## Tech Stack

### Core

| Layer | Technology |
|-------|------------|
| **Database** | PostgreSQL 16 + pgvector |
| **ORM** | Prisma 5.11 |
| **Backend** | Node.js + TypeScript + Express + tRPC |
| **Frontend** | Next.js 14 (App Router) + Tailwind CSS |
| **Mobile** | React Native + Expo |
| **Queue** | BullMQ + Redis |
| **Auth** | JWT + Refresh Token Rotation |

### AI Providers (Automatic Fallback)

| Provider | Use Case |
|----------|----------|
| **OpenAI** | Primary: GPT-4 for parsing, Whisper for voice, TTS for confirmations |
| **Anthropic** | Fallback: Claude for parsing and vision tasks |
| **Ollama** | Local fallback: Self-hosted LLM support |

The AI router automatically tries each provider in order until one succeeds.

### Vision/OCR

- Receipts: GPT-4 Vision → Claude Vision
- Checks: GPT-4 Vision → Claude Vision
- Business Cards: GPT-4 Vision → Claude Vision

---

## Project Structure

```
AutoInvoice/
├── apps/
│   ├── backend/           # Node.js API (tRPC)
│   │   ├── src/
│   │   │   ├── routers/       # API endpoints
│   │   │   ├── services/      # Business logic
│   │   │   │   ├── ai/        # AI provider abstraction
│   │   │   │   ├── queue/     # Background jobs
│   │   │   │   ├── pdf/       # PDF generation
│   │   │   │   └── google/    # Google Workspace
│   │   │   └── utils/         # DB, logger, validation
│   │   └── prisma/            # Database schema
│   │
│   ├── web/               # Next.js web app
│   │   └── src/app/           # App Router pages
│   │
│   └── mobile/            # React Native + Expo
│
├── packages/
│   └── shared/            # Shared types
│
└── docker-compose.yml     # Infrastructure
```

### API Routers

| Router | Purpose |
|--------|---------|
| `auth` | Register, login, token refresh |
| `customer` | Customer CRUD, search, locations |
| `invoice` | Invoice CRUD, status, stats, PDF |
| `service` | Service catalog management |
| `receipt` | Receipt upload and OCR extraction |
| `check` | Check scanning and invoice matching |
| `smartTemplates` | Natural language invoice parsing |
| `voice` | Voice transcription and processing |
| `tally` | Running tally management |
| `lead` | Lead pipeline management |
| `leadBusinessCard` | Business card OCR for leads |
| `contact` | Network contact management |
| `quote` | Quote/estimate management |
| `team` | Team member management |
| `payments` | Payment tracking |
| `reporting` | Analytics and reports |
| `branding` | Company branding settings |
| `gdpr` | Data export and deletion |

---

## Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Quick Start

```bash
# 1. Clone and setup
git clone https://github.com/yourusername/AutoInvoice.git
cd AutoInvoice
cp .env.example .env

# 2. Start infrastructure (PostgreSQL, Redis)
npm run docker:up

# 3. Install dependencies
npm install

# 4. Setup database
npm run db:migrate
npm run db:seed  # Optional: sample data

# 5. Start development
npm run dev
```

This starts:
- Backend API: http://localhost:4000
- Web App: http://localhost:3000
- PostgreSQL: localhost:5432
- Redis: localhost:6379

### Environment Variables

**Required:**
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/autoinvoice
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-min-32-chars
```

**AI Provider (at least one):**
```env
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_URL=http://localhost:11434
```

**Optional:**
```env
TELEGRAM_BOT_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

---

## Development Commands

### Start Development

```bash
npm run dev           # All services
npm run dev:backend   # Backend only (port 4000)
npm run dev:web       # Web only (port 3000)
npm run dev:mobile    # Mobile (Expo)
```

### Database

```bash
npm run db:migrate    # Create and apply migrations
npm run db:studio     # Open Prisma Studio GUI
npm run db:seed       # Seed sample data
npm run generate      # Regenerate Prisma client
```

### Build & Test

```bash
npm run build         # Build all workspaces
npm run test          # Run all tests
npm run lint          # Lint code
```

### CLI Tools

```bash
# From apps/backend directory
npm run cli customer:add "John Doe" --email john@example.com
npm run cli service:add "Lawn Mowing" MOWING Landscaping --price 50
npm run cli quick "2 hours mowing for John today" --pdf
```

---

## Architecture Highlights

### Type-Safe End-to-End

- Prisma generates database types
- tRPC infers API types automatically
- Changes flow from schema to UI without manual type definitions

### AI Provider Abstraction

All AI calls go through a unified router with automatic fallback:

```typescript
// Tries OpenAI → Anthropic → Ollama
const result = await AIRouter.parseInvoice(text);
const transcript = await AIRouter.transcribe(audioBuffer);
const speech = await AIRouter.generateSpeech(confirmationText);
```

### Background Job Processing

Heavy operations are queued via BullMQ:
- PDF generation
- Email sending
- OCR processing
- Payment reminders
- Database backups

### Smart Template Engine

Natural language parsing with:
- Fuzzy customer matching (name + nicknames)
- Service keyword matching
- Per-customer custom pricing lookup
- AI confidence scoring
- Date parsing ("today", "yesterday", "last Monday")

---

## Database Models

### Core

| Model | Purpose |
|-------|---------|
| `User` | System users with roles and company branding |
| `Customer` | Invoice recipients with nicknames and locations |
| `Service` | Service catalog with pricing |
| `Invoice` | Invoices with line items and status |
| `Receipt` | Expense receipts with OCR data |
| `Check` | Check payments linked to invoices |

### Tally System

| Model | Purpose |
|-------|---------|
| `TallyInvoice` | Running tally container per customer |
| `TallyItem` | Individual items added to tally |

### Lead Management

| Model | Purpose |
|-------|---------|
| `Lead` | Potential customers with pipeline status |
| `Quote` | Estimates with line items |
| `Reminder` | Scheduled reminders for leads |
| `FollowUp` | Follow-up tracking and outcomes |
| `Contact` | Professional network contacts |

### Supporting

| Model | Purpose |
|-------|---------|
| `Location` | Customer service addresses |
| `PriceOverride` | Customer-specific pricing |
| `Conversation` | Multi-channel chat history |
| `AIInteraction` | AI usage and cost tracking |
| `Task` | Team task management |

---

## Deployment

### Docker Compose

```bash
docker-compose up -d
```

### Kubernetes

Kubernetes manifests available in `k8s/` directory.

### Production Build

```bash
npm run build
npm run migrate:deploy  # Apply migrations
npm run start           # Start production server
```

---

## Security Features

- JWT authentication with refresh token rotation
- Password hashing with bcrypt
- Role-based access (Owner, Admin, Employee, Viewer)
- GDPR compliance (data export, deletion)
- Two-factor authentication support
- Device tracking for sessions

---

## Integration Support

| Platform | Status |
|----------|--------|
| Telegram Bot | Framework Ready |
| Google Workspace | OAuth Configured |
| Twilio SMS | Planned |
| WhatsApp Business | Planned |

---

## License

MIT License - see [LICENSE](LICENSE) file.

---

**Built with TypeScript, PostgreSQL, and AI**

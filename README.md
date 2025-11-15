# AutoInvoice 🚀

AI-powered invoice automation platform with multi-channel input support (voice, Telegram, web, mobile).

## 🏗️ Architecture

This is a **production-ready monorepo** built with a **database-first** approach using PostgreSQL from day one.

### Tech Stack

#### **Foundation Layer** (Never Changes)

**Database:**
- PostgreSQL 16 + pgvector (Docker)
- ORM: Prisma 5.11
- Migrations: Prisma Migrate
- Backup: Automated pg_dump

**Backend:**
- Node.js + TypeScript + Express
- API: tRPC (type-safe)
- Validation: Zod
- Auth: JWT + refresh tokens
- File Upload: Multer
- Queues: BullMQ + Redis

**Frontend:**
- Web: Next.js 14 (App Router) + TypeScript
- Mobile: React Native + Expo
- UI: Tailwind CSS (configured for both)
- State: Zustand
- Forms: React Hook Form + Zod

#### **AI Layer** (Swappable Providers)

**LLM Interface:**
- Primary: OpenAI GPT-4 API
- Fallback 1: Anthropic Claude API
- Fallback 2: Ollama (local)
- Router: Custom provider abstraction with automatic fallback

**Voice:**
- STT: OpenAI Whisper API
- TTS: OpenAI TTS API

**OCR:**
- Primary: GPT-4 Vision
- Fallback: Anthropic Claude Vision

#### **Integration Layer**

**Messaging:**
- Phase 1: Telegram Bot API ✅
- Phase 2: Twilio SMS (planned)
- Phase 3: WhatsApp Business (planned)

**Google Workspace:**
- Auth: OAuth 2.0
- APIs: Calendar, Gmail, Drive
- SDK: googleapis npm package

**PDF:**
- Generation: pdf-lib
- Storage: PostgreSQL (binary) + filesystem

## 📁 Project Structure

```
AutoInvoice/
├── apps/
│   ├── backend/          # Node.js + Express + tRPC API
│   │   ├── src/
│   │   │   ├── routers/      # tRPC routers (auth, customer, invoice, service)
│   │   │   ├── services/
│   │   │   │   ├── ai/       # AI provider abstraction layer
│   │   │   │   ├── queue/    # BullMQ job processors
│   │   │   │   ├── telegram/ # Telegram bot
│   │   │   │   ├── google/   # Google Workspace integration
│   │   │   │   └── pdf/      # PDF generation
│   │   │   ├── middleware/   # Auth middleware
│   │   │   ├── utils/        # DB, logger, env validation
│   │   │   ├── trpc.ts       # tRPC configuration
│   │   │   ├── server.ts     # Express server setup
│   │   │   └── index.ts      # Entry point
│   │   ├── prisma/
│   │   │   ├── schema.prisma # Database schema
│   │   │   └── seed.ts       # Seed data
│   │   └── package.json
│   │
│   ├── web/              # Next.js 14 web app
│   │   ├── src/
│   │   │   ├── app/          # App Router pages
│   │   │   ├── components/   # React components
│   │   │   ├── lib/          # tRPC client, utils
│   │   │   └── store/        # Zustand state
│   │   └── package.json
│   │
│   └── mobile/           # React Native + Expo app
│       ├── app/              # Expo Router screens
│       ├── components/       # React Native components
│       ├── lib/              # tRPC client
│       └── package.json
│
├── packages/
│   └── shared/           # Shared types and utilities
│
├── nginx/
│   └── nginx.conf        # Reverse proxy configuration
│
├── docker-compose.yml    # Infrastructure setup
├── package.json          # Root workspace
└── README.md
```

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- Docker & Docker Compose
- npm or yarn

### Quick Start

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/AutoInvoice.git
   cd AutoInvoice
   ```

2. **Set up environment variables:**
   ```bash
   cp .env.example .env
   # Edit .env with your API keys and configuration
   ```

3. **Start infrastructure:**
   ```bash
   npm run docker:up
   ```

4. **Install dependencies:**
   ```bash
   npm install
   ```

5. **Run database migrations:**
   ```bash
   npm run db:migrate
   ```

6. **Seed the database (optional):**
   ```bash
   npm run db:seed
   ```

7. **Start development servers:**
   ```bash
   npm run dev
   ```

This will start:
- Backend API on http://localhost:4000
- Web app on http://localhost:3000
- PostgreSQL on localhost:5432
- Redis on localhost:6379

### Development Workflow

**Backend Development:**
```bash
npm run dev:backend
```

**Web Development:**
```bash
npm run dev:web
```

**Mobile Development:**
```bash
npm run dev:mobile
```

**Database Management:**
```bash
npm run db:studio      # Open Prisma Studio
npm run db:migrate     # Create and apply migration
npm run db:seed        # Seed database
```

## 🤖 AI Provider Configuration

The system supports multiple AI providers with automatic fallback:

### OpenAI (Primary)
```env
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4-turbo-preview
```

### Anthropic Claude (Fallback)
```env
ANTHROPIC_API_KEY=sk-ant-your-key-here
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

### Ollama (Local Fallback)
```env
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama2
```

The AI router automatically tries each provider in order until one succeeds.

## 📱 Features

### Core Features

- ✅ **Multi-channel Invoice Creation**
  - Natural language processing
  - Voice input (Whisper)
  - Telegram bot
  - Web dashboard
  - Mobile app

- ✅ **Customer Management**
  - Customer profiles with nicknames
  - Multiple locations per customer
  - Custom pricing overrides
  - Payment terms tracking

- ✅ **Invoice Management**
  - Automatic numbering
  - Line items with services
  - Tax and discount calculation
  - Status tracking (Draft → Sent → Paid)
  - PDF generation

- ✅ **Receipt Processing**
  - OCR extraction using AI vision
  - Automatic categorization
  - Item-level parsing

- ✅ **Background Jobs**
  - PDF generation queue
  - Email sending queue
  - OCR processing queue
  - Payment reminder scheduler
  - Database backup automation

### Coming Soon

- 🔄 **Telegram Bot Integration** (framework ready)
- 🔄 **Google Workspace Integration** (OAuth configured)
- 🔄 **Email Invoice Delivery** (queue system ready)
- 🔄 **Payment Reminders** (scheduler configured)
- 🔄 **Voice Message Processing** (Whisper integrated)

## 🔐 Authentication

The system uses JWT tokens with refresh token rotation:

**Register:**
```typescript
const { user, accessToken, refreshToken } = await trpc.auth.register.mutate({
  email: 'user@example.com',
  password: 'securepassword',
  name: 'John Doe',
});
```

**Login:**
```typescript
const { user, accessToken, refreshToken } = await trpc.auth.login.mutate({
  email: 'user@example.com',
  password: 'securepassword',
});
```

**Refresh Token:**
```typescript
const { accessToken, refreshToken } = await trpc.auth.refresh.mutate({
  refreshToken: oldRefreshToken,
});
```

## 📊 Database Schema

The database uses PostgreSQL with pgvector extension for future AI features.

**Key Models:**
- `User` - System users
- `Customer` - Invoice recipients
- `Service` - Service catalog
- `Invoice` - Invoices with line items
- `Receipt` - Expense receipts with OCR data
- `Conversation` - Multi-channel conversations
- `Message` - Conversation messages
- `AIInteraction` - AI usage tracking

See `apps/backend/prisma/schema.prisma` for complete schema.

## 🐳 Docker Services

```yaml
services:
  postgres    # PostgreSQL 16 + pgvector
  redis       # Redis 7 for queues and cache
  backend     # Node.js API server
  ollama      # Local LLM (optional)
  nginx       # Reverse proxy
```

## 🧪 Testing

```bash
npm run test           # Run all tests
npm run test:backend   # Backend tests only
npm run test:web       # Frontend tests only
```

## 📦 Building for Production

```bash
npm run build          # Build all workspaces
npm run build:backend  # Build backend only
npm run build:web      # Build web app only
```

## 🚀 Deployment

### Docker Swarm (Recommended)

```bash
docker stack deploy -c docker-compose.yml autoinvoice
```

### Kubernetes

Kubernetes manifests coming soon.

## 🔧 Environment Variables

See `.env.example` for all available configuration options.

**Required:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `JWT_SECRET` - Secret for signing JWT tokens (min 32 chars)

**Optional (but recommended):**
- `OPENAI_API_KEY` - OpenAI API key for AI features
- `ANTHROPIC_API_KEY` - Anthropic API key (fallback)
- `TELEGRAM_BOT_TOKEN` - Telegram bot token
- `GOOGLE_CLIENT_ID` - Google OAuth client ID
- `GOOGLE_CLIENT_SECRET` - Google OAuth secret

## 📝 API Documentation

### tRPC Endpoints

**Auth:**
- `auth.register` - Register new user
- `auth.login` - Login user
- `auth.refresh` - Refresh access token

**Customers:**
- `customer.list` - List customers (paginated)
- `customer.get` - Get customer by ID
- `customer.create` - Create customer
- `customer.update` - Update customer
- `customer.delete` - Delete customer
- `customer.search` - Search by name/nickname

**Invoices:**
- `invoice.list` - List invoices (paginated)
- `invoice.get` - Get invoice by ID
- `invoice.create` - Create invoice
- `invoice.updateStatus` - Update invoice status
- `invoice.delete` - Delete invoice
- `invoice.stats` - Get statistics

**Services:**
- `service.list` - List all services
- `service.get` - Get service by ID
- `service.create` - Create service
- `service.update` - Update service
- `service.delete` - Delete service

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- OpenAI for GPT-4 and Whisper APIs
- Anthropic for Claude API
- Ollama for local LLM support
- The amazing open-source community

## 📧 Support

For support, email support@autoinvoice.com or open an issue on GitHub.

---

**Built with ❤️ using TypeScript, PostgreSQL, and AI**

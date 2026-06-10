# AutoInvoice Architecture

## System Overview

AutoInvoice is built as a **production-ready, database-first platform** using a **vertical architecture** approach where each feature is fully implemented before moving to the next.

## Design Principles

1. **Database First**: PostgreSQL is the source of truth from day one
2. **Type Safety**: End-to-end type safety with TypeScript, Prisma, tRPC, and Zod
3. **AI Abstraction**: Swappable AI providers with automatic fallback
4. **Async Processing**: Background jobs for all heavy operations
5. **Multi-Channel**: Support for voice, chat, web, and mobile interfaces

## Architecture Layers

### 1. Foundation Layer (Permanent)

This layer never changes and provides stable infrastructure:

```
┌─────────────────────────────────────────┐
│         Application Layer               │
│  (Web, Mobile, Telegram, Voice, CLI)   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│          API Layer (tRPC)               │
│  Type-safe, validated, authenticated   │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│        Business Logic Layer             │
│  (Routers, Services, Middleware)        │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│         Data Layer (Prisma)             │
│  ORM, migrations, type generation       │
└─────────────────────────────────────────┘
                    ↓
┌─────────────────────────────────────────┐
│    Database (PostgreSQL + pgvector)     │
│  Single source of truth                 │
└─────────────────────────────────────────┘
```

### 2. AI Layer (Swappable)

AI providers are abstracted behind a unified interface:

```typescript
interface AIProvider {
  parseInvoice(text: string): Promise<InvoiceData>
  transcribe(audio: Buffer): Promise<string>
  generateSpeech(text: string): Promise<Buffer>
  extractReceipt(image: Buffer): Promise<ReceiptData>
}
```

**Provider Chain:**
```
Request → AIRouter → [OpenAI → Anthropic → Ollama] → Response
                      ↓         ↓          ↓
                    Success   Fallback   Fallback
```

Each provider logs its usage to `AIInteraction` table for analytics and cost tracking.

### 3. Queue System

Background processing using BullMQ + Redis:

```
┌─────────────────┐
│  API Request    │
└────────┬────────┘
         ↓
┌────────────────────────┐
│  Queue Job (BullMQ)    │
│  - PDF Generation      │
│  - Email Sending       │
│  - OCR Processing      │
│  - Payment Reminders   │
└────────┬───────────────┘
         ↓
┌────────────────────────┐
│  Worker Processes      │
│  (Concurrent)          │
└────────┬───────────────┘
         ↓
┌────────────────────────┐
│  Result Storage        │
│  (PostgreSQL)          │
└────────────────────────┘
```

## Data Flow

### Invoice Creation Flow

```
1. User Input (Voice/Text/Telegram)
         ↓
2. AI Router (parseInvoice)
         ↓
3. Natural Language → Structured Data
         ↓
4. Validation (Zod schemas)
         ↓
5. Database Transaction (Prisma)
   - Create/Find Customer
   - Create Invoice
   - Create Line Items
         ↓
6. Background Jobs (BullMQ)
   - Queue PDF generation
   - Queue email sending
         ↓
7. Response to User
```

### Receipt Processing Flow

```
1. Image Upload
         ↓
2. Queue OCR Job
         ↓
3. AI Vision (extractReceipt)
   - Try GPT-4 Vision
   - Fallback to Claude Vision
   - Fallback to Tesseract
         ↓
4. Extract Structured Data
   - Vendor
   - Amount
   - Date
   - Line items
         ↓
5. Store in Database
   - Receipt record
   - OCR confidence score
   - Raw OCR data
         ↓
6. Optional: Link to Invoice
```

## Security Architecture

### Authentication Flow

```
1. User credentials
         ↓
2. bcrypt password verification
         ↓
3. Generate JWT access token (15min)
         ↓
4. Generate refresh token (7 days)
         ↓
5. Return both tokens
         ↓
6. Client stores tokens
         ↓
7. Subsequent requests use access token
         ↓
8. When access token expires:
   - Use refresh token
   - Get new access token
   - Get new refresh token (rotation)
```

### Authorization

```typescript
// Public routes (no auth)
publicProcedure
  .input(schema)
  .mutation(handler)

// Protected routes (requires auth)
protectedProcedure
  .use(authMiddleware)  // Checks JWT
  .input(schema)
  .mutation(handler)
```

## State Management

### Web (Next.js)
- Server State: React Query (via tRPC)
- Client State: Zustand
- Form State: React Hook Form + Zod

### Mobile (React Native)
- Server State: React Query (via tRPC)
- Client State: Zustand
- Navigation State: Expo Router

## Database Design

### Key Design Decisions

1. **pgvector Extension**: Future-proof for AI embeddings and semantic search
2. **JSON Fields**: Flexible storage for dynamic data (customFields, context)
3. **Decimal Type**: Precise financial calculations
4. **Soft Deletes**: Not implemented yet, but can be added without breaking changes
5. **Indexes**: Strategic indexes on frequently queried fields

### Relationships

```
User (1) ────── (N) (none yet - multi-tenancy ready)

Customer (1) ── (N) Invoice
         (1) ── (N) Location
         (1) ── (N) PriceOverride
         (1) ── (N) Conversation

Invoice (1) ─── (N) LineItem
        (1) ─── (N) Receipt
        (1) ─── (N) Conversation
        (N) ─── (1) Customer
        (N) ─── (1) Location

Service (1) ─── (N) LineItem
        (1) ─── (N) PriceOverride

Conversation (1) ─ (N) Message
             (N) ─ (1) Customer
             (N) ─ (1) Invoice
```

## Scalability Considerations

### Current Architecture
- Monolithic backend (simple, fast to develop)
- Horizontal scaling via Docker replicas
- Database connection pooling via Prisma
- Redis for caching and queues

### Future Scaling Options

1. **Microservices (if needed)**
   ```
   ├── invoice-service
   ├── customer-service
   ├── ai-service
   ├── notification-service
   └── pdf-service
   ```

2. **Database Scaling**
   - Read replicas for queries
   - Partitioning by customer/date
   - Connection pooling (PgBouncer)

3. **Queue Scaling**
   - Multiple worker instances
   - Job prioritization
   - Rate limiting per provider

## Monitoring & Observability

### Logging
- Winston for structured logging
- Log levels: error, warn, info, debug
- Request IDs for tracing

### Metrics (Planned)
- AI provider usage and costs
- Queue job statistics
- API response times
- Error rates

### Database
- All AI interactions logged
- Query performance via Prisma
- Migration history tracked

## Development Workflow

### Local Development
```bash
docker-compose up -d  # Start infrastructure
npm run dev           # Start all dev servers
```

### Testing Strategy
1. **Unit Tests**: Business logic and utilities
2. **Integration Tests**: API endpoints
3. **E2E Tests**: Critical user flows
4. **Manual Testing**: UI/UX validation

### Deployment Pipeline
```
1. Git Push
     ↓
2. CI/CD (GitHub Actions)
   - Lint
   - Type check
   - Tests
   - Build
     ↓
3. Build Docker images
     ↓
4. Push to registry
     ↓
5. Deploy to production
   - Rolling update
   - Health checks
   - Rollback if needed
```

## Technology Choices Rationale

### Why PostgreSQL?
- ACID compliance for financial data
- Rich type system (JSON, arrays, decimals)
- pgvector for future AI features
- Battle-tested and scalable
- Excellent TypeScript support via Prisma

### Why tRPC?
- End-to-end type safety
- No code generation needed
- Automatic API documentation
- Great DX with autocomplete
- Works perfectly with Prisma types

### Why BullMQ?
- Redis-based (fast and reliable)
- Job retries and failures
- Cron jobs support
- Great monitoring tools
- Active development

### Why Prisma?
- Type-safe database queries
- Migration management
- Introspection and validation
- Multiple database support
- Great documentation

## Future Enhancements

1. **Multi-tenancy**
   - Add `organizationId` to all tables
   - Row-level security
   - Per-tenant databases (optional)

2. **Real-time Features**
   - WebSocket support (Socket.io)
   - Live invoice updates
   - Chat with AI assistant

3. **Advanced Analytics**
   - Revenue forecasting
   - Customer segmentation
   - Payment prediction

4. **Mobile SDK**
   - Offline support
   - Background sync
   - Push notifications

5. **Plugin System**
   - Custom integrations
   - Webhook system
   - API extensions

# Technology Stack

## Foundation Layer (Stable - Never Changes)

### Database
- **PostgreSQL 16** with pgvector extension (for future vector embeddings)
- **ORM**: Prisma 5.11 with full TypeScript support
- **Migrations**: Prisma Migrate for schema versioning
- **Backup**: Automated pg_dump for data protection
- **Connection**: Docker-based with persistent volumes

### Backend
- **Runtime**: Node.js 18+ with TypeScript 5.3.3
- **Framework**: Express.js for HTTP server
- **API**: tRPC for type-safe API with zero-overhead
- **Validation**: Zod for runtime type validation
- **Authentication**: JWT tokens with refresh token rotation
- **File Upload**: Multer for multipart form handling
- **Job Queue**: BullMQ with Redis for background tasks
- **Logging**: Winston for structured logging

### Frontend Web
- **Framework**: Next.js 14 with App Router (latest React patterns)
- **Language**: TypeScript 5.3.3
- **Styling**: Tailwind CSS 3.x for utility-first styling
- **State Management**: Zustand for lightweight state
- **Forms**: React Hook Form with Zod validation
- **API Client**: tRPC React hooks for type-safe queries

### Frontend Mobile
- **Framework**: React Native with Expo
- **Router**: Expo Router for file-based routing
- **Styling**: Tailwind-compatible styling (NativeWind)
- **State**: Shared Zustand store with web
- **API Client**: tRPC React hooks (shared with web)

## AI Layer (Swappable Providers)

### LLM Interface
- **Primary**: OpenAI GPT-4 API (gpt-4-turbo-preview)
- **Fallback 1**: Anthropic Claude API (claude-3-5-sonnet)
- **Fallback 2**: Ollama for local LLM (llama2, optional)
- **Architecture**: Custom provider abstraction with automatic fallback chain

### Voice AI
- **Speech-to-Text**: OpenAI Whisper API
- **Text-to-Speech**: OpenAI TTS API

### Vision OCR
- **Primary**: GPT-4 Vision for receipt scanning
- **Fallback**: Anthropic Claude Vision

## Integration Layer

### Messaging & Communication
- **Phase 1**: Telegram Bot API (active development)
- **Phase 2**: Twilio SMS (planned)
- **Phase 3**: WhatsApp Business API (planned)

### Google Workspace
- **Auth**: OAuth 2.0 flow
- **APIs**: Calendar, Gmail, Drive integration
- **SDK**: googleapis npm package

### PDF Generation
- **Library**: pdf-lib for programmatic PDF creation
- **Storage**: Dual strategy - PostgreSQL (bytea) + filesystem backup
- **Templates**: Professional invoice templates with branding

## Infrastructure

### Development
- **Package Manager**: npm workspaces for monorepo
- **Docker**: docker-compose for local PostgreSQL + Redis
- **Testing**: Jest for unit/integration tests
- **Linting**: ESLint with TypeScript rules
- **Code Quality**: TypeScript strict mode, Prettier formatting

### Production (Planned)
- **Deployment**: Docker Swarm or Kubernetes
- **Reverse Proxy**: nginx for load balancing
- **Monitoring**: Prometheus + Grafana (to be configured)
- **Logging**: ELK stack or Loki (to be configured)

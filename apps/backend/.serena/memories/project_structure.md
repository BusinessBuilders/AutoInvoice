# Project Structure

## Monorepo Layout

AutoInvoice is organized as an npm workspaces monorepo:

```
AutoInvoice/
├── apps/              # Application workspaces
│   ├── backend/       # Node.js + Express + tRPC API
│   ├── web/           # Next.js 14 web application
│   └── mobile/        # React Native + Expo mobile app
├── packages/          # Shared packages
│   └── shared/        # Shared types and utilities
├── nginx/             # Nginx reverse proxy configuration
├── docker-compose.yml # Infrastructure orchestration
├── package.json       # Root workspace configuration
└── README.md          # Project documentation
```

## Backend Structure (`apps/backend/`)

```
backend/
├── src/
│   ├── routers/              # tRPC API routers
│   │   ├── auth.ts           # Authentication endpoints
│   │   ├── customer.ts       # Customer CRUD operations
│   │   ├── invoice.ts        # Invoice management
│   │   ├── service.ts        # Service catalog
│   │   ├── receipt.ts        # Receipt OCR and processing
│   │   ├── branding.ts       # Logo/branding customization
│   │   └── conversation.ts   # Multi-channel conversations
│   │
│   ├── services/             # Business logic layer
│   │   ├── ai/              # AI provider abstractions
│   │   │   ├── index.ts     # AI router with fallback
│   │   │   ├── openai.ts    # OpenAI provider
│   │   │   ├── anthropic.ts # Claude provider
│   │   │   └── ollama.ts    # Local LLM provider
│   │   ├── queue/           # BullMQ job processors
│   │   │   ├── pdf.queue.ts
│   │   │   ├── email.queue.ts
│   │   │   └── ocr.queue.ts
│   │   ├── telegram/        # Telegram bot integration
│   │   ├── google/          # Google Workspace APIs
│   │   ├── pdf/             # PDF generation
│   │   │   └── professional-generator.ts
│   │   └── logo/            # Logo processing and colors
│   │
│   ├── middleware/           # Express/tRPC middleware
│   │   └── auth.ts          # JWT authentication
│   │
│   ├── utils/                # Shared utilities
│   │   ├── db.ts            # Prisma client singleton
│   │   ├── logger.ts        # Winston logger configuration
│   │   ├── env.ts           # Environment validation
│   │   └── validation.ts    # Common Zod schemas
│   │
│   ├── trpc.ts               # tRPC configuration and context
│   ├── server.ts             # Express server setup
│   └── index.ts              # Application entry point
│
├── prisma/
│   ├── schema.prisma         # Database schema definition
│   ├── migrations/           # Migration history
│   └── seed.ts               # Database seeding script
│
├── uploads/                  # File upload storage (gitignored)
├── dist/                     # Compiled JavaScript output
├── package.json              # Backend dependencies
├── tsconfig.json             # TypeScript configuration
├── .eslintrc.json            # ESLint rules
├── jest.config.js            # Jest testing configuration
├── .env                      # Environment variables (gitignored)
└── Dockerfile                # Docker container definition
```

## Web Frontend Structure (`apps/web/`)

```
web/
├── src/
│   ├── app/                  # Next.js 14 App Router
│   │   ├── layout.tsx        # Root layout with providers
│   │   ├── page.tsx          # Home page
│   │   ├── providers.tsx     # tRPC and React Query providers
│   │   │
│   │   ├── invoices/         # Invoice management pages
│   │   │   ├── page.tsx      # Invoice list
│   │   │   ├── new/          # Create invoice
│   │   │   └── [id]/         # Invoice detail (dynamic route)
│   │   │       └── page.tsx
│   │   │
│   │   ├── receipts/         # Receipt management pages
│   │   │   ├── page.tsx      # Receipt list
│   │   │   ├── upload/       # Receipt upload
│   │   │   └── [id]/         # Receipt detail (dynamic route)
│   │   │       └── page.tsx
│   │   │
│   │   ├── customers/        # Customer management pages
│   │   │   ├── page.tsx      # Customer list
│   │   │   └── [id]/         # Customer detail
│   │   │       └── page.tsx
│   │   │
│   │   └── settings/         # Settings pages
│   │       ├── page.tsx
│   │       ├── branding/     # Logo/color customization
│   │       └── profile/      # User profile
│   │
│   ├── components/           # Reusable React components
│   │   ├── ui/              # Base UI components (buttons, inputs)
│   │   ├── forms/           # Form components
│   │   ├── layout/          # Layout components (nav, sidebar)
│   │   └── shared/          # Shared business components
│   │
│   ├── lib/                  # Utilities and configurations
│   │   ├── trpc.ts          # tRPC client configuration
│   │   ├── utils.ts         # Helper functions
│   │   └── constants.ts     # Application constants
│   │
│   └── store/                # Zustand state management
│       ├── auth.ts          # Authentication state
│       └── ui.ts            # UI state (modals, toasts)
│
├── public/                   # Static assets
├── .next/                    # Next.js build output (gitignored)
├── package.json              # Frontend dependencies
├── tsconfig.json             # TypeScript configuration
├── tailwind.config.js        # Tailwind CSS configuration
├── next.config.js            # Next.js configuration
└── postcss.config.js         # PostCSS configuration
```

## Mobile App Structure (`apps/mobile/`)

```
mobile/
├── app/                      # Expo Router screens
│   ├── _layout.tsx          # Root layout
│   ├── index.tsx            # Home screen
│   ├── invoices/            # Invoice screens
│   ├── receipts/            # Receipt screens
│   └── customers/           # Customer screens
│
├── components/               # React Native components
│   ├── ui/                  # Base UI components
│   └── shared/              # Shared business components
│
├── lib/                      # Utilities
│   ├── trpc.ts              # tRPC client for mobile
│   └── utils.ts             # Helper functions
│
├── store/                    # Zustand state (shared with web)
├── assets/                   # Images, fonts
├── package.json              # Mobile dependencies
└── app.json                  # Expo configuration
```

## Key Files and Their Purposes

### Backend
- **`trpc.ts`**: Defines tRPC configuration, context creation, protected procedures
- **`server.ts`**: Sets up Express server, middleware, CORS, tRPC adapter
- **`schema.prisma`**: Single source of truth for database schema
- **`.env`**: Environment configuration (API keys, database URL, etc.)

### Frontend
- **`providers.tsx`**: Wraps app with tRPC and React Query providers, handles API URL detection (localhost/ngrok/production)
- **`layout.tsx`**: Root layout with global styles, fonts, metadata
- **`trpc.ts`**: Creates type-safe tRPC client for frontend

### Shared
- **`docker-compose.yml`**: Orchestrates PostgreSQL, Redis, and optional Ollama containers
- **`package.json` (root)**: Defines workspace scripts and dependencies
- **`tsconfig.json` (root)**: Base TypeScript configuration extended by all workspaces

## Data Flow

1. **User Action** → Frontend (Next.js / React Native)
2. **tRPC Call** → Type-safe request with Zod validation
3. **Backend Router** → Processes request, validates auth
4. **Service Layer** → Business logic (AI, PDF, queue, etc.)
5. **Prisma ORM** → Database operations
6. **PostgreSQL** → Data persistence
7. **Response** → Type-safe response back to frontend

## Build Artifacts (Gitignored)

- `node_modules/` - Dependencies
- `dist/` - Compiled backend JavaScript
- `.next/` - Next.js build output
- `uploads/` - User-uploaded files
- `.env` - Environment secrets
- `.serena/` - Serena MCP knowledge base
- `*.log` - Log files

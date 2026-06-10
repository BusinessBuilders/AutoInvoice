# Code Style and Conventions

## TypeScript Configuration

### Compiler Options
- **Target**: ES2022 (modern JavaScript features)
- **Module**: CommonJS for backend, ESNext for frontend
- **Strict Mode**: Enabled (all strict checks on)
- **ESModule Interop**: Enabled for better compatibility
- **Skip Lib Check**: Enabled for faster builds
- **Force Consistent Casing**: Enabled for cross-platform compatibility
- **Source Maps**: Enabled for debugging
- **Declaration Files**: Generated for type definitions

### Import Style
- Use ES6 imports: `import { x } from 'y'`
- Group imports: external deps → internal modules → types
- Use path aliases: `@/lib`, `@/components` (Next.js convention)

## ESLint Rules

### Key Rules
- **no-explicit-any**: Warn (discouraged but not forbidden)
- **no-unused-vars**: Error, except for args starting with `_`
- **explicit-function-return-type**: Off (let TypeScript infer)

### Best Practices
- Prefer `const` over `let`, avoid `var`
- Use template literals over string concatenation
- Async/await over raw promises
- Destructuring for cleaner code

## Naming Conventions

### Variables and Functions
- **camelCase** for variables and functions: `const userId`, `function getUserById()`
- **PascalCase** for classes and types: `class UserService`, `type InvoiceData`
- **UPPER_SNAKE_CASE** for constants: `const API_BASE_URL`, `const MAX_FILE_SIZE`

### Files and Directories
- **kebab-case** for file names: `user-service.ts`, `invoice-router.ts`
- **PascalCase** for React components: `InvoiceList.tsx`, `CustomerForm.tsx`
- **Lowercase** for directories: `routers`, `services`, `utils`, `components`

### Database (Prisma)
- **PascalCase** for models: `User`, `Invoice`, `Customer`
- **camelCase** for fields: `userId`, `createdAt`, `invoiceNumber`

## Code Organization

### Backend Structure
```
src/
├── routers/          # tRPC routers (API endpoints)
├── services/         # Business logic layer
│   ├── ai/          # AI provider abstractions
│   ├── queue/       # BullMQ job processors
│   └── pdf/         # PDF generation
├── middleware/       # Express/tRPC middleware
├── utils/           # Shared utilities (db, logger, env)
├── trpc.ts          # tRPC configuration
└── server.ts        # Express server setup
```

### Frontend Structure (Next.js)
```
src/
├── app/             # Next.js App Router pages
├── components/      # Reusable React components
├── lib/             # Utilities (tRPC client, helpers)
└── store/           # Zustand state management
```

## Type Safety Patterns

### tRPC Routers
```typescript
export const userRouter = router({
  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // Implementation
    }),
});
```

### Zod Validation
Always validate external inputs with Zod schemas:
```typescript
const createInvoiceSchema = z.object({
  customerId: z.string(),
  amount: z.number().positive(),
  date: z.coerce.date(),
});
```

### Error Handling
- Use TRPCError for API errors: `throw new TRPCError({ code: 'NOT_FOUND' })`
- Log errors with context: `logger.error('Operation failed', { userId, error })`
- Never expose internal errors to clients

## Comments and Documentation

### When to Comment
- Complex algorithms or business logic
- Non-obvious workarounds or edge cases  
- Public APIs and exported functions
- DO NOT comment obvious code

### JSDoc for Public APIs
```typescript
/**
 * Processes receipt image using AI OCR
 * @param imageBuffer - Raw image data
 * @returns Extracted receipt data with confidence scores
 */
export async function extractReceipt(imageBuffer: Buffer): Promise<ReceiptData>
```

## Git Conventions

### Commit Messages
- Use present tense: "Add feature" not "Added feature"
- Start with verb: "Fix", "Add", "Update", "Remove", "Refactor"
- Keep first line under 72 characters
- Add detailed description if needed

### Branch Naming
- `feature/description` - New features
- `fix/description` - Bug fixes
- `refactor/description` - Code refactoring
- `docs/description` - Documentation updates

# Task Completion Checklist

When completing a development task, ensure the following steps are completed:

## 1. Code Quality

### TypeScript
- [ ] No TypeScript errors: `cd apps/backend && npx tsc --noEmit`
- [ ] No TypeScript errors: `cd apps/web && npx tsc --noEmit`
- [ ] All types are properly defined (no excessive `any` usage)
- [ ] Zod schemas for all external inputs

### Linting
- [ ] ESLint passes: `npm run lint`
- [ ] No console.log statements in production code (use logger instead)
- [ ] Unused imports removed
- [ ] Consistent code formatting

## 2. Testing

### Manual Testing
- [ ] Feature works on localhost (http://localhost:3000)
- [ ] Feature works via ngrok (for mobile testing)
- [ ] Tested in different browsers (Chrome, Firefox, Safari)
- [ ] Mobile responsive design verified

### Backend Testing
- [ ] API endpoints return correct responses
- [ ] Error handling works properly (try invalid inputs)
- [ ] Database migrations applied: `npm run db:migrate`
- [ ] Prisma client regenerated if schema changed: `cd apps/backend && npx prisma generate`

### Frontend Testing
- [ ] Forms validate correctly
- [ ] Error states display properly
- [ ] Loading states implemented
- [ ] Success/error toasts/messages shown

## 3. Database

### Prisma Changes
- [ ] Schema changes documented
- [ ] Migration created: `npm run db:migrate`
- [ ] Migration tested on clean database
- [ ] Seed data updated if needed
- [ ] Prisma Studio verified: `npm run db:studio`

### Data Integrity
- [ ] Foreign key relationships correct
- [ ] Required fields marked properly
- [ ] Default values appropriate
- [ ] Indexes added for performance if needed

## 4. Security

### Authentication
- [ ] Protected routes require authentication
- [ ] JWT tokens validated correctly
- [ ] User authorization checked (users can only access their own data)
- [ ] Sensitive data not logged

### Input Validation
- [ ] All inputs validated with Zod
- [ ] SQL injection prevented (using Prisma ORM)
- [ ] XSS prevented (React escapes by default)
- [ ] File uploads validated (size, type)

## 5. Performance

### Backend
- [ ] Database queries optimized (use includes/select wisely)
- [ ] N+1 query problems avoided
- [ ] Pagination implemented for lists
- [ ] Appropriate indexes created

### Frontend
- [ ] Images optimized (Next.js Image component)
- [ ] Large lists virtualized if needed
- [ ] Unnecessary re-renders avoided
- [ ] Code splitting implemented where appropriate

## 6. Error Handling

### Backend
- [ ] TRPCError used with appropriate codes
- [ ] Errors logged with context: `logger.error('message', { context })`
- [ ] User-friendly error messages (not internal details)
- [ ] Database errors caught and handled

### Frontend
- [ ] API errors displayed to user
- [ ] Retry logic for transient failures
- [ ] Graceful degradation when features unavailable
- [ ] Loading states prevent race conditions

## 7. Documentation

### Code Documentation
- [ ] Complex logic commented
- [ ] JSDoc for public APIs
- [ ] README updated if needed
- [ ] Environment variables documented

### API Documentation
- [ ] tRPC endpoints self-documenting via types
- [ ] Example requests/responses provided if complex
- [ ] Breaking changes noted

## 8. Git

### Commits
- [ ] Meaningful commit messages
- [ ] Related changes grouped in single commit
- [ ] No debug code or console.logs committed
- [ ] .env and secrets not committed

### Pull Requests
- [ ] Branch up to date with main: `git pull origin main`
- [ ] All tests passing
- [ ] Code reviewed (self-review at minimum)
- [ ] Breaking changes clearly marked

## 9. Deployment Readiness

### Environment
- [ ] Works with environment variables (not hardcoded values)
- [ ] .env.example updated with new variables
- [ ] Database migrations can run in production
- [ ] No dev-only code in production paths

### Configuration
- [ ] CORS configured correctly
- [ ] Rate limiting in place for public endpoints
- [ ] File upload limits set
- [ ] Logging configured properly

## 10. Cleanup

### Development
- [ ] Temporary files removed
- [ ] Test data cleaned up
- [ ] Development endpoints removed/protected
- [ ] Debug flags turned off

### Build
- [ ] Production build succeeds: `npm run build`
- [ ] No build warnings
- [ ] Bundle size reasonable
- [ ] Source maps generated for debugging

## Quick Commands Checklist

Run these before considering a task complete:

```bash
# TypeScript check
cd apps/backend && npx tsc --noEmit
cd apps/web && npx tsc --noEmit

# Lint
npm run lint

# Build
npm run build

# Test locally
docker-compose up -d
npm run dev

# Verify database
npm run db:studio
```

## Special Cases

### Adding a New tRPC Endpoint
- [ ] Router defined in `apps/backend/src/routers/`
- [ ] Input schema validated with Zod
- [ ] Protected with `protectedProcedure` if auth required
- [ ] Error handling implemented
- [ ] Type exports available to frontend

### Adding a New Database Model
- [ ] Schema updated in `schema.prisma`
- [ ] Migration created: `npm run db:migrate`
- [ ] Relations defined correctly
- [ ] Seed data added if needed
- [ ] Indexes for foreign keys

### Adding a New Frontend Page
- [ ] Page file in correct `app/` directory
- [ ] Metadata defined (title, description)
- [ ] Mobile responsive
- [ ] Loading state handled
- [ ] Error state handled
- [ ] Navigation links updated

### Working with AI Features
- [ ] API key configured (OPENAI_API_KEY or ANTHROPIC_API_KEY)
- [ ] Fallback providers configured
- [ ] Error handling for API failures
- [ ] Cost limits considered (token usage)
- [ ] User feedback for long operations

## Critical Fixes (ngrok bypass header)

When deploying or testing via ngrok:
- [ ] `'ngrok-skip-browser-warning': 'true'` header present in tRPC client (providers.tsx)
- [ ] API URL detection works for localhost, ngrok, and production
- [ ] Mobile testing verified via ngrok tunnel

## Final Verification

Before marking task complete:
1. Clear browser cache and test
2. Test with fresh database (if schema changed)
3. Restart dev servers
4. Check for console errors
5. Verify no TypeScript/ESLint errors
6. Test both desktop and mobile views

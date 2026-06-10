# Essential Development Commands

## Initial Setup

### First Time Setup
```bash
# Clone repository
git clone https://github.com/yourusername/AutoInvoice.git
cd AutoInvoice

# Install all dependencies (monorepo)
npm install

# Start Docker services (PostgreSQL + Redis)
docker-compose up -d

# Run database migrations
npm run db:migrate

# Optional: Seed initial data
npm run db:seed
```

## Daily Development

### Start Everything
```bash
# Start all services (Docker + Backend + Frontend)
npm run dev
```
This starts:
- PostgreSQL on localhost:5432
- Redis on localhost:6379
- Backend API on http://localhost:4000
- Web app on http://localhost:3000

### Start Individual Services
```bash
# Backend only
npm run dev:backend

# Web frontend only
npm run dev:web

# Mobile app only (requires Expo)
npm run dev:mobile
```

## Database Management

### Prisma Commands
```bash
# Open Prisma Studio (visual database browser)
npm run db:studio

# Create and apply migration
npm run db:migrate

# Generate Prisma Client after schema changes
cd apps/backend && npx prisma generate

# Reset database (DESTRUCTIVE - development only)
cd apps/backend && npx prisma migrate reset

# Seed database with initial data
npm run db:seed

# Create manual backup
npm run db:backup
```

### Direct Database Access
```bash
# Connect to PostgreSQL
docker exec -it invoice_db psql -U invoice_user -d invoice_platform

# View all receipts
PGPASSWORD=invoice_dev_password psql -h localhost -U invoice_user -d invoice_platform -c "SELECT id, vendor, amount, status FROM \"Receipt\" LIMIT 10;"

# Check database size
PGPASSWORD=invoice_dev_password psql -h localhost -U invoice_user -d invoice_platform -c "SELECT pg_size_pretty(pg_database_size('invoice_platform'));"
```

## Building

### Production Builds
```bash
# Build all workspaces
npm run build

# Build backend only
npm run build:backend

# Build web only
npm run build:web
```

### Type Checking
```bash
# Check TypeScript types (all workspaces)
cd apps/backend && npx tsc --noEmit
cd apps/web && npx tsc --noEmit
```

## Code Quality

### Linting
```bash
# Lint all workspaces
npm run lint

# Lint specific workspace
cd apps/backend && npm run lint
cd apps/web && npm run lint
```

### Testing
```bash
# Run all tests
npm run test

# Run backend tests only
npm run test:backend

# Run web tests only
npm run test:web

# Run tests in watch mode
cd apps/backend && npm test -- --watch
```

## Docker Management

### Container Operations
```bash
# Start all containers
npm run docker:up
# or
docker-compose up -d

# Stop all containers
npm run docker:down
# or
docker-compose down

# View logs
npm run docker:logs
# or
docker-compose logs -f

# Restart specific service
docker-compose restart postgres
docker-compose restart redis
```

### Container Inspection
```bash
# List running containers
docker ps

# Check PostgreSQL logs
docker logs invoice_db

# Check Redis logs
docker logs invoice_redis

# Execute commands in containers
docker exec -it invoice_db bash
docker exec -it invoice_redis redis-cli
```

## Ngrok (Mobile/External Testing)

### Start Ngrok Tunnels
```bash
# Start ngrok for both frontend and backend
ngrok start --all --log=stdout

# Or manually
ngrok http --domain=<your-domain> 3000  # Frontend
ngrok http --domain=<other-domain> 4000  # Backend
```

## Git Workflow

### Common Operations
```bash
# Check status
git status

# Create feature branch
git checkout -b feature/description

# Stage changes
git add .

# Commit with message
git commit -m "Add feature description"

# Push to remote
git push origin feature/description

# Pull latest changes
git pull origin main

# View commit history
git log --oneline --graph --decorate --all
```

## Useful Utilities

### System Commands
```bash
# Find files
find /home/magiccat/AutoInvoice -name "*.ts" -type f

# Search code
grep -r "searchTerm" apps/backend/src/

# List directory contents
ls -la apps/backend/src/routers/

# Change directory
cd apps/backend
cd apps/web

# View file contents
cat apps/backend/.env

# Check Node version
node --version

# Check npm version
npm --version

# Check disk usage
df -h

# Check running processes
ps aux | grep node
```

### Network Debugging
```bash
# Check if port is in use
ss -tulpn | grep :4000

# Test API endpoint
curl http://localhost:4000/health

# Check PostgreSQL connection
pg_isready -h localhost -p 5432
```

## Environment Variables

### Backend (.env in apps/backend/)
```bash
# Required
DATABASE_URL=postgresql://invoice_user:invoice_dev_password@localhost:5432/invoice_platform
REDIS_URL=redis://localhost:6379
JWT_SECRET=your-secret-key-min-32-chars

# Optional AI providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
OLLAMA_URL=http://localhost:11434

# Optional integrations
TELEGRAM_BOT_TOKEN=...
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
```

### Frontend (.env.local in apps/web/)
```bash
# Optional: Override API URL
NEXT_PUBLIC_API_URL=http://localhost:4000
```

## Troubleshooting

### Clear Everything and Restart
```bash
# Stop all Docker containers
docker-compose down

# Clear Next.js cache
cd apps/web && rm -rf .next

# Clear node_modules and reinstall
rm -rf node_modules apps/*/node_modules
npm install

# Restart everything
docker-compose up -d
npm run dev
```

### Reset Database
```bash
cd apps/backend
npx prisma migrate reset
npx prisma migrate deploy
npx prisma db seed
```

### Kill Port Processes
```bash
# Kill process on port 4000
lsof -ti:4000 | xargs kill -9

# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

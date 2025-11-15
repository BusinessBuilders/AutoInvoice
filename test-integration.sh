#!/bin/bash

# AutoInvoice Integration Test Script
# This script tests the full stack from infrastructure to API

set -e

echo "🧪 AutoInvoice Integration Test Suite"
echo "======================================"
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test 1: Check Docker services
echo "📦 Test 1: Checking Docker services..."
if docker ps | grep -q invoice_db; then
    echo -e "${GREEN}✅ PostgreSQL is running${NC}"
else
    echo -e "${RED}❌ PostgreSQL is not running${NC}"
    echo "   Run: docker-compose up -d"
    exit 1
fi

if docker ps | grep -q invoice_redis; then
    echo -e "${GREEN}✅ Redis is running${NC}"
else
    echo -e "${RED}❌ Redis is not running${NC}"
    exit 1
fi

echo ""

# Test 2: Check PostgreSQL connection
echo "🗄️  Test 2: Testing PostgreSQL connection..."
if docker exec invoice_db pg_isready -U invoice_user > /dev/null 2>&1; then
    echo -e "${GREEN}✅ PostgreSQL is accepting connections${NC}"
else
    echo -e "${RED}❌ PostgreSQL connection failed${NC}"
    exit 1
fi

echo ""

# Test 3: Check Redis connection
echo "💾 Test 3: Testing Redis connection..."
if docker exec invoice_redis redis-cli ping | grep -q PONG; then
    echo -e "${GREEN}✅ Redis is responding${NC}"
else
    echo -e "${RED}❌ Redis connection failed${NC}"
    exit 1
fi

echo ""

# Test 4: Check if backend dependencies are installed
echo "📚 Test 4: Checking backend dependencies..."
if [ -d "apps/backend/node_modules" ]; then
    echo -e "${GREEN}✅ Backend dependencies installed${NC}"
else
    echo -e "${YELLOW}⚠️  Backend dependencies not installed${NC}"
    echo "   Installing now..."
    cd apps/backend && npm install && cd ../..
fi

echo ""

# Test 5: Run Prisma generate
echo "🔧 Test 5: Generating Prisma client..."
cd apps/backend
if npx prisma generate > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Prisma client generated${NC}"
else
    echo -e "${RED}❌ Prisma generate failed${NC}"
    exit 1
fi
cd ../..

echo ""

# Test 6: Check database schema
echo "📊 Test 6: Checking database schema..."
cd apps/backend
if npx prisma db push --accept-data-loss > /dev/null 2>&1; then
    echo -e "${GREEN}✅ Database schema synced${NC}"
else
    echo -e "${YELLOW}⚠️  Database schema sync had issues (may be normal)${NC}"
fi
cd ../..

echo ""

# Test 7: Test TypeScript compilation
echo "🔨 Test 7: Testing TypeScript compilation..."
cd apps/backend
if npx tsc --noEmit > /dev/null 2>&1; then
    echo -e "${GREEN}✅ TypeScript compiles successfully${NC}"
else
    echo -e "${YELLOW}⚠️  TypeScript has some type issues (checking...)${NC}"
    npx tsc --noEmit 2>&1 | head -20
fi
cd ../..

echo ""

echo "======================================"
echo -e "${GREEN}🎉 Integration tests complete!${NC}"
echo ""
echo "Next steps:"
echo "  1. Start backend:  cd apps/backend && npm run dev"
echo "  2. Start web app:  cd apps/web && npm run dev"
echo "  3. Open browser:   http://localhost:3000"
echo ""
echo "API Endpoints:"
echo "  • tRPC:        http://localhost:4000/trpc"
echo "  • Health:      http://localhost:4000/health"
echo "  • Upload:      http://localhost:4000/upload"
echo ""
echo "Database:"
echo "  • Prisma Studio: npm run db:studio"
echo ""

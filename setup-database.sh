#!/bin/bash
set -e

echo "🚀 AutoInvoice Database Setup Script"
echo "===================================="
echo ""

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Error: Docker is not running"
    echo "Please start Docker Desktop and try again"
    exit 1
fi

echo "✅ Docker is running"
echo ""

# Start PostgreSQL and Redis
echo "📦 Starting PostgreSQL and Redis..."
docker compose up -d postgres redis

echo "⏳ Waiting for PostgreSQL to be ready..."
sleep 5

# Check if PostgreSQL is ready
until docker compose exec -T postgres pg_isready > /dev/null 2>&1; do
    echo "   Still waiting for PostgreSQL..."
    sleep 2
done

echo "✅ PostgreSQL is ready"
echo ""

# Run Prisma migrations
echo "🔄 Running database migrations..."
cd apps/backend
npx prisma migrate deploy

echo ""
echo "✅ Database setup complete!"
echo ""
echo "📊 Database Info:"
echo "   Host: localhost"
echo "   Port: 5432"
echo "   Database: autoinvoice"
echo "   User: postgres"
echo ""
echo "🎯 Next steps:"
echo "   1. Configure your .env file with API keys"
echo "   2. Run: npm run dev (in apps/backend)"
echo "   3. Run: npm run dev (in apps/web)"
echo ""

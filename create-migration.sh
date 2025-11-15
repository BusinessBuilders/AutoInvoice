#!/bin/bash
set -e

echo "🔄 Creating Prisma Migration for Check Payment Feature"
echo "======================================================"
echo ""

# Navigate to backend directory
cd apps/backend

echo "📝 Migration will include:"
echo "   - Check model (new table)"
echo "   - Receipt.userId and Receipt.status fields (new columns)"
echo "   - Invoice.check relation (new column)"
echo ""

# Check if database is running
if docker compose exec -T postgres pg_isready > /dev/null 2>&1; then
    echo "✅ Database is running - creating migration with diff"
    echo ""

    # Create migration with Prisma
    npx prisma migrate dev --name add_check_payment_feature
else
    echo "⚠️  Database is not running"
    echo "   Creating migration file manually..."
    echo ""

    # Create migration directory
    MIGRATION_DIR="prisma/migrations/$(date +%Y%m%d%H%M%S)_add_check_payment_feature"
    mkdir -p "$MIGRATION_DIR"

    # Create migration.sql
    cat > "$MIGRATION_DIR/migration.sql" << 'EOF'
-- AlterTable Receipt - Add new columns
ALTER TABLE "Receipt" ADD COLUMN "userId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN "status" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable Check
CREATE TABLE "Check" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT,
    "userId" TEXT,
    "imageUrl" TEXT,
    "imageData" BYTEA,
    "checkNumber" TEXT NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "payee" TEXT,
    "memo" TEXT,
    "ocrData" JSONB,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "matchedAt" TIMESTAMP(3),
    "confidence" DOUBLE PRECISION,
    "processed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Check_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Check_invoiceId_key" ON "Check"("invoiceId");

-- CreateIndex
CREATE INDEX "Check_invoiceId_idx" ON "Check"("invoiceId");

-- CreateIndex
CREATE INDEX "Check_checkNumber_idx" ON "Check"("checkNumber");

-- CreateIndex
CREATE INDEX "Check_date_idx" ON "Check"("date");

-- CreateIndex
CREATE INDEX "Check_userId_idx" ON "Check"("userId");

-- CreateIndex
CREATE INDEX "Check_amount_idx" ON "Check"("amount");

-- CreateIndex on Receipt
CREATE INDEX "Receipt_userId_idx" ON "Receipt"("userId");

-- AddForeignKey
ALTER TABLE "Check" ADD CONSTRAINT "Check_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EOF

    echo "✅ Migration file created: $MIGRATION_DIR/migration.sql"
    echo ""
    echo "⚠️  To apply this migration:"
    echo "   1. Start the database: docker compose up -d postgres"
    echo "   2. Run: cd apps/backend && npx prisma migrate deploy"
fi

echo ""
echo "✅ Migration ready!"

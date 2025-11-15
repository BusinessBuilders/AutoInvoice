-- AlterTable Receipt - Add new columns for user tracking and status
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "Receipt" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'pending';

-- CreateTable Check - New table for check payment recognition
CREATE TABLE IF NOT EXISTS "Check" (
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

-- CreateIndex - Unique constraint on invoiceId (one check per invoice)
CREATE UNIQUE INDEX IF NOT EXISTS "Check_invoiceId_key" ON "Check"("invoiceId");

-- CreateIndex - Performance indexes for Check table
CREATE INDEX IF NOT EXISTS "Check_invoiceId_idx" ON "Check"("invoiceId");
CREATE INDEX IF NOT EXISTS "Check_checkNumber_idx" ON "Check"("checkNumber");
CREATE INDEX IF NOT EXISTS "Check_date_idx" ON "Check"("date");
CREATE INDEX IF NOT EXISTS "Check_userId_idx" ON "Check"("userId");
CREATE INDEX IF NOT EXISTS "Check_amount_idx" ON "Check"("amount");

-- CreateIndex - Performance index for Receipt.userId
CREATE INDEX IF NOT EXISTS "Receipt_userId_idx" ON "Receipt"("userId");

-- AddForeignKey - Link Check to Invoice
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conname = 'Check_invoiceId_fkey'
    ) THEN
        ALTER TABLE "Check" ADD CONSTRAINT "Check_invoiceId_fkey"
        FOREIGN KEY ("invoiceId") REFERENCES "Invoice"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

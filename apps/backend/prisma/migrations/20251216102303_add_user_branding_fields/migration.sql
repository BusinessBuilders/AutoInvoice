-- AddBrandingFieldsToUser
-- This migration only ADDS new columns, it will NEVER delete existing data

ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "logoPath" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "brandColors" JSONB;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyName" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyAddress" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyPhone" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyEmail" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyWebsite" TEXT;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "companyTaxId" TEXT;

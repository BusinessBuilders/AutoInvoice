-- AddUserId to Accounting Tables Migration
-- This migration adds userId fields to Account, JournalEntry, and ExpenseCategory tables
-- and associates existing data with the first user in the system

-- Step 1: Add userId column as NULLABLE to existing tables
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "userId" TEXT;
ALTER TABLE "ExpenseCategory" ADD COLUMN IF NOT EXISTS "userId" TEXT;

-- Step 2: Set userId for all existing rows to the first user
-- Get the first user's ID dynamically (the user created first)
DO $$
DECLARE
  first_user_id TEXT;
BEGIN
  SELECT id INTO first_user_id FROM "User" ORDER BY "createdAt" ASC LIMIT 1;

  IF first_user_id IS NULL THEN
    RAISE EXCEPTION 'No users found in database. Cannot migrate accounting data without a user.';
  END IF;

  UPDATE "Account" SET "userId" = first_user_id WHERE "userId" IS NULL;
  UPDATE "JournalEntry" SET "userId" = first_user_id WHERE "userId" IS NULL;
  UPDATE "ExpenseCategory" SET "userId" = first_user_id WHERE "userId" IS NULL;
END $$;

-- Step 3: Make userId NOT NULL now that all rows have values
ALTER TABLE "Account" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "JournalEntry" ALTER COLUMN "userId" SET NOT NULL;
ALTER TABLE "ExpenseCategory" ALTER COLUMN "userId" SET NOT NULL;

-- Step 4: Drop old unique constraints that don't include userId
DROP INDEX IF EXISTS "Account_code_key";
DROP INDEX IF EXISTS "JournalEntry_entryNumber_key";
DROP INDEX IF EXISTS "ExpenseCategory_name_key";
DROP INDEX IF EXISTS "ExpenseCategory_code_key";

-- Step 5: Drop old indexes that will be replaced
DROP INDEX IF EXISTS "Account_accountType_idx";
DROP INDEX IF EXISTS "Account_code_idx";
DROP INDEX IF EXISTS "JournalEntry_entryNumber_idx";

-- Step 6: Create new indexes with userId
CREATE INDEX "Account_userId_idx" ON "Account"("userId");
CREATE INDEX "Account_userId_accountType_idx" ON "Account"("userId", "accountType");
CREATE UNIQUE INDEX "Account_userId_code_key" ON "Account"("userId", "code");

CREATE INDEX "JournalEntry_userId_idx" ON "JournalEntry"("userId");
CREATE INDEX "JournalEntry_userId_entryDate_idx" ON "JournalEntry"("userId", "entryDate");
CREATE INDEX "JournalEntry_userId_status_idx" ON "JournalEntry"("userId", "status");
CREATE UNIQUE INDEX "JournalEntry_userId_entryNumber_key" ON "JournalEntry"("userId", "entryNumber");

CREATE INDEX "ExpenseCategory_userId_idx" ON "ExpenseCategory"("userId");
CREATE UNIQUE INDEX "ExpenseCategory_userId_name_key" ON "ExpenseCategory"("userId", "name");
CREATE UNIQUE INDEX "ExpenseCategory_userId_code_key" ON "ExpenseCategory"("userId", "code");

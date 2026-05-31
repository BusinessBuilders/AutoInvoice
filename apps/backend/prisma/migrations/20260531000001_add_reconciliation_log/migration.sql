-- CreateTable
CREATE TABLE "reconciliation_log" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "throughDate" DATE NOT NULL,
    "source" TEXT NOT NULL,
    "writtenBy" TEXT NOT NULL,
    "writtenAt" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note" TEXT,

    CONSTRAINT "reconciliation_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reconciliation_log_companyId_throughDate_key" ON "reconciliation_log"("companyId", "throughDate");
CREATE INDEX "reconciliation_log_companyId_throughDate_idx" ON "reconciliation_log"("companyId", "throughDate" DESC);

-- AddForeignKey
ALTER TABLE "reconciliation_log" ADD CONSTRAINT "reconciliation_log_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint
ALTER TABLE "reconciliation_log" ADD CONSTRAINT "reconciliation_log_source_check" CHECK (source IN ('manual', 'statement_match'));

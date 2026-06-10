-- CreateTable
CREATE TABLE "AutomationLog" (
    "id" TEXT NOT NULL,
    "rule" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "companyId" TEXT,
    "firedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "result" JSONB,

    CONSTRAINT "AutomationLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AutomationLog_companyId_firedAt_idx" ON "AutomationLog"("companyId", "firedAt");

-- CreateIndex
CREATE UNIQUE INDEX "AutomationLog_rule_entityType_entityId_key" ON "AutomationLog"("rule", "entityType", "entityId");


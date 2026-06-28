-- AlterTable
ALTER TABLE "Lead" ADD COLUMN     "landingPage" TEXT,
ADD COLUMN     "referrer" TEXT,
ADD COLUMN     "utmCampaign" TEXT,
ADD COLUMN     "utmContent" TEXT,
ADD COLUMN     "utmMedium" TEXT,
ADD COLUMN     "utmSource" TEXT,
ADD COLUMN     "utmTerm" TEXT;

-- CreateTable
CREATE TABLE "AdSpend" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "channel" TEXT NOT NULL,
    "campaign" TEXT NOT NULL DEFAULT '',
    "spend" DECIMAL(65,30) NOT NULL,
    "clicks" INTEGER,
    "impressions" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdSpend_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AdSpend_companyId_date_idx" ON "AdSpend"("companyId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "AdSpend_companyId_date_channel_campaign_key" ON "AdSpend"("companyId", "date", "channel", "campaign");

-- AddForeignKey
ALTER TABLE "AdSpend" ADD CONSTRAINT "AdSpend_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AdSpend" ADD CONSTRAINT "AdSpend_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Company"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


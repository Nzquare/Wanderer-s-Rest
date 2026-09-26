-- CreateEnum
CREATE TYPE "DndSessionType" AS ENUM ('ONE_SHOT', 'CAMPAIGN');

-- CreateTable
CREATE TABLE "DndCampaign" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DndCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DndSession" (
    "id" TEXT NOT NULL,
    "type" "DndSessionType" NOT NULL,
    "campaignId" TEXT,
    "sessionNumber" INTEGER,
    "staffId" TEXT NOT NULL,
    "tableSessionId" TEXT,
    "tableFeeAmount" DECIMAL(12,2) NOT NULL,
    "commissionPercent" DOUBLE PRECISION NOT NULL,
    "commissionAmount" DECIMAL(12,2) NOT NULL,
    "notes" TEXT,
    "playedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DndSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DndSession_campaignId_idx" ON "DndSession"("campaignId");

-- CreateIndex
CREATE INDEX "DndSession_staffId_idx" ON "DndSession"("staffId");

-- CreateIndex
CREATE INDEX "DndSession_tableSessionId_idx" ON "DndSession"("tableSessionId");

-- AddForeignKey
ALTER TABLE "DndSession" ADD CONSTRAINT "DndSession_campaignId_fkey" FOREIGN KEY ("campaignId") REFERENCES "DndCampaign"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DndSession" ADD CONSTRAINT "DndSession_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DndSession" ADD CONSTRAINT "DndSession_tableSessionId_fkey" FOREIGN KEY ("tableSessionId") REFERENCES "TableSession"("id") ON DELETE SET NULL ON UPDATE CASCADE;

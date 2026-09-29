-- CreateTable
CREATE TABLE "TimeClockEntry" (
    "id" TEXT NOT NULL,
    "staffId" TEXT,
    "staffNameSnapshot" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TimeClockEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TimeClockEntry_staffId_idx" ON "TimeClockEntry"("staffId");

-- CreateIndex
CREATE INDEX "TimeClockEntry_clockIn_idx" ON "TimeClockEntry"("clockIn");

-- AddForeignKey
ALTER TABLE "TimeClockEntry" ADD CONSTRAINT "TimeClockEntry_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;

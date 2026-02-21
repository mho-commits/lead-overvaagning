-- CreateTable
CREATE TABLE "LeadEvent" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurredAt" TIMESTAMP(3),
    "campaignKey" TEXT NOT NULL,
    "campaignName" TEXT,
    "formId" TEXT,
    "externalLeadId" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "utmSource" TEXT,
    "utmMedium" TEXT,
    "utmCampaign" TEXT,
    "utmContent" TEXT,
    "utmTerm" TEXT,
    "rawPayload" JSONB NOT NULL,

    CONSTRAINT "LeadEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeadEvent_tenantKey_receivedAt_idx" ON "LeadEvent"("tenantKey", "receivedAt");

-- CreateIndex
CREATE INDEX "LeadEvent_tenantKey_campaignKey_receivedAt_idx" ON "LeadEvent"("tenantKey", "campaignKey", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "LeadEvent_source_externalLeadId_key" ON "LeadEvent"("source", "externalLeadId");

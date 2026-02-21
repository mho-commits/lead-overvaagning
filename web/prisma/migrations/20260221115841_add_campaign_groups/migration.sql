-- CreateTable
CREATE TABLE "CampaignGroup" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "groupKey" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CampaignGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CampaignGroupItem" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "campaignKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CampaignGroupItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CampaignGroup_tenantKey_idx" ON "CampaignGroup"("tenantKey");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignGroup_tenantKey_groupKey_key" ON "CampaignGroup"("tenantKey", "groupKey");

-- CreateIndex
CREATE INDEX "CampaignGroupItem_tenantKey_idx" ON "CampaignGroupItem"("tenantKey");

-- CreateIndex
CREATE INDEX "CampaignGroupItem_groupId_idx" ON "CampaignGroupItem"("groupId");

-- CreateIndex
CREATE INDEX "CampaignGroupItem_tenantKey_campaignKey_idx" ON "CampaignGroupItem"("tenantKey", "campaignKey");

-- CreateIndex
CREATE UNIQUE INDEX "CampaignGroupItem_tenantKey_groupId_campaignKey_key" ON "CampaignGroupItem"("tenantKey", "groupId", "campaignKey");

-- AddForeignKey
ALTER TABLE "CampaignGroupItem" ADD CONSTRAINT "CampaignGroupItem_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "CampaignGroup"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "Tenant" (
    "tenantKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("tenantKey")
);

-- CreateTable
CREATE TABLE "Mapping" (
    "id" TEXT NOT NULL,
    "tenantKey" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "formId" TEXT NOT NULL,
    "campaignKey" TEXT NOT NULL,
    "forceTenantKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Mapping_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Mapping_source_formId_idx" ON "Mapping"("source", "formId");

-- CreateIndex
CREATE UNIQUE INDEX "Mapping_tenantKey_source_formId_key" ON "Mapping"("tenantKey", "source", "formId");

-- AddForeignKey
ALTER TABLE "Mapping" ADD CONSTRAINT "Mapping_tenantKey_fkey" FOREIGN KEY ("tenantKey") REFERENCES "Tenant"("tenantKey") ON DELETE CASCADE ON UPDATE CASCADE;

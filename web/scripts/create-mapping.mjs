// web/scripts/create-mapping.mjs
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // 1) Sørg for tenant findes
  await prisma.tenant.upsert({
    where: { tenantKey: "default" },
    update: { name: "Default" },
    create: { tenantKey: "default", name: "Default" },
  });

  // 2) Opret mapping (hvis den allerede findes, får du en fejl – det er OK, så siger du det)
  const mapping = await prisma.mapping.create({
    data: {
      tenantKey: "default",
      source: "drupal",
      formId: "test-form-1",
      campaignKey: "kampagne-test-1",
      // forceTenantKey: null,
    },
  });

  console.log("✅ CREATED MAPPING:", mapping);
}

main()
  .catch((e) => {
    console.error("❌ ERROR:", e?.message || e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
// web/lib/resolveCampaign.ts
import { prisma } from "@/lib/prisma";

type ResolveInput = {
  source: "drupal" | "meta";
  tenantKey: string;
  formId: string | null | undefined;
  utmCampaign: string | null | undefined;
};

export async function resolveCampaignAndTenant(input: ResolveInput): Promise<{
  tenantKey: string;
  campaignKey: string;
  used: "utm" | "mapping" | "unknown";
}> {
  const tenantKey = (input.tenantKey || "").trim();
  const utm = (input.utmCampaign || "").trim();
  const formId = (input.formId || "").trim();

  // 1) UTM wins
  if (utm) {
    return { tenantKey, campaignKey: utm, used: "utm" };
  }

  // 2) If no formId, we can’t map
  if (!formId) {
    return { tenantKey, campaignKey: "unknown", used: "unknown" };
  }

  // 3) Mapping lookup
  const mapping = await prisma.mapping.findUnique({
    where: {
      tenantKey_source_formId: {
        tenantKey,
        source: input.source,
        formId,
      },
    },
  });

  if (!mapping) {
    return { tenantKey, campaignKey: "unknown", used: "unknown" };
  }

  const finalTenantKey = (mapping.forceTenantKey || tenantKey).trim();

  return {
    tenantKey: finalTenantKey,
    campaignKey: mapping.campaignKey,
    used: "mapping",
  };
}
// web/app/api/webhooks/drupal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCampaignAndTenant } from "@/lib/resolveCampaign";

export const runtime = "nodejs";
function assertSecret(req: NextRequest) {
  const secret = req.headers.get("x-webhook-secret");

  if (!process.env.DRUPAL_WEBHOOK_SECRET) {
    throw new Error("Missing DRUPAL_WEBHOOK_SECRET");
  }
  if (secret !== process.env.DRUPAL_WEBHOOK_SECRET) {
    throw new Error("Invalid webhook secret");
  }
}

function extractExternalLeadId(body: any): string | null {
  return body.externalLeadId || body.submission_id || body.sid || null;
}

function extractFormId(body: any): string | null {
  return body.formId || body.webform_id || null;
}

function extractUtmCampaign(body: any): string | null {
  return body.utm_campaign || body.utm?.campaign || null;
}

export async function POST(req: NextRequest) {
  try {
    assertSecret(req);

    function assertSecret(req: NextRequest) {
  const headerSecret = req.headers.get("x-webhook-secret");

  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");

  const secret = headerSecret || querySecret;

  if (!process.env.DRUPAL_WEBHOOK_SECRET) {
    throw new Error("Missing DRUPAL_WEBHOOK_SECRET");
  }
  if (!secret || secret !== process.env.DRUPAL_WEBHOOK_SECRET) {
    throw new Error("Invalid webhook secret");
  }
}
    const tenantKey =
      (tenantFromQuery && tenantFromQuery.trim()) ||
      (body?.tenantKey && String(body.tenantKey).trim()) ||
      (body?.tenant && String(body.tenant).trim()) ||
      "horsens";

    const externalLeadId = extractExternalLeadId(body);
    const formId = extractFormId(body);
    const utmCampaign = extractUtmCampaign(body);

    if (!externalLeadId) {
      return NextResponse.json(
        { ok: false, error: "Missing externalLeadId" },
        { status: 400 }
      );
    }

    const resolved = await resolveCampaignAndTenant({
      source: "drupal",
      tenantKey,
      formId,
      utmCampaign,
    });

    const lead = await prisma.leadEvent.upsert({
      where: {
        source_externalLeadId: { source: "drupal", externalLeadId },
      },
      update: {},
      create: {
        tenantKey: resolved.tenantKey,
        campaignKey: resolved.campaignKey,
        source: "drupal",
        externalLeadId,
        occurredAt: new Date(),
        rawPayload: body,
      },
    });

    return NextResponse.json({
      ok: true,
      tenantKey: resolved.tenantKey,
      mappingUsed: resolved.used,
      id: lead.id,
    });
  } catch (err: any) {
    console.error("DRUPAL webhook error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 401 }
    );
  }
}
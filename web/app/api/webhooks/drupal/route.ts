// /web/app/api/webhooks/drupal/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveCampaignAndTenant } from "@/lib/resolveCampaign";

export const runtime = "nodejs";

/**
 * Auth via either:
 * - header: x-webhook-secret: <secret>
 * - query:  ?secret=<secret>
 */
function assertSecret(req: NextRequest) {
  const headerSecret = req.headers.get("x-webhook-secret");
  const url = new URL(req.url);
  const querySecret = url.searchParams.get("secret");
  const secret = headerSecret || querySecret;

  if (!process.env.DRUPAL_WEBHOOK_SECRET) {
    // Misconfig = server error, not auth error
    const err: any = new Error("Missing DRUPAL_WEBHOOK_SECRET");
    err.statusCode = 500;
    throw err;
  }

  if (!secret || secret !== process.env.DRUPAL_WEBHOOK_SECRET) {
    const err: any = new Error("Invalid webhook secret");
    err.statusCode = 401;
    throw err;
  }
}

/**
 * Parse body robustly for:
 * - application/json
 * - application/x-www-form-urlencoded
 * - multipart/form-data
 *
 * NOTE: We read req.text() / req.formData() only once (stream).
 */
async function parseBody(req: NextRequest): Promise<{
  body: any;
  contentType: string;
  rawText?: string;
}> {
  const contentType = req.headers.get("content-type") || "";

  // multipart/form-data must use formData()
  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    return { body: Object.fromEntries(fd.entries()), contentType };
  }

  // For JSON and urlencoded we can safely read text once and parse ourselves
  const rawText = await req.text();

  if (contentType.includes("application/json")) {
    try {
      return { body: rawText ? JSON.parse(rawText) : {}, contentType, rawText };
    } catch {
      // invalid JSON
      return { body: { _invalidJson: true }, contentType, rawText };
    }
  }

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(rawText);
    return { body: Object.fromEntries(params.entries()), contentType, rawText };
  }

  // Fallback: try JSON, else keep raw
  try {
    return { body: rawText ? JSON.parse(rawText) : {}, contentType, rawText };
  } catch {
    return { body: { raw: rawText }, contentType, rawText };
  }
}

/**
 * Try to extract an external lead/submission id from common Drupal/Webform patterns.
 * You can extend this once we see the real payload.
 */
function extractExternalLeadId(body: any): string | null {
  const candidate =
    body?.externalLeadId ??
    body?.external_lead_id ??
    body?.submission_id ??
    body?.sid ??
    body?.id ??
    body?.uuid ??
    body?.submission?.id ??
    body?.submission?.sid ??
    null;

  if (candidate === null || candidate === undefined) return null;
  const s = String(candidate).trim();
  return s.length ? s : null;
}

function extractFormId(body: any): string | null {
  const candidate =
    body?.formId ??
    body?.webform_id ??
    body?.webform ??
    body?.form_id ??
    body?.submission?.webform_id ??
    null;

  if (candidate === null || candidate === undefined) return null;
  const s = String(candidate).trim();
  return s.length ? s : null;
}

function extractUtmCampaign(body: any): string | null {
  // Common variants seen in integrations:
  const candidate =
    body?.utm_campaign ??
    body?.["utm[campaign]"] ??
    body?.["utm_campaign[0][value]"] ??
    body?.utm?.campaign ??
    body?.utmCampaign ??
    null;

  if (candidate === null || candidate === undefined) return null;
  const s = String(candidate).trim();
  return s.length ? s : null;
}

function pickTenantKey(body: any, reqUrl: URL): string {
  const tenantFromQuery = reqUrl.searchParams.get("tenant");

  const tenantKey =
    (tenantFromQuery && tenantFromQuery.trim()) ||
    (body?.tenantKey && String(body.tenantKey).trim()) ||
    (body?.tenant && String(body.tenant).trim()) ||
    "horsens";

  return tenantKey;
}

export async function POST(req: NextRequest) {
  const reqUrl = new URL(req.url);

  try {
    // 1) Auth
    assertSecret(req);

    // 2) Parse body (robust)
    const { body, contentType, rawText } = await parseBody(req);

    // 3) Extract routing fields
    const tenantKey = pickTenantKey(body, reqUrl);
    const externalLeadId = extractExternalLeadId(body);
    const formId = extractFormId(body);
    const utmCampaign = extractUtmCampaign(body);

    // 4) Basic validation
    if (!externalLeadId) {
      // Return 400 with helpful debug (keys only)
      return NextResponse.json(
        {
          ok: false,
          error:
            "Missing externalLeadId (no submission id found in payload). Update extractExternalLeadId() to match your Drupal payload.",
          debug: {
            contentType,
            keys: Object.keys(body || {}).slice(0, 80),
            // small peek (safe-ish) so you can see shape without dumping everything
            sample: typeof body === "object" ? Object.fromEntries(Object.entries(body).slice(0, 10)) : body,
            // if body is urlencoded, rawText can help (mask if needed)
            rawLength: rawText?.length ?? 0,
          },
        },
        { status: 400 }
      );
    }

    // 5) Resolve tenant/campaign mapping
    const resolved = await resolveCampaignAndTenant({
      source: "drupal",
      tenantKey,
      formId,
      utmCampaign,
    });

    // 6) Persist (idempotent)
    const lead = await prisma.leadEvent.upsert({
      where: {
        source_externalLeadId: {
          source: "drupal",
          externalLeadId: String(externalLeadId),
        },
      },
      update: {},
      create: {
        tenantKey: resolved.tenantKey,
        campaignKey: resolved.campaignKey,
        source: "drupal",
        externalLeadId: String(externalLeadId),
        occurredAt: new Date(),
        rawPayload: body,
      },
    });

    // 7) OK
    return NextResponse.json({
      ok: true,
      tenantKey: resolved.tenantKey,
      campaignKey: resolved.campaignKey,
      mappingUsed: resolved.used,
      id: lead.id,
    });
  } catch (err: any) {
    const msg = err?.message || "Unknown error";

    // Determine status code
    const status =
      typeof err?.statusCode === "number"
        ? err.statusCode
        : msg.includes("Invalid webhook secret")
          ? 401
          : msg.includes("Missing DRUPAL_WEBHOOK_SECRET")
            ? 500
            : 500;

    // Helpful auth debug only (not leaking secret)
    const hasHeaderSecret = Boolean(req.headers.get("x-webhook-secret"));
    const hasQuerySecret = new URL(req.url).searchParams.has("secret");

    console.error("DRUPAL webhook error:", err);

    return NextResponse.json(
      {
        ok: false,
        error: msg,
        debug: { hasHeaderSecret, hasQuerySecret },
      },
      { status }
    );
  }
}
// web/app/api/webhooks/meta/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { resolveCampaignAndTenant } from "@/lib/resolveCampaign";

/**
 * ENV du skal have:
 * META_VERIFY_TOKEN
 * META_APP_SECRET
 * META_ACCESS_TOKEN
 *
 * Optional:
 * META_DEV_MODE=true  (dev)
 */

const DEV_MODE = (process.env.META_DEV_MODE || "").toLowerCase() === "true";

function json(data: any, status = 200) {
  return NextResponse.json(data, { status });
}

/**
 * Meta webhook verification (GET)
 * Meta kalder din endpoint med hub.* query params
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);

  const mode = url.searchParams.get("hub.mode");
  const token = url.searchParams.get("hub.verify_token");
  const challenge = url.searchParams.get("hub.challenge");

  if (!mode || !token) {
    return json({ ok: false, error: "Missing hub params" }, 400);
  }

  if (!process.env.META_VERIFY_TOKEN) {
    return json({ ok: false, error: "Missing META_VERIFY_TOKEN" }, 500);
  }

  if (mode === "subscribe" && token === process.env.META_VERIFY_TOKEN) {
    return new NextResponse(challenge || "", { status: 200 });
  }

  return json({ ok: false, error: "Verification failed" }, 403);
}

/**
 * Validate X-Hub-Signature-256
 * Header: x-hub-signature-256: sha256=<hmac>
 */
function assertMetaSignature(req: NextRequest, rawBody: string) {
  if (DEV_MODE) return;

  const sig = req.headers.get("x-hub-signature-256") || "";
  if (!sig.startsWith("sha256=")) throw new Error("Missing/invalid x-hub-signature-256");

  if (!process.env.META_APP_SECRET) throw new Error("Missing META_APP_SECRET");

  const their = sig.replace("sha256=", "").trim();
  const ours = crypto.createHmac("sha256", process.env.META_APP_SECRET).update(rawBody).digest("hex");

  // timing-safe compare
  const a = Buffer.from(their, "hex");
  const b = Buffer.from(ours, "hex");
  if (a.length !== b.length) throw new Error("Invalid signature");
  if (!crypto.timingSafeEqual(a, b)) throw new Error("Invalid signature");
}

async function fetchMetaLead(leadId: string) {
  if (DEV_MODE) {
    // Fake lead i dev
    return {
      id: leadId,
      created_time: new Date().toISOString(),
      ad_id: "dev_ad",
      form_id: "test-form-1", // 👈 matcher din mapping-test
      field_data: [
        { name: "full_name", values: ["Test Person"] },
        { name: "email", values: ["test@example.com"] },
      ],
    };
  }

  if (!process.env.META_ACCESS_TOKEN) throw new Error("Missing META_ACCESS_TOKEN");

  // Henter lead details
  const url = new URL(`https://graph.facebook.com/v19.0/${encodeURIComponent(leadId)}`);
  url.searchParams.set(
    "fields",
    [
      "id",
      "created_time",
      "ad_id",
      "adgroup_id",
      "campaign_id",
      "form_id",
      "field_data",
      "platform",
    ].join(",")
  );
  url.searchParams.set("access_token", process.env.META_ACCESS_TOKEN);

  const res = await fetch(url.toString(), { method: "GET" });
  const data = await res.json();

  if (!res.ok) {
    const msg = data?.error?.message || "Graph API error";
    throw new Error(`Graph API failed: ${msg}`);
  }

  return data;
}

/**
 * POST webhook (Meta sender lead IDs, vi fetcher detaljer og gemmer LeadEvent)
 */
export async function POST(req: NextRequest) {
  let rawBody = "";
  try {
    rawBody = await req.text();

    // Dev bypass: hvis du vil (valgfrit)
    const devBypass = (req.headers.get("x-dev-bypass") || "").toLowerCase() === "true";
    if (!(DEV_MODE && devBypass)) {
      assertMetaSignature(req, rawBody);
    }

    const body = JSON.parse(rawBody);

    // Meta webhook structure: entry[].changes[] eller entry[].messaging[] osv.
    // For leadgen er det typisk: entry[].changes[].value.leadgen_id
    const entries = Array.isArray(body?.entry) ? body.entry : [];
    const leadIds: string[] = [];

    for (const entry of entries) {
      const changes = Array.isArray(entry?.changes) ? entry.changes : [];
      for (const change of changes) {
        const leadId = change?.value?.leadgen_id;
        if (leadId) leadIds.push(String(leadId));
      }
    }

    // Hvis ingen lead IDs, så return ok (Meta forventer 200)
    if (leadIds.length === 0) {
      return json({ ok: true, received: true, leadIds: [] }, 200);
    }

    // TenantKey: MVP – brug query param ?tenant=... hvis du vil, ellers default
    // (Meta webhook sender typisk ikke tenant. Derfor mapping/forceTenantKey er vigtigt)
    const url = new URL(req.url);
    const tenantKeyFromQuery = url.searchParams.get("tenant") || "default";

    const results: any[] = [];

    for (const externalLeadId of leadIds) {
      // 1) Fetch lead details (Graph)
      const lead = await fetchMetaLead(externalLeadId);

      // 2) Extract formId og evt utm_campaign (hvis du har noget i field_data)
      const formId = lead?.form_id ? String(lead.form_id) : null;

      // UTM i Meta lead er sjældent direkte. Her prøver vi bare at finde "utm_campaign" hvis du gemmer den som felt.
      let utmCampaign: string | null = null;
      const fieldData = Array.isArray(lead?.field_data) ? lead.field_data : [];
      for (const f of fieldData) {
        if (String(f?.name || "").toLowerCase() === "utm_campaign") {
          utmCampaign = Array.isArray(f?.values) && f.values[0] ? String(f.values[0]) : null;
        }
      }

      // 3) Resolve campaign + tenant via din mapping
      const resolved = await resolveCampaignAndTenant({
        source: "meta",
        tenantKey: tenantKeyFromQuery,
        formId,
        utmCampaign,
      });

      // 4) Insert (idempotent)
      // NOTE: Dette kræver at du har unik constraint på (source, externalLeadId)
      const created = await prisma.leadEvent.upsert({
        where: {
          source_externalLeadId: {
            source: "meta",
            externalLeadId,
          },
        },
        update: {},
        create: {
          tenantKey: resolved.tenantKey,
          campaignKey: resolved.campaignKey,
          source: "meta",
          externalLeadId,
          occurredAt: lead?.created_time ? new Date(lead.created_time) : new Date(),
          rawPayload: lead, // 👈 matcher din model (rawPayload)
        },
      });

      results.push({
        externalLeadId,
        ok: true,
        mappingUsed: resolved.used,
        tenantKey: resolved.tenantKey,
        campaignKey: resolved.campaignKey,
        id: created.id,
      });
    }

    return json({ ok: true, results }, 200);
  } catch (err: any) {
    // Meta retry’er ved 500, så vi returnerer 500 ved fejl
    return json({ ok: false, error: err?.message || "Unknown error" }, 500);
  }
}
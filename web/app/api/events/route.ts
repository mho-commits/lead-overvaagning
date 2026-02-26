// app/api/events/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const tenant = url.searchParams.get("tenant") || "";
    const groupKey = url.searchParams.get("group") || "";
    const limitRaw = url.searchParams.get("limit") || "20";
    const limit = Math.max(1, Math.min(200, Number(limitRaw) || 20));

    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "Missing tenant", events: [] },
        { status: 400 }
      );
    }

    let campaignKeys: string[] | null = null;
    if (groupKey) {
      const group = await prisma.campaignGroup.findUnique({
        where: { tenantKey_groupKey: { tenantKey: tenant, groupKey } },
        include: { items: true },
      });

      if (!group) {
        return NextResponse.json(
          { ok: false, error: "Unknown group", events: [] },
          { status: 400 }
        );
      }

      campaignKeys = group.items.map((i) => i.campaignKey);
      if (campaignKeys.length === 0) {
        return NextResponse.json({ ok: true, events: [] });
      }
    }

    const rows = await prisma.leadEvent.findMany({
      where: {
        tenantKey: tenant,
        ...(campaignKeys ? { campaignKey: { in: campaignKeys } } : {}),
      },
      orderBy: [{ occurredAt: "desc" }, { receivedAt: "desc" }],
      take: limit,
    });

    const events = rows.map((e: any) => {
      const raw = (e.rawPayload ?? {}) as any;

      const clubName =
        raw?.klubnavn ||
        raw?.clubName ||
        raw?.club_name ||
        raw?.club ||
        raw?.club_id ||
        null;

      return {
        id: e.id,
        tenantKey: e.tenantKey,
        campaignKey: e.campaignKey,
        source: e.source,
        externalLeadId: e.externalLeadId,
        email: e.email ?? null,
        phone: e.phone ?? null,
        formId: e.formId ?? null,
        clubName: typeof clubName === "string" ? clubName.trim() : null,
        receivedAt: (e.occurredAt ?? e.receivedAt).toISOString(),
        occurredAt: (e.occurredAt ?? null)?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({ ok: true, events });
  } catch (err: any) {
    console.error("EVENTS route error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error", events: [] },
      { status: 500 }
    );
  }
}
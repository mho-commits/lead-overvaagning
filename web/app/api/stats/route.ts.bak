// app/api/stats/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function startOfDayUTC(d: Date) {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function isoDateUTC(d: Date) {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export const GET = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const tenant = url.searchParams.get("tenant") || "";
    const groupKey = url.searchParams.get("group") || "";
    const daysRaw = url.searchParams.get("days") || "7";
    const days = Math.max(1, Math.min(90, Number(daysRaw) || 7));

    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Missing tenant" }, { status: 400 });
    }

    const now = new Date();
    const todayStart = startOfDayUTC(now);

    const rangeStart = new Date(todayStart);
    rangeStart.setUTCDate(rangeStart.getUTCDate() - (days - 1));

    // Hvis group-filter: hent campaignKeys
    let campaignKeys: string[] | null = null;
    if (groupKey) {
      const group = await prisma.campaignGroup.findUnique({
        where: { tenantKey_groupKey: { tenantKey: tenant, groupKey } },
        include: { items: true },
      });

      if (!group) {
        return NextResponse.json({ ok: false, error: "Unknown group" }, { status: 400 });
      }

      campaignKeys = group.items.map((i) => i.campaignKey);
      // tom gruppe => alt 0
      if (campaignKeys.length === 0) {
        return NextResponse.json({
          ok: true,
          tenant,
          days,
          total: 0,
          today: 0,
          lastNDays: 0,
          lastReceivedAt: null,
          byCampaign: [],
          byDay: Array.from({ length: days }).map((_, i) => {
            const d = new Date(rangeStart);
            d.setUTCDate(d.getUTCDate() + i);
            return { date: isoDateUTC(d), count: 0 };
          }),
          byGroup: [],
        });
      }
    }

    const whereBase: any = {
      tenantKey: tenant,
      ...(campaignKeys ? { campaignKey: { in: campaignKeys } } : {}),
    };

    const [total, today, last] = await Promise.all([
      prisma.leadEvent.count({ where: whereBase }),
      prisma.leadEvent.count({
        where: {
          ...whereBase,
          OR: [
            { occurredAt: { gte: todayStart } },
            { occurredAt: null, receivedAt: { gte: todayStart } },
          ],
        },
      }),
      prisma.leadEvent.findFirst({
        where: whereBase,
        orderBy: [{ occurredAt: "desc" }, { receivedAt: "desc" }],
        select: { occurredAt: true, receivedAt: true },
      }),
    ]);

    const lastReceivedAt = (last?.occurredAt || last?.receivedAt || null)?.toISOString?.() ?? null;

    // byDay (JS – simpelt og robust)
    const eventsInRange = await prisma.leadEvent.findMany({
      where: {
        ...whereBase,
        OR: [
          { occurredAt: { gte: rangeStart } },
          { occurredAt: null, receivedAt: { gte: rangeStart } },
        ],
      },
      select: { occurredAt: true, receivedAt: true, campaignKey: true },
    });

    const dayCounts: Record<string, number> = {};
    for (let i = 0; i < days; i++) {
      const d = new Date(rangeStart);
      d.setUTCDate(d.getUTCDate() + i);
      dayCounts[isoDateUTC(d)] = 0;
    }

    const campaignCounts: Record<string, number> = {};

    for (const e of eventsInRange) {
      const ts = e.occurredAt ?? e.receivedAt;
      const key = isoDateUTC(new Date(ts));
      if (dayCounts[key] !== undefined) dayCounts[key] += 1;

      const ck = e.campaignKey || "unknown";
      campaignCounts[ck] = (campaignCounts[ck] || 0) + 1;
    }

    const byDay = Object.entries(dayCounts).map(([date, count]) => ({ date, count }));
    const lastNDays = byDay.reduce((sum, x) => sum + x.count, 0);

    const byCampaign = Object.entries(campaignCounts)
      .map(([campaignKey, count]) => ({ campaignKey, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 50);

    // byGroup (som før)
    const byGroupRows = (await prisma.$queryRaw`
      SELECT
        g."groupKey" as "groupKey",
        g."displayName" as "displayName",
        COUNT(le."id")::int as count
      FROM "CampaignGroup" g
      LEFT JOIN "CampaignGroupItem" gi
        ON gi."groupId" = g."id"
       AND gi."tenantKey" = g."tenantKey"
      LEFT JOIN "LeadEvent" le
        ON le."tenantKey" = g."tenantKey"
       AND le."campaignKey" = gi."campaignKey"
       AND COALESCE(le."occurredAt", le."receivedAt") >= ${rangeStart}
      WHERE g."tenantKey" = ${tenant}
      GROUP BY g."groupKey", g."displayName"
      ORDER BY count DESC, g."displayName" ASC
    `) as Array<{ groupKey: string; displayName: string; count: number }>;

    const byGroup = byGroupRows.map((r) => ({
      groupKey: String(r.groupKey),
      displayName: String(r.displayName),
      count: Number(r.count) || 0,
    }));

    return NextResponse.json({
      ok: true,
      tenant,
      days,
      total,
      today,
      lastNDays,
      lastReceivedAt,
      byCampaign,
      byDay,
      byGroup,
    });
  } catch (err: any) {
    console.error("STATS error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
};
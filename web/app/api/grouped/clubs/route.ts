import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function parseDaysParam(daysStr: string | null) {
  const days = Number(daysStr ?? "7");
  if (!Number.isFinite(days) || days <= 0) return 7;
  return Math.min(Math.max(days, 1), 365);
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const tenant = url.searchParams.get("tenant") ?? "";

    // Behold param af kompatibilitet (men vi bruger det ikke til klub-oversigten længere)
    const days = parseDaysParam(url.searchParams.get("days"));

    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Missing tenant" }, { status: 400 });
    }

    // All-time counts pr. clubId
    const counts = await prisma.leadEvent.groupBy({
      by: ["clubId"],
      where: {
        tenantKey: tenant,
        clubId: { not: null },
      },
      _count: { clubId: true },
    });

    // Sortér i JS (desc)
    counts.sort((a, b) => (b._count.clubId ?? 0) - (a._count.clubId ?? 0));

    // Stabilt klubnavn: hent seneste lead pr. clubId deterministisk
    const ids = counts.map((c) => c.clubId).filter(Boolean) as string[];

    const latestPerClub = await prisma.leadEvent.findMany({
      where: {
        tenantKey: tenant,
        clubId: { in: ids },
      },
      select: { clubId: true, clubName: true, receivedAt: true },
      orderBy: [{ receivedAt: "desc" }],
    });

    const nameById = new Map<string, string>();
    for (const row of latestPerClub) {
      // første gang vi ser clubId er den nyeste (pga. orderBy desc)
      if (row.clubId && !nameById.has(row.clubId)) {
        nameById.set(row.clubId, row.clubName ?? row.clubId);
      }
    }

    const rows = counts.map((c) => ({
      clubId: c.clubId as string,
      clubName: nameById.get(c.clubId as string) ?? (c.clubId as string),
      leads: c._count.clubId,
    }));

    // Debug-tal (hjælper os med at se hvorfor sum pr klub != total)
    const totalAll = await prisma.leadEvent.count({
      where: { tenantKey: tenant },
    });

    const totalWithClubId = await prisma.leadEvent.count({
      where: { tenantKey: tenant, clubId: { not: null } },
    });

    const nullClubId = await prisma.leadEvent.count({
      where: { tenantKey: tenant, clubId: null },
    });

    return NextResponse.json({
      ok: true,
      rows,
      days, // stadig med (så eksisterende client ikke crasher), men klubtælling er all-time
      debug: {
        totalAll,
        totalWithClubId,
        nullClubId,
        sumRows: rows.reduce((acc, r) => acc + (r.leads ?? 0), 0),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
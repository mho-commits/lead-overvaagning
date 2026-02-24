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
    const days = parseDaysParam(url.searchParams.get("days"));

    if (!tenant) {
      return NextResponse.json({ ok: false, error: "Missing tenant" }, { status: 400 });
    }

    const since = new Date();
    since.setDate(since.getDate() - days);

    const counts = await prisma.leadEvent.groupBy({
  by: ["clubId"],
  where: {
    tenantKey: tenant,
    receivedAt: { gte: since },
    clubId: { not: null },
  },
  _count: { clubId: true }, // <-- brug count på clubId i stedet for _all
});

// Sortér i JS (desc)
counts.sort((a, b) => (b._count.clubId ?? 0) - (a._count.clubId ?? 0));

    const names = await prisma.leadEvent.findMany({
      where: {
        tenantKey: tenant,
        receivedAt: { gte: since },
        clubId: { not: null },
      },
      distinct: ["clubId"],
      select: { clubId: true, clubName: true, receivedAt: true },
      orderBy: [{ clubId: "asc" }, { receivedAt: "desc" }],
    });

    const nameById = new Map<string, string>();
    for (const row of names) {
      if (row.clubId) nameById.set(row.clubId, row.clubName ?? row.clubId);
    }

    const rows = counts.map((c) => ({
      clubId: c.clubId as string,
      clubName: nameById.get(c.clubId as string) ?? (c.clubId as string),
      leads: c._count.clubId,
    }));

    return NextResponse.json({ ok: true, rows, days });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message ?? "Unknown error" },
      { status: 500 }
    );
  }
}
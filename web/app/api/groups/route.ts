// app/api/groups/route.ts
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export const GET = async (req: NextRequest) => {
  try {
    const url = new URL(req.url);
    const tenant = url.searchParams.get("tenant") || "";
    if (!tenant) {
      return NextResponse.json(
        { ok: false, error: "Missing tenant" },
        { status: 400 }
      );
    }

    const groups = await prisma.campaignGroup.findMany({
      where: { tenantKey: tenant },
      orderBy: { displayName: "asc" },
      include: { items: { orderBy: { campaignKey: "asc" } } },
    });

    return NextResponse.json({
      ok: true,
      groups: groups.map((g) => ({
        tenantKey: g.tenantKey,
        groupKey: g.groupKey,
        displayName: g.displayName,
        campaignKeys: g.items.map((i) => i.campaignKey),
      })),
    });
  } catch (err: any) {
    console.error("GROUPS GET error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
};

export const POST = async (req: NextRequest) => {
  try {
    const body = await req.json();

    const tenantKey = String(body?.tenantKey || "").trim();
    const groupKey = String(body?.groupKey || "").trim();
    const displayName = String(body?.displayName || "").trim();
    const campaignKeys = Array.isArray(body?.campaignKeys)
      ? body.campaignKeys
          .map((x: any) => String(x).trim())
          .filter((x: string) => x.length > 0)
      : [];

    if (!tenantKey || !groupKey || !displayName) {
      return NextResponse.json(
        { ok: false, error: "Missing tenantKey/groupKey/displayName" },
        { status: 400 }
      );
    }

    const group = await prisma.campaignGroup.upsert({
      where: { tenantKey_groupKey: { tenantKey, groupKey } },
      update: { displayName },
      create: { tenantKey, groupKey, displayName },
    });

    await prisma.campaignGroupItem.deleteMany({
      where: { tenantKey, groupId: group.id },
    });

    if (campaignKeys.length > 0) {
      await prisma.campaignGroupItem.createMany({
        data: campaignKeys.map((campaignKey: string) => ({
          tenantKey,
          groupId: group.id,
          campaignKey,
        })),
        skipDuplicates: true,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("GROUPS POST error:", err);
    return NextResponse.json(
      { ok: false, error: err?.message || "Unknown error" },
      { status: 500 }
    );
  }
};
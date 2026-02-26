import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET() {
  try {
    const info = await prisma.$queryRaw<
      Array<{
        current_database: string;
        current_schema: string;
        server_addr: string | null;
        server_port: number | null;
        user: string;
      }>
    >`
      select
        current_database() as current_database,
        current_schema() as current_schema,
        inet_server_addr()::text as server_addr,
        inet_server_port() as server_port,
        current_user as "user";
    `;

    const cols = await prisma.$queryRaw<
      Array<{ column_name: string }>
    >`
      select column_name
      from information_schema.columns
      where table_schema='public'
        and table_name='LeadEvent'
        and column_name in ('clubId','clubName')
      order by column_name;
    `;

    return NextResponse.json({ ok: true, info: info[0], leadEventCols: cols });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  const url = process.env.DATABASE_URL ?? "";
  // maskér password hvis muligt
  const masked = url.replace(/:\/\/([^:]+):([^@]+)@/, "://$1:***@");

  return NextResponse.json({
    hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
    databaseUrlMasked: masked,
  });
}
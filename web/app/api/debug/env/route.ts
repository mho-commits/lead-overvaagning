import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json({
    drupalSecret: process.env.DRUPAL_WEBHOOK_SECRET ?? null,
    defaultTenant: process.env.DEFAULT_TENANT_KEY ?? null,
  });
}
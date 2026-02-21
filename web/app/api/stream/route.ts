// web/app/api/stream/route.ts
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    // Hvis du kører bag proxy kan den her hjælpe:
    "X-Accel-Buffering": "no",
  };
}

function writeEvent(controller: ReadableStreamDefaultController, name: string, data: any) {
  controller.enqueue(`event: ${name}\n`);
  controller.enqueue(`data: ${JSON.stringify(data)}\n\n`);
}

function writeComment(controller: ReadableStreamDefaultController, text: string) {
  controller.enqueue(`: ${text}\n\n`);
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const tenant = searchParams.get("tenant") || "";

  if (!tenant) {
    return new Response("Missing ?tenant=", { status: 400 });
  }

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;

      // 1) Send initial "hello" så browseren ser connection med det samme
      writeComment(controller, "connected");
      writeEvent(controller, "ready", { ok: true, tenant, ts: new Date().toISOString() });

      // 2) Poll DB efter nyeste event for tenant
      let lastSeenId: string | null = null;

      const pollEveryMs = 1000; // 1 sekund (MVP)
      const keepAliveMs = 15000; // 15 sek keep alive

      const pollTimer = setInterval(async () => {
        if (closed) return;

        try {
          const latest = await prisma.leadEvent.findFirst({
            where: { tenantKey: tenant },
            orderBy: { receivedAt: "desc" },
            select: {
              id: true,
              receivedAt: true,
              campaignKey: true,
              source: true,
            },
          });

          if (!latest) return;

          if (lastSeenId === null) {
            // første poll: sæt baseline uden at spamme UI
            lastSeenId = latest.id;
            return;
          }

          if (latest.id !== lastSeenId) {
            lastSeenId = latest.id;

            // Send "lead_created" event som UI lytter på
            writeEvent(controller, "lead_created", {
              id: latest.id,
              tenant,
              receivedAt: latest.receivedAt,
              campaignKey: latest.campaignKey,
              source: latest.source,
            });
          }
        } catch (e: any) {
          // Vi lukker ikke streamen ved fejl — bare send en error event
          writeEvent(controller, "error", { message: e?.message ?? "poll failed" });
        }
      }, pollEveryMs);

      const keepAliveTimer = setInterval(() => {
        if (closed) return;
        writeComment(controller, "keep-alive");
      }, keepAliveMs);

      // 3) Close når klienten disconnecter
      const onAbort = () => {
        if (closed) return;
        closed = true;
        clearInterval(pollTimer);
        clearInterval(keepAliveTimer);
        try {
          controller.close();
        } catch {}
      };

      req.signal.addEventListener("abort", onAbort);
    },
  });

  return new Response(stream, { headers: sseHeaders() });
}

// Optional: HEAD så din UI "autodetect" kan køre pænt
export async function HEAD() {
  return new Response(null, { status: 200, headers: sseHeaders() });
}
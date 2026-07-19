import { NextResponse } from "next/server";
import { routeOneToOneCall } from "@/lib/aiHosts/routeCall";
import { listAiHosts } from "@/lib/aiHosts/catalog";

/**
 * POST /api/call-route
 * Body: { hostId: string }
 * Returns routing decision: agora_live | ai_prerecorded
 */
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { hostId?: string };
    const hostId = body.hostId?.trim();
    if (!hostId) {
      return NextResponse.json({ error: "hostId required" }, { status: 400 });
    }
    const decision = await routeOneToOneCall(hostId);
    return NextResponse.json({ ok: true, decision });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Routing failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/** GET /api/call-route → list AI host table (admin / debug) */
export async function GET() {
  return NextResponse.json({
    ok: true,
    ai_hosts: listAiHosts(),
    cdn: process.env.NEXT_PUBLIC_AI_HOST_CDN || null,
    note: "Set NEXT_PUBLIC_AI_HOST_CDN to your cloud bucket root for production clips",
  });
}

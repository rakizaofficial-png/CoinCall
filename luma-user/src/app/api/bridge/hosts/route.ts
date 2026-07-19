import { NextResponse } from "next/server";

const API =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ||
  "https://coincall-api.onrender.com/api";

/**
 * Server-side proxy so the Discover feed always reaches CoinCall hosts
 * even if the browser blocks or flakes on a cross-origin call.
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const ready = searchParams.get("ready");
  const qs = ready === "1" || ready === "true" ? "?ready=1" : "";

  try {
    const res = await fetch(`${API}/hosts${qs}`, {
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    const text = await res.text();
    let data: { hosts?: unknown[] } = {};
    try {
      data = JSON.parse(text) as { hosts?: unknown[] };
    } catch {
      return NextResponse.json(
        { hosts: [], error: "Invalid API response", raw: text.slice(0, 120) },
        { status: 502 },
      );
    }
    if (!res.ok) {
      return NextResponse.json(
        { hosts: [], error: (data as { error?: string }).error || res.statusText },
        { status: res.status },
      );
    }
    return NextResponse.json(
      { hosts: Array.isArray(data.hosts) ? data.hosts : [] },
      {
        headers: {
          "Cache-Control": "no-store",
        },
      },
    );
  } catch (e) {
    return NextResponse.json(
      {
        hosts: [],
        error: e instanceof Error ? e.message : "Bridge unreachable",
      },
      { status: 502 },
    );
  }
}

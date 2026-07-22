// Data source: GET /api/wallet/history/:userId filtered for gift-related debit entries
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { requireApiBase } from "@/config/apiConfig";
import { getDeviceUserId } from "@/lib/walletApi";

type LedgerEntry = {
  id?: string;
  kind: "credit" | "debit";
  amount: number;
  reason: string;
  createdAt?: number;
  at?: number;
};

const PAGE_SIZE = 12;

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

export default function GiftsHistoryPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  useEffect(() => {
    let active = true;
    const doLoad = async () => {
      if (!active) return;
      setLoading(true);
      setError(null);
      try {
        const userId = getDeviceUserId();
        const res = await fetch(
          `${requireApiBase()}/wallet/history/${encodeURIComponent(userId)}`,
          { headers: { "X-User-Id": userId }, cache: "no-store" },
        );
        const data = (await res.json()) as { history?: LedgerEntry[] };
        const gifts = (data.history ?? []).filter(
          (e) => e.kind === "debit" && /gift/i.test(e.reason),
        );
        if (active) setEntries(gifts);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load gift history");
      } finally {
        if (active) setLoading(false);
      }
    };
    void doLoad();
    return () => { active = false; };
  }, []);

  const totalPages = Math.ceil(entries.length / PAGE_SIZE);
  const paged = entries.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);
  const totalSpent = entries.reduce((s, e) => s + e.amount, 0);

  return (
    <main className="pb-28">
      <div className="sticky top-0 z-10 border-b border-line bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/profile" className="rounded-full bg-ink-3 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="font-display text-lg font-extrabold">Gifts Sent</h1>
            <p className="text-[11px] text-muted">
              {totalSpent > 0
                ? `${totalSpent.toLocaleString()} coins across ${entries.length} gifts`
                : "Your gifting history"}
            </p>
          </div>
        </div>
      </div>

      <section className="px-4 pt-4">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Loading…</p>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : paged.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-2xl mb-2">🎁</p>
            <p className="text-sm text-muted">No gifts sent yet</p>
            <Link href="/" className="mt-3 inline-block text-xs font-semibold text-coral">
              Browse hosts →
            </Link>
          </div>
        ) : (
          <div className="space-y-2">
            {paged.map((e, i) => (
              <div
                key={e.id ?? i}
                className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3"
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-fuchsia-500/15 text-lg">
                  🎁
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-sand">{e.reason}</p>
                  <p className="text-[11px] text-muted">{fmtDate(e.createdAt ?? e.at ?? 0)}</p>
                </div>
                <span className="font-display text-sm font-bold text-coral">
                  -{e.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {totalPages > 1 && (
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setPage((p) => p - 1)}
              className="rounded-xl border border-line bg-ink-2 px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              ← Prev
            </button>
            <span className="text-xs text-muted">{page + 1} / {totalPages}</span>
            <button
              type="button"
              disabled={page >= totalPages - 1}
              onClick={() => setPage((p) => p + 1)}
              className="rounded-xl border border-line bg-ink-2 px-4 py-2 text-sm font-semibold disabled:opacity-40"
            >
              Next →
            </button>
          </div>
        )}
      </section>
    </main>
  );
}

// Data source: GET /api/wallet/history/:userId (walletLedger entries per user)
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, TrendingDown, TrendingUp } from "lucide-react";
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

type Tab = "all" | "earn" | "spend";
type Filter = "today" | "7d" | "30d";

const PAGE_SIZE = 12;

function filterByDate(entries: LedgerEntry[], filter: Filter): LedgerEntry[] {
  const now = Date.now();
  const cutoffs: Record<Filter, number> = {
    today: now - 86_400_000,
    "7d": now - 7 * 86_400_000,
    "30d": now - 30 * 86_400_000,
  };
  const cut = cutoffs[filter];
  return entries.filter((e) => (e.createdAt ?? e.at ?? 0) >= cut);
}

function entryTime(e: LedgerEntry): string {
  const ts = e.createdAt ?? e.at;
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CoinHistoryPage() {
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retryAt, setRetryAt] = useState(0);
  const [tab, setTab] = useState<Tab>("all");
  const [filter, setFilter] = useState<Filter>("30d");
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
        if (active) setEntries(data.history ?? []);
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load history");
      } finally {
        if (active) setLoading(false);
      }
    };
    void doLoad();
    return () => { active = false; };
  }, [retryAt]);

  const tabFiltered = entries.filter((e) =>
    tab === "all" ? true : tab === "earn" ? e.kind === "credit" : e.kind === "debit",
  );
  const dateFiltered = filterByDate(tabFiltered, filter);
  const totalPages = Math.ceil(dateFiltered.length / PAGE_SIZE);
  const paged = dateFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const totalEarned = entries.filter((e) => e.kind === "credit").reduce((s, e) => s + e.amount, 0);
  const totalSpent = entries.filter((e) => e.kind === "debit").reduce((s, e) => s + e.amount, 0);

  const handleTab = (t: Tab) => { setTab(t); setPage(0); };
  const handleFilter = (f: Filter) => { setFilter(f); setPage(0); };

  return (
    <main className="pb-28">
      <div className="sticky top-0 z-10 border-b border-line bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/profile" className="rounded-full bg-ink-3 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-display text-lg font-extrabold">Coin History</h1>
        </div>

        {/* Summary */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-3 px-3 py-2">
            <TrendingUp className="h-4 w-4 shrink-0 text-green" />
            <div>
              <p className="text-[10px] text-muted">Earned</p>
              <p className="font-display text-sm font-bold text-green">+{totalEarned.toLocaleString()}</p>
            </div>
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-line bg-ink-3 px-3 py-2">
            <TrendingDown className="h-4 w-4 shrink-0 text-coral" />
            <div>
              <p className="text-[10px] text-muted">Spent</p>
              <p className="font-display text-sm font-bold text-coral">-{totalSpent.toLocaleString()}</p>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 rounded-xl bg-ink-3 p-1">
          {(["all", "earn", "spend"] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => handleTab(t)}
              className={`flex-1 rounded-lg py-1.5 text-xs font-semibold capitalize transition ${
                tab === t ? "bg-coral text-white" : "text-muted"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {/* Date filter */}
        <div className="mt-2 flex gap-1.5">
          {(["today", "7d", "30d"] as Filter[]).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => handleFilter(f)}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold transition ${
                filter === f ? "bg-gold/20 text-gold" : "bg-ink-3 text-muted"
              }`}
            >
              {f === "today" ? "Today" : f === "7d" ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>

      <section className="px-4 pt-4">
        {loading ? (
          <p className="py-12 text-center text-sm text-muted">Loading…</p>
        ) : error ? (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-center">
            <p className="text-sm text-red-400">{error}</p>
            <button
              type="button"
              onClick={() => setRetryAt(Date.now())}
              className="mt-2 text-xs text-muted underline"
            >
              Retry
            </button>
          </div>
        ) : paged.length === 0 ? (
          <div className="py-12 text-center">
            <p className="text-sm text-muted">No transactions found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {paged.map((e, i) => (
              <div
                key={e.id ?? i}
                className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3"
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                  e.kind === "credit" ? "bg-green/15 text-green" : "bg-coral/15 text-coral"
                }`}>
                  {e.kind === "credit" ? (
                    <TrendingUp className="h-4 w-4" />
                  ) : (
                    <TrendingDown className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-sand">{e.reason || "Transaction"}</p>
                  <p className="text-[11px] text-muted">{entryTime(e)}</p>
                </div>
                <span className={`font-display text-sm font-bold ${
                  e.kind === "credit" ? "text-green" : "text-coral"
                }`}>
                  {e.kind === "credit" ? "+" : "-"}{e.amount.toLocaleString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Pagination */}
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
            <span className="text-xs text-muted">
              {page + 1} / {totalPages}
            </span>
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

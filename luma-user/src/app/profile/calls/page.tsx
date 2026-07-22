// Data source: GET /api/users/:userId/calls (callHistory filtered by userId)
"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, Clock, PhoneCall, PhoneMissed } from "lucide-react";
import { requireApiBase } from "@/config/apiConfig";
import { getDeviceUserId } from "@/lib/walletApi";

type CallRecord = {
  id: string;
  hostId: string;
  hostName: string;
  status: string;
  durationSec: number;
  coinsSpent: number;
  startedAt: number;
  endedAt: number;
  ratePerMinute: number;
};

type CallSummary = { totalCalls: number; totalCoinsSpent: number; totalDurationSec: number };

type Tab = "all" | "completed" | "missed";
type Filter = "today" | "7d" | "30d";

const PAGE_SIZE = 12;

function fmtDuration(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function fmtDate(ts: number): string {
  return new Date(ts).toLocaleDateString("en-US", {
    month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
  });
}

function filterByDate(records: CallRecord[], filter: Filter): CallRecord[] {
  const now = Date.now();
  const cut: Record<Filter, number> = {
    today: now - 86_400_000,
    "7d": now - 7 * 86_400_000,
    "30d": now - 30 * 86_400_000,
  };
  return records.filter((c) => (c.startedAt ?? 0) >= cut[filter]);
}

export default function CallHistoryPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [summary, setSummary] = useState<CallSummary>({ totalCalls: 0, totalCoinsSpent: 0, totalDurationSec: 0 });
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
          `${requireApiBase()}/users/${encodeURIComponent(userId)}/calls?limit=100`,
          { headers: { "X-User-Id": userId }, cache: "no-store" },
        );
        const data = (await res.json()) as { calls?: CallRecord[]; summary?: CallSummary };
        if (active) {
          setCalls(data.calls ?? []);
          if (data.summary) setSummary(data.summary);
        }
      } catch (e) {
        if (active) setError(e instanceof Error ? e.message : "Could not load call history");
      } finally {
        if (active) setLoading(false);
      }
    };
    void doLoad();
    return () => { active = false; };
  }, [retryAt]);

  const tabFiltered = calls.filter((c) => {
    if (tab === "all") return true;
    if (tab === "completed") return c.status === "ended";
    if (tab === "missed") return c.status === "missed" || c.status === "rejected";
    return true;
  });
  const dateFiltered = filterByDate(tabFiltered, filter);
  const totalPages = Math.ceil(dateFiltered.length / PAGE_SIZE);
  const paged = dateFiltered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const handleTab = (t: Tab) => { setTab(t); setPage(0); };
  const handleFilter = (f: Filter) => { setFilter(f); setPage(0); };

  return (
    <main className="pb-28">
      <div className="sticky top-0 z-10 border-b border-line bg-ink/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <Link href="/profile" className="rounded-full bg-ink-3 p-2">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="font-display text-lg font-extrabold">Call History</h1>
        </div>

        {/* Summary row */}
        <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-hide pb-0.5">
          <div className="shrink-0 rounded-xl border border-line bg-ink-3 px-3 py-2 text-center">
            <p className="text-[10px] text-muted">Calls</p>
            <p className="font-display text-sm font-bold text-sand">{summary.totalCalls}</p>
          </div>
          <div className="shrink-0 rounded-xl border border-line bg-ink-3 px-3 py-2 text-center">
            <p className="text-[10px] text-muted">Coins</p>
            <p className="font-display text-sm font-bold text-gold">{summary.totalCoinsSpent.toLocaleString()}</p>
          </div>
          <div className="shrink-0 rounded-xl border border-line bg-ink-3 px-3 py-2 text-center">
            <p className="text-[10px] text-muted">Duration</p>
            <p className="font-display text-sm font-bold text-cyan">{fmtDuration(summary.totalDurationSec)}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="mt-3 flex gap-1 rounded-xl bg-ink-3 p-1">
          {(["all", "completed", "missed"] as Tab[]).map((t) => (
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
            <p className="text-sm text-muted">No calls found</p>
          </div>
        ) : (
          <div className="space-y-2">
            {paged.map((c) => {
              const isMissed = c.status === "missed" || c.status === "rejected";
              return (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-2xl border border-line bg-ink-2 px-4 py-3"
                >
                  <Image
                    src={`https://i.pravatar.cc/80?u=${encodeURIComponent(c.hostId)}`}
                    alt={c.hostName}
                    width={40}
                    height={40}
                    unoptimized
                    className="h-10 w-10 rounded-full object-cover"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-sand">{c.hostName}</p>
                    <div className="flex items-center gap-2 text-[11px] text-muted">
                      {isMissed ? (
                        <span className="flex items-center gap-0.5 text-coral">
                          <PhoneMissed className="h-3 w-3" /> Missed
                        </span>
                      ) : (
                        <span className="flex items-center gap-0.5 text-green">
                          <PhoneCall className="h-3 w-3" /> {fmtDuration(c.durationSec)}
                        </span>
                      )}
                      <span>·</span>
                      <Clock className="h-3 w-3" />
                      {fmtDate(c.startedAt)}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="font-display text-sm font-bold text-coral">
                      -{c.coinsSpent.toLocaleString()}
                    </p>
                    <p className="text-[10px] text-muted">coins</p>
                  </div>
                </div>
              );
            })}
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

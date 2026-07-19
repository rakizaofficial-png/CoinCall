import { useEffect, useMemo, useState } from 'react';
import { fetchAdminStats, type AdminStatsPayload } from '../api';

function SparkBars({
  values,
  color,
  labels,
}: {
  values: number[];
  color: string;
  labels: string[];
}) {
  const max = Math.max(1, ...values);
  return (
    <div className="chart-bars">
      {values.map((v, i) => (
        <div key={`${labels[i]}-${i}`} className="chart-bar-col">
          <div
            className="chart-bar"
            style={{
              height: `${Math.max(8, (v / max) * 100)}%`,
              background: color,
            }}
            title={`${labels[i]}: ${v.toLocaleString()}`}
          />
          <span>{labels[i]}</span>
        </div>
      ))}
    </div>
  );
}

function SparkLine({ values, stroke }: { values: number[]; stroke: string }) {
  const max = Math.max(1, ...values);
  const min = Math.min(...values);
  const span = Math.max(1, max - min);
  const w = 320;
  const h = 96;
  const pts = values
    .map((v, i) => {
      const x = (i / Math.max(1, values.length - 1)) * w;
      const y = h - ((v - min) / span) * (h - 8) - 4;
      return `${x},${y}`;
    })
    .join(' ');
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="chart-line" aria-hidden>
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="3"
        strokeLinejoin="round"
        strokeLinecap="round"
        points={pts}
      />
    </svg>
  );
}

/** Super Admin analytics — scannable KPIs + weekly graphs */
export function DashboardAnalytics({
  isAgency,
  hostOnline,
  liveCalls,
  openPayouts,
}: {
  isAgency?: boolean;
  hostOnline: number;
  liveCalls: number;
  openPayouts: number;
}) {
  const [payload, setPayload] = useState<AdminStatsPayload | null>(null);

  useEffect(() => {
    if (isAgency) return;
    let dead = false;
    const load = async () => {
      try {
        const data = await fetchAdminStats();
        if (!dead) setPayload(data);
      } catch {
        if (!dead) setPayload(null);
      }
    };
    void load();
    const t = setInterval(() => void load(), 12_000);
    return () => {
      dead = true;
      clearInterval(t);
    };
  }, [isAgency]);

  const s = payload?.stats;
  const cards = useMemo(
    () => [
      {
        label: 'Online hosts',
        value: s?.onlineHosts ?? hostOnline,
        tone: 'teal',
      },
      {
        label: 'Active users',
        value: s?.activeUsers ?? 0,
        tone: 'blue',
      },
      {
        label: 'Live streams',
        value: s?.liveRooms ?? 0,
        tone: 'coral',
      },
      {
        label: 'Live 1:1',
        value: s?.activeCalls ?? liveCalls,
        tone: 'gold',
      },
      {
        label: 'Revenue (paid)',
        value: (s?.revenueCoins ?? 0).toLocaleString(),
        tone: 'green',
      },
      {
        label: 'Pending payouts',
        value: s?.pendingWithdrawals ?? openPayouts,
        tone: '',
      },
    ],
    [s, hostOnline, liveCalls, openPayouts],
  );

  if (isAgency) {
    return (
      <div className="stats">
        {cards.slice(0, 4).map((c) => (
          <div key={c.label} className={`stat ${c.tone}`}>
            <span>{c.label}</span>
            <b>{c.value}</b>
          </div>
        ))}
      </div>
    );
  }

  return (
    <>
      <div className="stats">
        {cards.map((c) => (
          <div key={c.label} className={`stat ${c.tone}`}>
            <span>{c.label}</span>
            <b>{c.value}</b>
          </div>
        ))}
      </div>

      <div className="analytics-grid">
        <article className="analytics-card">
          <header>
            <h3>Revenue · 7 days</h3>
            <p>Paid withdrawals + gift spend</p>
          </header>
          {payload?.series ? (
            <SparkBars
              values={payload.series.revenue}
              labels={payload.series.days}
              color="linear-gradient(180deg, #ff4d7a, #f0c14a)"
            />
          ) : (
            <div className="empty-state">Loading chart…</div>
          )}
        </article>
        <article className="analytics-card">
          <header>
            <h3>Users · trend</h3>
            <p>Active wallet growth signal</p>
          </header>
          {payload?.series ? (
            <>
              <SparkLine values={payload.series.users} stroke="#2ee6c5" />
              <div className="chart-legend">
                {payload.series.days.map((d, i) => (
                  <span key={d}>
                    {d} · {payload.series.users[i]}
                  </span>
                ))}
              </div>
            </>
          ) : (
            <div className="empty-state">Loading chart…</div>
          )}
        </article>
      </div>
    </>
  );
}

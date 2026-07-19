import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { fetchRevenue, type RevenueHostRow } from '../agencyApi';
import { FadeIn } from './AnimatedPage';

export function RevenuePanel({ agencyId }: { agencyId?: string | null }) {
  const [totals, setTotals] = useState({
    allHosts: 0,
    agencyHosts: 0,
    individualHosts: 0,
    agenciesMonth: 0,
  });
  const [agencies, setAgencies] = useState<
    {
      id: string;
      name: string;
      commissionPercent: number;
      hostCount: number;
      revenueMonth: number;
      agencyShare: number;
      platformShare: number;
    }[]
  >([]);
  const [hosts, setHosts] = useState<RevenueHostRow[]>([]);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchRevenue(agencyId || undefined);
      setTotals(data.totals);
      setAgencies(data.agencies || []);
      setHosts(data.hosts || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Revenue load failed');
    }
  }, [agencyId]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Revenue</h2>
          <p className="sub">
            {agencyId
              ? 'Your agency host earnings (limited view)'
              : 'Platform · agency · individual host revenue'}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="stats">
        <FadeIn>
          <div className="stat">
            <span>All hosts</span>
            <b>{totals.allHosts.toLocaleString()}</b>
          </div>
        </FadeIn>
        <FadeIn delay={0.05}>
          <div className="stat teal">
            <span>Agency hosts</span>
            <b>{totals.agencyHosts.toLocaleString()}</b>
          </div>
        </FadeIn>
        <FadeIn delay={0.1}>
          <div className="stat gold">
            <span>Individual</span>
            <b>{totals.individualHosts.toLocaleString()}</b>
          </div>
        </FadeIn>
        <FadeIn delay={0.15}>
          <div className="stat blue">
            <span>Agencies (month)</span>
            <b>{totals.agenciesMonth.toLocaleString()}</b>
          </div>
        </FadeIn>
      </div>

      {!agencyId ? (
        <>
          <h3 className="section-title">Agency split</h3>
          <div className="list">
            {agencies.map((a, i) => (
              <motion.div
                key={a.id}
                className="card"
                style={{ gridTemplateColumns: '1fr auto' }}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <div>
                  <h3>{a.name}</h3>
                  <div className="meta">
                    {a.hostCount} hosts · {a.commissionPercent}% agency cut
                    <br />
                    Month {a.revenueMonth.toLocaleString()} · Agency share{' '}
                    {a.agencyShare.toLocaleString()} · Platform{' '}
                    {a.platformShare.toLocaleString()}
                  </div>
                  <div className="rev-bar">
                    <div
                      className="rev-bar-fill agency"
                      style={{
                        width: `${Math.min(100, a.commissionPercent)}%`,
                      }}
                    />
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </>
      ) : null}

      <h3 className="section-title">Host earnings</h3>
      <div className="list">
        {hosts.length === 0 ? (
          <div className="empty-state">No host revenue rows yet.</div>
        ) : (
          hosts.slice(0, 40).map((h) => (
            <div
              key={h.hostId}
              className="card"
              style={{ gridTemplateColumns: '1fr auto' }}
            >
              <div>
                <h3>{h.name}</h3>
                <div className="meta">
                  <span className={`badge ${h.type === 'agency' ? 'approved' : 'pending'}`}>
                    {h.type}
                  </span>
                  {h.agencyName ? `${h.agencyName} · ` : ''}
                  Pending {h.pendingEarnings.toLocaleString()} · Paid{' '}
                  {h.paidEarnings.toLocaleString()}
                </div>
              </div>
              <div style={{ fontFamily: 'var(--display)', fontWeight: 800 }}>
                {h.revenueGenerated.toLocaleString()}
              </div>
            </div>
          ))
        )}
      </div>
    </>
  );
}

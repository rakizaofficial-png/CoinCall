import { useCallback, useEffect, useState } from 'react';
import { fetchRevenue, type RevenueHostRow } from '../agencyApi';

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
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>Revenue</h2>
          <p className="sub">
            {agencyId
              ? 'Your agency host earnings (live ledger)'
              : 'Platform · agency · individual host revenue'}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {error ? <div className="error">{error}</div> : null}

      <div className="stats">
        <div className="stat">
          <span>All hosts</span>
          <b>{totals.allHosts.toLocaleString()}</b>
        </div>
        <div className="stat teal">
          <span>Agency hosts</span>
          <b>{totals.agencyHosts.toLocaleString()}</b>
        </div>
        <div className="stat gold">
          <span>Individual</span>
          <b>{totals.individualHosts.toLocaleString()}</b>
        </div>
        <div className="stat blue">
          <span>Agencies (month)</span>
          <b>{totals.agenciesMonth.toLocaleString()}</b>
        </div>
      </div>

      {!agencyId ? (
        <>
          <h3 className="section-title">Agency split</h3>
          <div className="desk-table-wrap">
            <table className="desk-table">
              <thead>
                <tr>
                  <th>Agency</th>
                  <th>Hosts</th>
                  <th>Cut</th>
                  <th>Month</th>
                  <th>Agency share</th>
                  <th>Platform</th>
                </tr>
              </thead>
              <tbody>
                {agencies.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <strong>{a.name}</strong>
                    </td>
                    <td>{a.hostCount}</td>
                    <td>{a.commissionPercent}%</td>
                    <td>{a.revenueMonth.toLocaleString()}</td>
                    <td>{a.agencyShare.toLocaleString()}</td>
                    <td>{a.platformShare.toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : null}

      <h3 className="section-title">Host earnings</h3>
      <div className="desk-table-wrap">
        {hosts.length === 0 ? (
          <div className="empty-state">No host revenue rows yet.</div>
        ) : (
          <table className="desk-table">
            <thead>
              <tr>
                <th>Host</th>
                <th>Type</th>
                <th>Agency</th>
                <th>Revenue</th>
                <th>Pending</th>
                <th>Paid</th>
              </tr>
            </thead>
            <tbody>
              {hosts.slice(0, 80).map((h) => (
                <tr key={h.hostId}>
                  <td>
                    <strong>{h.name}</strong>
                  </td>
                  <td>
                    <span
                      className={`badge solid ${
                        h.type === 'agency' ? 'approved' : 'pending'
                      }`}
                    >
                      {h.type}
                    </span>
                  </td>
                  <td className="meta">{h.agencyName || '—'}</td>
                  <td>
                    <strong>{h.revenueGenerated.toLocaleString()}</strong>
                  </td>
                  <td>{h.pendingEarnings.toLocaleString()}</td>
                  <td>{h.paidEarnings.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

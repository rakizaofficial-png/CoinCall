import { useEffect, useMemo, useState } from 'react';
import {
  fetchAdminWithdrawals,
  setWithdrawalStatus,
  type WithdrawalRow,
} from '../api';

type DeskTab = 'pending' | 'approved' | 'rejected';

function mapTab(status: string): DeskTab {
  if (status === 'paid') return 'approved';
  if (status === 'failed') return 'rejected';
  return 'pending';
}

function statusLabel(s: string) {
  if (s === 'paid') return 'Approved';
  if (s === 'failed') return 'Rejected';
  if (s === 'admin_review') return 'Review';
  if (s === 'processing') return 'Processing';
  return 'Pending';
}

/** Money Desk — cash-out queue with clear Pending / Approved / Rejected */
export function MoneyDesk({
  readOnly,
  agencyHostIds,
}: {
  readOnly?: boolean;
  agencyHostIds?: Set<string>;
}) {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [tab, setTab] = useState<DeskTab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');

  const load = async () => {
    try {
      const data = await fetchAdminWithdrawals();
      setRows(data.withdrawals || []);
    } catch {
      setRows([]);
    }
  };

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, []);

  const scopedRows = useMemo(() => {
    if (!agencyHostIds || agencyHostIds.size === 0) {
      return agencyHostIds ? [] : rows;
    }
    return rows.filter((w) => agencyHostIds.has(w.hostId));
  }, [rows, agencyHostIds]);

  const counts = useMemo(() => {
    const pending = scopedRows.filter((w) => mapTab(w.status) === 'pending').length;
    const approved = scopedRows.filter((w) => mapTab(w.status) === 'approved').length;
    const rejected = scopedRows.filter((w) => mapTab(w.status) === 'rejected').length;
    return { pending, approved, rejected };
  }, [scopedRows]);

  const filtered = useMemo(
    () => scopedRows.filter((w) => mapTab(w.status) === tab),
    [scopedRows, tab],
  );

  const act = async (id: string, status: 'paid' | 'failed' | 'processing') => {
    if (readOnly) return;
    const prev = rows.find((w) => w.id === id);
    // Optimistic — leave current filter tab immediately
    setRows((list) =>
      list.map((w) => (w.id === id ? { ...w, status } : w)),
    );
    setBusyId(id);
    try {
      await setWithdrawalStatus(id, status);
      setMsg(`Updated · ${statusLabel(status)}`);
    } catch (e) {
      if (prev) {
        setRows((list) =>
          list.map((w) => (w.id === id ? { ...w, status: prev.status } : w)),
        );
      }
      setMsg(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>Money Desk</h2>
          <p className="sub">
            Host &amp; agency cash-outs · payout methods · full history
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      <div className="desk-filters">
        {(
          [
            ['pending', 'Pending', counts.pending],
            ['approved', 'Approved', counts.approved],
            ['rejected', 'Rejected', counts.rejected],
          ] as const
        ).map(([id, label, count]) => (
          <button
            key={id}
            type="button"
            className={`desk-tab ${tab === id ? 'on' : ''}`}
            onClick={() => setTab(id)}
          >
            {label}
            <span>{count}</span>
          </button>
        ))}
      </div>

      <div className="desk-table-wrap">
        {filtered.length === 0 ? (
          <div className="empty-state">No {tab} withdrawals.</div>
        ) : (
          <table className="desk-table">
            <thead>
              <tr>
                <th>Amount</th>
                <th>Host</th>
                <th>Gateway</th>
                <th>Account</th>
                <th>Status</th>
                <th>Submitted</th>
                {!readOnly ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className={busyId === w.id ? 'desk-row-busy' : ''}>
                  <td>
                    <strong>{w.amountCoins.toLocaleString()}</strong>
                    <small className="meta"> coins</small>
                  </td>
                  <td>
                    <code className="desk-app-id">{w.hostId}</code>
                  </td>
                  <td>{w.gateway.toUpperCase()}</td>
                  <td className="meta">
                    {w.accountName}
                    <br />
                    {w.accountNumber}
                  </td>
                  <td>
                    <span
                      className={`badge solid ${
                        mapTab(w.status) === 'approved'
                          ? 'approved'
                          : mapTab(w.status) === 'rejected'
                            ? 'rejected'
                            : 'pending'
                      }`}
                    >
                      {statusLabel(w.status)}
                    </span>
                  </td>
                  <td className="meta">
                    {new Date(w.createdAt).toLocaleString()}
                  </td>
                  {!readOnly ? (
                    <td>
                      {mapTab(w.status) === 'pending' ? (
                        <div className="desk-row-actions">
                          <button
                            type="button"
                            className="btn-teal"
                            disabled={busyId === w.id}
                            onClick={() => void act(w.id, 'processing')}
                          >
                            Processing
                          </button>
                          <button
                            type="button"
                            className="btn-green"
                            disabled={busyId === w.id}
                            onClick={() => void act(w.id, 'paid')}
                          >
                            Approve
                          </button>
                          <button
                            type="button"
                            className="btn-red"
                            disabled={busyId === w.id}
                            onClick={() => void act(w.id, 'failed')}
                          >
                            Reject
                          </button>
                        </div>
                      ) : (
                        <span className={`badge solid ${mapTab(w.status) === 'approved' ? 'approved' : 'rejected'}`}>
                          {statusLabel(w.status)}
                        </span>
                      )}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

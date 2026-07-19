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
export function MoneyDesk({ readOnly }: { readOnly?: boolean }) {
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

  const counts = useMemo(() => {
    const pending = rows.filter((w) => mapTab(w.status) === 'pending').length;
    const approved = rows.filter((w) => mapTab(w.status) === 'approved').length;
    const rejected = rows.filter((w) => mapTab(w.status) === 'rejected').length;
    return { pending, approved, rejected };
  }, [rows]);

  const filtered = useMemo(
    () => rows.filter((w) => mapTab(w.status) === tab),
    [rows, tab],
  );

  const act = async (id: string, status: 'paid' | 'failed' | 'processing') => {
    if (readOnly) return;
    setBusyId(id);
    try {
      await setWithdrawalStatus(id, status);
      setMsg(`Updated · ${statusLabel(status)}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <>
      <div className="page-head">
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

      {msg ? <div className="hm-toast">{msg}</div> : null}

      <div className="desk-tabs">
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

      <div className="list">
        {filtered.length === 0 ? (
          <div className="empty-state">No {tab} withdrawals.</div>
        ) : (
          filtered.map((w) => (
            <article className="money-card" key={w.id}>
              <div className="money-card-main">
                <div className="money-amount">
                  {w.amountCoins.toLocaleString()}
                  <small>coins</small>
                </div>
                <div>
                  <h3>
                    {w.gateway.toUpperCase()} · {statusLabel(w.status)}
                  </h3>
                  <p className="meta">
                    Host <code>{w.hostId}</code>
                    <br />
                    {w.accountName} · {w.accountNumber}
                    <br />
                    {new Date(w.createdAt).toLocaleString()}
                    {w.providerRef ? ` · ref ${w.providerRef}` : ''}
                    {w.error ? ` · ${w.error}` : ''}
                  </p>
                </div>
              </div>
              {!readOnly && mapTab(w.status) === 'pending' ? (
                <div className="actions">
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
              ) : null}
            </article>
          ))
        )}
      </div>
    </>
  );
}

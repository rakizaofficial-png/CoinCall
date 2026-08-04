import { useEffect, useMemo, useState } from 'react';
import {
  fetchAdminWithdrawals,
  setWithdrawalStatus,
  type WithdrawalRow,
} from '../api';
import {
  createAgencyWithdrawal,
  fetchAgencyWithdrawals,
} from '../agencyApi';

type DeskTab = 'pending' | 'approved' | 'rejected';

function mapTab(status: string): DeskTab {
  if (status === 'paid' || status === 'agency_paid') return 'approved';
  if (status === 'failed' || status === 'agency_rejected') return 'rejected';
  return 'pending';
}

function statusLabel(s: string) {
  if (s === 'paid') return 'Approved';
  if (s === 'agency_paid') return 'Paid by agency';
  if (s === 'failed') return 'Rejected';
  if (s === 'agency_rejected') return 'Rejected by agency';
  if (s === 'agency_pending') return 'Agency review';
  if (s === 'agency_processing') return 'Agency processing';
  if (s === 'admin_review') return 'Review';
  if (s === 'processing') return 'Processing';
  return 'Pending';
}

function durationLabel(seconds = 0) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  return `${hours}h ${minutes}m`;
}

/** Money Desk — cash-out queue with clear Pending / Approved / Rejected */
export function MoneyDesk({
  readOnly,
  agencyHostIds,
  isAgency = false,
  agencyName = '',
}: {
  readOnly?: boolean;
  agencyHostIds?: Set<string>;
  isAgency?: boolean;
  agencyName?: string;
}) {
  const [rows, setRows] = useState<WithdrawalRow[]>([]);
  const [tab, setTab] = useState<DeskTab>('pending');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState('');
  const [agencyRows, setAgencyRows] = useState<WithdrawalRow[]>([]);
  const [agencyBalance, setAgencyBalance] = useState({
    available: 0,
    collected: 0,
    reserved: 0,
  });
  const [agencyForm, setAgencyForm] = useState({
    amount: '',
    gateway: 'bank' as 'easypaisa' | 'jazzcash' | 'bank',
    accountName: agencyName,
    accountNumber: '',
  });

  const load = async () => {
    try {
      const data = await fetchAdminWithdrawals();
      setRows(data.withdrawals || []);
      if (isAgency) {
        const agencyData = await fetchAgencyWithdrawals();
        setAgencyRows(agencyData.withdrawals || []);
        setAgencyBalance({
          available: agencyData.availableCoins || 0,
          collected: agencyData.collectedCoins || 0,
          reserved: agencyData.reservedCoins || 0,
        });
      }
    } catch {
      setRows([]);
    }
  };

  const submitAgencyWithdrawal = async () => {
    const amountCoins = Math.floor(Number(agencyForm.amount) || 0);
    if (amountCoins <= 0 || amountCoins > agencyBalance.available) {
      setMsg(`Enter an amount up to ${agencyBalance.available.toLocaleString()} coins.`);
      return;
    }
    if (!agencyForm.accountName.trim() || agencyForm.accountNumber.trim().length < 6) {
      setMsg('Enter valid agency payout account details.');
      return;
    }
    setBusyId('agency-submit');
    try {
      await createAgencyWithdrawal({
        amountCoins,
        gateway: agencyForm.gateway,
        accountName: agencyForm.accountName.trim(),
        accountNumber: agencyForm.accountNumber.trim(),
      });
      setAgencyForm((current) => ({ ...current, amount: '' }));
      setMsg('Agency withdrawal sent to platform admin.');
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Agency withdrawal failed');
    } finally {
      setBusyId(null);
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

  const totals = useMemo(() => {
    const pending = scopedRows.filter((row) => mapTab(row.status) === 'pending');
    const uniqueBalances = new Map<string, number>();
    for (const row of scopedRows) {
      uniqueBalances.set(row.hostId, row.currentWalletBalance || 0);
    }
    return {
      pendingCoins: pending.reduce((sum, row) => sum + row.amountCoins, 0),
      liveWalletCoins: [...uniqueBalances.values()].reduce((sum, coins) => sum + coins, 0),
      onlineHosts: new Set(
        scopedRows.filter((row) => row.isOnline).map((row) => row.hostId),
      ).size,
    };
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

      {isAgency ? (
        <div className="analytics-card" style={{ marginBottom: 18 }}>
          <header>
            <h3>Agency collected wallet</h3>
            <p>Approve host payouts first, then send the collected balance to admin.</p>
          </header>
          <div className="stats">
            <div className="stat green">
              <span>Available to request</span>
              <b>{agencyBalance.available.toLocaleString()}</b>
            </div>
            <div className="stat teal">
              <span>Collected from hosts</span>
              <b>{agencyBalance.collected.toLocaleString()}</b>
            </div>
            <div className="stat gold">
              <span>Already requested</span>
              <b>{agencyBalance.reserved.toLocaleString()}</b>
            </div>
          </div>
          <div className="desk-filters" style={{ alignItems: 'end' }}>
            <label>
              <span className="meta">Coins</span>
              <input
                value={agencyForm.amount}
                onChange={(e) => setAgencyForm((f) => ({ ...f, amount: e.target.value }))}
                inputMode="numeric"
                placeholder="Amount"
              />
            </label>
            <label>
              <span className="meta">Method</span>
              <select
                value={agencyForm.gateway}
                onChange={(e) =>
                  setAgencyForm((f) => ({
                    ...f,
                    gateway: e.target.value as typeof f.gateway,
                  }))
                }
              >
                <option value="bank">Bank</option>
                <option value="easypaisa">EasyPaisa</option>
                <option value="jazzcash">JazzCash</option>
              </select>
            </label>
            <label>
              <span className="meta">Account name</span>
              <input
                value={agencyForm.accountName}
                onChange={(e) => setAgencyForm((f) => ({ ...f, accountName: e.target.value }))}
                placeholder="Agency account name"
              />
            </label>
            <label>
              <span className="meta">Account number</span>
              <input
                value={agencyForm.accountNumber}
                onChange={(e) => setAgencyForm((f) => ({ ...f, accountNumber: e.target.value }))}
                placeholder="IBAN / wallet number"
              />
            </label>
            <button
              type="button"
              className="btn-green"
              disabled={busyId === 'agency-submit' || agencyBalance.available <= 0}
              onClick={() => void submitAgencyWithdrawal()}
            >
              Send to admin
            </button>
          </div>
          {agencyRows.length ? (
            <div className="meta">
              Latest admin request: {agencyRows[0].amountCoins.toLocaleString()} coins ·{' '}
              {statusLabel(agencyRows[0].status)}
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="stats">
        <div className="stat gold">
          <span>Pending payout coins</span>
          <b>{totals.pendingCoins.toLocaleString()}</b>
        </div>
        <div className="stat teal">
          <span>Current host balances</span>
          <b>{totals.liveWalletCoins.toLocaleString()}</b>
        </div>
        <div className="stat blue">
          <span>Online payout hosts</span>
          <b>{totals.onlineHosts}</b>
        </div>
        <div className="stat">
          <span>Total requests</span>
          <b>{scopedRows.length}</b>
        </div>
      </div>

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
                <th>Host / agency</th>
                <th>Wallet &amp; request</th>
                <th>Performance at request</th>
                <th>Payout account</th>
                <th>Status</th>
                <th>Submitted</th>
                {!readOnly ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => (
                <tr key={w.id} className={busyId === w.id ? 'desk-row-busy' : ''}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      {w.hostAvatar ? (
                        <img className="desk-table-avatar" src={w.hostAvatar} alt="" />
                      ) : (
                        <span className="desk-avatar-fallback sm">
                          {(w.hostName || 'H')[0]}
                        </span>
                      )}
                      <div>
                        <strong>
                          {w.hostName || (w.kind === 'agency' ? 'Agency' : 'Host')}
                        </strong>
                        <div className="meta">
                          {w.kind === 'agency' ? 'Agency payout · ' : ''}
                          <code className="desk-app-id">{w.hostId}</code>
                          {' · '}
                          <span className={`badge solid ${w.isLive ? 'live' : w.isOnline ? 'online' : 'none'}`}>
                            {w.isLive ? 'Live' : w.isOnline ? 'Online' : 'Offline'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>
                    <strong>{w.amountCoins.toLocaleString()} coins requested</strong>
                    <div className="meta">
                      Before: {(w.walletBalanceBefore ?? 0).toLocaleString()}
                      {' · '}After: {(w.walletBalanceAfter ?? 0).toLocaleString()}
                      <br />
                      Live balance: {(w.currentWalletBalance ?? 0).toLocaleString()}
                    </div>
                  </td>
                  <td>
                    <strong>
                      {w.answeredCallsAtRequest ?? 0}/{w.totalCallsAtRequest ?? 0} calls answered
                    </strong>
                    <div className="meta">
                      Missed: {w.missedCallsAtRequest ?? 0}
                      {' · '}Call time: {durationLabel(w.totalCallSecondsAtRequest)}
                      <br />
                      Calls: {(w.callCoinsAtRequest ?? 0).toLocaleString()} coins
                      {' · '}Gifts: {(w.giftCoinsAtRequest ?? 0).toLocaleString()}
                      <br />
                      Lifetime: {(w.lifetimeEarningsAtRequest ?? 0).toLocaleString()} coins
                    </div>
                  </td>
                  <td>
                    <strong>{w.gateway.toUpperCase()}</strong>
                    <div className="meta">
                      {w.accountName}
                      <br />
                      <code className="desk-app-id">{w.accountNumber}</code>
                    </div>
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

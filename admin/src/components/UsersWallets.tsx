import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminCreditWallet,
  fetchAdminWallets,
  setWalletAccountStatus,
  type AdminWalletRow,
} from '../api';
import { DeskField, DeskModal } from './DeskModal';

export function UsersWalletsPanel() {
  const [wallets, setWallets] = useState<AdminWalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');
  const [creditTarget, setCreditTarget] = useState<AdminWalletRow | null>(null);
  const [creditAmount, setCreditAmount] = useState('100');
  const [creditReason, setCreditReason] = useState('Admin credit');
  const [filter, setFilter] = useState<'all' | 'active' | 'suspended' | 'banned'>(
    'all',
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await fetchAdminWallets();
      setWallets(data.wallets || []);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load wallets');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 10000);
    return () => clearInterval(t);
  }, [load]);

  const filtered = useMemo(() => {
    let rows = wallets;
    if (filter !== 'all') {
      rows = rows.filter((w) => (w.accountStatus || 'active') === filter);
    }
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((w) =>
      `${w.userId} ${w.displayName} ${w.role} ${w.appId || ''}`.toLowerCase().includes(q),
    );
  }, [wallets, query, filter]);

  const totals = useMemo(() => {
    const users = wallets.filter(
      (w) => w.role === 'user' || w.userId.startsWith('luma_'),
    );
    const vip = wallets.filter((w) => w.isPremium).length;
    const coins = wallets.reduce((s, w) => s + (w.coinBalance || 0), 0);
    return { count: wallets.length, users: users.length, vip, coins };
  }, [wallets]);

  async function applyStatus(
    userId: string,
    accountStatus: 'active' | 'suspended' | 'banned',
  ) {
    setWallets((prev) =>
      prev.map((w) => (w.userId === userId ? { ...w, accountStatus } : w)),
    );
    try {
      await setWalletAccountStatus(userId, accountStatus);
      setMsg(`${accountStatus} · ${userId.slice(0, 12)}…`);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Status update failed');
      await load();
    }
  }

  async function submitCredit() {
    if (!creditTarget) return;
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount === 0) {
      setMsg('Invalid amount');
      return;
    }
    try {
      await adminCreditWallet(
        creditTarget.userId,
        amount,
        creditReason || 'Admin adjust',
      );
      setMsg(`${amount > 0 ? '+' : ''}${amount} · ${creditTarget.displayName}`);
      setCreditTarget(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Credit failed');
    }
  }

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>User list</h2>
          <p className="sub">
            Luma profiles · wallets · suspend / ban without page reload
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      <div className="stats">
        <div className="stat">
          <span>Wallets</span>
          <b>{totals.count}</b>
        </div>
        <div className="stat teal">
          <span>User profiles</span>
          <b>{totals.users}</b>
        </div>
        <div className="stat gold">
          <span>VIP</span>
          <b>{totals.vip}</b>
        </div>
        <div className="stat blue">
          <span>Total coins</span>
          <b>{totals.coins.toLocaleString()}</b>
        </div>
      </div>

      <div className="desk-toolbar">
        <input
          className="hm-search desk-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user id / name / App ID…"
        />
        <div className="desk-filters">
          {(['all', 'active', 'suspended', 'banned'] as const).map((f) => (
            <button
              key={f}
              type="button"
              className={`desk-tab ${filter === f ? 'on' : ''}`}
              onClick={() => setFilter(f)}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}
      {error ? <div className="error">{error}</div> : null}

      <div className="desk-table-wrap">
        {loading && !wallets.length ? (
          <div className="empty-state">Loading wallets…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state">
            No user wallets yet. They appear when someone opens the Luma app.
          </div>
        ) : (
          <table className="desk-table">
            <thead>
              <tr>
                <th>Profile</th>
                <th>User</th>
                <th>App ID</th>
                <th>Status</th>
                <th>Coins</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((w) => {
                const st = w.accountStatus || 'active';
                return (
                  <tr key={w.userId}>
                    <td>
                      {w.avatarUrl ? (
                        <img
                          className="desk-table-avatar"
                          src={w.avatarUrl}
                          alt=""
                        />
                      ) : (
                        <span className="desk-avatar-fallback sm">
                          {(w.displayName || '?')[0]}
                        </span>
                      )}
                    </td>
                    <td>
                      <strong>{w.displayName || 'User'}</strong>
                      <div className="meta">
                        {w.role}
                        {w.isPremium ? ' · VIP' : ''} · XP {w.xp}
                      </div>
                    </td>
                    <td>
                      <code className="desk-app-id">
                        {w.appId ||
                          String(w.userId).replace(/\D/g, '').slice(-6).padStart(6, '0')}
                      </code>
                    </td>
                    <td>
                      <span
                        className={`badge solid ${
                          st === 'banned'
                            ? 'banned'
                            : st === 'suspended'
                              ? 'suspended'
                              : 'approved'
                        }`}
                      >
                        {st}
                      </span>
                    </td>
                    <td>
                      <strong>{w.coinBalance.toLocaleString()}</strong>
                    </td>
                    <td>
                      <div className="desk-row-actions">
                        <button
                          type="button"
                          className="btn-pink"
                          onClick={() => {
                            setCreditTarget(w);
                            setCreditAmount('100');
                            setCreditReason('Admin credit');
                          }}
                        >
                          Adjust
                        </button>
                        <button
                          type="button"
                          className="btn-gold"
                          onClick={() =>
                            void applyStatus(
                              w.userId,
                              st === 'suspended' ? 'active' : 'suspended',
                            )
                          }
                        >
                          {st === 'suspended' ? 'Unsuspend' : 'Suspend'}
                        </button>
                        <button
                          type="button"
                          className="btn-red"
                          onClick={() =>
                            void applyStatus(
                              w.userId,
                              st === 'banned' ? 'active' : 'banned',
                            )
                          }
                        >
                          {st === 'banned' ? 'Unban' : 'Ban'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <DeskModal
        open={!!creditTarget}
        title="Adjust wallet"
        subtitle={creditTarget?.displayName}
        onClose={() => setCreditTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setCreditTarget(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-pink"
              onClick={() => void submitCredit()}
            >
              Apply
            </button>
          </>
        }
      >
        <DeskField label="Amount (negative to deduct)">
          <input
            value={creditAmount}
            onChange={(e) => setCreditAmount(e.target.value)}
            inputMode="decimal"
          />
        </DeskField>
        <DeskField label="Reason">
          <input
            value={creditReason}
            onChange={(e) => setCreditReason(e.target.value)}
          />
        </DeskField>
      </DeskModal>
    </div>
  );
}

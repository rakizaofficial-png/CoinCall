import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  adminCreditWallet,
  fetchAdminWallets,
  type AdminWalletRow,
} from '../api';

/** Luma user wallets — auto-created profiles + balances */
export function UsersWalletsPanel() {
  const [wallets, setWallets] = useState<AdminWalletRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [msg, setMsg] = useState('');

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
    const q = query.trim().toLowerCase();
    if (!q) return wallets;
    return wallets.filter((w) =>
      `${w.userId} ${w.displayName} ${w.role}`.toLowerCase().includes(q),
    );
  }, [wallets, query]);

  const totals = useMemo(() => {
    const users = wallets.filter(
      (w) => w.role === 'user' || w.userId.startsWith('luma_'),
    );
    const vip = wallets.filter((w) => w.isPremium).length;
    const coins = wallets.reduce((s, w) => s + (w.coinBalance || 0), 0);
    return { count: wallets.length, users: users.length, vip, coins };
  }, [wallets]);

  async function credit(userId: string) {
    const raw = window.prompt('Credit amount (use negative to deduct)?', '100');
    if (raw == null) return;
    const amount = Number(raw);
    if (!Number.isFinite(amount) || amount === 0) {
      setMsg('Invalid amount');
      return;
    }
    const reason =
      window.prompt('Reason', amount > 0 ? 'Admin credit' : 'Admin adjust') ||
      'Admin adjust';
    try {
      await adminCreditWallet(userId, amount, reason);
      setMsg(`${amount > 0 ? '+' : ''}${amount} · ${userId.slice(0, 14)}…`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Credit failed');
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Luma users</h2>
          <p className="sub">
            Auto-created profiles · wallet balances · purchase IDs
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

      <div className="hm-toolbar">
        <input
          className="hm-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user id / name…"
        />
      </div>

      {msg ? <div className="hm-toast">{msg}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {loading && !wallets.length ? (
        <div className="empty-state">Loading wallets…</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          No user wallets yet. They appear when someone opens the Luma app.
        </div>
      ) : (
        <div className="list">
          {filtered.map((w) => (
            <div
              className="card"
              key={w.userId}
              style={{ gridTemplateColumns: 'auto 1fr auto' }}
            >
              {w.avatarUrl ? (
                <img src={w.avatarUrl} alt="" width={48} height={48} />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: 'linear-gradient(145deg,#ff4d7a33,#2ee6c533)',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 800,
                    fontFamily: 'var(--display)',
                  }}
                >
                  {(w.displayName || '?')[0]}
                </div>
              )}
              <div>
                <h3>{w.displayName || 'User'}</h3>
                <div className="meta">
                  <code>{w.userId}</code>
                  <br />
                  {w.role} · XP {w.xp}
                  {w.isPremium ? ' · VIP' : ''} · ledger {w.ledgerCount ?? 0}
                </div>
              </div>
              <div className="actions" style={{ textAlign: 'right' }}>
                <div
                  style={{
                    fontFamily: 'var(--display)',
                    fontWeight: 800,
                    fontSize: 20,
                    marginBottom: 8,
                  }}
                >
                  {w.coinBalance.toLocaleString()}
                  <span
                    style={{ fontSize: 11, opacity: 0.7, fontWeight: 600 }}
                  >
                    {' '}
                    coins
                  </span>
                </div>
                <button
                  type="button"
                  className="btn-pink"
                  onClick={() => void credit(w.userId)}
                >
                  Adjust
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

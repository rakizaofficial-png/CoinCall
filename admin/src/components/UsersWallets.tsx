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
    const users = wallets.filter((w) => w.role === 'user' || w.userId.startsWith('luma_'));
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
      <h2>Luma users</h2>
      <p className="sub">
        Auto-created profiles · wallet balances · purchase IDs
      </p>

      <div className="stats" style={{ marginBottom: 16 }}>
        <div className="stat">
          <span>Wallets</span>
          <b>{totals.count}</b>
        </div>
        <div className="stat">
          <span>User profiles</span>
          <b>{totals.users}</b>
        </div>
        <div className="stat">
          <span>VIP</span>
          <b>{totals.vip}</b>
        </div>
        <div className="stat">
          <span>Total coins</span>
          <b>{totals.coins.toLocaleString()}</b>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginBottom: 14, flexWrap: 'wrap' }}>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search user id / name…"
          style={{ flex: 1, minWidth: 200, padding: 10, borderRadius: 10 }}
        />
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {msg ? <div className="warn">{msg}</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {loading && !wallets.length ? (
        <div className="meta">Loading wallets…</div>
      ) : filtered.length === 0 ? (
        <div className="meta">
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
                <img
                  src={w.avatarUrl}
                  alt=""
                  width={48}
                  height={48}
                  style={{ borderRadius: 12, objectFit: 'cover' }}
                />
              ) : (
                <div
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: 12,
                    background: '#2a2038',
                    display: 'grid',
                    placeItems: 'center',
                    fontWeight: 700,
                  }}
                >
                  {(w.displayName || '?')[0]}
                </div>
              )}
              <div>
                <h3 style={{ margin: 0 }}>{w.displayName || 'User'}</h3>
                <div className="meta">
                  <code>{w.userId}</code>
                  <br />
                  {w.role} · XP {w.xp}
                  {w.isPremium ? ' · VIP' : ''} · ledger {w.ledgerCount ?? 0}
                </div>
              </div>
              <div className="actions" style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 800, fontSize: 18, marginBottom: 8 }}>
                  {w.coinBalance.toLocaleString()}
                  <span style={{ fontSize: 11, opacity: 0.7 }}> coins</span>
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

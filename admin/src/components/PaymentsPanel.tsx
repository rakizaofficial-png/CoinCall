import { useCallback, useEffect, useState } from 'react';
import { adminKey, apiBaseUrl } from '../firebase';

type Payment = {
  id: string; userId: string; provider: string; providerTransactionId: string;
  productId: string; status: string; amount?: number; currency?: string;
  coinsGranted: number; createdAt: string;
};

function mask(value: string) {
  return value.length > 12 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}

export function PaymentsPanel() {
  const [items, setItems] = useState<Payment[]>([]);
  const [search, setSearch] = useState('');
  const [provider, setProvider] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (search) params.set('search', search);
      if (provider) params.set('provider', provider);
      if (status) params.set('status', status);
      const res = await fetch(`${apiBaseUrl}/admin/payments?${params}`, { headers: {
        'x-admin-key': localStorage.getItem('cc_admin_key') || adminKey,
      } });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || data.error || 'Payments load failed');
      setItems(data.items || []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Payments load failed'); }
    finally { setLoading(false); }
  }, [provider, search, status]);
  useEffect(() => { void load(); }, [load]);
  return <div className="desk-root">
    <div className="desk-header"><div><h2>Payments</h2><p className="sub">Verified provider transactions and entitlements</p></div>
      <button className="btn-ghost" onClick={() => void load()} disabled={loading}>{loading ? 'Loading…' : 'Refresh'}</button></div>
    <div className="filter-row">
      <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="User, order, product or transaction" />
      <select value={provider} onChange={(e) => setProvider(e.target.value)}><option value="">All providers</option><option value="google_play">Google Play</option><option value="stripe">Stripe</option></select>
      <select value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All statuses</option>{['COMPLETED','PENDING','FAILED','REFUNDED','REVOKED'].map((value) => <option key={value}>{value}</option>)}</select>
    </div>
    {error ? <div className="error">{error}</div> : null}
    <div className="desk-table-wrap"><table className="desk-table"><thead><tr><th>Date</th><th>User</th><th>Provider</th><th>Product</th><th>Coins</th><th>Amount</th><th>Status</th><th>Provider ref</th></tr></thead>
      <tbody>{items.map((payment) => <tr key={payment.id}><td>{new Date(payment.createdAt).toLocaleString()}</td><td>{payment.userId}</td><td>{payment.provider}</td><td>{payment.productId}</td><td>{payment.coinsGranted}</td><td>{payment.amount != null ? `${payment.amount / 100} ${(payment.currency || '').toUpperCase()}` : 'Provider price'}</td><td><span className="badge solid">{payment.status}</span></td><td title={payment.providerTransactionId}>{mask(payment.providerTransactionId)}</td></tr>)}</tbody></table>
      {!loading && items.length === 0 ? <div className="empty-state">No payment transactions found.</div> : null}</div>
  </div>;
}

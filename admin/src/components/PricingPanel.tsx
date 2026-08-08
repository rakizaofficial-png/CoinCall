import { useEffect, useState } from 'react';
import { apiBaseUrl } from '../firebase';

type CoinPackage = {
  productId: string;
  title: string;
  coins: number;
  bonusCoins: number;
  priceLabel: string;
  popular?: boolean;
};
type VipPlan = {
  id: string;
  name: string;
  priceLabel: string;
  period: string;
  coins: number;
};
type CallBilling = { rateUnitCoins: number; formula?: string };

function headers() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key': localStorage.getItem('cc_admin_key') || '',
  };
}

export function PricingPanel() {
  const [coinPackages, setCoinPackages] = useState<CoinPackage[]>([]);
  const [vipPlans, setVipPlans] = useState<VipPlan[]>([]);
  const [callBilling, setCallBilling] = useState<CallBilling>({ rateUnitCoins: 10 });
  const [msg, setMsg] = useState('');

  useEffect(() => {
    void fetch(`${apiBaseUrl}/config/pricing`, { cache: 'no-store' })
      .then((r) => r.json())
      .then((data) => {
        setCoinPackages(data.coinPackages || []);
        setVipPlans(data.vipPlans || []);
        setCallBilling(data.callBilling || { rateUnitCoins: 10 });
      })
      .catch(() => setMsg('Could not load pricing'));
  }, []);

  async function save() {
    setMsg('Saving…');
    const res = await fetch(`${apiBaseUrl}/admin/config/pricing`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({ coinPackages, vipPlans, callBilling }),
    });
    const data = await res.json().catch(() => ({}));
    setMsg(res.ok ? 'Pricing published to the user app' : data.error || 'Save failed');
  }

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>Coin & subscription pricing</h2>
          <p className="sub">Live server configuration used by the Luma user app</p>
        </div>
        <button className="btn-pink" type="button" onClick={() => void save()}>
          Publish pricing
        </button>
      </div>
      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}
      <h3 className="section-title">Private call billing</h3>
      <div className="desk-table-wrap"><table className="desk-table"><thead><tr><th>Host rate unit</th><th>Coins per rate unit</th><th>Formula</th></tr></thead><tbody><tr>
        <td>Host rate</td>
        <td><input type="number" min="1" max="10000" value={callBilling.rateUnitCoins} onChange={(e) => setCallBilling({ rateUnitCoins: Math.max(1, Math.floor(Number(e.target.value) || 1)) })} /></td>
        <td>Host rate × {callBilling.rateUnitCoins} = coins/minute</td>
      </tr></tbody></table></div>
      <h3 className="section-title">Coin packages</h3>
      <div className="desk-table-wrap">
        <table className="desk-table">
          <thead><tr><th>Package</th><th>Price</th><th>Coins</th><th>Bonus</th></tr></thead>
          <tbody>
            {coinPackages.map((p, index) => (
              <tr key={p.productId}>
                <td><strong>{p.title}</strong><div className="meta">{p.productId}</div></td>
                <td><input value={p.priceLabel} onChange={(e) => setCoinPackages((rows) => rows.map((r, i) => i === index ? { ...r, priceLabel: e.target.value } : r))} /></td>
                <td><input type="number" value={p.coins} onChange={(e) => setCoinPackages((rows) => rows.map((r, i) => i === index ? { ...r, coins: Number(e.target.value) } : r))} /></td>
                <td><input type="number" value={p.bonusCoins} onChange={(e) => setCoinPackages((rows) => rows.map((r, i) => i === index ? { ...r, bonusCoins: Number(e.target.value) } : r))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3 className="section-title">VIP subscriptions</h3>
      <div className="desk-table-wrap">
        <table className="desk-table">
          <thead><tr><th>Plan</th><th>Price</th><th>Period</th><th>Welcome coins</th></tr></thead>
          <tbody>
            {vipPlans.map((p, index) => (
              <tr key={p.id}>
                <td><strong>{p.name}</strong></td>
                <td><input value={p.priceLabel} onChange={(e) => setVipPlans((rows) => rows.map((r, i) => i === index ? { ...r, priceLabel: e.target.value } : r))} /></td>
                <td><input value={p.period} onChange={(e) => setVipPlans((rows) => rows.map((r, i) => i === index ? { ...r, period: e.target.value } : r))} /></td>
                <td><input type="number" value={p.coins} onChange={(e) => setVipPlans((rows) => rows.map((r, i) => i === index ? { ...r, coins: Number(e.target.value) } : r))} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

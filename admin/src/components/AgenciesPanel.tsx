import { useCallback, useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import {
  createAgency,
  fetchAgencies,
  updateAgency,
  type Agency,
} from '../agencyApi';
import { FadeIn } from './AnimatedPage';

export function AgenciesPanel({ limited }: { limited?: boolean }) {
  const [rows, setRows] = useState<Agency[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchAgencies();
      setRows(data.agencies || []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Failed to load agencies');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCreate() {
    if (limited) return;
    const name = window.prompt('Agency name');
    if (!name) return;
    const ownerName = window.prompt('Owner name') || 'Owner';
    const email = window.prompt('Email') || 'agency@demo.com';
    setBusy(true);
    try {
      const res = await createAgency({ name, ownerName, email });
      setMsg(`Created · login key: ${res.loginKey}`);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setBusy(false);
    }
  }

  async function toggleStatus(a: Agency) {
    if (limited) return;
    const next =
      a.status === 'active'
        ? 'suspended'
        : a.status === 'pending'
          ? 'active'
          : 'active';
    await updateAgency(a.id, { status: next });
    await load();
  }

  async function editPerms(a: Agency) {
    if (limited) return;
    const canManageHosts = window.confirm(
      'Allow agency to manage hosts? OK = yes',
    );
    const canViewRevenue = window.confirm('Allow revenue view? OK = yes');
    const canRequestPayout = window.confirm('Allow payout requests? OK = yes');
    const canViewCalls = window.confirm('Allow live calls list? OK = yes');
    const canMonitor = window.confirm('Allow silent monitor? OK = yes');
    await updateAgency(a.id, {
      permissions: {
        canManageHosts,
        canViewRevenue,
        canRequestPayout,
        canViewCalls,
        canMonitor,
      },
    });
    setMsg(`Permissions updated · ${a.name}`);
    await load();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2>Agencies</h2>
          <p className="sub">
            Partner agencies · commission · limited portal permissions
          </p>
        </div>
        {!limited ? (
          <button
            type="button"
            className="btn-pink"
            disabled={busy}
            onClick={() => void onCreate()}
          >
            + New agency
          </button>
        ) : null}
      </div>

      {msg ? <div className="hm-toast">{msg}</div> : null}

      <div className="agency-grid">
        {rows.map((a, i) => (
          <FadeIn key={a.id} delay={i * 0.05}>
            <motion.article
              className="agency-card"
              whileHover={{ y: -4, scale: 1.01 }}
              transition={{ type: 'spring', stiffness: 380, damping: 28 }}
            >
              <div className="agency-card-top">
                <div>
                  <h3>{a.name}</h3>
                  <p>
                    {a.ownerName} · {a.email}
                  </p>
                </div>
                <span className={`badge ${a.status}`}>{a.status}</span>
              </div>
              <div className="agency-metrics">
                <div>
                  <span>Hosts</span>
                  <b>{a.hostIds.length}</b>
                </div>
                <div>
                  <span>Cut</span>
                  <b>{a.commissionPercent}%</b>
                </div>
                <div>
                  <span>Month</span>
                  <b>{a.revenueMonth.toLocaleString()}</b>
                </div>
                <div>
                  <span>Total</span>
                  <b>{a.revenueTotal.toLocaleString()}</b>
                </div>
              </div>
              <div className="perm-chips">
                {a.permissions.canViewRevenue ? (
                  <span className="chip on">Revenue</span>
                ) : (
                  <span className="chip">No revenue</span>
                )}
                {a.permissions.canManageHosts ? (
                  <span className="chip on">Hosts</span>
                ) : (
                  <span className="chip">Hosts locked</span>
                )}
                {a.permissions.canRequestPayout ? (
                  <span className="chip on">Payout</span>
                ) : null}
                {a.permissions.canMonitor ? (
                  <span className="chip on">Monitor</span>
                ) : null}
              </div>
              {!limited ? (
                <div className="actions" style={{ flexDirection: 'row' }}>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => void toggleStatus(a)}
                  >
                    {a.status === 'active' ? 'Suspend' : 'Activate'}
                  </button>
                  <button
                    type="button"
                    className="btn-teal"
                    onClick={() => void editPerms(a)}
                  >
                    Permissions
                  </button>
                </div>
              ) : null}
            </motion.article>
          </FadeIn>
        ))}
      </div>
      {!rows.length ? (
        <div className="empty-state">No agencies yet.</div>
      ) : null}
    </>
  );
}

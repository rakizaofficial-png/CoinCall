import { useCallback, useEffect, useState } from 'react';
import {
  createAgency,
  deleteAgency,
  fetchAgencies,
  updateAgency,
  type Agency,
} from '../agencyApi';
import type { AgencyPerms } from '../permissions';
import { DeskField, DeskModal } from './DeskModal';

const EMPTY_PERMS: AgencyPerms = {
  canManageHosts: true,
  canViewRevenue: true,
  canRequestPayout: false,
  canViewCalls: true,
  canMonitor: false,
};

export function AgenciesPanel({
  limited,
  onOpenHosts,
  onOpenRevenue,
}: {
  limited?: boolean;
  onOpenHosts?: () => void;
  onOpenRevenue?: () => void;
}) {
  const [rows, setRows] = useState<Agency[]>([]);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({
    name: '',
    ownerName: '',
    email: '',
    commissionPercent: '30',
    minWithdrawCoins: '500',
    maxWithdrawCoins: '50000',
    dailyWithdrawCap: '100000',
  });
  const [createdCreds, setCreatedCreds] = useState<{
    loginKey: string;
    referralCode: string;
    referralLink: string;
  } | null>(null);
  const [manageTarget, setManageTarget] = useState<Agency | null>(null);
  const [perms, setPerms] = useState<AgencyPerms>(EMPTY_PERMS);
  const [cutValue, setCutValue] = useState('30');
  const [limits, setLimits] = useState({
    minWithdrawCoins: '500',
    maxWithdrawCoins: '50000',
    dailyWithdrawCap: '100000',
  });

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
    const t = setInterval(() => void load(), 8000);
    return () => clearInterval(t);
  }, [load]);

  async function onCreate() {
    if (limited) return;
    const { name, ownerName, email } = createForm;
    if (!name.trim() || !ownerName.trim() || !email.trim()) {
      setMsg('Name, owner, and email are required');
      return;
    }
    const commissionPercent = Number(createForm.commissionPercent);
    setBusy(true);
    try {
      const res = await createAgency({
        name: name.trim(),
        ownerName: ownerName.trim(),
        email: email.trim(),
        commissionPercent: Number.isFinite(commissionPercent)
          ? commissionPercent
          : 30,
        minWithdrawCoins: Number(createForm.minWithdrawCoins) || 500,
        maxWithdrawCoins: Number(createForm.maxWithdrawCoins) || 50000,
        dailyWithdrawCap: Number(createForm.dailyWithdrawCap) || 100000,
      });
      setCreatedCreds({
        loginKey: res.loginKey,
        referralCode: res.referralCode,
        referralLink: res.referralLink,
      });
      setMsg(`Created ${res.agency.name}`);
      setCreateOpen(false);
      setCreateForm({
        name: '',
        ownerName: '',
        email: '',
        commissionPercent: '30',
        minWithdrawCoins: '500',
        maxWithdrawCoins: '50000',
        dailyWithdrawCap: '100000',
      });
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
    setRows((prev) =>
      prev.map((r) => (r.id === a.id ? { ...r, status: next } : r)),
    );
    await updateAgency(a.id, { status: next });
    setMsg(`${a.name} → ${next}`);
  }

  async function onDelete(a: Agency) {
    if (limited) return;
    if (!window.confirm(`Delete agency “${a.name}”? This cannot be undone.`)) {
      return;
    }
    setBusy(true);
    try {
      await deleteAgency(a.id);
      setMsg(`Deleted ${a.name}`);
      if (manageTarget?.id === a.id) setManageTarget(null);
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setBusy(false);
    }
  }

  async function savePerms() {
    if (!manageTarget) return;
    await updateAgency(manageTarget.id, { permissions: perms });
    setMsg(`Permissions updated · ${manageTarget.name}`);
    setManageTarget(null);
    await load();
  }

  async function saveCut() {
    if (!manageTarget) return;
    const n = Number(cutValue);
    if (!Number.isFinite(n) || n < 0 || n > 80) {
      setMsg('Commission must be 0–80');
      return;
    }
    await updateAgency(manageTarget.id, {
      commissionPercent: n,
      minWithdrawCoins: Number(limits.minWithdrawCoins) || 500,
      maxWithdrawCoins: Number(limits.maxWithdrawCoins) || 50000,
      dailyWithdrawCap: Number(limits.dailyWithdrawCap) || 100000,
    });
    setMsg(`Commission & limits saved · ${manageTarget.name}`);
    setManageTarget(null);
    await load();
  }

  function openManage(a: Agency) {
    setManageTarget(a);
    setPerms({ ...a.permissions });
    setCutValue(String(a.commissionPercent));
    setLimits({
      minWithdrawCoins: String(a.minWithdrawCoins ?? 500),
      maxWithdrawCoins: String(a.maxWithdrawCoins ?? 50000),
      dailyWithdrawCap: String(a.dailyWithdrawCap ?? 100000),
    });
  }

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>Agencies</h2>
          <p className="sub">
            Create partners · referral codes · commission · withdrawal rules · portal access
          </p>
        </div>
        {!limited ? (
          <button
            type="button"
            className="btn-pink"
            disabled={busy}
            onClick={() => setCreateOpen(true)}
          >
            + New agency
          </button>
        ) : null}
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      {createdCreds ? (
        <div className="agency-card" style={{ marginBottom: 16 }}>
          <div className="agency-card-top">
            <h3>Agency credentials</h3>
            <p>Share once securely — login key is not shown again in the table</p>
          </div>
          <p>
            <strong>Login key:</strong> <code>{createdCreds.loginKey}</code>
          </p>
          <p>
            <strong>Referral code:</strong> <code>{createdCreds.referralCode}</code>
          </p>
          <p>
            <strong>Referral link:</strong>{' '}
            <code className="referral-link">{createdCreds.referralLink}</code>
          </p>
          <button
            type="button"
            className="btn-ghost"
            onClick={() => setCreatedCreds(null)}
          >
            Dismiss
          </button>
        </div>
      ) : null}

      <div className="desk-table-wrap">
        {!rows.length ? (
          <div className="empty-state">No agencies yet.</div>
        ) : (
          <table className="desk-table">
            <thead>
              <tr>
                <th>Agency</th>
                <th>Owner</th>
                <th>Status</th>
                <th>Referral</th>
                <th>Hosts</th>
                <th>Cut</th>
                <th>Month</th>
                <th>Total</th>
                {!limited ? <th>Lifecycle</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((a) => (
                <tr key={a.id}>
                  <td>
                    <strong>{a.name}</strong>
                    <div className="meta">{a.email}</div>
                  </td>
                  <td className="meta">{a.ownerName}</td>
                  <td>
                    <span className={`badge solid ${a.status}`}>
                      {a.status}
                    </span>
                  </td>
                  <td>
                    <code>{a.referralCode || '—'}</code>
                  </td>
                  <td>
                    <strong>{a.hostCount ?? a.hostIds.length}</strong>
                  </td>
                  <td>{a.commissionPercent}%</td>
                  <td>{a.revenueMonth.toLocaleString()}</td>
                  <td>{a.revenueTotal.toLocaleString()}</td>
                  {!limited ? (
                    <td>
                      <div className="desk-row-actions">
                        <button
                          type="button"
                          className={
                            a.status === 'active' ? 'btn-gold' : 'btn-green'
                          }
                          onClick={() => void toggleStatus(a)}
                        >
                          {a.status === 'active'
                            ? 'Suspend'
                            : a.status === 'pending'
                              ? 'Activate'
                              : 'Activate'}
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => openManage(a)}
                        >
                          Manage
                        </button>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() => void onDelete(a)}
                        >
                          Delete
                        </button>
                        {onOpenHosts ? (
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={onOpenHosts}
                          >
                            Hosts
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DeskModal
        open={createOpen}
        title="Create agency"
        subtitle="Issues login key + referral code"
        onClose={() => setCreateOpen(false)}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setCreateOpen(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-pink"
              disabled={busy}
              onClick={() => void onCreate()}
            >
              Create
            </button>
          </>
        }
      >
        <DeskField label="Agency name">
          <input
            value={createForm.name}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, name: e.target.value }))
            }
          />
        </DeskField>
        <DeskField label="Owner name">
          <input
            value={createForm.ownerName}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, ownerName: e.target.value }))
            }
          />
        </DeskField>
        <DeskField label="Email">
          <input
            type="email"
            value={createForm.email}
            onChange={(e) =>
              setCreateForm((f) => ({ ...f, email: e.target.value }))
            }
          />
        </DeskField>
        <DeskField label="Commission %">
          <input
            value={createForm.commissionPercent}
            onChange={(e) =>
              setCreateForm((f) => ({
                ...f,
                commissionPercent: e.target.value,
              }))
            }
          />
        </DeskField>
        <DeskField label="Min withdraw (coins)">
          <input
            value={createForm.minWithdrawCoins}
            onChange={(e) =>
              setCreateForm((f) => ({
                ...f,
                minWithdrawCoins: e.target.value,
              }))
            }
          />
        </DeskField>
        <DeskField label="Max withdraw (coins)">
          <input
            value={createForm.maxWithdrawCoins}
            onChange={(e) =>
              setCreateForm((f) => ({
                ...f,
                maxWithdrawCoins: e.target.value,
              }))
            }
          />
        </DeskField>
        <DeskField label="Daily withdraw cap">
          <input
            value={createForm.dailyWithdrawCap}
            onChange={(e) =>
              setCreateForm((f) => ({
                ...f,
                dailyWithdrawCap: e.target.value,
              }))
            }
          />
        </DeskField>
      </DeskModal>

      <DeskModal
        open={!!manageTarget}
        title="Manage agency"
        subtitle={manageTarget?.name}
        onClose={() => setManageTarget(null)}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setManageTarget(null)}
            >
              Close
            </button>
            <button type="button" className="btn-gold" onClick={() => void saveCut()}>
              Save cut &amp; limits
            </button>
            <button type="button" className="btn-pink" onClick={() => void savePerms()}>
              Save permissions
            </button>
          </>
        }
      >
        {manageTarget ? (
          <>
            <div className="agency-manage-paths">
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setManageTarget(null);
                  onOpenHosts?.();
                }}
              >
                → Agency hosts
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => {
                  setManageTarget(null);
                  onOpenRevenue?.();
                }}
              >
                → Revenue
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void toggleStatus(manageTarget)}
              >
                {manageTarget.status === 'active' ? 'Suspend' : 'Activate'}
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => void onDelete(manageTarget)}
              >
                Delete
              </button>
            </div>
            {manageTarget.referralCode ? (
              <p className="sub">
                Referral: <code>{manageTarget.referralCode}</code>
                {manageTarget.referralLink ? (
                  <>
                    {' '}
                    · <code className="referral-link">{manageTarget.referralLink}</code>
                  </>
                ) : null}
              </p>
            ) : null}
            <DeskField label="Commission % (0–80)">
              <input
                value={cutValue}
                onChange={(e) => setCutValue(e.target.value)}
                inputMode="numeric"
              />
            </DeskField>
            <DeskField label="Min withdraw">
              <input
                value={limits.minWithdrawCoins}
                onChange={(e) =>
                  setLimits((l) => ({ ...l, minWithdrawCoins: e.target.value }))
                }
              />
            </DeskField>
            <DeskField label="Max withdraw">
              <input
                value={limits.maxWithdrawCoins}
                onChange={(e) =>
                  setLimits((l) => ({ ...l, maxWithdrawCoins: e.target.value }))
                }
              />
            </DeskField>
            <DeskField label="Daily cap">
              <input
                value={limits.dailyWithdrawCap}
                onChange={(e) =>
                  setLimits((l) => ({ ...l, dailyWithdrawCap: e.target.value }))
                }
              />
            </DeskField>
            <p className="sub" style={{ marginTop: 12 }}>
              Portal permissions
            </p>
            {(
              [
                ['canManageHosts', 'Manage hosts'],
                ['canViewRevenue', 'View revenue'],
                ['canRequestPayout', 'Request payouts'],
                ['canViewCalls', 'View live calls'],
                ['canMonitor', 'Silent monitor'],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="desk-check-row">
                <input
                  type="checkbox"
                  checked={!!perms[key]}
                  onChange={(e) =>
                    setPerms((p) => ({ ...p, [key]: e.target.checked }))
                  }
                />
                <span>{label}</span>
              </label>
            ))}
          </>
        ) : null}
      </DeskModal>
    </div>
  );
}

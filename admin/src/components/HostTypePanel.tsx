import { useCallback, useEffect, useState } from 'react';
import {
  assignHostToAgency,
  fetchAgencies,
  fetchHostTypes,
  type Agency,
  type RevenueHostRow,
} from '../agencyApi';
import { DeskField, DeskModal } from './DeskModal';

export function HostTypePanel({
  mode,
  agencyId,
  canManage,
}: {
  mode: 'agency' | 'individual';
  agencyId?: string | null;
  canManage?: boolean;
}) {
  const [rows, setRows] = useState<RevenueHostRow[]>([]);
  const [agencies, setAgencies] = useState<Agency[]>([]);
  const [msg, setMsg] = useState('');
  const [assignHostId, setAssignHostId] = useState<string | null>(null);
  const [pickedAgency, setPickedAgency] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await fetchHostTypes(agencyId || undefined);
      let list = mode === 'agency' ? data.agency : data.individual;
      if (agencyId && mode === 'agency') {
        list = data.agency.filter((h) => h.agencyId === agencyId);
      }
      setRows(list || []);
      if (mode === 'individual' || canManage) {
        const ag = await fetchAgencies();
        setAgencies(ag.agencies || []);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Load failed');
    }
  }, [mode, agencyId, canManage]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [load]);

  async function confirmAssign() {
    if (!assignHostId || !pickedAgency) return;
    const agency = agencies.find((a) => a.id === pickedAgency);
    if (!agency) return;
    await assignHostToAgency(agency.id, assignHostId, 'assign');
    setMsg(`Assigned to ${agency.name}`);
    setAssignHostId(null);
    setPickedAgency('');
    await load();
  }

  return (
    <div className="desk-root">
      <div className="desk-header">
        <div>
          <h2>
            {mode === 'agency' ? 'Agency hosts' : 'Individual hosts'}
          </h2>
          <p className="sub">
            {mode === 'agency'
              ? agencyId
                ? 'Hosts under your agency · live earnings ledger'
                : 'Hosts managed by partner agencies'
              : 'Independent hosts · assign to an agency'}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      <div className="desk-table-wrap">
        {rows.length === 0 ? (
          <div className="empty-state">No {mode} hosts found.</div>
        ) : (
          <table className="desk-table">
            <thead>
              <tr>
                <th>Host</th>
                <th>App ID</th>
                <th>Agency</th>
                <th>Revenue</th>
                <th>Pending</th>
                <th>Paid</th>
                {mode === 'individual' && canManage ? <th>Actions</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => (
                <tr key={h.hostId}>
                  <td>
                    <strong>{h.name}</strong>
                  </td>
                  <td>
                    <code className="desk-app-id">
                      {String(h.hostId).replace(/\D/g, '').slice(-6).padStart(6, '0') ||
                        h.hostId.slice(0, 8)}
                    </code>
                  </td>
                  <td className="meta">{h.agencyName || 'Independent'}</td>
                  <td>
                    <strong>{h.revenueGenerated.toLocaleString()}</strong>
                  </td>
                  <td className="meta">{h.pendingEarnings.toLocaleString()}</td>
                  <td className="meta">{h.paidEarnings.toLocaleString()}</td>
                  {mode === 'individual' && canManage ? (
                    <td>
                      <button
                        type="button"
                        className="btn-pink"
                        onClick={() => {
                          setAssignHostId(h.hostId);
                          setPickedAgency(agencies[0]?.id || '');
                        }}
                      >
                        Assign agency
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <DeskModal
        open={!!assignHostId}
        title="Assign to agency"
        subtitle="Host will appear under that agency’s portal"
        onClose={() => setAssignHostId(null)}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setAssignHostId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-pink"
              disabled={!pickedAgency}
              onClick={() => void confirmAssign()}
            >
              Assign
            </button>
          </>
        }
      >
        <DeskField label="Agency">
          <select
            value={pickedAgency}
            onChange={(e) => setPickedAgency(e.target.value)}
          >
            {agencies.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {a.commissionPercent}%
              </option>
            ))}
          </select>
        </DeskField>
      </DeskModal>
    </div>
  );
}

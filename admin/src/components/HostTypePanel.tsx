import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  assignHostToAgency,
  fetchAgencies,
  fetchHostTypes,
  type Agency,
  type RevenueHostRow,
} from '../agencyApi';
import { fetchBridgeHosts, type BridgeHostStatus } from '../hostApi';
import { DeskField, DeskModal } from './DeskModal';

function appIdOf(hostId: string) {
  const raw = String(hostId || '').replace(/\D/g, '');
  if (raw.length >= 6) return raw.slice(-6);
  return (raw || '0').padStart(6, '0');
}

function PresenceCell({ bridge }: { bridge?: BridgeHostStatus }) {
  if (bridge?.readyToCall) return <span className="badge online">Ready</span>;
  if (bridge?.isLive) return <span className="badge live">Live</span>;
  if (bridge?.isOnCall) return <span className="badge under_review">On call</span>;
  if (bridge?.isOnline) return <span className="badge online">Online</span>;
  return <span className="badge none">Offline</span>;
}

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
  const [bridgeHosts, setBridgeHosts] = useState<BridgeHostStatus[]>([]);
  const [msg, setMsg] = useState('');
  const [assignHostId, setAssignHostId] = useState<string | null>(null);
  const [pickedAgency, setPickedAgency] = useState('');

  const bridgeById = useMemo(() => {
    const map = new Map<string, BridgeHostStatus>();
    for (const h of bridgeHosts) map.set(h.id, h);
    return map;
  }, [bridgeHosts]);

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
      try {
        const bridge = await fetchBridgeHosts(agencyId);
        setBridgeHosts(bridge.hosts || []);
      } catch {
        setBridgeHosts([]);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Load failed');
    }
  }, [mode, agencyId, canManage]);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 4000);
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
    <div className="desk-root desk-root--wide">
      <div className="desk-header">
        <div>
          <h2>
            {mode === 'agency' ? 'Agency hosts' : 'Individual hosts'}
          </h2>
          <p className="sub">
            {mode === 'agency'
              ? agencyId
                ? 'Hosts under your agency · live earnings ledger'
                : 'Hosts managed by partner agencies · live revenue sync'
              : 'Independent hosts · assign to an agency'}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void load()}>
          Refresh
        </button>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      <div className="desk-table-wrap desk-table-wrap--enterprise">
        {rows.length === 0 ? (
          <div className="empty-state">No {mode} hosts found.</div>
        ) : (
          <table className="desk-table desk-table--enterprise">
            <thead>
              <tr>
                <th>Host</th>
                <th>App ID</th>
                <th>Agency</th>
                <th>Presence</th>
                <th>Revenue</th>
                <th>Pending</th>
                <th>Paid</th>
                {mode === 'individual' && canManage ? <th>Lifecycle</th> : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((h) => {
                const bridge = bridgeById.get(h.hostId);
                return (
                  <tr key={h.hostId}>
                    <td>
                      <div className="desk-host-inline">
                        <span className="desk-avatar-fallback sm">
                          {(h.name || '?')[0]}
                        </span>
                        <div>
                          <strong>{h.name || 'Host'}</strong>
                          <div className="meta">{h.hostId.slice(0, 12)}</div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <code className="desk-app-id">{appIdOf(h.hostId)}</code>
                    </td>
                    <td className="meta">{h.agencyName || '—'}</td>
                    <td>
                      <PresenceCell bridge={bridge} />
                    </td>
                    <td>
                      <strong>{(h.revenueGenerated || 0).toLocaleString()}</strong>
                    </td>
                    <td className="meta">
                      {(h.pendingEarnings || 0).toLocaleString()}
                    </td>
                    <td className="meta">
                      {(h.paidEarnings || 0).toLocaleString()}
                    </td>
                    {mode === 'individual' && canManage ? (
                      <td>
                        <button
                          type="button"
                          className="btn-ghost"
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
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <DeskModal
        open={!!assignHostId}
        title="Assign to agency"
        subtitle="Move this individual host under a partner agency"
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
                {a.name}
              </option>
            ))}
          </select>
        </DeskField>
      </DeskModal>
    </div>
  );
}

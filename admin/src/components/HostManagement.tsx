import { useEffect, useMemo, useRef, useState } from 'react';
import type { HostRow } from '../api';
import { connectAdminRealtime } from '../api';
import {
  exportHostsCsv,
  fetchAuditLogs,
  fetchBridgeHosts,
  fetchManagedHosts,
  mergeFirebaseHosts,
  runBulkHostAction,
  runHostAction,
  syncHostsToServer,
  type AuditLog,
  type BridgeHostStatus,
  type HostLifecycleStatus,
  type ManagedHost,
} from '../hostApi';
import { DeskField, DeskModal } from './DeskModal';

const STATUS_FILTERS = [
  'all',
  'pending',
  'under_review',
  'approved',
  'rejected',
  'suspended',
  'banned',
] as const;

const SORTS = [
  { id: 'updated', label: 'Recent' },
  { id: 'name', label: 'Name' },
  { id: 'earnings', label: 'Earnings' },
  { id: 'rating', label: 'Rating' },
  { id: 'calls', label: 'Calls' },
  { id: 'coins', label: 'Coins' },
] as const;

const NEXT_STATUS: Record<string, HostLifecycleStatus> = {
  approve: 'approved',
  reject: 'rejected',
  suspend: 'suspended',
  ban: 'banned',
  unsuspend: 'approved',
  unban: 'approved',
  under_review: 'under_review',
  request_docs: 'under_review',
};

function fmtSec(sec = 0) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

function appIdOf(h: ManagedHost) {
  const raw = String(h.hostId || '').replace(/\D/g, '');
  if (raw.length >= 6) return raw.slice(-6);
  if (raw) return raw.padStart(6, '0');
  const fallback = String(h.id || '')
    .replace(/\D/g, '')
    .slice(-6);
  return fallback.padStart(6, '0') || '000000';
}

function photoOf(h: ManagedHost) {
  if (h.photoUrls?.length) return h.photoUrls[0];
  return h.photoUrl || h.avatarUrl || '';
}

function PresencePill({ bridge, online }: { bridge?: BridgeHostStatus; online?: boolean }) {
  if (bridge?.readyToCall) return <span className="badge online">Ready</span>;
  if (bridge?.isLive) return <span className="badge live">Live</span>;
  if (bridge?.isOnCall) return <span className="badge under_review">On call</span>;
  if (bridge?.isOnline || online) return <span className="badge online">Online</span>;
  return <span className="badge none">Offline</span>;
}

function mergeServerHosts(
  server: ManagedHost[],
  optimistic: Map<string, Partial<ManagedHost>>,
): ManagedHost[] {
  if (!optimistic.size) return server;
  return server.map((h) => {
    const patch = optimistic.get(h.id);
    return patch ? { ...h, ...patch } : h;
  });
}

export function HostManagementPanel({
  firebaseHosts,
  agencyId,
  canAct = true,
  title,
  subtitle,
  initialStatus,
}: {
  firebaseHosts: HostRow[];
  agencyId?: string | null;
  canAct?: boolean;
  title?: string;
  subtitle?: string;
  /** Separate sidebar paths: Host Approver / Host KYC */
  initialStatus?: string;
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>(
    initialStatus || (agencyId ? 'all' : 'pending'),
  );
  const [sort, setSort] = useState('updated');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ManagedHost | null>(null);
  const [managed, setManaged] = useState<ManagedHost[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [bridgeHosts, setBridgeHosts] = useState<BridgeHostStatus[]>([]);
  const [bridgeReady, setBridgeReady] = useState(0);
  const [bridgeOnline, setBridgeOnline] = useState(0);
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [msg, setMsg] = useState('');
  const [form, setForm] = useState<
    | null
    | { type: 'docs' | 'commission' | 'coins'; host: ManagedHost }
  >(null);
  const [formValue, setFormValue] = useState('');
  const optimisticRef = useRef<Map<string, Partial<ManagedHost>>>(new Map());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flash = (text: string) => {
    setMsg(text);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setMsg(''), 2800);
  };

  useEffect(() => {
    if (initialStatus) setStatus(initialStatus);
    else setStatus(agencyId ? 'all' : 'pending');
  }, [agencyId, initialStatus]);

  const hosts = useMemo(() => {
    if (agencyId) return managed;
    return mergeFirebaseHosts(firebaseHosts, managed);
  }, [firebaseHosts, managed, agencyId]);

  const bridgeById = useMemo(() => {
    const map = new Map<string, BridgeHostStatus>();
    for (const h of bridgeHosts) map.set(h.id, h);
    return map;
  }, [bridgeHosts]);

  const filtered = useMemo(() => {
    let rows = hosts;
    if (status !== 'all') {
      rows = rows.filter((h) => h.hostStatus === status);
    }
    const q = query.trim().toLowerCase();
    if (q) {
      rows = rows.filter((h) => {
        const hay =
          `${h.name} ${h.email || ''} ${h.hostId || ''} ${appIdOf(h)} ${h.country || ''} ${h.id}`.toLowerCase();
        return hay.includes(q);
      });
    }
    rows = [...rows].sort((a, b) => {
      switch (sort) {
        case 'name':
          return (a.name || '').localeCompare(b.name || '');
        case 'earnings':
          return (b.revenueGenerated || 0) - (a.revenueGenerated || 0);
        case 'rating':
          return (b.rating || 0) - (a.rating || 0);
        case 'calls':
          return (b.totalCalls || 0) - (a.totalCalls || 0);
        case 'coins':
          return (b.coinBalance || 0) - (a.coinBalance || 0);
        default:
          return (b.applicationSubmittedAt || 0) - (a.applicationSubmittedAt || 0);
      }
    });
    return rows;
  }, [hosts, query, status, sort]);

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = { all: hosts.length };
    for (const f of STATUS_FILTERS) {
      if (f === 'all') continue;
      counts[f] = hosts.filter((h) => h.hostStatus === f).length;
    }
    return counts;
  }, [hosts]);

  const refreshServer = async () => {
    try {
      if (!agencyId) {
        await syncHostsToServer(firebaseHosts as ManagedHost[]);
      }
      const data = await fetchManagedHosts({
        q: query,
        status: 'all',
        sort,
        agencyId,
      });
      setManaged(mergeServerHosts(data.hosts || [], optimisticRef.current));
      if (!agencyId) {
        const audit = await fetchAuditLogs(60);
        setLogs(audit.logs || []);
      }
      try {
        const bridge = await fetchBridgeHosts(agencyId);
        setBridgeHosts(bridge.hosts || []);
        setBridgeReady(bridge.readyCount || 0);
        setBridgeOnline(bridge.onlineCount || 0);
      } catch {
        setBridgeHosts([]);
        setBridgeReady(0);
        setBridgeOnline(0);
      }
    } catch (e) {
      flash(
        e instanceof Error
          ? e.message
          : 'Server sync failed — using Firebase only',
      );
    }
  };

  useEffect(() => {
    void refreshServer();
    const t = setInterval(() => void refreshServer(), 3500);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseHosts.length, query, sort, agencyId]);

  useEffect(() => {
    const off = connectAdminRealtime((type) => {
      if (
        type === 'host:presence' ||
        type === 'host:updated' ||
        type === 'live:room' ||
        type === 'live:ended' ||
        type === 'call:updated' ||
        type === 'call:ended' ||
        type === 'wallet:updated' ||
        type === 'gift:received'
      ) {
        void refreshServer();
      }
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agencyId]);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  const markBusy = (id: string, on: boolean) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const patchLocal = (id: string, patch: Partial<ManagedHost>) => {
    const prevOpt = optimisticRef.current.get(id) || {};
    optimisticRef.current.set(id, { ...prevOpt, ...patch });
    setManaged((prev) => {
      const exists = prev.some((h) => h.id === id);
      if (!exists) {
        const fb = firebaseHosts.find((h) => h.id === id);
        if (!fb) return prev;
        return [...prev, { ...fb, ...patch } as ManagedHost];
      }
      return prev.map((h) => (h.id === id ? { ...h, ...patch } : h));
    });
    setDetail((d) => (d?.id === id ? { ...d, ...patch } : d));
  };

  const clearOptimistic = (id: string) => {
    optimisticRef.current.delete(id);
  };

  const act = async (
    id: string,
    action: string,
    extra?: {
      reason?: string;
      docsMessage?: string;
      commissionRate?: number;
      coinBalance?: number;
    },
  ) => {
    if (!canAct) return;
    const host = hosts.find((h) => h.id === id);
    const next = NEXT_STATUS[action];
    const snapshot = host ? { ...host } : null;

    // Instant UI — no alert/confirm; row leaves current filter tab immediately
    if (next) {
      patchLocal(id, {
        hostStatus: next,
        banned: action === 'ban' ? true : action === 'unban' ? false : host?.banned,
        suspended:
          action === 'suspend'
            ? true
            : action === 'unsuspend'
              ? false
              : host?.suspended,
        rejectionReason:
          action === 'reject'
            ? extra?.reason || 'Not approved'
            : host?.rejectionReason,
      });
    }

    markBusy(id, true);
    try {
      const result = await runHostAction(id, action, {
        ...extra,
        reason:
          extra?.reason ||
          (action === 'reject'
            ? 'Not approved'
            : action === 'ban'
              ? 'Banned by admin'
              : action === 'suspend'
                ? 'Suspended by admin'
                : undefined),
        name: host?.name,
        hostId: host?.hostId,
      });
      if (result.host) {
        clearOptimistic(id);
        setManaged((prev) => {
          const others = prev.filter((h) => h.id !== id);
          return [...others, result.host];
        });
        if (detail?.id === id) setDetail(result.host);
      } else {
        clearOptimistic(id);
      }
      flash(`${action.replace(/_/g, ' ')} · ${host?.name || id}`);
    } catch (e) {
      clearOptimistic(id);
      if (snapshot) {
        setManaged((prev) =>
          prev.map((h) => (h.id === id ? snapshot : h)),
        );
        setDetail((d) => (d?.id === id ? snapshot : d));
      }
      flash(e instanceof Error ? e.message : 'Action failed');
    } finally {
      markBusy(id, false);
    }
  };

  const bulk = async (action: string) => {
    if (!canAct || !selected.size) return;
    const ids = [...selected];
    const next = NEXT_STATUS[action];
    if (next) {
      for (const id of ids) {
        patchLocal(id, {
          hostStatus: next,
          banned: action === 'ban',
          suspended: action === 'suspend',
        });
      }
    }
    setBusyIds(new Set(ids));
    try {
      await runBulkHostAction(
        ids,
        action,
        action === 'reject'
          ? 'Not approved'
          : action === 'ban'
            ? 'Banned by admin'
            : action === 'suspend'
              ? 'Suspended by admin'
              : undefined,
      );
      for (const id of ids) clearOptimistic(id);
      setSelected(new Set());
      flash(`Bulk ${action} · ${ids.length} hosts`);
      await refreshServer();
    } catch (e) {
      for (const id of ids) clearOptimistic(id);
      flash(e instanceof Error ? e.message : 'Bulk failed');
      await refreshServer();
    } finally {
      setBusyIds(new Set());
    }
  };

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === filtered.length) setSelected(new Set());
    else setSelected(new Set(filtered.map((h) => h.id)));
  };

  const submitForm = async () => {
    if (!form) return;
    const { type, host } = form;
    if (type === 'docs') {
      await act(host.id, 'request_docs', {
        docsMessage: formValue.trim() || 'Please upload verification documents',
      });
    } else if (type === 'commission') {
      const n = Number(formValue);
      if (!Number.isFinite(n)) {
        flash('Invalid commission');
        return;
      }
      await act(host.id, 'set_commission', { commissionRate: n });
    } else if (type === 'coins') {
      const n = Number(formValue);
      if (!Number.isFinite(n)) {
        flash('Invalid coin balance');
        return;
      }
      await act(host.id, 'set_coins', { coinBalance: n });
    }
    setForm(null);
    setFormValue('');
  };

  return (
    <div className="desk-root desk-root--wide">
      <div className="desk-header">
        <div>
          <h2>{title || (agencyId ? 'Agency hosts' : 'Host management')}</h2>
          <p className="sub">
            {subtitle ||
              (agencyId
                ? 'Live roster · earnings · presence from linked host apps'
                : 'Applications · approvals · control · finance · audit')}
          </p>
          <p className="sub desk-live-line">
            Live bridge · <strong>{bridgeOnline}</strong> online ·{' '}
            <strong>{bridgeReady}</strong> ready
            {agencyId ? ' · your hosts only' : ''}
          </p>
        </div>
        <div className="desk-header-actions">
          {!agencyId ? (
            <button
              type="button"
              className="btn-ghost"
              onClick={() => void exportHostsCsv().catch((e) => flash(String(e)))}
            >
              Export CSV
            </button>
          ) : null}
          <button
            type="button"
            className="btn-ghost"
            onClick={() => void refreshServer()}
          >
            Refresh
          </button>
        </div>
      </div>

      {msg ? <div className="hm-toast desk-toast">{msg}</div> : null}

      <div className="desk-toolbar">
        <input
          className="hm-search desk-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, App ID, country…"
        />
        <div className="desk-filters" role="tablist" aria-label="Lifecycle filters">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={status === f}
              className={`desk-tab ${status === f ? 'on' : ''}`}
              onClick={() => setStatus(f)}
            >
              {f.replace('_', ' ')}
              <span>{statusCounts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="desk-filters desk-sorts">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`desk-tab ghost ${sort === s.id ? 'on' : ''}`}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {canAct ? (
        <div className="desk-bulk">
          <button type="button" className="btn-ghost" onClick={selectAll}>
            {selected.size === filtered.length && filtered.length
              ? 'Clear selection'
              : `Select all (${filtered.length})`}
          </button>
          <button
            type="button"
            className="btn-green"
            disabled={!selected.size}
            onClick={() => void bulk('approve')}
          >
            Approve
          </button>
          <button
            type="button"
            className="btn-gold"
            disabled={!selected.size}
            onClick={() => void bulk('reject')}
          >
            Reject
          </button>
          <button
            type="button"
            className="btn-gold"
            disabled={!selected.size}
            onClick={() => void bulk('suspend')}
          >
            Suspend
          </button>
          {!agencyId ? (
            <button
              type="button"
              className="btn-red"
              disabled={!selected.size}
              onClick={() => void bulk('ban')}
            >
              Ban
            </button>
          ) : null}
        </div>
      ) : null}

      <div className={`desk-layout ${detail || !agencyId ? '' : 'single'}`}>
        <div className="desk-table-wrap desk-table-wrap--enterprise">
          {filtered.length === 0 ? (
            <div className="empty-state">No hosts in this filter</div>
          ) : (
            <table className="desk-table desk-table--enterprise">
              <thead>
                <tr>
                  {canAct ? (
                    <th className="desk-check">
                      <input
                        type="checkbox"
                        checked={
                          selected.size > 0 &&
                          selected.size === filtered.length
                        }
                        onChange={selectAll}
                        aria-label="Select all"
                      />
                    </th>
                  ) : null}
                  <th>Profile</th>
                  <th>Host / User</th>
                  <th>App ID</th>
                  <th>Country</th>
                  <th>Status</th>
                  <th>Presence</th>
                  <th>Earnings</th>
                  <th>Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => {
                  const st = h.hostStatus || 'none';
                  const busy = busyIds.has(h.id);
                  const bridge = bridgeById.get(h.id);
                  const needsReview =
                    st === 'pending' || st === 'under_review';
                  return (
                    <tr
                      key={h.id}
                      className={`${detail?.id === h.id ? 'desk-row-active' : ''} ${busy ? 'desk-row-busy' : ''}`}
                    >
                      {canAct ? (
                        <td>
                          <input
                            type="checkbox"
                            checked={selected.has(h.id)}
                            onChange={() => toggle(h.id)}
                          />
                        </td>
                      ) : null}
                      <td>
                        <button
                          type="button"
                          className="desk-avatar-btn"
                          onClick={() => setDetail(h)}
                        >
                          {photoOf(h) ? (
                            <img src={photoOf(h)} alt="" />
                          ) : (
                            <span className="desk-avatar-fallback">
                              {(h.name || '?')[0]}
                            </span>
                          )}
                        </button>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="desk-name-btn"
                          onClick={() => setDetail(h)}
                        >
                          <strong>{h.name || 'Host'}</strong>
                          <small>{h.email || h.id.slice(0, 10)}</small>
                        </button>
                      </td>
                      <td>
                        <code className="desk-app-id">{appIdOf(h)}</code>
                      </td>
                      <td className="meta">{h.country || '—'}</td>
                      <td>
                        <span className={`badge solid ${st}`}>
                          {st.replace('_', ' ')}
                        </span>
                      </td>
                      <td>
                        <PresencePill bridge={bridge} online={h.isOnline} />
                      </td>
                      <td>
                        <div className="desk-earn">
                          <strong>
                            {(h.revenueGenerated || 0).toLocaleString()}
                          </strong>
                          <small>
                            pend {(h.pendingEarnings || 0).toLocaleString()} · bal{' '}
                            {(h.coinBalance || 0).toLocaleString()}
                          </small>
                        </div>
                      </td>
                      <td>
                        <div className="desk-row-actions">
                          {canAct && needsReview ? (
                            <>
                              <button
                                type="button"
                                className="btn-green"
                                disabled={busy}
                                onClick={() => void act(h.id, 'approve')}
                              >
                                Approve
                              </button>
                              <button
                                type="button"
                                className="btn-gold"
                                disabled={busy}
                                onClick={() =>
                                  void act(h.id, 'reject', {
                                    reason: 'Not approved',
                                  })
                                }
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {canAct && st === 'approved' ? (
                            <>
                              <span className="badge solid approved desk-action-done">
                                Approved
                              </span>
                              <button
                                type="button"
                                className="btn-gold"
                                disabled={busy}
                                onClick={() => void act(h.id, 'suspend')}
                              >
                                Suspend
                              </button>
                              {!agencyId ? (
                                <button
                                  type="button"
                                  className="btn-red"
                                  disabled={busy}
                                  onClick={() => void act(h.id, 'ban')}
                                >
                                  Ban
                                </button>
                              ) : null}
                            </>
                          ) : null}
                          {canAct && st === 'suspended' ? (
                            <button
                              type="button"
                              className="btn-green"
                              disabled={busy}
                              onClick={() => void act(h.id, 'unsuspend')}
                            >
                              Unsuspend
                            </button>
                          ) : null}
                          {canAct && st === 'banned' && !agencyId ? (
                            <button
                              type="button"
                              className="btn-green"
                              disabled={busy}
                              onClick={() => void act(h.id, 'unban')}
                            >
                              Unban
                            </button>
                          ) : null}
                          {canAct && st === 'rejected' ? (
                            <button
                              type="button"
                              className="btn-green"
                              disabled={busy}
                              onClick={() => void act(h.id, 'approve')}
                            >
                              Re-approve
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="btn-ghost desk-icon-btn"
                            onClick={() => setDetail(h)}
                            title="Open profile"
                          >
                            Open
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

        {!agencyId ? (
          <aside className="desk-side">
            {detail ? (
              <HostDetail
                host={detail}
                bridge={bridgeById.get(detail.id)}
                busy={busyIds.has(detail.id)}
                canAct={canAct}
                onClose={() => setDetail(null)}
                onAction={(action, extra) => void act(detail.id, action, extra)}
                onOpenForm={(type) => {
                  setForm({ type, host: detail });
                  setFormValue(
                    type === 'commission'
                      ? String(detail.commissionRate ?? 0.3)
                      : type === 'coins'
                        ? String(detail.coinBalance ?? 0)
                        : '',
                  );
                }}
              />
            ) : (
              <div className="hm-audit">
                <h3>Audit log</h3>
                <p className="sub">Admin actions (live)</p>
                <ul>
                  {logs.length === 0 ? (
                    <li className="meta">No audit entries yet</li>
                  ) : (
                    logs.map((l) => (
                      <li key={l.id}>
                        <strong>{l.action}</strong> · {l.hostName || l.hostId}
                        <br />
                        <span className="meta">
                          {l.adminId}/{l.adminRole} ·{' '}
                          {new Date(l.at).toLocaleString()}
                          {l.details ? ` · ${l.details}` : ''}
                        </span>
                      </li>
                    ))
                  )}
                </ul>
              </div>
            )}
          </aside>
        ) : detail ? (
          <aside className="desk-side">
            <HostDetail
              host={detail}
              bridge={bridgeById.get(detail.id)}
              busy={busyIds.has(detail.id)}
              canAct={canAct}
              agencyMode
              onClose={() => setDetail(null)}
              onAction={(action, extra) => void act(detail.id, action, extra)}
              onOpenForm={() => undefined}
            />
          </aside>
        ) : null}
      </div>

      <DeskModal
        open={!!form}
        title={
          form?.type === 'docs'
            ? 'Request documents'
            : form?.type === 'commission'
              ? 'Set commission'
              : 'Set coin balance'
        }
        subtitle={form?.host.name}
        onClose={() => setForm(null)}
        footer={
          <>
            <button
              type="button"
              className="btn-ghost"
              onClick={() => setForm(null)}
            >
              Cancel
            </button>
            <button type="button" className="btn-pink" onClick={() => void submitForm()}>
              Save
            </button>
          </>
        }
      >
        <DeskField
          label={
            form?.type === 'docs'
              ? 'Message to host'
              : form?.type === 'commission'
                ? 'Rate (0–1)'
                : 'Coin balance'
          }
        >
          {form?.type === 'docs' ? (
            <textarea
              rows={3}
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              placeholder="Please upload CNIC / passport selfie…"
            />
          ) : (
            <input
              value={formValue}
              onChange={(e) => setFormValue(e.target.value)}
              inputMode="decimal"
            />
          )}
        </DeskField>
      </DeskModal>
    </div>
  );
}

function HostDetail({
  host,
  bridge,
  busy,
  canAct,
  agencyMode,
  onClose,
  onAction,
  onOpenForm,
}: {
  host: ManagedHost;
  bridge?: BridgeHostStatus;
  busy: boolean;
  canAct: boolean;
  agencyMode?: boolean;
  onClose: () => void;
  onAction: (
    action: string,
    extra?: {
      reason?: string;
      docsMessage?: string;
      commissionRate?: number;
      coinBalance?: number;
    },
  ) => void;
  onOpenForm: (type: 'docs' | 'commission' | 'coins') => void;
}) {
  const photos = host.photoUrls?.length
    ? host.photoUrls
    : host.photoUrl
      ? [host.photoUrl]
      : [];
  const st = host.hostStatus || 'none';

  return (
    <div className="hm-detail">
      <div className="hm-detail-top">
        <h3>{host.name}</h3>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="meta">
        App ID <code className="desk-app-id">{appIdOf(host)}</code> ·{' '}
        {host.email || 'no email'} · {host.country || '—'}
        <br />
        Status{' '}
        <span className={`badge solid ${st}`}>{st.replace('_', ' ')}</span>
        {host.rejectionReason ? ` · ${host.rejectionReason}` : ''}
        <br />
        Presence:{' '}
        {bridge ? (
          bridge.readyToCall
            ? 'Ready to call'
            : bridge.isLive
              ? 'Live'
              : bridge.isOnCall
                ? 'On call'
                : 'Online'
        ) : host.isOnline ? (
          'Online'
        ) : (
          'Offline'
        )}
      </div>

      <div className="photos" style={{ marginTop: 10 }}>
        {photos.map((p) => (
          <img key={p} src={p} alt="" />
        ))}
      </div>

      <p className="hm-bio">{host.bio || 'No bio'}</p>

      <h4>Earnings</h4>
      <div className="hm-metrics">
        <div>
          <span>Revenue</span>
          <b>{(host.revenueGenerated ?? 0).toLocaleString()}</b>
        </div>
        <div>
          <span>Pending</span>
          <b>{(host.pendingEarnings ?? 0).toLocaleString()}</b>
        </div>
        <div>
          <span>Paid</span>
          <b>{(host.paidEarnings ?? 0).toLocaleString()}</b>
        </div>
        <div>
          <span>Calls</span>
          <b>{host.totalCalls ?? 0}</b>
        </div>
        <div>
          <span>Online</span>
          <b>{fmtSec(host.onlineSeconds)}</b>
        </div>
        <div>
          <span>Rating</span>
          <b>{(host.rating ?? 5).toFixed(1)}</b>
        </div>
      </div>

      {canAct ? (
        <>
          <h4>Lifecycle</h4>
          <div className="actions hm-perm">
            {st === 'pending' || st === 'under_review' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-green"
                  onClick={() => onAction('approve')}
                >
                  Approve
                </button>
                {!agencyMode ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn-ghost"
                    onClick={() => onAction('under_review')}
                  >
                    Under review
                  </button>
                ) : null}
                {!agencyMode ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn-gold"
                    onClick={() => onOpenForm('docs')}
                  >
                    Request docs
                  </button>
                ) : null}
                <button
                  type="button"
                  disabled={busy}
                  className="btn-gold"
                  onClick={() =>
                    onAction('reject', { reason: 'Not approved' })
                  }
                >
                  Reject
                </button>
              </>
            ) : null}
            {st === 'rejected' ? (
              <button
                type="button"
                disabled={busy}
                className="btn-green"
                onClick={() => onAction('approve')}
              >
                Re-approve
              </button>
            ) : null}
            {st === 'approved' ? (
              <>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-gold"
                  onClick={() => onAction('suspend')}
                >
                  Suspend
                </button>
                {!agencyMode ? (
                  <button
                    type="button"
                    disabled={busy}
                    className="btn-red"
                    onClick={() => onAction('ban')}
                  >
                    Ban
                  </button>
                ) : null}
              </>
            ) : null}
            {st === 'suspended' ? (
              <button
                type="button"
                disabled={busy}
                className="btn-green"
                onClick={() => onAction('unsuspend')}
              >
                Unsuspend
              </button>
            ) : null}
            {st === 'banned' && !agencyMode ? (
              <button
                type="button"
                disabled={busy}
                className="btn-green"
                onClick={() => onAction('unban')}
              >
                Unban
              </button>
            ) : null}
          </div>

          {!agencyMode ? (
            <>
              <h4>Permissions</h4>
              <div className="actions hm-perm">
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() =>
                    onAction(
                      host.videoCallsEnabled === false
                        ? 'enable_video'
                        : 'disable_video',
                    )
                  }
                >
                  Video {host.videoCallsEnabled === false ? 'OFF' : 'ON'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() =>
                    onAction(
                      host.voiceCallsEnabled === false
                        ? 'enable_voice'
                        : 'disable_voice',
                    )
                  }
                >
                  Voice {host.voiceCallsEnabled === false ? 'OFF' : 'ON'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() =>
                    onAction(
                      host.giftsEnabled === false
                        ? 'enable_gifts'
                        : 'disable_gifts',
                    )
                  }
                >
                  Gifts {host.giftsEnabled === false ? 'OFF' : 'ON'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() =>
                    onAction(
                      host.callsEnabled === false
                        ? 'enable_calls'
                        : 'disable_calls',
                    )
                  }
                >
                  Calls {host.callsEnabled === false ? 'OFF' : 'ON'}
                </button>
              </div>

              <h4>Controls</h4>
              <div className="actions hm-perm">
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() => onAction('force_offline')}
                >
                  Force offline
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() => onAction('force_online')}
                >
                  Force online
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-gold"
                  onClick={() =>
                    onAction(
                      host.walletFrozen ? 'unfreeze_wallet' : 'freeze_wallet',
                    )
                  }
                >
                  {host.walletFrozen ? 'Unfreeze wallet' : 'Freeze wallet'}
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() => onOpenForm('commission')}
                >
                  Set commission
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-ghost"
                  onClick={() => onOpenForm('coins')}
                >
                  Set coins
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="btn-red"
                  onClick={() =>
                    onAction('reset_earnings', {
                      reason: 'Platform policy reset',
                    })
                  }
                >
                  Reset earnings
                </button>
              </div>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

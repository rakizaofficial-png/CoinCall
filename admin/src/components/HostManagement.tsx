import { useEffect, useMemo, useState } from 'react';
import type { HostRow } from '../api';
import {
  connectAdminRealtime,
} from '../api';
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
  type ManagedHost,
} from '../hostApi';

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
  { id: 'earnings', label: 'Revenue' },
  { id: 'rating', label: 'Rating' },
  { id: 'calls', label: 'Calls' },
  { id: 'coins', label: 'Coins' },
] as const;

function fmtSec(sec = 0) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  return `${h}h ${m}m`;
}

export function HostManagementPanel({
  firebaseHosts,
}: {
  firebaseHosts: HostRow[];
}) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<string>('all');
  const [sort, setSort] = useState('updated');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<ManagedHost | null>(null);
  const [managed, setManaged] = useState<ManagedHost[]>([]);
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [bridgeHosts, setBridgeHosts] = useState<BridgeHostStatus[]>([]);
  const [bridgeReady, setBridgeReady] = useState(0);
  const [bridgeOnline, setBridgeOnline] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const hosts = useMemo(
    () => mergeFirebaseHosts(firebaseHosts, managed),
    [firebaseHosts, managed],
  );

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
        const hay = `${h.name} ${h.email || ''} ${h.hostId || ''} ${h.country || ''} ${h.id}`.toLowerCase();
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
      await syncHostsToServer(firebaseHosts as ManagedHost[]);
      const data = await fetchManagedHosts({ q: query, status, sort });
      setManaged(data.hosts || []);
      const audit = await fetchAuditLogs(60);
      setLogs(audit.logs || []);
      try {
        const bridge = await fetchBridgeHosts();
        setBridgeHosts(bridge.hosts || []);
        setBridgeReady(bridge.readyCount || 0);
        setBridgeOnline(bridge.onlineCount || 0);
      } catch {
        setBridgeHosts([]);
        setBridgeReady(0);
        setBridgeOnline(0);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Server sync failed — using Firebase only');
    }
  };

  useEffect(() => {
    void refreshServer();
    const t = setInterval(() => void refreshServer(), 4000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firebaseHosts.length, query, status, sort]);

  // Instant presence from admin websocket
  useEffect(() => {
    const off = connectAdminRealtime((type) => {
      if (
        type === 'host:presence' ||
        type === 'host:updated' ||
        type === 'live:room' ||
        type === 'live:ended' ||
        type === 'call:updated' ||
        type === 'call:ended'
      ) {
        void refreshServer();
      }
    });
    return () => off();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const act = async (
    id: string,
    action: string,
    extra?: { reason?: string; docsMessage?: string; commissionRate?: number; coinBalance?: number },
  ) => {
    setBusy(true);
    setMsg('');
    try {
      const host = hosts.find((h) => h.id === id);
      const result = await runHostAction(id, action, {
        ...extra,
        name: host?.name,
        hostId: host?.hostId,
      });
      setMsg(`${action} · ${host?.name || id}`);
      if (result.host) {
        setManaged((prev) => {
          const others = prev.filter((h) => h.id !== id);
          return [...others, result.host];
        });
        if (detail?.id === id) setDetail(result.host);
        // Auto-switch tab when status leaves current filter
        if (
          status !== 'all' &&
          result.host.hostStatus &&
          result.host.hostStatus !== status
        ) {
          setStatus(result.host.hostStatus);
        }
      }
      await refreshServer();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  };

  const bulk = async (action: string) => {
    if (!selected.size) return;
    const reason =
      action === 'reject' || action === 'ban' || action === 'suspend'
        ? window.prompt('Reason (shown to hosts)?') || undefined
        : undefined;
    setBusy(true);
    try {
      const count = selected.size;
      await runBulkHostAction([...selected], action, reason);
      setSelected(new Set());
      setMsg(`Bulk ${action} · ${count} hosts`);
      await refreshServer();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Bulk failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="hm-root">
      <div className="hm-header">
        <div>
          <h2>Host Management</h2>
          <p className="sub">
            Applications · approvals · control · finance · monitoring · audit
          </p>
          <p className="sub" style={{ marginTop: 6 }}>
            User-app bridge: <strong>{bridgeOnline}</strong> online ·{' '}
            <strong>{bridgeReady}</strong> ready to call
          </p>
        </div>
        <div className="hm-header-actions">
          <button
            type="button"
            className="btn-ghost"
            disabled={busy}
            onClick={() => void exportHostsCsv().catch((e) => setMsg(String(e)))}
          >
            Export CSV
          </button>
          <button
            type="button"
            className="btn-pink"
            disabled={busy}
            onClick={() => void refreshServer()}
          >
            Refresh
          </button>
        </div>
      </div>

      {msg ? <div className="hm-toast">{msg}</div> : null}

      <div className="hm-toolbar">
        <input
          className="hm-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search name, email, host ID, country…"
        />
        <div className="toolbar">
          {STATUS_FILTERS.map((f) => (
            <button
              key={f}
              type="button"
              className={`chip ${status === f ? 'on' : ''}`}
              onClick={() => setStatus(f)}
            >
              {f.replace('_', ' ')}
              <span className="chip-count">{statusCounts[f] ?? 0}</span>
            </button>
          ))}
        </div>
        <div className="toolbar">
          {SORTS.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`chip ${sort === s.id ? 'on' : ''}`}
              onClick={() => setSort(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      <div className="hm-bulk">
        <button type="button" className="btn-ghost" onClick={selectAll}>
          {selected.size === filtered.length && filtered.length
            ? 'Clear selection'
            : `Select all (${filtered.length})`}
        </button>
        <button
          type="button"
          className="btn-green"
          disabled={!selected.size || busy}
          onClick={() => void bulk('approve')}
        >
          Bulk approve
        </button>
        <button
          type="button"
          className="btn-gold"
          disabled={!selected.size || busy}
          onClick={() => void bulk('reject')}
        >
          Bulk reject
        </button>
        <button
          type="button"
          className="btn-gold"
          disabled={!selected.size || busy}
          onClick={() => void bulk('suspend')}
        >
          Bulk suspend
        </button>
        <button
          type="button"
          className="btn-red"
          disabled={!selected.size || busy}
          onClick={() => void bulk('ban')}
        >
          Bulk ban
        </button>
      </div>

      <div className="hm-layout">
        <div className="hm-table-wrap">
          {filtered.length === 0 ? (
            <div className="meta">No hosts match filters</div>
          ) : (
            <table className="hm-table">
              <thead>
                <tr>
                  <th className="hm-th-check">
                    <input
                      type="checkbox"
                      checked={
                        selected.size > 0 && selected.size === filtered.length
                      }
                      onChange={selectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th>Host</th>
                  <th>Status</th>
                  <th>Presence</th>
                  <th>Location</th>
                  <th>Calls</th>
                  <th>Balance</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((h) => {
                  const photos = h.photoUrls?.length
                    ? h.photoUrls
                    : h.photoUrl
                      ? [h.photoUrl]
                      : [];
                  const bridge = bridgeById.get(h.id);
                  const st = h.hostStatus || 'none';
                  const needsReview =
                    st === 'pending' || st === 'under_review';
                  return (
                    <tr
                      key={h.id}
                      className={detail?.id === h.id ? 'hm-row-active' : ''}
                    >
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(h.id)}
                          onChange={() => toggle(h.id)}
                        />
                      </td>
                      <td>
                        <button
                          type="button"
                          className="hm-host-cell"
                          onClick={() => setDetail(h)}
                        >
                          <img src={photos[0] || h.avatarUrl || ''} alt="" />
                          <span>
                            <strong>{h.name || 'Host'}</strong>
                            <small>
                              {h.hostId || h.id.slice(0, 8)}
                            </small>
                          </span>
                        </button>
                      </td>
                      <td>
                        <span className={`badge ${st}`}>
                          {st.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td>
                        <div className="hm-presence">
                          {bridge?.readyToCall ? (
                            <span className="badge online">READY TO CALL</span>
                          ) : bridge?.isLive ? (
                            <span className="badge pending">LIVE</span>
                          ) : bridge?.isOnCall ? (
                            <span className="badge under_review">ON CALL</span>
                          ) : bridge?.isOnline ? (
                            <span className="badge online">ONLINE</span>
                          ) : h.isOnline ? (
                            <span className="badge online">ONLINE</span>
                          ) : (
                            <span className="badge">NOT ON USER APP</span>
                          )}
                        </div>
                      </td>
                      <td className="meta">{h.country || '—'}</td>
                      <td className="meta">{h.totalCalls ?? 0}</td>
                      <td className="meta">{h.coinBalance ?? 0}</td>
                      <td>
                        <div className="hm-row-actions">
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => setDetail(h)}
                          >
                            Open
                          </button>
                          {needsReview ? (
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
                                onClick={() => {
                                  const reason =
                                    window.prompt('Reject reason?') ||
                                    'Not approved';
                                  void act(h.id, 'reject', { reason });
                                }}
                              >
                                Reject
                              </button>
                            </>
                          ) : null}
                          {st === 'approved' ? (
                            <>
                              <button
                                type="button"
                                className="btn-gold"
                                disabled={busy}
                                onClick={() =>
                                  void act(h.id, 'suspend', {
                                    reason: 'Suspended by admin',
                                  })
                                }
                              >
                                Suspend
                              </button>
                              <button
                                type="button"
                                className="btn-red"
                                disabled={busy}
                                onClick={() =>
                                  void act(h.id, 'ban', {
                                    reason: 'Banned by admin',
                                  })
                                }
                              >
                                Ban
                              </button>
                            </>
                          ) : null}
                          {st === 'suspended' ? (
                            <button
                              type="button"
                              className="btn-green"
                              disabled={busy}
                              onClick={() => void act(h.id, 'unsuspend')}
                            >
                              Unsuspend
                            </button>
                          ) : null}
                          {st === 'banned' ? (
                            <button
                              type="button"
                              className="btn-green"
                              disabled={busy}
                              onClick={() => void act(h.id, 'unban')}
                            >
                              Unban
                            </button>
                          ) : null}
                          {st === 'rejected' ? (
                            <button
                              type="button"
                              className="btn-green"
                              disabled={busy}
                              onClick={() => void act(h.id, 'approve')}
                            >
                              Re-approve
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <aside className="hm-side">
          {detail ? (
            <HostDetail
              host={detail}
              bridge={bridgeById.get(detail.id)}
              busy={busy}
              onClose={() => setDetail(null)}
              onAction={(action, extra) => void act(detail.id, action, extra)}
            />
          ) : (
            <div className="hm-audit">
              <h3>Audit log</h3>
              <p className="sub">Admin actions (realtime refresh)</p>
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
      </div>
    </div>
  );
}

function HostDetail({
  host,
  bridge,
  busy,
  onClose,
  onAction,
}: {
  host: ManagedHost;
  bridge?: BridgeHostStatus;
  busy: boolean;
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
}) {
  const photos = host.photoUrls?.length
    ? host.photoUrls
    : host.photoUrl
      ? [host.photoUrl]
      : [];

  return (
    <div className="hm-detail">
      <div className="hm-detail-top">
        <h3>{host.name}</h3>
        <button type="button" className="btn-ghost" onClick={onClose}>
          Close
        </button>
      </div>
      <div className="meta">
        {host.hostId} · {host.email || 'no email'} · {host.country || '—'}
        <br />
        Status <strong>{host.hostStatus}</strong>
        {host.rejectionReason ? ` · ${host.rejectionReason}` : ''}
        {host.docsRequested ? ` · Docs: ${host.docsRequested}` : ''}
        <br />
        User app:{' '}
        {bridge ? (
          <>
            {bridge.readyToCall
              ? 'Ready to call'
              : bridge.isLive
                ? 'Live'
                : bridge.isOnCall
                  ? 'On call'
                  : 'Online'}
            {bridge.workspaceMode ? ` · ${bridge.workspaceMode}` : ''}
          </>
        ) : (
          'Not listed (host must be Online in CoinCall)'
        )}
      </div>

      <div className="photos" style={{ marginTop: 10 }}>
        {photos.map((p) => (
          <img key={p} src={p} alt="" />
        ))}
      </div>
      {host.idDocumentUrl ? (
        <div className="meta" style={{ marginTop: 8 }}>
          ID:{' '}
          <a href={host.idDocumentUrl} target="_blank" rel="noreferrer">
            CNIC / Passport
          </a>
        </div>
      ) : null}
      {host.selfieUrl ? (
        <div className="meta">
          Selfie:{' '}
          <a href={host.selfieUrl} target="_blank" rel="noreferrer">
            Open
          </a>
        </div>
      ) : null}
      {host.videoUrl ? (
        <div className="meta">
          Video preview
          <video
            src={host.videoUrl}
            controls
            playsInline
            style={{
              width: '100%',
              maxHeight: 220,
              borderRadius: 12,
              background: '#000',
              marginTop: 6,
              display: 'block',
            }}
          />
        </div>
      ) : null}

      <p className="hm-bio">{host.bio || 'No bio'}</p>
      <div className="meta">
        Languages: {(host.languages || []).join(', ') || '—'}
        <br />
        Categories: {(host.categories || []).join(', ') || '—'}
        <br />
        Call price: {host.callPrice ?? 80} coins/min
      </div>

      <h4>Monitoring</h4>
      <div className="hm-metrics">
        <div>
          <span>Calls</span>
          <b>{host.totalCalls ?? 0}</b>
        </div>
        <div>
          <span>Missed</span>
          <b>{host.missedCalls ?? 0}</b>
        </div>
        <div>
          <span>Cancelled</span>
          <b>{host.cancelledCalls ?? 0}</b>
        </div>
        <div>
          <span>Online</span>
          <b>{fmtSec(host.onlineSeconds)}</b>
        </div>
        <div>
          <span>Rating</span>
          <b>{(host.rating ?? 5).toFixed(1)}</b>
        </div>
        <div>
          <span>Reports</span>
          <b>{host.reportsReceived ?? 0}</b>
        </div>
        <div>
          <span>Revenue</span>
          <b>{host.revenueGenerated ?? 0}</b>
        </div>
      </div>

      <h4>Finance</h4>
      <div className="meta">
        Wallet {host.coinBalance ?? 0} · Pending {host.pendingEarnings ?? 0} ·
        Paid {host.paidEarnings ?? 0}
        <br />
        Commission {Math.round((host.commissionRate ?? 0.3) * 100)}% ·{' '}
        {host.walletFrozen ? 'FROZEN' : 'Active'} · Withdrawals{' '}
        {host.withdrawalsAllowed === false ? 'blocked' : 'allowed'}
      </div>

      <h4>Permissions</h4>
      <div className="actions hm-perm">
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction(host.videoCallsEnabled === false ? 'enable_video' : 'disable_video')}>
          Video {host.videoCallsEnabled === false ? 'OFF' : 'ON'}
        </button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction(host.voiceCallsEnabled === false ? 'enable_voice' : 'disable_voice')}>
          Voice {host.voiceCallsEnabled === false ? 'OFF' : 'ON'}
        </button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction(host.giftsEnabled === false ? 'enable_gifts' : 'disable_gifts')}>
          Gifts {host.giftsEnabled === false ? 'OFF' : 'ON'}
        </button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction(host.withdrawalsAllowed === false ? 'allow_withdrawals' : 'block_withdrawals')}>
          Withdraw {host.withdrawalsAllowed === false ? 'blocked' : 'ok'}
        </button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction(host.callsEnabled === false ? 'enable_calls' : 'disable_calls')}>
          Calls {host.callsEnabled === false ? 'disabled' : 'enabled'}
        </button>
      </div>

      <h4>Controls</h4>
      <div className="actions hm-perm">
        {host.hostStatus === 'pending' || host.hostStatus === 'under_review' ? (
          <>
            <button type="button" disabled={busy} className="btn-green" onClick={() => onAction('approve')}>Approve</button>
            <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction('under_review')}>Under review</button>
            <button type="button" disabled={busy} className="btn-gold" onClick={() => {
              const docsMessage = window.prompt('Request documents') || '';
              if (docsMessage) onAction('request_docs', { docsMessage });
            }}>Request docs</button>
            <button type="button" disabled={busy} className="btn-gold" onClick={() => {
              const reason = window.prompt('Reject reason') || '';
              onAction('reject', { reason });
            }}>Reject</button>
          </>
        ) : null}
        {host.hostStatus === 'rejected' ? (
          <button type="button" disabled={busy} className="btn-green" onClick={() => onAction('approve')}>Re-approve</button>
        ) : null}
        {host.hostStatus === 'approved' ? (
          <>
            <button type="button" disabled={busy} className="btn-gold" onClick={() => onAction('suspend', { reason: 'Suspended by admin' })}>Suspend</button>
            <button type="button" disabled={busy} className="btn-red" onClick={() => onAction('ban', { reason: 'Banned by admin' })}>Ban</button>
          </>
        ) : null}
        {host.hostStatus === 'suspended' ? (
          <button type="button" disabled={busy} className="btn-green" onClick={() => onAction('unsuspend')}>Unsuspend</button>
        ) : null}
        {host.hostStatus === 'banned' ? (
          <button type="button" disabled={busy} className="btn-green" onClick={() => onAction('unban')}>Unban</button>
        ) : null}
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction('force_offline')}>Force offline</button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction('force_online')}>Force online</button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction('reset_profile')}>Reset profile</button>
        <button type="button" disabled={busy} className="btn-red" onClick={() => {
          if (window.confirm('Reset earnings per platform policy?')) {
            onAction('reset_earnings', { reason: 'Platform policy reset' });
          }
        }}>Reset earnings</button>
        <button type="button" disabled={busy} className="btn-gold" onClick={() => onAction(host.walletFrozen ? 'unfreeze_wallet' : 'freeze_wallet')}>
          {host.walletFrozen ? 'Unfreeze wallet' : 'Freeze wallet'}
        </button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => {
          const n = window.prompt('Commission rate 0-1', String(host.commissionRate ?? 0.3));
          if (n != null) onAction('set_commission', { commissionRate: Number(n) });
        }}>Set commission</button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => {
          const n = window.prompt('Coin balance', String(host.coinBalance ?? 0));
          if (n != null) onAction('set_coins', { coinBalance: Number(n) });
        }}>Set coins</button>
      </div>

      <h4>Login / device</h4>
      <div className="meta">
        {host.deviceInfo?.platform || '—'} · {host.deviceInfo?.model || '—'} ·{' '}
        {host.deviceInfo?.appVersion || '—'}
        <br />
        IP {host.deviceInfo?.lastIp || '—'}
      </div>
      <ul className="hm-logins">
        {(host.loginHistory || []).slice(0, 8).map((l, i) => (
          <li key={`${l.at}-${i}`}>
            {new Date(l.at).toLocaleString()} · {l.device || 'device'} · {l.ip || 'ip'}
          </li>
        ))}
      </ul>
    </div>
  );
}

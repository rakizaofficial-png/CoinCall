import { useEffect, useMemo, useState } from 'react';
import type { HostRow } from '../api';
import {
  exportHostsCsv,
  fetchAuditLogs,
  fetchManagedHosts,
  mergeFirebaseHosts,
  runBulkHostAction,
  runHostAction,
  syncHostsToServer,
  type AuditLog,
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
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const hosts = useMemo(
    () => mergeFirebaseHosts(firebaseHosts, managed),
    [firebaseHosts, managed],
  );

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

  const refreshServer = async () => {
    try {
      await syncHostsToServer(firebaseHosts as ManagedHost[]);
      const data = await fetchManagedHosts({ q: query, status, sort });
      setManaged(data.hosts || []);
      const audit = await fetchAuditLogs(60);
      setLogs(audit.logs || []);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Server sync failed — using Firebase only');
    }
  };

  useEffect(() => {
    void refreshServer();
    const t = setInterval(() => void refreshServer(), 12000);
    return () => clearInterval(t);
  }, [firebaseHosts.length]);

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
      await runHostAction(id, action, {
        ...extra,
        name: host?.name,
        hostId: host?.hostId,
      });
      setMsg(`${action} · ${host?.name || id}`);
      await refreshServer();
      if (detail?.id === id) {
        const updated = mergeFirebaseHosts(firebaseHosts, managed).find((h) => h.id === id);
        if (updated) setDetail(updated);
      }
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
        <div className="list hm-list">
          {filtered.length === 0 ? (
            <div className="meta">No hosts match filters</div>
          ) : (
            filtered.map((h) => {
              const photos = h.photoUrls?.length
                ? h.photoUrls
                : h.photoUrl
                  ? [h.photoUrl]
                  : [];
              return (
                <div className="card hm-card" key={h.id}>
                  <label className="hm-check">
                    <input
                      type="checkbox"
                      checked={selected.has(h.id)}
                      onChange={() => toggle(h.id)}
                    />
                  </label>
                  <img src={photos[0] || h.avatarUrl || ''} alt="" />
                  <div>
                    <h3>
                      {h.name || 'Host'} {h.hostId ? `· ${h.hostId}` : ''}
                    </h3>
                    <div className="meta">
                      <span className={`badge ${h.hostStatus || 'none'}`}>
                        {(h.hostStatus || 'none').replace('_', ' ').toUpperCase()}
                      </span>
                      {h.isOnline ? <span className="badge online">ONLINE</span> : null}
                      {h.banned ? <span className="badge rejected">BANNED</span> : null}
                      {h.walletFrozen ? (
                        <span className="badge rejected">WALLET FROZEN</span>
                      ) : null}
                      <br />
                      {h.country || '—'} · ⭐ {(h.rating ?? 5).toFixed(1)} ·{' '}
                      {h.totalCalls ?? 0} calls · {h.coinBalance ?? 0} coins
                      <br />
                      {(h.languages || []).join(', ') || 'No languages'} ·{' '}
                      {(h.categories || []).join(', ') || 'No categories'}
                    </div>
                    <div className="actions" style={{ flexDirection: 'row', marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn-pink"
                        onClick={() => setDetail(h)}
                      >
                        Open
                      </button>
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
                            window.prompt('Reject reason?') || 'Not approved';
                          void act(h.id, 'reject', { reason });
                        }}
                      >
                        Reject
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy}
                        onClick={() => {
                          const docsMessage =
                            window.prompt('Documents requested?') ||
                            'Please upload clearer CNIC/Passport and selfie.';
                          void act(h.id, 'request_docs', { docsMessage });
                        }}
                      >
                        Request docs
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>

        <aside className="hm-side">
          {detail ? (
            <HostDetail
              host={detail}
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
  busy,
  onClose,
  onAction,
}: {
  host: ManagedHost;
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
        <button type="button" disabled={busy} className="btn-gold" onClick={() => onAction('suspend', { reason: 'Suspended by admin' })}>Suspend</button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction('unsuspend')}>Unsuspend</button>
        <button type="button" disabled={busy} className="btn-red" onClick={() => onAction('ban', { reason: 'Banned by admin' })}>Ban</button>
        <button type="button" disabled={busy} className="btn-ghost" onClick={() => onAction('unban')}>Unban</button>
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

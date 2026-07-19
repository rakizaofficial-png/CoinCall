import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import AgoraRTC, { type IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import {
  adminLogin,
  endCallRemote,
  fetchAdminReports,
  fetchAdminWithdrawals,
  fetchMonitorToken,
  listenActiveCalls,
  listenHosts,
  listenReports,
  resolveAdminReport,
  resolveFirebaseReport,
  sendControl,
  setHostOnline,
  setWithdrawalStatus,
  type ActiveCall,
  type HostRow,
  type ReportAdminRow,
  type WithdrawalRow,
} from './api';
import { HostManagementPanel } from './components/HostManagement';
import { UsersWalletsPanel } from './components/UsersWallets';
import { adminKey, agoraAppId, firebaseReady } from './firebase';
import './styles.css';

type Tab =
  | 'dashboard'
  | 'hosts'
  | 'users'
  | 'calls'
  | 'control'
  | 'payouts'
  | 'reports';
type AdminRole = 'super_admin' | 'moderator' | 'finance' | 'support';

function formatClock(sec = 0) {
  const m = Math.floor(sec / 60)
    .toString()
    .padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

function Icon({ d }: { d: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d={d} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

const ICONS: Record<Tab, string> = {
  dashboard: 'M3 12l9-9 9 9M5 10v10h14V10',
  hosts: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  users: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  calls: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
  payouts: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  reports: 'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  control: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 01-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 01-4 0v-.09A1.65 1.65 0 009 19.4a1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 01-2.83-2.83l.06-.06A1.65 1.65 0 004.68 15a1.65 1.65 0 00-1.51-1H3a2 2 0 010-4h.09A1.65 1.65 0 004.6 9a1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 012.83-2.83l.06.06A1.65 1.65 0 009 4.68a1.65 1.65 0 001-1.51V3a2 2 0 014 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 012.83 2.83l-.06.06A1.65 1.65 0 0019.4 9a1.65 1.65 0 001.51 1H21a2 2 0 010 4h-.09a1.65 1.65 0 00-1.51 1z',
};

function PageHead({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-head">
      <div>
        <h2>{title}</h2>
        <p className="sub">{subtitle}</p>
      </div>
      {action}
    </div>
  );
}

/** Modern web-based CoinCall control center */
export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('cc_admin') === '1');
  const [key, setKey] = useState(adminKey);
  const [adminRole, setAdminRole] = useState<AdminRole>(
    () => (localStorage.getItem('cc_admin_role') as AdminRole) || 'super_admin',
  );
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [monitor, setMonitor] = useState<ActiveCall | null>(null);
  const [monitorStatus, setMonitorStatus] = useState('');
  const [withdrawals, setWithdrawals] = useState<WithdrawalRow[]>([]);
  const [reports, setReports] = useState<ReportAdminRow[]>([]);
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const hostVideoRef = useRef<HTMLDivElement>(null);
  const peerVideoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authed || !firebaseReady) return;
    const u1 = listenHosts(setHosts);
    const u2 = listenActiveCalls(setCalls);
    const u3 = listenReports(setReports);
    return () => {
      u1();
      u2();
      u3();
    };
  }, [authed]);

  useEffect(() => {
    if (!authed || (tab !== 'payouts' && tab !== 'dashboard')) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchAdminWithdrawals();
        if (!cancelled) setWithdrawals(data.withdrawals || []);
      } catch {
        if (!cancelled) setWithdrawals([]);
      }
    };
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [authed, tab]);

  useEffect(() => {
    if (!authed || tab !== 'reports') return;
    void fetchAdminReports()
      .then((data) => {
        if (data.reports?.length) {
          setReports((prev) => {
            const map = new Map<string, ReportAdminRow>();
            [...prev, ...data.reports].forEach((r) => map.set(r.id, r));
            return Array.from(map.values()).sort(
              (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
            );
          });
        }
      })
      .catch(() => undefined);
  }, [authed, tab]);

  useEffect(() => {
    if (!monitor) return;
    let dead = false;
    (async () => {
      try {
        setMonitorStatus('Joining silently…');
        await leaveMonitor();
        const uid = 900000 + Math.floor(Math.random() * 9999);
        const token = await fetchMonitorToken(monitor.channel, uid);
        const client = AgoraRTC.createClient({ mode: 'rtc', codec: 'vp8' });
        clientRef.current = client;
        let slot = 0;
        client.on('user-published', async (user, mediaType) => {
          await client.subscribe(user, mediaType);
          if (mediaType === 'video' && user.videoTrack) {
            const el = slot === 0 ? hostVideoRef.current : peerVideoRef.current;
            slot += 1;
            if (el) user.videoTrack.play(el);
          }
          if (mediaType === 'audio' && user.audioTrack) user.audioTrack.play();
        });
        await client.join(
          token.appId || agoraAppId,
          monitor.channel,
          token.token,
          uid,
        );
        if (!dead) setMonitorStatus('Silent monitor ON · host cannot see you');
      } catch (e) {
        if (!dead)
          setMonitorStatus(e instanceof Error ? e.message : 'Monitor failed');
      }
    })();
    return () => {
      dead = true;
      void leaveMonitor();
    };
  }, [monitor?.id, monitor?.channel]);

  async function leaveMonitor() {
    const client = clientRef.current;
    clientRef.current = null;
    if (!client) return;
    try {
      await client.leave();
    } catch {
      /* ignore */
    }
  }

  const stats = useMemo(() => {
    const pending = hosts.filter(
      (h) => h.hostStatus === 'pending' || h.hostStatus === 'under_review',
    ).length;
    const approved = hosts.filter((h) => h.hostStatus === 'approved').length;
    const online = hosts.filter((h) => h.isOnline).length;
    const banned = hosts.filter(
      (h) => h.banned || h.hostStatus === 'banned',
    ).length;
    const openPayouts = withdrawals.filter((w) => w.status !== 'paid').length;
    const openReports = reports.filter((r) => r.status !== 'resolved').length;
    return {
      total: hosts.length,
      pending,
      approved,
      online,
      banned,
      liveCalls: calls.length,
      openPayouts,
      openReports,
    };
  }, [hosts, calls, withdrawals, reports]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      await adminLogin(key.trim(), adminRole);
      localStorage.setItem('cc_admin', '1');
      localStorage.setItem('cc_admin_key', key.trim());
      localStorage.setItem('cc_admin_role', adminRole);
      localStorage.setItem('cc_admin_id', `admin_${adminRole}`);
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  const navItems: {
    id: Tab;
    label: string;
    count?: number;
    group: string;
  }[] = [
    { id: 'dashboard', label: 'Overview', group: 'Main' },
    { id: 'hosts', label: 'Hosts', count: stats.total, group: 'Main' },
    { id: 'users', label: 'Luma users', group: 'Main' },
    { id: 'calls', label: 'Live calls', count: stats.liveCalls, group: 'Live' },
    { id: 'control', label: 'Remote control', group: 'Live' },
    {
      id: 'payouts',
      label: 'Payouts',
      count: stats.openPayouts,
      group: 'Finance',
    },
    {
      id: 'reports',
      label: 'Reports',
      count: stats.openReports,
      group: 'Finance',
    },
  ];

  if (!authed) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={onLogin}>
          <p className="login-eyebrow">Web control center</p>
          <h1>CoinCall Admin</h1>
          <p>Manage hosts, Luma wallets, live calls, payouts, and silent monitor from the browser.</p>
          <label htmlFor="admin-key">Admin key</label>
          <input
            id="admin-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Enter admin key"
            autoFocus
          />
          <label htmlFor="admin-role">Role</label>
          <select
            id="admin-role"
            value={adminRole}
            onChange={(e) => setAdminRole(e.target.value as AdminRole)}
          >
            <option value="super_admin">Super Admin</option>
            <option value="moderator">Moderator</option>
            <option value="finance">Finance</option>
            <option value="support">Support</option>
          </select>
          <button type="submit">Enter admin panel</button>
          {loginError ? <div className="error">{loginError}</div> : null}
          <p className="login-hint">
            Default key: <code>coincall-admin</code> · runs on web
          </p>
        </form>
      </div>
    );
  }

  let lastGroup = '';

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">CC</div>
          <div className="brand-text">
            <strong>CoinCall</strong>
            <span>Admin · Web</span>
          </div>
        </div>
        <div className="side-role">{adminRole.replace('_', ' ')}</div>

        <nav className="nav-group">
          {navItems.map((item) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {showGroup ? <div className="nav-label">{item.group}</div> : null}
                <button
                  type="button"
                  className={`nav-btn ${tab === item.id ? 'active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  <Icon d={ICONS[item.id]} />
                  {item.label}
                  {typeof item.count === 'number' ? (
                    <span className="nav-count">{item.count}</span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </nav>

        <button
          className="logout"
          type="button"
          onClick={() => {
            localStorage.removeItem('cc_admin');
            setAuthed(false);
            setMonitor(null);
          }}
        >
          Sign out
        </button>
      </aside>

      <main className="main">
        {!firebaseReady ? (
          <div className="warn">
            Firebase keys missing in <code>admin/.env</code>. Copy host{' '}
            <code>EXPO_PUBLIC_FIREBASE_*</code> into <code>VITE_FIREBASE_*</code>{' '}
            then restart.
          </div>
        ) : null}

        {tab === 'dashboard' ? (
          <>
            <PageHead
              title="Overview"
              subtitle="Live pulse of hosts, calls, and Luma users"
            />
            <div className="stats">
              <div className="stat">
                <span>Total hosts</span>
                <b>{stats.total}</b>
              </div>
              <div className="stat gold">
                <span>Pending review</span>
                <b>{stats.pending}</b>
              </div>
              <div className="stat green">
                <span>Approved</span>
                <b>{stats.approved}</b>
              </div>
              <div className="stat teal">
                <span>Online now</span>
                <b>{stats.online}</b>
              </div>
              <div className="stat blue">
                <span>Live 1:1</span>
                <b>{stats.liveCalls}</b>
              </div>
              <div className="stat">
                <span>Open payouts</span>
                <b>{stats.openPayouts}</b>
              </div>
            </div>
            <div className="quick-grid">
              <button type="button" className="quick-card" onClick={() => setTab('hosts')}>
                <strong>Host KYC</strong>
                <span>Approve, suspend, and audit host applications</span>
              </button>
              <button type="button" className="quick-card" onClick={() => setTab('users')}>
                <strong>Luma wallets</strong>
                <span>Auto profiles, coin balances, purchase IDs</span>
              </button>
              <button type="button" className="quick-card" onClick={() => setTab('calls')}>
                <strong>Silent monitor</strong>
                <span>Join live 1:1 calls without being seen</span>
              </button>
              <button type="button" className="quick-card" onClick={() => setTab('payouts')}>
                <strong>Payout desk</strong>
                <span>Process EasyPaisa / JazzCash / bank cash-outs</span>
              </button>
            </div>
          </>
        ) : null}

        {tab === 'hosts' ? <HostManagementPanel firebaseHosts={hosts} /> : null}

        {tab === 'users' ? <UsersWalletsPanel /> : null}

        {tab === 'calls' ? (
          <>
            <PageHead
              title="Live 1:1 calls"
              subtitle="Silent video monitor — host cannot see admin"
            />
            <div className="list">
              {calls.length === 0 ? (
                <div className="empty-state">
                  No active calls. They appear here when a host starts a call.
                </div>
              ) : (
                calls.map((c) => (
                  <div
                    className="card"
                    key={c.id}
                    style={{ gridTemplateColumns: '1fr auto' }}
                  >
                    <div>
                      <h3>
                        {c.hostName} ↔ {c.peerName}
                      </h3>
                      <div className="meta">
                        <span className="badge live">LIVE</span>
                        Channel <code>{c.channel}</code>
                        <br />
                        Time {formatClock(c.seconds)} · Coins {c.coinsEarned || 0}
                      </div>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn-pink"
                        onClick={() => setMonitor(c)}
                      >
                        Enter silent
                      </button>
                      <button
                        type="button"
                        className="btn-red"
                        onClick={() => void endCallRemote(c)}
                      >
                        Force end
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {monitor ? (
              <div className="section-panel" style={{ marginTop: 20 }}>
                <PageHead
                  title={`Monitor · ${monitor.hostName}`}
                  subtitle={monitorStatus}
                  action={
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setMonitor(null);
                        void leaveMonitor();
                      }}
                    >
                      Leave
                    </button>
                  }
                />
                <div className="monitor">
                  <div className="video-box">
                    <label>Host / stream A</label>
                    <div ref={hostVideoRef} />
                  </div>
                  <div className="video-box">
                    <label>Peer / stream B</label>
                    <div ref={peerVideoRef} />
                  </div>
                </div>
              </div>
            ) : null}
          </>
        ) : null}

        {tab === 'payouts' ? (
          <>
            <PageHead
              title="Host payouts"
              subtitle="Review cash-outs · mark paid or failed"
            />
            <div className="list">
              {withdrawals.length === 0 ? (
                <div className="empty-state">No withdrawal requests yet.</div>
              ) : (
                withdrawals.map((w) => (
                  <div
                    className="card"
                    key={w.id}
                    style={{ gridTemplateColumns: '1fr auto' }}
                  >
                    <div>
                      <h3>
                        {w.amountCoins} coins · {w.gateway}
                      </h3>
                      <div className="meta">
                        Host {w.hostId} · {w.accountName} · {w.accountNumber}
                        <br />
                        Status <strong>{w.status}</strong>
                        {w.providerRef ? ` · ${w.providerRef}` : ''}
                        <br />
                        {new Date(w.createdAt).toLocaleString()}
                        {w.error ? ` · ${w.error}` : ''}
                      </div>
                    </div>
                    <div className="actions">
                      <button
                        type="button"
                        className="btn-gold"
                        onClick={() =>
                          void setWithdrawalStatus(w.id, 'processing').then(() =>
                            fetchAdminWithdrawals().then((d) =>
                              setWithdrawals(d.withdrawals || []),
                            ),
                          )
                        }
                      >
                        Processing
                      </button>
                      <button
                        type="button"
                        className="btn-green"
                        onClick={() =>
                          void setWithdrawalStatus(w.id, 'paid').then(() =>
                            fetchAdminWithdrawals().then((d) =>
                              setWithdrawals(d.withdrawals || []),
                            ),
                          )
                        }
                      >
                        Mark paid
                      </button>
                      <button
                        type="button"
                        className="btn-red"
                        onClick={() =>
                          void setWithdrawalStatus(w.id, 'failed').then(() =>
                            fetchAdminWithdrawals().then((d) =>
                              setWithdrawals(d.withdrawals || []),
                            ),
                          )
                        }
                      >
                        Fail / refund
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}

        {tab === 'reports' ? (
          <>
            <PageHead
              title="Reports"
              subtitle="Abuse and spam reports from hosts"
            />
            <div className="list">
              {reports.length === 0 ? (
                <div className="empty-state">No reports.</div>
              ) : (
                reports.map((r) => (
                  <div
                    className="card"
                    key={r.id}
                    style={{ gridTemplateColumns: '1fr auto' }}
                  >
                    <div>
                      <h3>
                        {r.reason} · {r.status}
                      </h3>
                      <div className="meta">
                        From {r.reporterName || r.reporterId} → target {r.targetId}
                        <br />
                        {r.details || 'No details'}
                        <br />
                        {new Date(r.createdAt).toLocaleString()}
                      </div>
                    </div>
                    <div className="actions">
                      {r.status !== 'resolved' ? (
                        <button
                          type="button"
                          className="btn-green"
                          onClick={() =>
                            void (async () => {
                              try {
                                await resolveFirebaseReport(r.id);
                              } catch {
                                await resolveAdminReport(r.id);
                              }
                              setReports((list) =>
                                list.map((x) =>
                                  x.id === r.id
                                    ? { ...x, status: 'resolved' }
                                    : x,
                                ),
                              );
                            })()
                          }
                        >
                          Resolve
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        ) : null}

        {tab === 'control' ? (
          <>
            <PageHead
              title="Remote control"
              subtitle="Push commands into any approved host app"
            />
            <div className="list">
              {hosts.filter((h) => h.hostStatus === 'approved').length === 0 ? (
                <div className="empty-state">No approved hosts yet.</div>
              ) : (
                hosts
                  .filter((h) => h.hostStatus === 'approved')
                  .map((h) => (
                    <div
                      className="card"
                      key={h.id}
                      style={{ gridTemplateColumns: '64px 1fr' }}
                    >
                      <img src={h.photoUrl || h.avatarUrl || ''} alt="" />
                      <div>
                        <h3>
                          {h.name} · {h.hostId}
                        </h3>
                        <div
                          className="actions"
                          style={{ flexDirection: 'row', marginTop: 8 }}
                        >
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() =>
                              void sendControl(h.id, {
                                type: 'message',
                                message:
                                  'Please keep beauty filter on and stay longer on calls.',
                              })
                            }
                          >
                            Send tip
                          </button>
                          <button
                            type="button"
                            className="btn-gold"
                            onClick={() => void setHostOnline(h.id, true)}
                          >
                            Force online
                          </button>
                          <button
                            type="button"
                            className="btn-ghost"
                            onClick={() => void setHostOnline(h.id, false)}
                          >
                            Force offline
                          </button>
                          <button
                            type="button"
                            className="btn-red"
                            onClick={() =>
                              void sendControl(h.id, {
                                type: 'end_call',
                                message: 'Admin ended your call.',
                              })
                            }
                          >
                            End their call
                          </button>
                        </div>
                      </div>
                    </div>
                  ))
              )}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

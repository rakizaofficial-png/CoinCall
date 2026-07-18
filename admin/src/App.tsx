import { useEffect, useMemo, useRef, useState } from 'react';
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
import { adminKey, agoraAppId, firebaseReady } from './firebase';
import './styles.css';

type Tab = 'dashboard' | 'hosts' | 'calls' | 'control' | 'payouts' | 'reports';
type AdminRole = 'super_admin' | 'moderator' | 'finance' | 'support';

function formatClock(sec = 0) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

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
    if (!authed || tab !== 'payouts') return;
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
        await client.join(token.appId || agoraAppId, monitor.channel, token.token, uid);
        // No publish → host cannot see admin
        if (!dead) setMonitorStatus('Silent monitor ON · host cannot see you');
      } catch (e) {
        if (!dead) setMonitorStatus(e instanceof Error ? e.message : 'Monitor failed');
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
    const banned = hosts.filter((h) => h.banned || h.hostStatus === 'banned').length;
    return { total: hosts.length, pending, approved, online, banned, liveCalls: calls.length };
  }, [hosts, calls]);

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

  if (!authed) {
    return (
      <div className="login-wrap">
        <form className="login-card" onSubmit={onLogin}>
          <h1>CoinCall Admin</h1>
          <p>Host management · approvals · finance · silent monitor</p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin key"
            autoFocus
          />
          <select
            value={adminRole}
            onChange={(e) => setAdminRole(e.target.value as AdminRole)}
            style={{ width: '100%', marginTop: 10, padding: 10, borderRadius: 10 }}
          >
            <option value="super_admin">Super Admin</option>
            <option value="moderator">Moderator</option>
            <option value="finance">Finance</option>
            <option value="support">Support</option>
          </select>
          <button type="submit">Enter Admin Panel</button>
          {loginError ? <div className="error">{loginError}</div> : null}
          <p style={{ marginTop: 14, fontSize: 12 }}>
            Default key: <code>coincall-admin</code>
          </p>
        </form>
      </div>
    );
  }

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          CoinCall <span>Admin</span>
        </div>
        <small>
          Role: {adminRole.replace('_', ' ')} · hosts &amp; live control
        </small>
        {(
          [
            ['dashboard', 'Dashboard'],
            ['hosts', `Hosts (${stats.total})`],
            ['calls', `Live 1:1 (${stats.liveCalls})`],
            ['payouts', `Payouts (${withdrawals.filter((w) => w.status !== 'paid').length})`],
            ['reports', `Reports (${reports.filter((r) => r.status !== 'resolved').length})`],
            ['control', 'Remote Control'],
          ] as [Tab, string][]
        ).map(([id, label]) => (
          <button
            key={id}
            className={`nav-btn ${tab === id ? 'active' : ''}`}
            onClick={() => setTab(id)}
            type="button"
          >
            {label}
          </button>
        ))}
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
            Firebase keys missing in <code>admin/.env</code>. Copy from host app
            <code> EXPO_PUBLIC_FIREBASE_*</code> into <code>VITE_FIREBASE_*</code> then restart
            admin.
          </div>
        ) : null}

        {tab === 'dashboard' ? (
          <>
            <h2>Dashboard</h2>
            <p className="sub">Live overview of the host network</p>
            <div className="stats">
              <div className="stat">
                <span>Total hosts</span>
                <b>{stats.total}</b>
              </div>
              <div className="stat">
                <span>Pending / review</span>
                <b>{stats.pending}</b>
              </div>
              <div className="stat">
                <span>Approved</span>
                <b>{stats.approved}</b>
              </div>
              <div className="stat">
                <span>Online now</span>
                <b>{stats.online}</b>
              </div>
              <div className="stat">
                <span>Banned</span>
                <b>{stats.banned}</b>
              </div>
              <div className="stat">
                <span>Live 1:1 calls</span>
                <b>{stats.liveCalls}</b>
              </div>
            </div>
            <div className="warn">
              Use <strong>Hosts</strong> for full management: KYC review, bulk actions,
              permissions, finance, monitoring, and audit logs.
            </div>
          </>
        ) : null}

        {tab === 'hosts' ? <HostManagementPanel firebaseHosts={hosts} /> : null}

        {tab === 'calls' ? (
          <>
            <h2>Live 1:1 Calls</h2>
            <p className="sub">Enter behind the host — silent video monitor</p>
            <div className="list">
              {calls.length === 0 ? (
                <div className="meta">No active calls. When a host starts a call, it appears here.</div>
              ) : (
                calls.map((c) => (
                  <div className="card" key={c.id} style={{ gridTemplateColumns: '1fr auto' }}>
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
              <div style={{ marginTop: 20 }}>
                <h3>
                  Silent monitor · {monitor.hostName}{' '}
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ marginLeft: 8 }}
                    onClick={() => {
                      setMonitor(null);
                      void leaveMonitor();
                    }}
                  >
                    Leave
                  </button>
                </h3>
                <div className="meta" style={{ marginBottom: 8 }}>
                  {monitorStatus}
                </div>
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
            <h2>Host payouts</h2>
            <p className="sub">Review cash-outs · mark paid / failed</p>
            <div className="list">
              {withdrawals.length === 0 ? (
                <div className="card">No withdrawal requests yet.</div>
              ) : (
                withdrawals.map((w) => (
                  <div className="card" key={w.id} style={{ gridTemplateColumns: '1fr auto' }}>
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
            <h2>Reports</h2>
            <p className="sub">Host-submitted abuse / spam reports</p>
            <div className="list">
              {reports.length === 0 ? (
                <div className="card">No reports.</div>
              ) : (
                reports.map((r) => (
                  <div className="card" key={r.id} style={{ gridTemplateColumns: '1fr auto' }}>
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
                                  x.id === r.id ? { ...x, status: 'resolved' } : x,
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
            <h2>Remote Control</h2>
            <p className="sub">Push commands into any host app instantly</p>
            <div className="list">
              {hosts
                .filter((h) => h.hostStatus === 'approved')
                .map((h) => (
                  <div className="card" key={h.id} style={{ gridTemplateColumns: '64px 1fr' }}>
                    <img src={h.photoUrl || h.avatarUrl || ''} alt="" />
                    <div>
                      <h3>
                        {h.name} · {h.hostId}
                      </h3>
                      <div className="actions" style={{ flexDirection: 'row', marginTop: 8 }}>
                        <button
                          type="button"
                          className="btn-ghost"
                          onClick={() =>
                            void sendControl(h.id, {
                              type: 'message',
                              message: 'Please keep beauty filter on and stay longer on calls.',
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
                ))}
            </div>
          </>
        ) : null}
      </main>
    </div>
  );
}

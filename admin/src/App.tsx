import { useEffect, useMemo, useRef, useState } from 'react';
import AgoraRTC, { type IAgoraRTCClient } from 'agora-rtc-sdk-ng';
import {
  adminLogin,
  approveHost,
  banHost,
  endCallRemote,
  fetchMonitorToken,
  listenActiveCalls,
  listenHosts,
  rejectHost,
  sendControl,
  setHostCoins,
  setHostOnline,
  type ActiveCall,
  type HostRow,
} from './api';
import { adminKey, agoraAppId, firebaseReady } from './firebase';
import './styles.css';

type Tab = 'dashboard' | 'pending' | 'hosts' | 'calls' | 'control';

function formatClock(sec = 0) {
  const m = Math.floor(sec / 60).toString().padStart(2, '0');
  const s = (sec % 60).toString().padStart(2, '0');
  return `${m}:${s}`;
}

export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('cc_admin') === '1');
  const [key, setKey] = useState(adminKey);
  const [loginError, setLoginError] = useState('');
  const [tab, setTab] = useState<Tab>('dashboard');
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [calls, setCalls] = useState<ActiveCall[]>([]);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'online'>('all');
  const [monitor, setMonitor] = useState<ActiveCall | null>(null);
  const [monitorStatus, setMonitorStatus] = useState('');
  const clientRef = useRef<IAgoraRTCClient | null>(null);
  const hostVideoRef = useRef<HTMLDivElement>(null);
  const peerVideoRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!authed || !firebaseReady) return;
    const u1 = listenHosts(setHosts);
    const u2 = listenActiveCalls(setCalls);
    return () => {
      u1();
      u2();
    };
  }, [authed]);

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
    const pending = hosts.filter((h) => h.hostStatus === 'pending').length;
    const approved = hosts.filter((h) => h.hostStatus === 'approved').length;
    const online = hosts.filter((h) => h.isOnline).length;
    return { total: hosts.length, pending, approved, online, liveCalls: calls.length };
  }, [hosts, calls]);

  const filteredHosts = useMemo(() => {
    return hosts.filter((h) => {
      if (filter === 'pending') return h.hostStatus === 'pending';
      if (filter === 'approved') return h.hostStatus === 'approved';
      if (filter === 'rejected') return h.hostStatus === 'rejected';
      if (filter === 'online') return !!h.isOnline;
      return true;
    });
  }, [hosts, filter]);

  const pendingHosts = hosts.filter((h) => h.hostStatus === 'pending');

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      await adminLogin(key.trim());
      localStorage.setItem('cc_admin', '1');
      localStorage.setItem('cc_admin_key', key.trim());
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
          <p>Full control panel for hosts, approvals, and silent 1:1 video monitor.</p>
          <input
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder="Admin key"
            autoFocus
          />
          <button type="submit">Enter Admin Panel</button>
          {loginError ? <div className="error">{loginError}</div> : null}
          <p style={{ marginTop: 14, fontSize: 12 }}>
            Default key: <code>coincall-admin</code> · API must be running on port 3000
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
        <small>Control hosts · silent live · approvals</small>
        {(
          [
            ['dashboard', 'Dashboard'],
            ['pending', `Approvals (${stats.pending})`],
            ['hosts', 'All Hosts'],
            ['calls', `Live 1:1 (${stats.liveCalls})`],
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
            <p className="sub">Live overview of the beauty host network</p>
            <div className="stats">
              <div className="stat">
                <span>Total hosts</span>
                <b>{stats.total}</b>
              </div>
              <div className="stat">
                <span>Pending approval</span>
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
                <span>Live 1:1 calls</span>
                <b>{stats.liveCalls}</b>
              </div>
            </div>
            <div className="warn">
              Silent monitor joins Agora as subscriber only — host does not see admin camera or
              hear admin mic.
            </div>
          </>
        ) : null}

        {tab === 'pending' ? (
          <>
            <h2>Host Approvals</h2>
            <p className="sub">Review photo + video applications before hosting unlocks</p>
            <div className="list">
              {pendingHosts.length === 0 ? (
                <div className="meta">No pending applications</div>
              ) : (
                pendingHosts.map((h) => <HostCard key={h.id} host={h} detailed />)
              )}
            </div>
          </>
        ) : null}

        {tab === 'hosts' ? (
          <>
            <h2>All Hosts</h2>
            <p className="sub">Approve, reject, ban, coins, online force</p>
            <div className="toolbar">
              {(['all', 'pending', 'approved', 'rejected', 'online'] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`chip ${filter === f ? 'on' : ''}`}
                  onClick={() => setFilter(f)}
                >
                  {f}
                </button>
              ))}
            </div>
            <div className="list">
              {filteredHosts.map((h) => (
                <HostCard key={h.id} host={h} detailed />
              ))}
            </div>
          </>
        ) : null}

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

function HostCard({ host, detailed }: { host: HostRow; detailed?: boolean }) {
  const photos = host.photoUrls?.length
    ? host.photoUrls
    : host.photoUrl
      ? [host.photoUrl]
      : [];

  return (
    <div className="card">
      <img src={photos[0] || host.avatarUrl || ''} alt="" />
      <div>
        <h3>
          {host.name || 'Host'} {host.hostId ? `· ${host.hostId}` : ''}
        </h3>
        <div className="meta">
          <span className={`badge ${host.hostStatus || 'none'}`}>
            {(host.hostStatus || 'none').toUpperCase()}
          </span>
          {host.isOnline ? <span className="badge online">ONLINE</span> : null}
          {host.banned ? <span className="badge rejected">BANNED</span> : null}
          <br />
          {host.country || '—'} · {host.email || 'no email'} · coins {host.coinBalance ?? 0}
          {host.videoUrl ? ' · video ✓' : ' · no video'}
        </div>
        {detailed && photos.length > 0 ? (
          <div className="photos">
            {photos.map((p) => (
              <img key={p} src={p} alt="" />
            ))}
          </div>
        ) : null}
        {detailed && host.videoUrl ? (
          <div className="meta" style={{ marginTop: 8 }}>
            Video:{' '}
            <a href={host.videoUrl} target="_blank" rel="noreferrer">
              Open intro video
            </a>
          </div>
        ) : null}
      </div>
      <div className="actions">
        <button type="button" className="btn-green" onClick={() => void approveHost(host.id)}>
          Approve
        </button>
        <button
          type="button"
          className="btn-gold"
          onClick={() =>
            void rejectHost(host.id, window.prompt('Reject reason?') || 'Not approved')
          }
        >
          Reject
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => {
            const n = window.prompt('Set coin balance', String(host.coinBalance ?? 0));
            if (n != null) void setHostCoins(host.id, Number(n) || 0);
          }}
        >
          Set coins
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={() => void setHostOnline(host.id, !host.isOnline)}
        >
          {host.isOnline ? 'Force offline' : 'Force online'}
        </button>
        <button type="button" className="btn-red" onClick={() => void banHost(host.id)}>
          Ban
        </button>
      </div>
    </div>
  );
}

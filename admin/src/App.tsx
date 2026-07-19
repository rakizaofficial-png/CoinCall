import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
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
import { AgenciesPanel } from './components/AgenciesPanel';
import { AnimatedPage } from './components/AnimatedPage';
import { HostManagementPanel } from './components/HostManagement';
import { HostTypePanel } from './components/HostTypePanel';
import { RevenuePanel } from './components/RevenuePanel';
import { UsersWalletsPanel } from './components/UsersWallets';
import { adminKey, agoraAppId, firebaseReady } from './firebase';
import {
  canAccess,
  sectionsForRole,
  type AdminRole,
  type AdminSection,
  type AgencyPerms,
} from './permissions';
import './styles.css';

type Tab = AdminSection;

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

const ICONS: Partial<Record<Tab, string>> = {
  dashboard: 'M3 12l9-9 9 9M5 10v10h14V10',
  agencies: 'M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6',
  agency_hosts: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8z',
  individual_hosts: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  hosts: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zM23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  users: 'M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2M12 11a4 4 0 100-8 4 4 0 000 8z',
  revenue: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  calls: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
  payouts: 'M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6',
  reports: 'M12 9v4M12 17h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z',
  control: 'M12 15a3 3 0 100-6 3 3 0 000 6z',
};

const LABELS: Record<Tab, string> = {
  dashboard: 'Overview',
  agencies: 'Agencies',
  agency_hosts: 'Agency hosts',
  individual_hosts: 'Individual hosts',
  hosts: 'Host KYC',
  users: 'Luma users',
  revenue: 'Revenue',
  calls: 'Live calls',
  control: 'Remote control',
  payouts: 'Payouts',
  reports: 'Reports',
};

const GROUPS: Record<Tab, string> = {
  dashboard: 'Main',
  agencies: 'Network',
  agency_hosts: 'Network',
  individual_hosts: 'Network',
  hosts: 'Network',
  users: 'Network',
  revenue: 'Finance',
  payouts: 'Finance',
  reports: 'Finance',
  calls: 'Live',
  control: 'Live',
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

/** Modern agency-grade web admin control center */
export default function App() {
  const [authed, setAuthed] = useState(() => localStorage.getItem('cc_admin') === '1');
  const [loginMode, setLoginMode] = useState<'admin' | 'agency'>('admin');
  const [key, setKey] = useState(adminKey);
  const [adminRole, setAdminRole] = useState<AdminRole>(
    () => (localStorage.getItem('cc_admin_role') as AdminRole) || 'super_admin',
  );
  const [agencyId, setAgencyId] = useState<string | null>(
    () => localStorage.getItem('cc_agency_id'),
  );
  const [agencyPerms, setAgencyPerms] = useState<AgencyPerms | null>(() => {
    try {
      const raw = localStorage.getItem('cc_agency_perms');
      return raw ? (JSON.parse(raw) as AgencyPerms) : null;
    } catch {
      return null;
    }
  });
  const [agencyName, setAgencyName] = useState(
    () => localStorage.getItem('cc_agency_name') || '',
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

  const allowed = useMemo(
    () => sectionsForRole(adminRole, agencyPerms),
    [adminRole, agencyPerms],
  );

  useEffect(() => {
    if (!allowed.includes(tab)) setTab(allowed[0] || 'dashboard');
  }, [allowed, tab]);

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
    const openPayouts = withdrawals.filter((w) => w.status !== 'paid').length;
    const openReports = reports.filter((r) => r.status !== 'resolved').length;
    return {
      total: hosts.length,
      pending,
      approved,
      online,
      liveCalls: calls.length,
      openPayouts,
      openReports,
    };
  }, [hosts, calls, withdrawals, reports]);

  async function onLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginError('');
    try {
      const role = loginMode === 'agency' ? 'agency' : adminRole;
      const data = (await adminLogin(key.trim(), role)) as {
        role: AdminRole;
        agencyId?: string;
        agency?: { id: string; name: string };
        permissions?: AgencyPerms;
        adminId?: string;
      };
      localStorage.setItem('cc_admin', '1');
      localStorage.setItem('cc_admin_key', key.trim());
      localStorage.setItem('cc_admin_role', data.role || role);
      localStorage.setItem(
        'cc_admin_id',
        data.adminId || `admin_${data.role || role}`,
      );
      setAdminRole((data.role || role) as AdminRole);
      if (data.role === 'agency') {
        const aid = data.agencyId || data.agency?.id || null;
        setAgencyId(aid);
        setAgencyName(data.agency?.name || '');
        setAgencyPerms(data.permissions || null);
        if (aid) localStorage.setItem('cc_agency_id', aid);
        if (data.agency?.name)
          localStorage.setItem('cc_agency_name', data.agency.name);
        if (data.permissions)
          localStorage.setItem(
            'cc_agency_perms',
            JSON.stringify(data.permissions),
          );
      } else {
        setAgencyId(null);
        setAgencyPerms(null);
        setAgencyName('');
        localStorage.removeItem('cc_agency_id');
        localStorage.removeItem('cc_agency_name');
        localStorage.removeItem('cc_agency_perms');
      }
      setAuthed(true);
    } catch (err) {
      setLoginError(err instanceof Error ? err.message : 'Login failed');
    }
  }

  function signOut() {
    localStorage.removeItem('cc_admin');
    localStorage.removeItem('cc_agency_id');
    localStorage.removeItem('cc_agency_name');
    localStorage.removeItem('cc_agency_perms');
    setAuthed(false);
    setMonitor(null);
    setAgencyId(null);
    setAgencyPerms(null);
  }

  const navItems = allowed.map((id) => ({
    id,
    label: LABELS[id],
    group: GROUPS[id],
    count:
      id === 'hosts'
        ? stats.total
        : id === 'calls'
          ? stats.liveCalls
          : id === 'payouts'
            ? stats.openPayouts
            : id === 'reports'
              ? stats.openReports
              : undefined,
  }));

  if (!authed) {
    return (
      <div className="login-wrap">
        <motion.form
          className="login-card"
          onSubmit={onLogin}
          initial={{ opacity: 0, y: 20, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
        >
          <p className="login-eyebrow">Web control center</p>
          <h1>CoinCall Admin</h1>
          <p>
            Agency-grade panel · hosts · revenue · limited agency portal
          </p>

          <div className="login-modes">
            <button
              type="button"
              className={`login-mode ${loginMode === 'admin' ? 'on' : ''}`}
              onClick={() => setLoginMode('admin')}
            >
              Platform admin
            </button>
            <button
              type="button"
              className={`login-mode ${loginMode === 'agency' ? 'on' : ''}`}
              onClick={() => {
                setLoginMode('agency');
                setKey('agency-nova');
              }}
            >
              Agency portal
            </button>
          </div>

          <label htmlFor="admin-key">
            {loginMode === 'agency' ? 'Agency key' : 'Admin key'}
          </label>
          <input
            id="admin-key"
            type="password"
            value={key}
            onChange={(e) => setKey(e.target.value)}
            placeholder={
              loginMode === 'agency' ? 'agency-nova' : 'coincall-admin'
            }
            autoFocus
          />
          {loginMode === 'admin' ? (
            <>
              <label htmlFor="admin-role">Role</label>
              <select
                id="admin-role"
                value={adminRole === 'agency' ? 'super_admin' : adminRole}
                onChange={(e) => setAdminRole(e.target.value as AdminRole)}
              >
                <option value="super_admin">Super Admin</option>
                <option value="moderator">Moderator</option>
                <option value="finance">Finance</option>
                <option value="support">Support</option>
              </select>
            </>
          ) : null}
          <button type="submit">Enter panel</button>
          {loginError ? <div className="error">{loginError}</div> : null}
          <p className="login-hint">
            Admin: <code>coincall-admin</code> · Agency demo:{' '}
            <code>agency-nova</code> / <code>agency-luxe</code>
          </p>
        </motion.form>
      </div>
    );
  }

  let lastGroup = '';
  const isAgency = adminRole === 'agency';

  return (
    <div className="shell">
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">CC</div>
          <div className="brand-text">
            <strong>CoinCall</strong>
            <span>{isAgency ? 'Agency portal' : 'Admin · Web'}</span>
          </div>
        </div>
        <div className="side-role">
          {isAgency
            ? agencyName || 'Agency'
            : adminRole.replace('_', ' ')}
        </div>

        <nav className="nav-group">
          {navItems.map((item) => {
            const showGroup = item.group !== lastGroup;
            lastGroup = item.group;
            return (
              <div key={item.id}>
                {showGroup ? (
                  <div className="nav-label">{item.group}</div>
                ) : null}
                <button
                  type="button"
                  className={`nav-btn ${tab === item.id ? 'active' : ''}`}
                  onClick={() => setTab(item.id)}
                >
                  {ICONS[item.id] ? <Icon d={ICONS[item.id]!} /> : null}
                  {item.label}
                  {typeof item.count === 'number' ? (
                    <span className="nav-count">{item.count}</span>
                  ) : null}
                </button>
              </div>
            );
          })}
        </nav>

        <button className="logout" type="button" onClick={signOut}>
          Sign out
        </button>
      </aside>

      <main className="main">
        {isAgency ? (
          <div className="limited-banner">
            Limited agency permissions · only your hosts &amp; allowed tools
          </div>
        ) : null}

        {!firebaseReady && !isAgency ? (
          <div className="warn">
            Firebase keys missing in <code>admin/.env</code> — some realtime
            host data may be empty.
          </div>
        ) : null}

        <AnimatePresence mode="wait">
          <AnimatedPage pageKey={tab}>
            {tab === 'dashboard' ? (
              <>
                <PageHead
                  title={isAgency ? 'Agency overview' : 'Overview'}
                  subtitle={
                    isAgency
                      ? 'Your network pulse'
                      : 'Hosts · agencies · revenue · live ops'
                  }
                />
                <div className="stats">
                  <div className="stat">
                    <span>Hosts</span>
                    <b>{stats.total}</b>
                  </div>
                  <div className="stat gold">
                    <span>Pending</span>
                    <b>{stats.pending}</b>
                  </div>
                  <div className="stat green">
                    <span>Approved</span>
                    <b>{stats.approved}</b>
                  </div>
                  <div className="stat teal">
                    <span>Online</span>
                    <b>{stats.online}</b>
                  </div>
                  <div className="stat blue">
                    <span>Live 1:1</span>
                    <b>{stats.liveCalls}</b>
                  </div>
                  <div className="stat">
                    <span>Payouts</span>
                    <b>{stats.openPayouts}</b>
                  </div>
                </div>
                <div className="quick-grid">
                  {canAccess(adminRole, 'agencies', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('agencies')}
                    >
                      <strong>Agencies</strong>
                      <span>Partners · commission · portal permissions</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'agency_hosts', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('agency_hosts')}
                    >
                      <strong>Agency hosts</strong>
                      <span>Hosts managed by agencies</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'individual_hosts', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('individual_hosts')}
                    >
                      <strong>Individual hosts</strong>
                      <span>Independent creators</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'revenue', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('revenue')}
                    >
                      <strong>Revenue</strong>
                      <span>Agency vs individual earnings</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'hosts', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('hosts')}
                    >
                      <strong>Host KYC</strong>
                      <span>Approvals · audit · bulk actions</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'users', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('users')}
                    >
                      <strong>Luma users</strong>
                      <span>Wallets · purchase IDs</span>
                    </button>
                  ) : null}
                </div>
              </>
            ) : null}

            {tab === 'agencies' ? <AgenciesPanel /> : null}
            {tab === 'agency_hosts' ? (
              <HostTypePanel
                mode="agency"
                agencyId={agencyId}
                canManage={!isAgency}
              />
            ) : null}
            {tab === 'individual_hosts' ? (
              <HostTypePanel mode="individual" canManage={!isAgency} />
            ) : null}
            {tab === 'hosts' ? (
              <HostManagementPanel firebaseHosts={hosts} />
            ) : null}
            {tab === 'users' ? <UsersWalletsPanel /> : null}
            {tab === 'revenue' ? <RevenuePanel agencyId={agencyId} /> : null}

            {tab === 'calls' ? (
              <>
                <PageHead
                  title="Live 1:1 calls"
                  subtitle={
                    agencyPerms?.canMonitor
                      ? 'Silent monitor enabled for your agency'
                      : 'Live call board'
                  }
                />
                <div className="list">
                  {calls.length === 0 ? (
                    <div className="empty-state">No active calls.</div>
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
                            {formatClock(c.seconds)} · {c.coinsEarned || 0} coins
                          </div>
                        </div>
                        <div className="actions">
                          {(agencyPerms?.canMonitor || !isAgency) && (
                            <button
                              type="button"
                              className="btn-pink"
                              onClick={() => setMonitor(c)}
                            >
                              Enter silent
                            </button>
                          )}
                          {!isAgency ? (
                            <button
                              type="button"
                              className="btn-red"
                              onClick={() => void endCallRemote(c)}
                            >
                              Force end
                            </button>
                          ) : null}
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
                        <label>Host</label>
                        <div ref={hostVideoRef} />
                      </div>
                      <div className="video-box">
                        <label>Peer</label>
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
                  title="Payouts"
                  subtitle={
                    isAgency
                      ? 'Request status for your hosts'
                      : 'Mark paid / failed'
                  }
                />
                <div className="list">
                  {withdrawals.length === 0 ? (
                    <div className="empty-state">No withdrawal requests.</div>
                  ) : (
                    withdrawals.map((w) => (
                      <div
                        className="card"
                        key={w.id}
                        style={{ gridTemplateColumns: '1fr auto' }}
                      >
                        <div>
                          <h3>
                            {w.amountCoins} · {w.gateway}
                          </h3>
                          <div className="meta">
                            {w.hostId} · {w.status}
                          </div>
                        </div>
                        {!isAgency ? (
                          <div className="actions">
                            <button
                              type="button"
                              className="btn-green"
                              onClick={() =>
                                void setWithdrawalStatus(w.id, 'paid').then(
                                  () =>
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
                                void setWithdrawalStatus(w.id, 'failed').then(
                                  () =>
                                    fetchAdminWithdrawals().then((d) =>
                                      setWithdrawals(d.withdrawals || []),
                                    ),
                                )
                              }
                            >
                              Fail
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : null}

            {tab === 'reports' ? (
              <>
                <PageHead title="Reports" subtitle="Abuse / spam queue" />
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
                          <div className="meta">{r.details || 'No details'}</div>
                        </div>
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
                    ))
                  )}
                </div>
              </>
            ) : null}

            {tab === 'control' ? (
              <>
                <PageHead
                  title="Remote control"
                  subtitle="Commands into approved host apps"
                />
                <div className="list">
                  {hosts
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
                                  message: 'Please stay online longer.',
                                })
                              }
                            >
                              Tip
                            </button>
                            <button
                              type="button"
                              className="btn-gold"
                              onClick={() => void setHostOnline(h.id, true)}
                            >
                              Online
                            </button>
                            <button
                              type="button"
                              className="btn-red"
                              onClick={() =>
                                void sendControl(h.id, {
                                  type: 'end_call',
                                  message: 'Admin ended call.',
                                })
                              }
                            >
                              End call
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </>
            ) : null}
          </AnimatedPage>
        </AnimatePresence>
      </main>
    </div>
  );
}

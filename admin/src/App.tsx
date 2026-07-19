import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { fetchBridgeHosts, fetchManagedHosts } from './hostApi';
import {
  adminLogin,
  connectAdminRealtime,
  endBridgeCallAdmin,
  endCallRemote,
  fetchAdminActiveSessions,
  fetchAdminReports,
  fetchAdminWithdrawals,
  listenActiveCalls,
  listenHosts,
  listenReports,
  resolveAdminReport,
  resolveFirebaseReport,
  sendControl,
  setHostOnline,
  type ActiveCall,
  type AdminActiveCall,
  type AdminLiveRoomSession,
  type HostRow,
  type LiveRoomAdmin,
  type ReportAdminRow,
} from './api';
import { AgenciesPanel } from './components/AgenciesPanel';
import { AnimatedPage } from './components/AnimatedPage';
import { DashboardAnalytics } from './components/DashboardAnalytics';
import { ForceUpdatePanel } from './components/ForceUpdatePanel';
import { HostManagementPanel } from './components/HostManagement';
import { HostTypePanel } from './components/HostTypePanel';
import {
  LiveMonitorDock,
  type MonitorTarget,
} from './components/LiveMonitorDock';
import { MoneyDesk } from './components/MoneyDesk';
import { RevenuePanel } from './components/RevenuePanel';
import { UsersWalletsPanel } from './components/UsersWallets';
import { VideoLibraryPanel } from './components/VideoLibraryPanel';
import { adminKey, firebaseReady } from './firebase';
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
  videos: 'M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M3 8a2 2 0 012-2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V8z',
};

const LABELS: Record<Tab, string> = {
  dashboard: 'Dashboard',
  agencies: 'Agencies',
  agency_hosts: 'Agency hosts',
  individual_hosts: 'Individual hosts',
  hosts: 'Host List',
  users: 'User List',
  revenue: 'Revenue',
  calls: 'Live Monitor',
  control: 'Remote control',
  payouts: 'Financials',
  reports: 'Reports',
  videos: 'Videos',
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
  videos: 'Content',
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
  const [bridgeCalls, setBridgeCalls] = useState<AdminActiveCall[]>([]);
  const [liveRooms, setLiveRooms] = useState<LiveRoomAdmin[]>([]);
  const [bridgeLiveRooms, setBridgeLiveRooms] = useState<AdminLiveRoomSession[]>([]);
  const [monitor, setMonitor] = useState<MonitorTarget | null>(null);
  const [reports, setReports] = useState<ReportAdminRow[]>([]);
  const [theme, setTheme] = useState<'dark' | 'light'>(() =>
    (localStorage.getItem('cc_admin_theme') as 'dark' | 'light') || 'dark',
  );
  const [openPayouts, setOpenPayouts] = useState(0);
  const [bridgeHosts, setBridgeHosts] = useState<
    { id: string; name: string; readyToCall?: boolean; isOnline?: boolean; isLive?: boolean; isOnCall?: boolean; avatarUrl?: string }[]
  >([]);
  const [agencyHostIds, setAgencyHostIds] = useState<Set<string>>(new Set());

  const allowed = useMemo(
    () => sectionsForRole(adminRole, agencyPerms),
    [adminRole, agencyPerms],
  );

  useEffect(() => {
    if (!allowed.includes(tab)) setTab(allowed[0] || 'dashboard');
  }, [allowed, tab]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('cc_admin_theme', theme);
  }, [theme]);

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

  const refreshSessions = async () => {
    try {
      const data = await fetchAdminActiveSessions();
      setBridgeCalls(data.calls || []);
      setBridgeLiveRooms(data.liveRooms || []);
      setLiveRooms(
        (data.liveRooms || []).map((r) => ({
          id: r.id,
          hostId: r.hostId,
          hostName: r.hostName,
          title: r.title,
          viewers: r.viewers,
          channel: r.channel,
          giftCoins: r.giftCoins,
          thumbnailUrl: r.thumbnailUrl,
          isLive: true,
        })),
      );
    } catch {
      /* keep last */
    }
    try {
      const scopedAgency = localStorage.getItem('cc_agency_id');
      const bridge = await fetchBridgeHosts(scopedAgency);
      setBridgeHosts(bridge.hosts || []);
    } catch {
      setBridgeHosts([]);
    }
  };

  useEffect(() => {
    if (!authed || !agencyId) {
      setAgencyHostIds(new Set());
      return;
    }
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchManagedHosts({ agencyId, status: 'all' });
        if (cancelled) return;
        setAgencyHostIds(new Set((data.hosts || []).map((h) => h.id)));
      } catch {
        if (!cancelled) setAgencyHostIds(new Set());
      }
    };
    void load();
    const t = setInterval(() => void load(), 8000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [authed, agencyId]);

  useEffect(() => {
    if (!authed) return;
    let cancelled = false;
    const tick = async () => {
      if (cancelled) return;
      await refreshSessions();
    };
    void tick();
    const t = setInterval(() => void tick(), 4000);
    const off = connectAdminRealtime((type) => {
      if (
        type === 'host:presence' ||
        type === 'host:updated' ||
        type === 'live:room' ||
        type === 'live:ended' ||
        type === 'call:updated' ||
        type === 'call:ended'
      ) {
        void refreshSessions();
      }
    });
    return () => {
      cancelled = true;
      clearInterval(t);
      off();
    };
  }, [authed]);

  useEffect(() => {
    if (!authed || (tab !== 'payouts' && tab !== 'dashboard')) return;
    let cancelled = false;
    const load = async () => {
      try {
        const data = await fetchAdminWithdrawals();
        if (!cancelled) {
          const list = data.withdrawals || [];
          setOpenPayouts(
            list.filter((w) => w.status !== 'paid' && w.status !== 'failed')
              .length,
          );
        }
      } catch {
        if (!cancelled) setOpenPayouts(0);
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

  const stats = useMemo(() => {
    const pending = hosts.filter(
      (h) => h.hostStatus === 'pending' || h.hostStatus === 'under_review',
    ).length;
    const approved = hosts.filter((h) => h.hostStatus === 'approved').length;
    const online = Math.max(
      hosts.filter((h) => h.isOnline).length,
      bridgeHosts.filter((h) => h.isOnline).length,
    );
    const openReports = reports.filter((r) => r.status !== 'resolved').length;
    const liveCalls = Math.max(calls.length, bridgeCalls.length);
    const liveStreams = Math.max(liveRooms.length, bridgeLiveRooms.length);
    return {
      total: hosts.length,
      pending,
      approved,
      online,
      liveCalls,
      liveStreams,
      openPayouts,
      openReports,
    };
  }, [hosts, calls, bridgeCalls, liveRooms, bridgeLiveRooms, bridgeHosts, openPayouts, reports]);

  const monitorLiveRoomsRaw = bridgeLiveRooms.length
    ? bridgeLiveRooms
    : liveRooms.map((r) => ({
        id: r.id,
        kind: 'live' as const,
        channel: r.channel || `live_${r.hostId || r.id}`,
        hostId: r.hostId || '',
        hostName: r.hostName || 'Host',
        title: r.title || 'Live',
        viewers: r.viewers || 0,
        giftCoins: r.giftCoins || 0,
        thumbnailUrl: r.thumbnailUrl,
        status: 'live',
      }));

  const monitorCallsRaw: Array<AdminActiveCall | (ActiveCall & { kind?: 'call' })> =
    bridgeCalls.length > 0
      ? bridgeCalls
      : calls.map((c) => ({ ...c, kind: 'call' as const }));

  const monitorLiveRooms =
    agencyId && agencyHostIds.size
      ? monitorLiveRoomsRaw.filter((r) => agencyHostIds.has(r.hostId || ''))
      : agencyId
        ? []
        : monitorLiveRoomsRaw;

  const monitorCalls =
    agencyId && agencyHostIds.size
      ? monitorCallsRaw.filter((c) => {
          const hid =
            'hostId' in c ? String((c as { hostId?: string }).hostId || '') : '';
          return agencyHostIds.has(hid);
        })
      : agencyId
        ? []
        : monitorCallsRaw;

  const remoteHosts = useMemo(() => {
    const byId = new Map<string, HostRow & { readyToCall?: boolean; isLive?: boolean; isOnCall?: boolean }>();
    for (const h of hosts) {
      if (h.hostStatus === 'approved') byId.set(h.id, h);
    }
    for (const b of bridgeHosts) {
      const prev = byId.get(b.id);
      byId.set(b.id, {
        ...(prev || { id: b.id, name: b.name, hostStatus: 'approved' }),
        name: b.name || prev?.name,
        avatarUrl: b.avatarUrl || prev?.avatarUrl,
        photoUrl: prev?.photoUrl,
        isOnline: b.isOnline,
        readyToCall: b.readyToCall,
        isLive: b.isLive,
        isOnCall: b.isOnCall,
        hostStatus: 'approved',
      });
    }
    return [...byId.values()];
  }, [hosts, bridgeHosts]);

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
          ? stats.liveCalls + stats.liveStreams
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
    <div className={`shell ${monitor ? 'shell-monitor-open' : ''}`} data-theme={theme}>
      <aside className="side">
        <div className="brand">
          <div className="brand-mark">CC</div>
          <div className="brand-text">
            <strong>CoinCall</strong>
            <span>{isAgency ? 'Agency portal' : 'Super Admin'}</span>
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

        <div className="side-footer">
          <button
            type="button"
            className="theme-toggle"
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? 'Light mode' : 'Dark mode'}
          </button>
          <button className="logout" type="button" onClick={signOut}>
            Sign out
          </button>
        </div>
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
                  title={isAgency ? 'Agency dashboard' : 'Super Admin dashboard'}
                  subtitle={
                    isAgency
                      ? 'Your hosts · earnings · withdrawals'
                      : 'Active hosts · users · live · revenue'
                  }
                />
                <DashboardAnalytics
                  isAgency={isAgency}
                  hostOnline={stats.online}
                  liveCalls={stats.liveCalls}
                  openPayouts={stats.openPayouts}
                />
                <div className="quick-grid">
                  {canAccess(adminRole, 'agencies', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('agencies')}
                    >
                      <strong>Agencies</strong>
                      <span>Create · commission · portal permissions</span>
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
                  {canAccess(adminRole, 'hosts', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('hosts')}
                    >
                      <strong>Host List</strong>
                      <span>Approve · KYC · ban · wallet</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'users', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('users')}
                    >
                      <strong>User List</strong>
                      <span>Wallets · suspend · ban</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'calls', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('calls')}
                    >
                      <strong>Live Monitor</strong>
                      <span>Silent watch · streams &amp; 1:1</span>
                    </button>
                  ) : null}
                  {canAccess(adminRole, 'payouts', agencyPerms) ? (
                    <button
                      type="button"
                      className="quick-card"
                      onClick={() => setTab('payouts')}
                    >
                      <strong>Financials</strong>
                      <span>Money Desk · pending / approved</span>
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
                </div>
              </>
            ) : null}

            {tab === 'agencies' ? (
              <AgenciesPanel
                onOpenHosts={() => setTab('agency_hosts')}
                onOpenRevenue={() => setTab('revenue')}
              />
            ) : null}
            {tab === 'agency_hosts' ? (
              isAgency ? (
                <HostManagementPanel
                  firebaseHosts={hosts}
                  agencyId={agencyId}
                  canAct={!!agencyPerms?.canManageHosts}
                  title="Agency hosts"
                  subtitle="Live presence · earnings · lifecycle for your linked hosts only"
                />
              ) : (
                <HostTypePanel mode="agency" canManage />
              )
            ) : null}
            {tab === 'individual_hosts' ? (
              <HostTypePanel mode="individual" canManage={!isAgency} />
            ) : null}
            {tab === 'hosts' ? (
              <HostManagementPanel firebaseHosts={hosts} />
            ) : null}
            {tab === 'users' ? <UsersWalletsPanel /> : null}
            {tab === 'videos' ? <VideoLibraryPanel /> : null}
            {tab === 'revenue' ? <RevenuePanel agencyId={agencyId} /> : null}

            {tab === 'calls' ? (
              <>
                <PageHead
                  title="Live Monitor"
                  subtitle={`${monitorLiveRooms.length} streams · ${monitorCalls.length} private calls · silent Agora watch`}
                />
                <h3 className="section-title">
                  Live streams ({monitorLiveRooms.length})
                </h3>
                <div className="desk-table-wrap">
                  {monitorLiveRooms.length === 0 ? (
                    <div className="empty-state">No live streams right now.</div>
                  ) : (
                    <table className="desk-table">
                      <thead>
                        <tr>
                          <th>Host</th>
                          <th>Title</th>
                          <th>Viewers</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monitorLiveRooms.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.hostName || 'Host'}</strong>
                            </td>
                            <td className="meta">{r.title || 'Live'}</td>
                            <td>{r.viewers || 0}</td>
                            <td>
                              <span className="badge solid live">Live</span>
                            </td>
                            <td>
                              {(agencyPerms?.canMonitor || !isAgency) && (
                                <button
                                  type="button"
                                  className="btn-pink"
                                  onClick={() =>
                                    setMonitor({
                                      id: r.id,
                                      kind: 'live',
                                      title: r.hostName || 'Live host',
                                      subtitle: r.title || 'Live stream',
                                      channel:
                                        r.channel ||
                                        `live_${r.hostId || r.id}`,
                                    })
                                  }
                                >
                                  Watch
                                </button>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>

                <h3 className="section-title" style={{ marginTop: 28 }}>
                  Private 1:1 calls ({monitorCalls.length})
                </h3>
                <div className="desk-table-wrap">
                  {monitorCalls.length === 0 ? (
                    <div className="empty-state">No active calls.</div>
                  ) : (
                    <table className="desk-table">
                      <thead>
                        <tr>
                          <th>Participants</th>
                          <th>Duration</th>
                          <th>Coins</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {monitorCalls.map((c) => {
                          const hostName =
                            'hostName' in c
                              ? c.hostName
                              : (c as ActiveCall).hostName;
                          const peerName =
                            'peerName' in c
                              ? (c as AdminActiveCall | ActiveCall).peerName
                              : 'Caller';
                          const channel = c.channel;
                          const seconds =
                            'seconds' in c ? Number(c.seconds || 0) : 0;
                          const coins =
                            'coinsEarned' in c
                              ? Number(c.coinsEarned || 0)
                              : 0;
                          const status =
                            'status' in c
                              ? String(c.status || 'active')
                              : 'active';
                          return (
                            <tr key={c.id}>
                              <td>
                                <strong>
                                  {hostName} ↔ {peerName}
                                </strong>
                              </td>
                              <td>{formatClock(seconds)}</td>
                              <td>{coins}</td>
                              <td>
                                <span className="badge solid live">
                                  {status === 'ringing' ? 'Ringing' : '1:1'}
                                </span>
                              </td>
                              <td>
                                <div className="desk-row-actions">
                                  {(agencyPerms?.canMonitor || !isAgency) &&
                                  status !== 'ringing' ? (
                                    <button
                                      type="button"
                                      className="btn-pink"
                                      onClick={() =>
                                        setMonitor({
                                          id: c.id,
                                          kind: 'call',
                                          title: `${hostName} ↔ ${peerName}`,
                                          subtitle: 'Private video call',
                                          channel,
                                        })
                                      }
                                    >
                                      Watch
                                    </button>
                                  ) : null}
                                  {!isAgency ? (
                                    <button
                                      type="button"
                                      className="btn-red"
                                      onClick={() =>
                                        void (async () => {
                                          try {
                                            if (
                                              bridgeCalls.some(
                                                (b) => b.id === c.id,
                                              )
                                            ) {
                                              await endBridgeCallAdmin(c.id);
                                            } else {
                                              await endCallRemote(
                                                c as ActiveCall,
                                              );
                                            }
                                            await refreshSessions();
                                          } catch {
                                            /* ignore */
                                          }
                                        })()
                                      }
                                    >
                                      Force end
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
              </>
            ) : null}

            {tab === 'payouts' ? (
              <MoneyDesk
                readOnly={isAgency}
                agencyHostIds={isAgency ? agencyHostIds : undefined}
              />
            ) : null}

            {tab === 'reports' ? (
              <>
                <PageHead title="Reports" subtitle="Abuse / spam queue" />
                <div className="desk-table-wrap">
                  {reports.length === 0 ? (
                    <div className="empty-state">No reports.</div>
                  ) : (
                    <table className="desk-table">
                      <thead>
                        <tr>
                          <th>Target</th>
                          <th>Reason</th>
                          <th>Status</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reports.map((r) => (
                          <tr key={r.id}>
                            <td>
                              <strong>{r.targetId || '—'}</strong>
                              <div className="meta">{r.reporterName || r.reporterId}</div>
                            </td>
                            <td className="meta">{r.reason || r.details || '—'}</td>
                            <td>
                              <span
                                className={`badge solid ${
                                  r.status === 'resolved' ? 'approved' : 'pending'
                                }`}
                              >
                                {r.status || 'open'}
                              </span>
                            </td>
                            <td>
                              {r.status !== 'resolved' ? (
                                <button
                                  type="button"
                                  className="btn-green"
                                  onClick={() =>
                                    void (async () => {
                                      try {
                                        await resolveAdminReport(r.id);
                                      } catch {
                                        await resolveFirebaseReport(r.id);
                                      }
                                      setReports((prev) =>
                                        prev.map((x) =>
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
                              ) : (
                                <span className="badge solid approved">Resolved</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : null}

            {tab === 'control' ? (
              <>
                {!isAgency ? <ForceUpdatePanel /> : null}
                <PageHead
                  title="Remote control"
                  subtitle={`${remoteHosts.length} hosts · live presence from bridge`}
                />
                <div className="desk-table-wrap">
                  {remoteHosts.length === 0 ? (
                    <div className="empty-state">
                      No approved hosts yet. Approve hosts in Host List.
                    </div>
                  ) : (
                    <table className="desk-table">
                      <thead>
                        <tr>
                          <th>Profile</th>
                          <th>Host</th>
                          <th>Presence</th>
                          <th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {remoteHosts.map((h) => (
                          <tr key={h.id}>
                            <td>
                              <img
                                className="desk-table-avatar"
                                src={
                                  h.photoUrl ||
                                  h.avatarUrl ||
                                  `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                    (h.name || 'H').slice(0, 2),
                                  )}&background=1a1520&color=f5f0ea&size=128`
                                }
                                alt=""
                                onError={(e) => {
                                  const el = e.currentTarget;
                                  el.onerror = null;
                                  el.src = `https://ui-avatars.com/api/?name=${encodeURIComponent(
                                    (h.name || 'H').slice(0, 2),
                                  )}&background=1a1520&color=f5f0ea&size=128`;
                                }}
                              />
                            </td>
                            <td>
                              <strong>{h.name}</strong>
                              <div className="meta">
                                {h.hostId || h.id.slice(0, 8)}
                              </div>
                            </td>
                            <td>
                              {h.readyToCall ? (
                                <span className="badge solid approved">Ready</span>
                              ) : h.isLive ? (
                                <span className="badge solid live">Live</span>
                              ) : h.isOnCall ? (
                                <span className="badge solid under_review">
                                  On call
                                </span>
                              ) : h.isOnline ? (
                                <span className="badge solid online">Online</span>
                              ) : (
                                <span className="badge solid none">Offline</span>
                              )}
                            </td>
                            <td>
                              <div className="desk-row-actions">
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
                                  className="btn-ghost"
                                  onClick={() =>
                                    void sendControl(h.id, {
                                      type: 'force_offline',
                                      message: 'Admin set you Offline.',
                                    })
                                  }
                                >
                                  Force offline
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
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : null}
          </AnimatedPage>
        </AnimatePresence>
      </main>

      <LiveMonitorDock target={monitor} onClose={() => setMonitor(null)} />
    </div>
  );
}

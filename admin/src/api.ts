import {
  onValue,
  ref,
  remove,
  set,
  update,
  type Database,
} from 'firebase/database';
import { adminKey, apiBaseUrl, db } from './firebase';

export type HostRow = {
  id: string;
  name?: string;
  email?: string;
  country?: string;
  hostId?: string;
  hostStatus?: string;
  photoUrl?: string;
  photoUrls?: string[];
  videoUrl?: string;
  avatarUrl?: string;
  coinBalance?: number;
  isOnline?: boolean;
  isVerified?: boolean;
  applicationSubmittedAt?: number;
  rejectionReason?: string;
  banned?: boolean;
  suspended?: boolean;
  bio?: string;
  languages?: string[];
  categories?: string[];
  callPrice?: number;
  idDocumentUrl?: string;
  selfieUrl?: string;
  docsRequested?: string;
};

export type ActiveCall = {
  id: string;
  channel: string;
  hostUid: string;
  hostName: string;
  hostAvatar?: string;
  peerId: string;
  peerName: string;
  startedAt: number;
  status: string;
  coinsEarned?: number;
  seconds?: number;
};

function requireDb(): Database {
  if (!db) throw new Error('Firebase RTDB not configured in admin/.env');
  return db;
}

export async function adminLogin(key: string, role = 'super_admin') {
  const res = await fetch(`${apiBaseUrl}/admin/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, role, adminId: `admin_${role}` }),
  });
  if (!res.ok) throw new Error('Wrong admin key');
  return res.json();
}

export function listenHosts(cb: (hosts: HostRow[]) => void) {
  const database = requireDb();
  return onValue(ref(database, 'hosts'), (snap) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<HostRow, 'id'>>;
    cb(
      Object.entries(val).map(([id, row]) => ({
        id,
        ...row,
      })),
    );
  });
}

export function listenActiveCalls(cb: (calls: ActiveCall[]) => void) {
  const database = requireDb();
  return onValue(ref(database, 'activeCalls'), (snap) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<ActiveCall, 'id'>>;
    cb(
      Object.entries(val).map(([id, row]) => ({
        id,
        ...row,
      })),
    );
  });
}

export async function approveHost(uid: string) {
  await update(ref(requireDb(), `hosts/${uid}`), {
    hostStatus: 'approved',
    isVerified: true,
    banned: false,
    coinBalance: 200,
    approvedAt: Date.now(),
    rejectionReason: null,
  });
}

export async function rejectHost(uid: string, reason: string) {
  await update(ref(requireDb(), `hosts/${uid}`), {
    hostStatus: 'rejected',
    isVerified: false,
    rejectionReason: reason || 'Does not meet beauty host standards',
  });
}

export async function banHost(uid: string) {
  await update(ref(requireDb(), `hosts/${uid}`), {
    banned: true,
    isOnline: false,
    hostStatus: 'rejected',
    rejectionReason: 'Banned by admin',
  });
  await sendControl(uid, { type: 'ban', message: 'Your account was banned by admin.' });
}

export async function setHostCoins(uid: string, coinBalance: number) {
  await update(ref(requireDb(), `hosts/${uid}`), { coinBalance });
}

export async function setHostOnline(uid: string, isOnline: boolean) {
  await update(ref(requireDb(), `hosts/${uid}`), { isOnline });
  await sendControl(uid, {
    type: isOnline ? 'force_online' : 'force_offline',
    message: isOnline ? 'Admin set you Online.' : 'Admin set you Offline.',
  });
}

export async function sendControl(
  uid: string,
  cmd: { type: string; message?: string },
) {
  await set(ref(requireDb(), `hosts/${uid}/control`), {
    ...cmd,
    at: Date.now(),
    by: 'admin',
  });
}

export async function endCallRemote(call: ActiveCall) {
  await sendControl(call.hostUid, {
    type: 'end_call',
    message: 'Admin ended your call.',
  });
  await remove(ref(requireDb(), `activeCalls/${call.id}`));
}

export async function fetchMonitorToken(channel: string, uid: number) {
  const url = `${apiBaseUrl}/agora/token?channel=${encodeURIComponent(channel)}&uid=${uid}&role=subscriber&key=${encodeURIComponent(adminKey)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(await res.text());
  return res.json() as Promise<{ token: string; appId: string; uid: number; channel: string }>;
}

export type WithdrawalRow = {
  id: string;
  hostId: string;
  amountCoins: number;
  gateway: string;
  accountName: string;
  accountNumber: string;
  status: string;
  createdAt: number;
  providerRef?: string;
  error?: string;
};

export type ReportAdminRow = {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  reason: string;
  details: string;
  createdAt: number;
  status: string;
};

function adminKeyHeader() {
  return localStorage.getItem('cc_admin_key') || adminKey;
}

export async function fetchAdminWithdrawals() {
  const res = await fetch(
    `${apiBaseUrl}/admin/withdrawals?key=${encodeURIComponent(adminKeyHeader())}`,
  );
  if (!res.ok) throw new Error('Could not load withdrawals');
  return (await res.json()) as { withdrawals: WithdrawalRow[] };
}

export async function setWithdrawalStatus(id: string, status: string) {
  const res = await fetch(`${apiBaseUrl}/admin/withdrawals/${encodeURIComponent(id)}/status`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: adminKeyHeader(), status }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function fetchAdminReports() {
  const res = await fetch(
    `${apiBaseUrl}/admin/reports?key=${encodeURIComponent(adminKeyHeader())}`,
  );
  if (!res.ok) throw new Error('Could not load reports');
  return (await res.json()) as { reports: ReportAdminRow[] };
}

export async function resolveAdminReport(id: string) {
  const res = await fetch(`${apiBaseUrl}/admin/reports/${encodeURIComponent(id)}/resolve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key: adminKeyHeader() }),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export function listenReports(cb: (rows: ReportAdminRow[]) => void) {
  const database = requireDb();
  return onValue(ref(database, 'reports'), (snap) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, Omit<ReportAdminRow, 'id'>>;
    cb(
      Object.entries(val)
        .map(([id, row]) => ({ id, ...row }))
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)),
    );
  });
}

export async function resolveFirebaseReport(id: string) {
  await update(ref(requireDb(), `reports/${id}`), { status: 'resolved', resolvedAt: Date.now() });
}

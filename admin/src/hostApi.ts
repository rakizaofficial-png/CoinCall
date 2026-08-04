/**
 * Host Management client — server APIs + Firebase realtime mirror.
 */

import { onValue, ref, set, update, type Database } from 'firebase/database';
import { adminKey, apiBaseUrl, db } from './firebase';
import type { HostRow } from './api';

export type HostLifecycleStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'banned';

export type AdminRole = 'super_admin' | 'moderator' | 'finance' | 'support' | 'agency';

export type ManagedHost = HostRow & {
  bio?: string;
  languages?: string[];
  categories?: string[];
  callPrice?: number;
  idDocumentUrl?: string;
  selfieUrl?: string;
  docsRequested?: string;
  suspended?: boolean;
  callsEnabled?: boolean;
  videoCallsEnabled?: boolean;
  voiceCallsEnabled?: boolean;
  giftsEnabled?: boolean;
  withdrawalsAllowed?: boolean;
  walletFrozen?: boolean;
  pendingEarnings?: number;
  paidEarnings?: number;
  commissionRate?: number;
  totalCalls?: number;
  missedCalls?: number;
  cancelledCalls?: number;
  onlineSeconds?: number;
  rating?: number;
  reportsReceived?: number;
  revenueGenerated?: number;
  revenueMonth?: number;
  callEarnings?: number;
  giftEarnings?: number;
  liveEarnings?: number;
  agencyId?: string;
  agencyName?: string;
  loginHistory?: { at: number; ip?: string; device?: string }[];
  deviceInfo?: {
    platform?: string;
    model?: string;
    appVersion?: string;
    lastIp?: string;
  };
};

export type AuditLog = {
  id: string;
  at: number;
  adminId: string;
  adminRole: AdminRole;
  action: string;
  hostId: string;
  hostName?: string;
  details?: string;
};

export type HostPerformance = {
  summary: {
    totalCalls: number;
    totalCallSeconds: number;
    averageCallSeconds: number;
    totalCallCoins: number;
    giftCoins: number;
    liveSeconds: number;
    lastActiveAt: number;
  };
  recentCalls: Array<{
    id: string;
    userName: string;
    status: string;
    durationSec: number;
    coinsSpent: number;
    startedAt: number;
    endedAt: number;
  }>;
};

function requireDb(): Database {
  if (!db) throw new Error('Firebase RTDB not configured in admin/.env');
  return db;
}

function adminHeaders() {
  return {
    'Content-Type': 'application/json',
    'x-admin-key': localStorage.getItem('cc_admin_key') || adminKey,
    'x-admin-id': localStorage.getItem('cc_admin_id') || 'admin',
    'x-admin-role': localStorage.getItem('cc_admin_role') || 'super_admin',
    'x-agency-id': localStorage.getItem('cc_agency_id') || '',
  };
}

async function adminFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...adminHeaders(),
      ...(init?.headers || {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Request failed ${res.status}`);
  }
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('text/csv')) {
    return (await res.text()) as T;
  }
  return res.json() as Promise<T>;
}

export async function fetchHostPerformance(hostId: string) {
  return adminFetch<HostPerformance>(
    `/admin/hosts/${encodeURIComponent(hostId)}/performance`,
  );
}

export async function syncHostsToServer(hosts: ManagedHost[]) {
  try {
    await adminFetch('/admin/hosts/sync', {
      method: 'POST',
      body: JSON.stringify({ hosts }),
    });
  } catch {
    /* server optional when offline */
  }
}

export async function fetchManagedHosts(params: {
  q?: string;
  status?: string;
  sort?: string;
  agencyId?: string | null;
}) {
  const qs = new URLSearchParams();
  if (params.q) qs.set('q', params.q);
  if (params.status) qs.set('status', params.status);
  if (params.sort) qs.set('sort', params.sort);
  if (params.agencyId) qs.set('agencyId', params.agencyId);
  return adminFetch<{ hosts: ManagedHost[]; total: number }>(
    `/admin/hosts?${qs.toString()}`,
  );
}

export async function fetchAuditLogs(limit = 80) {
  return adminFetch<{ logs: AuditLog[] }>(`/admin/audit-logs?limit=${limit}`);
}

export type BridgeHostStatus = {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  ratePerMinute: number;
  isOnline: boolean;
  isLive: boolean;
  isOnCall: boolean;
  readyToCall: boolean;
  workspaceMode?: string;
  hostStatus?: string;
  callsEnabled?: boolean;
  banned?: boolean;
  suspended?: boolean;
  lastSeen: number;
};

export async function fetchBridgeHosts(agencyId?: string | null) {
  const qs = agencyId
    ? `?agencyId=${encodeURIComponent(agencyId)}`
    : '';
  return adminFetch<{
    hosts: BridgeHostStatus[];
    readyCount: number;
    onlineCount: number;
  }>(`/admin/bridge-hosts${qs}`);
}

export async function exportHostsCsv() {
  const csv = await adminFetch<string>('/admin/hosts-export');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `hosts-report-${Date.now()}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

async function mirrorFirebase(
  uid: string,
  firebaseMirror: Record<string, unknown>,
  control?: { type: string; message: string } | null,
) {
  try {
    await update(ref(requireDb(), `hosts/${uid}`), firebaseMirror);
    if (control) {
      await set(ref(requireDb(), `hosts/${uid}/control`), {
        ...control,
        at: Date.now(),
        by: 'admin',
      });
    }
    const notifId = `n_${Date.now()}`;
    await set(ref(requireDb(), `hosts/${uid}/notifications/${notifId}`), {
      id: notifId,
      type: firebaseMirror.hostStatus || control?.type || 'update',
      title: control?.message || `Status: ${firebaseMirror.hostStatus}`,
      body: firebaseMirror.rejectionReason || firebaseMirror.docsRequested || control?.message || '',
      at: Date.now(),
      read: false,
    });
  } catch {
    /* Firebase optional */
  }
}

export async function runHostAction(
  uid: string,
  action: string,
  extra?: {
    reason?: string;
    docsMessage?: string;
    commissionRate?: number;
    callPrice?: number;
    coinBalance?: number;
    name?: string;
    hostId?: string;
  },
) {
  const data = await adminFetch<{
    ok: boolean;
    host: ManagedHost;
    firebaseMirror: Record<string, unknown>;
    control: { type: string; message: string } | null;
  }>(`/admin/hosts/${encodeURIComponent(uid)}/action`, {
    method: 'POST',
    body: JSON.stringify({ action, ...extra }),
  });
  await mirrorFirebase(uid, data.firebaseMirror, data.control);
  return data;
}

export async function runBulkHostAction(
  ids: string[],
  action: string,
  extra?: { reason?: string; callPrice?: number },
) {
  const data = await adminFetch<{
    ok: boolean;
    results: {
      id: string;
      host: ManagedHost;
      firebaseMirror: Record<string, unknown>;
      control: { type: string; message: string } | null;
    }[];
  }>('/admin/hosts/bulk', {
    method: 'POST',
    body: JSON.stringify({ ids, action, ...extra }),
  });
  await Promise.all(
    data.results.map((r) => mirrorFirebase(r.id, r.firebaseMirror, r.control)),
  );
  return data;
}

export function mergeFirebaseHosts(
  firebase: HostRow[],
  managed: ManagedHost[],
): ManagedHost[] {
  const rows: ManagedHost[] = [];
  const keyToIndex = new Map<string, number>();
  const keysFor = (host: Pick<ManagedHost, 'id' | 'hostId'>) => {
    const keys = new Set<string>();
    const id = String(host.id || '').trim().toLowerCase();
    const publicId = String(host.hostId || '').trim().toLowerCase();
    if (id) keys.add(`id:${id}`);
    if (publicId) {
      keys.add(`id:${publicId}`);
      keys.add(`public:${publicId}`);
      const digits = publicId.replace(/\D/g, '');
      if (digits) keys.add(`app:${digits.slice(-6).padStart(6, '0')}`);
    }
    return [...keys];
  };
  const upsert = (next: ManagedHost) => {
    const keys = keysFor(next);
    const hit = keys.map((key) => keyToIndex.get(key)).find((i) => i != null);
    if (hit == null) {
      const index = rows.length;
      rows.push(next);
      keys.forEach((key) => keyToIndex.set(key, index));
      return;
    }
    const previous = rows[hit]!;
    const merged = {
      ...next,
      ...previous,
      id: previous.id || next.id,
      hostId: previous.hostId || next.hostId,
      name: previous.name || next.name,
      photoUrl: previous.photoUrl || next.photoUrl,
      photoUrls:
        previous.photoUrls?.length ? previous.photoUrls : next.photoUrls,
      totalCalls: Math.max(previous.totalCalls || 0, next.totalCalls || 0),
      onlineSeconds: Math.max(
        previous.onlineSeconds || 0,
        next.onlineSeconds || 0,
      ),
      revenueGenerated: Math.max(
        previous.revenueGenerated || 0,
        next.revenueGenerated || 0,
      ),
    };
    rows[hit] = merged;
    keysFor(merged).forEach((key) => keyToIndex.set(key, hit));
  };
  managed.forEach(upsert);
  for (const f of firebase) {
    const prev = rows.find((row) =>
      keysFor(row).some((key) => keysFor(f as ManagedHost).includes(key)),
    );
    upsert({
      ...f,
      ...prev,
      id: prev?.id || f.id,
      name: f.name || prev?.name,
      photoUrl: f.photoUrl || prev?.photoUrl,
      photoUrls: f.photoUrls || prev?.photoUrls,
      videoUrl: f.videoUrl || prev?.videoUrl,
      hostStatus: (prev?.hostStatus || f.hostStatus) as HostLifecycleStatus,
      coinBalance: prev?.coinBalance ?? f.coinBalance,
      isOnline: f.isOnline ?? prev?.isOnline,
    } as ManagedHost);
  }
  return rows;
}

export function listenHostNotifications(
  uid: string,
  cb: (rows: { id: string; title: string; body: string; at: number }[]) => void,
) {
  const database = requireDb();
  return onValue(ref(database, `hosts/${uid}/notifications`), (snap) => {
    if (!snap.exists()) {
      cb([]);
      return;
    }
    const val = snap.val() as Record<string, { title: string; body: string; at: number }>;
    cb(
      Object.entries(val)
        .map(([id, row]) => ({ id, ...row }))
        .sort((a, b) => (b.at || 0) - (a.at || 0)),
    );
  });
}

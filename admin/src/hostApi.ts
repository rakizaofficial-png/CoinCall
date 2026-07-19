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
  reason?: string,
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
    body: JSON.stringify({ ids, action, reason }),
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
  const map = new Map<string, ManagedHost>();
  for (const m of managed) map.set(m.id, m);
  for (const f of firebase) {
    const prev = map.get(f.id);
    map.set(f.id, {
      ...f,
      ...prev,
      id: f.id,
      name: f.name || prev?.name,
      photoUrl: f.photoUrl || prev?.photoUrl,
      photoUrls: f.photoUrls || prev?.photoUrls,
      videoUrl: f.videoUrl || prev?.videoUrl,
      hostStatus: (prev?.hostStatus || f.hostStatus) as HostLifecycleStatus,
      coinBalance: prev?.coinBalance ?? f.coinBalance,
      isOnline: f.isOnline ?? prev?.isOnline,
    });
  }
  return [...map.values()];
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

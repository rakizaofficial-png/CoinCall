/**
 * Host Management System — in-memory registry + audit log.
 * Admin panel is the primary consumer; host app syncs via Firebase
 * (admin client mirrors server actions to RTDB for realtime UX).
 */

import { randomUUID } from 'crypto';
import type { Express, Request, Response } from 'express';
import {
  clearPresenceForAdminAction,
  listPresence,
  pruneHosts,
} from './presenceStore.ts';

export type HostLifecycleStatus =
  | 'pending'
  | 'under_review'
  | 'approved'
  | 'rejected'
  | 'suspended'
  | 'banned';

export type AdminRole = 'super_admin' | 'moderator' | 'finance' | 'support';

export type HostManagedRecord = {
  id: string;
  hostId: string;
  name: string;
  email?: string;
  country?: string;
  bio: string;
  languages: string[];
  categories: string[];
  callPrice: number;
  photoUrl?: string;
  photoUrls: string[];
  videoUrl?: string;
  idDocumentUrl?: string;
  selfieUrl?: string;
  hostStatus: HostLifecycleStatus;
  rejectionReason?: string;
  docsRequested?: string;
  docsRequestedAt?: number;
  applicationSubmittedAt?: number;
  approvedAt?: number;
  banned: boolean;
  suspended: boolean;
  isOnline: boolean;
  callsEnabled: boolean;
  videoCallsEnabled: boolean;
  voiceCallsEnabled: boolean;
  giftsEnabled: boolean;
  withdrawalsAllowed: boolean;
  walletFrozen: boolean;
  isVerified: boolean;
  coinBalance: number;
  pendingEarnings: number;
  paidEarnings: number;
  commissionRate: number;
  totalCalls: number;
  missedCalls: number;
  cancelledCalls: number;
  onlineSeconds: number;
  rating: number;
  reportsReceived: number;
  revenueGenerated: number;
  loginHistory: { at: number; ip?: string; device?: string }[];
  deviceInfo: {
    platform?: string;
    model?: string;
    appVersion?: string;
    lastIp?: string;
  };
  lastLoginAt?: number;
  createdAt: number;
  updatedAt: number;
};

export type AuditLogEntry = {
  id: string;
  at: number;
  adminId: string;
  adminRole: AdminRole;
  action: string;
  hostId: string;
  hostName?: string;
  details?: string;
  meta?: Record<string, unknown>;
};

export type HostNotification = {
  id: string;
  hostUid: string;
  type: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
};

const registry = new Map<string, HostManagedRecord>();
const auditLogs: AuditLogEntry[] = [];
const notifications = new Map<string, HostNotification[]>();

const DEFAULT_COMMISSION = 0.3;

function now() {
  return Date.now();
}

function emptyMetrics() {
  return {
    totalCalls: 0,
    missedCalls: 0,
    cancelledCalls: 0,
    onlineSeconds: 0,
    rating: 5,
    reportsReceived: 0,
    revenueGenerated: 0,
  };
}

export function ensureHostRecord(
  id: string,
  patch?: Partial<HostManagedRecord>,
): HostManagedRecord {
  let row = registry.get(id);
  if (!row) {
    row = {
      id,
      hostId: patch?.hostId || `H${String(Math.floor(10000 + Math.random() * 89999))}`,
      name: patch?.name || 'Host',
      email: patch?.email,
      country: patch?.country,
      bio: patch?.bio || '',
      languages: patch?.languages || [],
      categories: patch?.categories || [],
      callPrice: patch?.callPrice ?? 80,
      photoUrl: patch?.photoUrl,
      photoUrls: patch?.photoUrls || [],
      videoUrl: patch?.videoUrl,
      idDocumentUrl: patch?.idDocumentUrl,
      selfieUrl: patch?.selfieUrl,
      hostStatus: patch?.hostStatus || 'pending',
      rejectionReason: patch?.rejectionReason,
      docsRequested: patch?.docsRequested,
      applicationSubmittedAt: patch?.applicationSubmittedAt || now(),
      banned: false,
      suspended: false,
      isOnline: false,
      callsEnabled: true,
      videoCallsEnabled: true,
      voiceCallsEnabled: true,
      giftsEnabled: true,
      withdrawalsAllowed: true,
      walletFrozen: false,
      isVerified: false,
      coinBalance: patch?.coinBalance ?? 0,
      pendingEarnings: 0,
      paidEarnings: 0,
      commissionRate: DEFAULT_COMMISSION,
      ...emptyMetrics(),
      loginHistory: [],
      deviceInfo: {},
      createdAt: now(),
      updatedAt: now(),
      ...patch,
      id,
    };
    registry.set(id, row);
  } else if (patch) {
    row = { ...row, ...patch, id, updatedAt: now() };
    registry.set(id, row);
  }
  return row;
}

export function listHosts(): HostManagedRecord[] {
  return [...registry.values()].sort(
    (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0),
  );
}

export function getHost(id: string) {
  return registry.get(id) || null;
}

/** Alias used by the call bridge */
export function getManagedHost(id: string) {
  return getHost(id);
}

/**
 * Gate for listing / ringing a host on the user-app bridge.
 * Hosts with no managed row are allowed (not yet synced from admin).
 */
export function assertHostCanReceiveCalls(id: string): {
  ok: boolean;
  error?: string;
  status?: number;
  host?: HostManagedRecord | null;
} {
  const row = getHost(id);
  if (!row) {
    return { ok: true, host: null };
  }
  if (row.banned || row.hostStatus === 'banned') {
    return { ok: false, error: 'Host is banned', status: 403, host: row };
  }
  if (row.suspended || row.hostStatus === 'suspended') {
    return { ok: false, error: 'Host is suspended', status: 403, host: row };
  }
  if (row.hostStatus !== 'approved') {
    return {
      ok: false,
      error: 'Host is not approved for calls',
      status: 403,
      host: row,
    };
  }
  if (!row.callsEnabled) {
    return { ok: false, error: 'Calls disabled by admin', status: 403, host: row };
  }
  return { ok: true, host: row };
}

export function pushAudit(entry: Omit<AuditLogEntry, 'id' | 'at'> & { at?: number }) {
  const row: AuditLogEntry = {
    id: randomUUID(),
    at: entry.at || now(),
    adminId: entry.adminId,
    adminRole: entry.adminRole,
    action: entry.action,
    hostId: entry.hostId,
    hostName: entry.hostName,
    details: entry.details,
    meta: entry.meta,
  };
  auditLogs.unshift(row);
  if (auditLogs.length > 500) auditLogs.length = 500;
  return row;
}

export function listAudit(limit = 100) {
  return auditLogs.slice(0, limit);
}

export function notifyHost(
  hostUid: string,
  input: { type: string; title: string; body: string },
) {
  const n: HostNotification = {
    id: randomUUID(),
    hostUid,
    type: input.type,
    title: input.title,
    body: input.body,
    at: now(),
    read: false,
  };
  const list = notifications.get(hostUid) || [];
  list.unshift(n);
  notifications.set(hostUid, list.slice(0, 50));
  return n;
}

export function listNotifications(hostUid: string) {
  return notifications.get(hostUid) || [];
}

type Broadcast = (event: unknown) => void;

function adminMeta(req: Request): { adminId: string; adminRole: AdminRole } {
  const role = String(req.headers['x-admin-role'] || req.body?.adminRole || 'super_admin');
  const allowed: AdminRole[] = ['super_admin', 'moderator', 'finance', 'support'];
  return {
    adminId: String(req.headers['x-admin-id'] || req.body?.adminId || 'admin'),
    adminRole: (allowed.includes(role as AdminRole) ? role : 'super_admin') as AdminRole,
  };
}

function canFinance(role: AdminRole) {
  return role === 'super_admin' || role === 'finance';
}

function canModerate(role: AdminRole) {
  return role === 'super_admin' || role === 'moderator' || role === 'support';
}

export type HostAction =
  | 'approve'
  | 'reject'
  | 'request_docs'
  | 'under_review'
  | 'ban'
  | 'unban'
  | 'suspend'
  | 'unsuspend'
  | 'disable_calls'
  | 'enable_calls'
  | 'force_offline'
  | 'force_online'
  | 'reset_profile'
  | 'reset_earnings'
  | 'freeze_wallet'
  | 'unfreeze_wallet'
  | 'enable_video'
  | 'disable_video'
  | 'enable_voice'
  | 'disable_voice'
  | 'allow_withdrawals'
  | 'block_withdrawals'
  | 'enable_gifts'
  | 'disable_gifts'
  | 'set_commission'
  | 'set_coins'
  | 'record_login';

export function applyHostAction(
  hostUid: string,
  action: HostAction,
  opts: {
    adminId: string;
    adminRole: AdminRole;
    reason?: string;
    docsMessage?: string;
    commissionRate?: number;
    coinBalance?: number;
    login?: { ip?: string; device?: string; platform?: string; model?: string; appVersion?: string };
    broadcast?: Broadcast;
  },
): HostManagedRecord {
  const row = ensureHostRecord(hostUid);
  const reason = opts.reason || '';

  switch (action) {
    case 'approve':
      row.hostStatus = 'approved';
      row.banned = false;
      row.suspended = false;
      row.isVerified = true;
      row.approvedAt = now();
      row.rejectionReason = undefined;
      row.docsRequested = undefined;
      if (row.coinBalance < 200) row.coinBalance = 200;
      notifyHost(hostUid, {
        type: 'approved',
        title: 'Application approved',
        body: 'Welcome! Your host account is approved. You can go online now.',
      });
      break;
    case 'reject':
      row.hostStatus = 'rejected';
      row.rejectionReason = reason || 'Does not meet host standards';
      row.isOnline = false;
      notifyHost(hostUid, {
        type: 'rejected',
        title: 'Application rejected',
        body: row.rejectionReason,
      });
      break;
    case 'request_docs':
      row.hostStatus = 'under_review';
      row.docsRequested = opts.docsMessage || reason || 'Please upload clearer ID and selfie.';
      row.docsRequestedAt = now();
      notifyHost(hostUid, {
        type: 'docs_requested',
        title: 'Additional documents required',
        body: row.docsRequested,
      });
      break;
    case 'under_review':
      row.hostStatus = 'under_review';
      notifyHost(hostUid, {
        type: 'under_review',
        title: 'Under review',
        body: 'An admin is reviewing your application.',
      });
      break;
    case 'ban':
      row.hostStatus = 'banned';
      row.banned = true;
      row.suspended = false;
      row.isOnline = false;
      row.callsEnabled = false;
      row.rejectionReason = reason || 'Banned by admin';
      notifyHost(hostUid, {
        type: 'banned',
        title: 'Account banned',
        body: row.rejectionReason,
      });
      break;
    case 'unban':
      row.banned = false;
      row.hostStatus = 'approved';
      row.callsEnabled = true;
      row.rejectionReason = undefined;
      notifyHost(hostUid, {
        type: 'unbanned',
        title: 'Account restored',
        body: 'Your ban was lifted. You may host again.',
      });
      break;
    case 'suspend':
      row.hostStatus = 'suspended';
      row.suspended = true;
      row.isOnline = false;
      row.callsEnabled = false;
      notifyHost(hostUid, {
        type: 'suspended',
        title: 'Account suspended',
        body: reason || 'Your host account is temporarily suspended.',
      });
      break;
    case 'unsuspend':
      row.suspended = false;
      row.hostStatus = 'approved';
      row.callsEnabled = true;
      notifyHost(hostUid, {
        type: 'unsuspended',
        title: 'Suspension lifted',
        body: 'You can go online again.',
      });
      break;
    case 'disable_calls':
      row.callsEnabled = false;
      row.isOnline = false;
      break;
    case 'enable_calls':
      row.callsEnabled = true;
      break;
    case 'force_offline':
      row.isOnline = false;
      break;
    case 'force_online':
      if (row.hostStatus === 'approved' && !row.banned && !row.suspended) {
        row.isOnline = true;
      }
      break;
    case 'reset_profile':
      row.bio = '';
      row.photoUrls = row.photoUrl ? [row.photoUrl] : [];
      row.videoUrl = undefined;
      row.languages = [];
      row.categories = [];
      notifyHost(hostUid, {
        type: 'profile_reset',
        title: 'Profile reset',
        body: 'Admin reset your public profile. Please update your bio and photos.',
      });
      break;
    case 'reset_earnings':
      row.pendingEarnings = 0;
      row.paidEarnings = 0;
      row.revenueGenerated = 0;
      row.coinBalance = 0;
      notifyHost(hostUid, {
        type: 'earnings_reset',
        title: 'Earnings reset',
        body: reason || 'Platform policy: earnings were reset by admin.',
      });
      break;
    case 'freeze_wallet':
      row.walletFrozen = true;
      row.withdrawalsAllowed = false;
      notifyHost(hostUid, {
        type: 'wallet_frozen',
        title: 'Wallet frozen',
        body: 'Withdrawals are paused while your wallet is under review.',
      });
      break;
    case 'unfreeze_wallet':
      row.walletFrozen = false;
      row.withdrawalsAllowed = true;
      notifyHost(hostUid, {
        type: 'wallet_unfrozen',
        title: 'Wallet unfrozen',
        body: 'You can withdraw again.',
      });
      break;
    case 'enable_video':
      row.videoCallsEnabled = true;
      break;
    case 'disable_video':
      row.videoCallsEnabled = false;
      break;
    case 'enable_voice':
      row.voiceCallsEnabled = true;
      break;
    case 'disable_voice':
      row.voiceCallsEnabled = false;
      break;
    case 'allow_withdrawals':
      row.withdrawalsAllowed = true;
      break;
    case 'block_withdrawals':
      row.withdrawalsAllowed = false;
      break;
    case 'enable_gifts':
      row.giftsEnabled = true;
      break;
    case 'disable_gifts':
      row.giftsEnabled = false;
      break;
    case 'set_commission':
      if (typeof opts.commissionRate === 'number') {
        row.commissionRate = Math.min(0.9, Math.max(0, opts.commissionRate));
      }
      break;
    case 'set_coins':
      if (typeof opts.coinBalance === 'number' && opts.coinBalance >= 0) {
        row.coinBalance = Math.floor(opts.coinBalance);
      }
      break;
    case 'record_login':
      row.lastLoginAt = now();
      row.loginHistory = [
        {
          at: now(),
          ip: opts.login?.ip,
          device: opts.login?.device || opts.login?.model,
        },
        ...row.loginHistory,
      ].slice(0, 40);
      row.deviceInfo = {
        ...row.deviceInfo,
        platform: opts.login?.platform || row.deviceInfo.platform,
        model: opts.login?.model || row.deviceInfo.model,
        appVersion: opts.login?.appVersion || row.deviceInfo.appVersion,
        lastIp: opts.login?.ip || row.deviceInfo.lastIp,
      };
      break;
    default:
      break;
  }

  row.updatedAt = now();
  registry.set(hostUid, row);

  pushAudit({
    adminId: opts.adminId,
    adminRole: opts.adminRole,
    action,
    hostId: hostUid,
    hostName: row.name,
    details: reason || opts.docsMessage,
    meta: {
      commissionRate: opts.commissionRate,
      coinBalance: opts.coinBalance,
    },
  });

  // Drop from Luma presence bridge when admin takes the host offline
  clearPresenceForAdminAction(hostUid, action);

  opts.broadcast?.({
    type: 'host:updated',
    payload: { hostUid, action, host: row },
  });
  opts.broadcast?.({
    type: 'host:notification',
    payload: { hostUid, action },
  });

  return row;
}

function firebaseMirrorPatch(row: HostManagedRecord, action: HostAction) {
  return {
    hostStatus: row.hostStatus,
    banned: row.banned,
    suspended: row.suspended,
    isOnline: row.isOnline,
    rejectionReason: row.rejectionReason || null,
    docsRequested: row.docsRequested || null,
    docsRequestedAt: row.docsRequestedAt || null,
    coinBalance: row.coinBalance,
    callPrice: row.callPrice,
    bio: row.bio,
    languages: row.languages,
    categories: row.categories,
    callsEnabled: row.callsEnabled,
    videoCallsEnabled: row.videoCallsEnabled,
    voiceCallsEnabled: row.voiceCallsEnabled,
    giftsEnabled: row.giftsEnabled,
    withdrawalsAllowed: row.withdrawalsAllowed,
    walletFrozen: row.walletFrozen,
    commissionRate: row.commissionRate,
    pendingEarnings: row.pendingEarnings,
    paidEarnings: row.paidEarnings,
    totalCalls: row.totalCalls,
    missedCalls: row.missedCalls,
    cancelledCalls: row.cancelledCalls,
    onlineSeconds: row.onlineSeconds,
    rating: row.rating,
    reportsReceived: row.reportsReceived,
    revenueGenerated: row.revenueGenerated,
    isVerified: row.hostStatus === 'approved',
    approvedAt: row.approvedAt || null,
    lastAction: action,
    updatedAt: row.updatedAt,
  };
}

export function registerHostManagementRoutes(
  app: Express,
  deps: {
    requireAdmin: (req: Request, res: Response) => boolean;
    broadcastWs: Broadcast;
  },
) {
  const { requireAdmin, broadcastWs } = deps;

  /** Host submits / syncs application */
  app.post('/api/host/applications', (req, res) => {
    const id = String(req.body?.id || req.body?.uid || '').trim();
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }
    const row = ensureHostRecord(id, {
      hostId: String(req.body?.hostId || ''),
      name: String(req.body?.name || 'Host'),
      email: req.body?.email ? String(req.body.email) : undefined,
      country: req.body?.country ? String(req.body.country) : undefined,
      bio: String(req.body?.bio || ''),
      languages: Array.isArray(req.body?.languages)
        ? req.body.languages.map(String)
        : [],
      categories: Array.isArray(req.body?.categories)
        ? req.body.categories.map(String)
        : [],
      callPrice: Number(req.body?.callPrice || 80),
      photoUrl: req.body?.photoUrl ? String(req.body.photoUrl) : undefined,
      photoUrls: Array.isArray(req.body?.photoUrls)
        ? req.body.photoUrls.map(String)
        : [],
      videoUrl: req.body?.videoUrl ? String(req.body.videoUrl) : undefined,
      idDocumentUrl: req.body?.idDocumentUrl
        ? String(req.body.idDocumentUrl)
        : undefined,
      selfieUrl: req.body?.selfieUrl ? String(req.body.selfieUrl) : undefined,
      hostStatus: 'pending',
      applicationSubmittedAt: now(),
      rejectionReason: undefined,
      docsRequested: undefined,
    });
    notifyHost(id, {
      type: 'application_received',
      title: 'Application received',
      body: 'We received your host application. Status: Pending.',
    });
    broadcastWs({ type: 'host:application', payload: row });
    res.json({ ok: true, host: row });
  });

  app.get('/api/host/notifications/:hostUid', (req, res) => {
    const hostUid = String(req.params.hostUid || '');
    res.json({ notifications: listNotifications(hostUid) });
  });

  app.post('/api/host/login-event', (req, res) => {
    const id = String(req.body?.id || '').trim();
    if (!id) {
      res.status(400).json({ error: 'id required' });
      return;
    }
    const row = applyHostAction(id, 'record_login', {
      adminId: 'system',
      adminRole: 'super_admin',
      login: {
        ip: String(req.body?.ip || req.ip || ''),
        device: String(req.body?.device || ''),
        platform: String(req.body?.platform || ''),
        model: String(req.body?.model || ''),
        appVersion: String(req.body?.appVersion || ''),
      },
      broadcast: broadcastWs,
    });
    res.json({ ok: true, host: row });
  });

  /** Admin: live bridge presence (what the user app sees) */
  app.get('/api/admin/bridge-hosts', (req, res) => {
    if (!requireAdmin(req, res)) return;
    pruneHosts();
    const bridge = listPresence().map((h) => {
      const managed = getHost(h.id);
      return {
        ...h,
        hostStatus: managed?.hostStatus || h.hostStatus || 'unknown',
        callsEnabled: managed ? managed.callsEnabled : true,
        banned: managed?.banned || false,
        suspended: managed?.suspended || false,
      };
    });
    res.json({
      hosts: bridge,
      readyCount: bridge.filter((h) => h.readyToCall).length,
      onlineCount: bridge.filter((h) => h.isOnline).length,
    });
  });

  /** Admin: list / search / filter / sort */
  app.get('/api/admin/hosts', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const q = String(req.query.q || '').trim().toLowerCase();
    const status = String(req.query.status || 'all');
    const sort = String(req.query.sort || 'updated');
    let rows = listHosts();
    if (status !== 'all') {
      rows = rows.filter((h) => h.hostStatus === status);
    }
    if (q) {
      rows = rows.filter((h) => {
        const hay = `${h.name} ${h.email || ''} ${h.hostId} ${h.country || ''} ${h.id}`.toLowerCase();
        return hay.includes(q);
      });
    }
    rows.sort((a, b) => {
      switch (sort) {
        case 'name':
          return a.name.localeCompare(b.name);
        case 'earnings':
          return b.revenueGenerated - a.revenueGenerated;
        case 'rating':
          return b.rating - a.rating;
        case 'calls':
          return b.totalCalls - a.totalCalls;
        case 'coins':
          return b.coinBalance - a.coinBalance;
        default:
          return b.updatedAt - a.updatedAt;
      }
    });
    res.json({ hosts: rows, total: rows.length });
  });

  /** Upsert from admin Firebase sync */
  app.post('/api/admin/hosts/sync', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const hosts = Array.isArray(req.body?.hosts) ? req.body.hosts : [];
    const upserted: HostManagedRecord[] = [];
    for (const h of hosts) {
      const id = String(h.id || '').trim();
      if (!id) continue;
      upserted.push(
        ensureHostRecord(id, {
          hostId: h.hostId,
          name: h.name,
          email: h.email,
          country: h.country,
          bio: h.bio,
          languages: h.languages,
          categories: h.categories,
          callPrice: h.callPrice,
          photoUrl: h.photoUrl,
          photoUrls: h.photoUrls,
          videoUrl: h.videoUrl,
          idDocumentUrl: h.idDocumentUrl,
          selfieUrl: h.selfieUrl,
          hostStatus: h.hostStatus,
          rejectionReason: h.rejectionReason,
          docsRequested: h.docsRequested,
          applicationSubmittedAt: h.applicationSubmittedAt,
          approvedAt: h.approvedAt,
          banned: h.banned,
          suspended: h.suspended,
          isOnline: h.isOnline,
          coinBalance: h.coinBalance,
          callsEnabled: h.callsEnabled,
          videoCallsEnabled: h.videoCallsEnabled,
          voiceCallsEnabled: h.voiceCallsEnabled,
          giftsEnabled: h.giftsEnabled,
          withdrawalsAllowed: h.withdrawalsAllowed,
          walletFrozen: h.walletFrozen,
          commissionRate: h.commissionRate,
          pendingEarnings: h.pendingEarnings,
          paidEarnings: h.paidEarnings,
          totalCalls: h.totalCalls,
          missedCalls: h.missedCalls,
          cancelledCalls: h.cancelledCalls,
          onlineSeconds: h.onlineSeconds,
          rating: h.rating,
          reportsReceived: h.reportsReceived,
          revenueGenerated: h.revenueGenerated,
        }),
      );
    }
    res.json({ ok: true, count: upserted.length });
  });

  app.get('/api/admin/hosts/:id', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const row = getHost(String(req.params.id));
    if (!row) {
      res.status(404).json({ error: 'Host not found' });
      return;
    }
    res.json({
      host: row,
      notifications: listNotifications(row.id),
      firebaseMirror: firebaseMirrorPatch(row, 'under_review'),
    });
  });

  app.post('/api/admin/hosts/:id/action', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { adminId, adminRole } = adminMeta(req);
    const action = String(req.body?.action || '') as HostAction;
    if (!action) {
      res.status(400).json({ error: 'action required' });
      return;
    }
    if (
      (action === 'reset_earnings' || action === 'set_commission' || action === 'freeze_wallet') &&
      !canFinance(adminRole)
    ) {
      res.status(403).json({ error: 'Finance role required' });
      return;
    }
    if (!canModerate(adminRole) && action !== 'record_login') {
      res.status(403).json({ error: 'Moderator role required' });
      return;
    }
    const id = String(req.params.id);
    ensureHostRecord(id, {
      name: req.body?.name,
      hostId: req.body?.hostId,
    });
    const row = applyHostAction(id, action, {
      adminId,
      adminRole,
      reason: req.body?.reason ? String(req.body.reason) : undefined,
      docsMessage: req.body?.docsMessage ? String(req.body.docsMessage) : undefined,
      commissionRate:
        req.body?.commissionRate != null
          ? Number(req.body.commissionRate)
          : undefined,
      coinBalance:
        req.body?.coinBalance != null ? Number(req.body.coinBalance) : undefined,
      broadcast: broadcastWs,
    });
    res.json({
      ok: true,
      host: row,
      firebaseMirror: firebaseMirrorPatch(row, action),
      control: controlForAction(action, req.body?.reason),
    });
  });

  app.post('/api/admin/hosts/bulk', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { adminId, adminRole } = adminMeta(req);
    if (!canModerate(adminRole)) {
      res.status(403).json({ error: 'Moderator role required' });
      return;
    }
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    const action = String(req.body?.action || '') as HostAction;
    const reason = req.body?.reason ? String(req.body.reason) : undefined;
    if (!ids.length || !action) {
      res.status(400).json({ error: 'ids and action required' });
      return;
    }
    const results = ids.map((id) => {
      ensureHostRecord(id);
      const host = applyHostAction(id, action, {
        adminId,
        adminRole,
        reason,
        broadcast: broadcastWs,
      });
      return {
        id,
        host,
        firebaseMirror: firebaseMirrorPatch(host, action),
        control: controlForAction(action, reason),
      };
    });
    res.json({ ok: true, results });
  });

  app.get('/api/admin/audit-logs', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const limit = Math.min(500, Number(req.query.limit || 100));
    res.json({ logs: listAudit(limit) });
  });

  app.get('/api/admin/hosts-export', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const rows = listHosts();
    const header = [
      'id',
      'hostId',
      'name',
      'email',
      'country',
      'status',
      'coins',
      'pendingEarnings',
      'paidEarnings',
      'totalCalls',
      'missedCalls',
      'cancelledCalls',
      'rating',
      'reports',
      'revenue',
      'commission',
      'onlineSeconds',
      'walletFrozen',
      'callsEnabled',
    ];
    const lines = [
      header.join(','),
      ...rows.map((h) =>
        [
          h.id,
          h.hostId,
          csv(h.name),
          csv(h.email || ''),
          csv(h.country || ''),
          h.hostStatus,
          h.coinBalance,
          h.pendingEarnings,
          h.paidEarnings,
          h.totalCalls,
          h.missedCalls,
          h.cancelledCalls,
          h.rating,
          h.reportsReceived,
          h.revenueGenerated,
          h.commissionRate,
          h.onlineSeconds,
          h.walletFrozen,
          h.callsEnabled,
        ].join(','),
      ),
    ];
    pushAudit({
      adminId: adminMeta(req).adminId,
      adminRole: adminMeta(req).adminRole,
      action: 'export_hosts',
      hostId: '*',
      details: `Exported ${rows.length} hosts`,
    });
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="hosts-report-${Date.now()}.csv"`,
    );
    res.send(lines.join('\n'));
  });
}

function controlForAction(action: HostAction, reason?: string) {
  const map: Partial<Record<HostAction, { type: string; message: string }>> = {
    ban: { type: 'ban', message: reason || 'Your account was banned by admin.' },
    unban: { type: 'message', message: 'Your ban was lifted.' },
    suspend: {
      type: 'suspend',
      message: reason || 'Your account was suspended by admin.',
    },
    unsuspend: { type: 'message', message: 'Your suspension was lifted.' },
    force_offline: {
      type: 'force_offline',
      message: 'Admin set you Offline.',
    },
    force_online: { type: 'force_online', message: 'Admin set you Online.' },
    disable_calls: {
      type: 'force_offline',
      message: 'Calls disabled by admin.',
    },
    approve: {
      type: 'message',
      message: 'Your host application was approved!',
    },
    reject: {
      type: 'message',
      message: reason || 'Your host application was rejected.',
    },
    request_docs: {
      type: 'message',
      message: reason || 'Please upload additional documents.',
    },
    freeze_wallet: {
      type: 'message',
      message: 'Your wallet was frozen by admin.',
    },
    unfreeze_wallet: {
      type: 'message',
      message: 'Your wallet was unfrozen.',
    },
    reset_profile: {
      type: 'message',
      message: 'Admin reset your profile. Please update it.',
    },
    reset_earnings: {
      type: 'message',
      message: reason || 'Earnings were reset by platform policy.',
    },
  };
  return map[action] || null;
}

function csv(v: string) {
  if (v.includes(',') || v.includes('"') || v.includes('\n')) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

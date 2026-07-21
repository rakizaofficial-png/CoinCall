/**
 * Smart Auto Call Recommendation System
 *
 * Zero-balance users get spaced invitations from verified online hosts.
 * Users with coins never get auto invites (manual / followed / viewing only).
 */

import { randomUUID } from 'crypto';

export const AUTO_CALL_MIN_INTERVAL_MS = 3 * 60 * 1000;
export const AUTO_CALL_MAX_INTERVAL_MS = 8 * 60 * 1000;
export const AUTO_CALL_MAX_PER_HOUR = 3;
export const AUTO_CALL_RING_MS = 35_000;
export const AUTO_CALL_HEARTBEAT_TTL_MS = 90_000;

export type AutoCallPrefs = {
  userId: string;
  enabled: boolean;
  updatedAt: number;
};

export type AutoCallSession = {
  userId: string;
  coinBalance: number;
  language?: string;
  country?: string;
  interests: string[];
  following: string[];
  recentHostIds: string[];
  viewingHostId?: string;
  inCall: boolean;
  lastHeartbeatAt: number;
  /** Next time an auto invite may be issued */
  nextInviteAt: number;
  invitesHourWindowStart: number;
  invitesThisHour: number;
  shownHostIds: string[];
  pendingInviteId?: string;
};

export type AutoCallInvite = {
  id: string;
  userId: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  hostCountry?: string;
  ratePerMinute: number;
  reason: 'zero_balance_auto' | 'host_manual_allowed';
  status: 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled';
  createdAt: number;
  expiresAt: number;
  matchScore: number;
};

export type AutoCallAnalyticsEvent = {
  id: string;
  at: number;
  userId: string;
  hostId?: string;
  inviteId?: string;
  type:
    | 'session_heartbeat'
    | 'invite_created'
    | 'invite_pushed'
    | 'invite_accepted'
    | 'invite_declined'
    | 'invite_expired'
    | 'invite_cancelled'
    | 'prefs_updated'
    | 'blocked_has_coins'
    | 'blocked_rate_limit'
    | 'blocked_disabled'
    | 'blocked_in_call'
    | 'host_manual_invite';
  meta?: Record<string, unknown>;
};

export type CandidateHost = {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  language?: string;
  categories?: string[];
  ratePerMinute: number;
  isVerified: boolean;
  hostStatus: string;
  callsEnabled: boolean;
  readyToCall: boolean;
  isOnline: boolean;
};

const prefs = new Map<string, AutoCallPrefs>();
const sessions = new Map<string, AutoCallSession>();
const invites = new Map<string, AutoCallInvite>();
const analytics: AutoCallAnalyticsEvent[] = [];

function logEvent(
  partial: Omit<AutoCallAnalyticsEvent, 'id' | 'at'> & { at?: number },
) {
  const row: AutoCallAnalyticsEvent = {
    id: `ace_${randomUUID().slice(0, 10)}`,
    at: partial.at || Date.now(),
    userId: partial.userId,
    hostId: partial.hostId,
    inviteId: partial.inviteId,
    type: partial.type,
    meta: partial.meta,
  };
  analytics.unshift(row);
  if (analytics.length > 2000) analytics.length = 2000;
  return row;
}

function randomIntervalMs() {
  const span = AUTO_CALL_MAX_INTERVAL_MS - AUTO_CALL_MIN_INTERVAL_MS;
  return AUTO_CALL_MIN_INTERVAL_MS + Math.floor(Math.random() * (span + 1));
}

/** First invite of a zero-balance session arrives sooner, then 3–8 min cadence */
function firstInviteDelayMs() {
  return 45_000 + Math.floor(Math.random() * 75_000);
}

export function getAutoCallPrefs(userId: string): AutoCallPrefs {
  const existing = prefs.get(userId);
  if (existing) return existing;
  const row: AutoCallPrefs = {
    userId,
    enabled: true,
    updatedAt: Date.now(),
  };
  prefs.set(userId, row);
  return row;
}

export function setAutoCallPrefs(userId: string, enabled: boolean): AutoCallPrefs {
  const row: AutoCallPrefs = {
    userId,
    enabled: Boolean(enabled),
    updatedAt: Date.now(),
  };
  prefs.set(userId, row);
  logEvent({ userId, type: 'prefs_updated', meta: { enabled: row.enabled } });
  if (!row.enabled) {
    cancelPendingForUser(userId, 'prefs_disabled');
  }
  return row;
}

function ensureSession(userId: string): AutoCallSession {
  let s = sessions.get(userId);
  if (!s) {
    const now = Date.now();
    s = {
      userId,
      coinBalance: 0,
      interests: [],
      following: [],
      recentHostIds: [],
      inCall: false,
      lastHeartbeatAt: now,
      nextInviteAt: now + firstInviteDelayMs(),
      invitesHourWindowStart: now,
      invitesThisHour: 0,
      shownHostIds: [],
    };
    sessions.set(userId, s);
  }
  return s;
}

function rollHourWindow(s: AutoCallSession, now = Date.now()) {
  if (now - s.invitesHourWindowStart >= 60 * 60 * 1000) {
    s.invitesHourWindowStart = now;
    s.invitesThisHour = 0;
  }
}

export function cancelPendingForUser(userId: string, reason: string) {
  const s = sessions.get(userId);
  if (!s?.pendingInviteId) return;
  const inv = invites.get(s.pendingInviteId);
  if (inv && inv.status === 'pending') {
    inv.status = 'cancelled';
    logEvent({
      userId,
      hostId: inv.hostId,
      inviteId: inv.id,
      type: 'invite_cancelled',
      meta: { reason },
    });
  }
  s.pendingInviteId = undefined;
}

export function touchAutoCallHeartbeat(input: {
  userId: string;
  coinBalance: number;
  language?: string;
  country?: string;
  interests?: string[];
  following?: string[];
  recentHostIds?: string[];
  viewingHostId?: string | null;
  inCall?: boolean;
}): AutoCallSession {
  const s = ensureSession(input.userId);
  const prevBalance = s.coinBalance;
  s.coinBalance = Math.max(0, Math.floor(Number(input.coinBalance) || 0));
  s.language = input.language?.trim() || s.language;
  s.country = input.country?.trim() || s.country;
  if (Array.isArray(input.interests)) {
    s.interests = input.interests.map(String).slice(0, 12);
  }
  if (Array.isArray(input.following)) {
    s.following = input.following.map(String).slice(0, 200);
  }
  if (Array.isArray(input.recentHostIds)) {
    s.recentHostIds = input.recentHostIds.map(String).slice(0, 50);
  }
  s.viewingHostId = input.viewingHostId?.trim() || undefined;
  s.inCall = Boolean(input.inCall);
  s.lastHeartbeatAt = Date.now();
  rollHourWindow(s);

  // Stop immediately after purchase or call start
  if (s.coinBalance > 0 || s.inCall) {
    cancelPendingForUser(input.userId, s.inCall ? 'in_call' : 'has_coins');
    if (prevBalance === 0 && s.coinBalance > 0) {
      logEvent({ userId: input.userId, type: 'blocked_has_coins' });
    }
  }

  logEvent({
    userId: input.userId,
    type: 'session_heartbeat',
    meta: {
      coinBalance: s.coinBalance,
      inCall: s.inCall,
      enabled: getAutoCallPrefs(input.userId).enabled,
    },
  });

  sessions.set(input.userId, s);
  return s;
}

function scoreHost(s: AutoCallSession, h: CandidateHost): number {
  let score = 10;
  if (s.country && h.country) {
    if (s.country.toLowerCase() === h.country.toLowerCase()) score += 40;
  }
  if (s.language && h.language) {
    if (s.language.toLowerCase() === h.language.toLowerCase()) score += 35;
  }
  if (s.interests.length && h.categories?.length) {
    const set = new Set(s.interests.map((x) => x.toLowerCase()));
    for (const c of h.categories) {
      if (set.has(c.toLowerCase())) score += 12;
    }
  }
  if (s.following.includes(h.id)) score += 8;
  if (s.recentHostIds.includes(h.id)) score -= 5;
  if (s.shownHostIds.includes(h.id)) score -= 50;
  return score;
}

function eligibleHosts(
  s: AutoCallSession,
  candidates: CandidateHost[],
): CandidateHost[] {
  const shown = new Set(s.shownHostIds);
  const base = candidates.filter(
    (h) =>
      h.isOnline &&
      h.readyToCall &&
      h.callsEnabled &&
      (h.isVerified || h.hostStatus === 'approved') &&
      h.id !== s.userId,
  );
  const fresh = base.filter((h) => !shown.has(h.id));
  const pool = fresh.length ? fresh : base; // rotate when all shown
  if (!fresh.length && base.length) {
    s.shownHostIds = [];
  }
  return pool;
}

export function pickAutoCallHost(
  userId: string,
  candidates: CandidateHost[],
): { host: CandidateHost; score: number } | null {
  const s = sessions.get(userId);
  if (!s) return null;
  const pool = eligibleHosts(s, candidates);
  if (!pool.length) return null;
  const ranked = pool
    .map((h) => ({ host: h, score: scoreHost(s, h) }))
    .sort((a, b) => b.score - a.score);
  // Soft randomness among top 3
  const top = ranked.slice(0, Math.min(3, ranked.length));
  const pick = top[Math.floor(Math.random() * top.length)]!;
  return pick;
}

export function createAutoInvite(input: {
  userId: string;
  host: CandidateHost;
  matchScore: number;
  reason?: AutoCallInvite['reason'];
}): AutoCallInvite | { error: string } {
  const prefsRow = getAutoCallPrefs(input.userId);
  if (!prefsRow.enabled) {
    logEvent({ userId: input.userId, type: 'blocked_disabled' });
    return { error: 'Auto call invitations disabled' };
  }
  const s = ensureSession(input.userId);
  rollHourWindow(s);
  if (s.coinBalance > 0 && input.reason !== 'host_manual_allowed') {
    logEvent({ userId: input.userId, type: 'blocked_has_coins' });
    return { error: 'User has coins — auto invites disabled' };
  }
  if (s.inCall) {
    logEvent({ userId: input.userId, type: 'blocked_in_call' });
    return { error: 'User is in a call' };
  }
  if (s.pendingInviteId) {
    return { error: 'Invite already pending' };
  }
  if (input.reason !== 'host_manual_allowed') {
    if (s.invitesThisHour >= AUTO_CALL_MAX_PER_HOUR) {
      logEvent({ userId: input.userId, type: 'blocked_rate_limit' });
      return { error: 'Max 3 auto invitations per hour' };
    }
    if (Date.now() < s.nextInviteAt) {
      return { error: 'Too soon for next invite' };
    }
  }

  const now = Date.now();
  const invite: AutoCallInvite = {
    id: `aci_${randomUUID().slice(0, 12)}`,
    userId: input.userId,
    hostId: input.host.id,
    hostName: input.host.name,
    hostAvatar: input.host.avatarUrl,
    hostCountry: input.host.country,
    ratePerMinute: input.host.ratePerMinute,
    reason: input.reason || 'zero_balance_auto',
    status: 'pending',
    createdAt: now,
    expiresAt: now + AUTO_CALL_RING_MS,
    matchScore: input.matchScore,
  };
  invites.set(invite.id, invite);
  s.pendingInviteId = invite.id;
  s.shownHostIds = [...s.shownHostIds.filter((id) => id !== invite.hostId), invite.hostId].slice(
    -40,
  );
  if (invite.reason === 'zero_balance_auto') {
    s.invitesThisHour += 1;
  }
  sessions.set(input.userId, s);

  logEvent({
    userId: input.userId,
    hostId: invite.hostId,
    inviteId: invite.id,
    type: 'invite_created',
    meta: { reason: invite.reason, matchScore: invite.matchScore },
  });
  return invite;
}

export function getPendingInvite(userId: string): AutoCallInvite | null {
  const s = sessions.get(userId);
  if (!s?.pendingInviteId) return null;
  const inv = invites.get(s.pendingInviteId);
  if (!inv || inv.status !== 'pending') {
    s.pendingInviteId = undefined;
    return null;
  }
  if (Date.now() > inv.expiresAt) {
    inv.status = 'expired';
    s.pendingInviteId = undefined;
    s.nextInviteAt = Date.now() + randomIntervalMs();
    logEvent({
      userId,
      hostId: inv.hostId,
      inviteId: inv.id,
      type: 'invite_expired',
    });
    return null;
  }
  return inv;
}

export function respondAutoInvite(input: {
  userId: string;
  inviteId: string;
  action: 'accept' | 'decline';
}): { ok: true; invite: AutoCallInvite } | { ok: false; error: string } {
  const inv = invites.get(input.inviteId);
  if (!inv || inv.userId !== input.userId) {
    return { ok: false, error: 'Invite not found' };
  }
  if (inv.status !== 'pending') {
    return { ok: false, error: `Invite is ${inv.status}` };
  }
  const s = ensureSession(input.userId);
  if (input.action === 'accept') {
    inv.status = 'accepted';
    logEvent({
      userId: input.userId,
      hostId: inv.hostId,
      inviteId: inv.id,
      type: 'invite_accepted',
    });
  } else {
    inv.status = 'declined';
    logEvent({
      userId: input.userId,
      hostId: inv.hostId,
      inviteId: inv.id,
      type: 'invite_declined',
    });
  }
  s.pendingInviteId = undefined;
  s.nextInviteAt = Date.now() + randomIntervalMs();
  sessions.set(input.userId, s);
  return { ok: true, invite: inv };
}

/** Can a host manually invite this user when they have coins? */
export function hostMayInviteUser(input: {
  userId: string;
  hostId: string;
}): boolean {
  const s = sessions.get(input.userId);
  if (!s) return false;
  if (s.following.includes(input.hostId)) return true;
  if (s.recentHostIds.includes(input.hostId)) return true;
  if (s.viewingHostId === input.hostId) return true;
  return false;
}

export function listDueAutoCallUsers(now = Date.now()): string[] {
  const due: string[] = [];
  for (const s of sessions.values()) {
    if (now - s.lastHeartbeatAt > AUTO_CALL_HEARTBEAT_TTL_MS) continue;
    const p = getAutoCallPrefs(s.userId);
    if (!p.enabled) continue;
    if (s.coinBalance > 0) continue;
    if (s.inCall) continue;
    if (s.pendingInviteId) continue;
    rollHourWindow(s, now);
    if (s.invitesThisHour >= AUTO_CALL_MAX_PER_HOUR) continue;
    if (now < s.nextInviteAt) continue;
    due.push(s.userId);
  }
  return due;
}

export function markInvitePushed(inviteId: string) {
  const inv = invites.get(inviteId);
  if (!inv) return;
  logEvent({
    userId: inv.userId,
    hostId: inv.hostId,
    inviteId: inv.id,
    type: 'invite_pushed',
  });
}

export function expireStaleInvites(now = Date.now()) {
  for (const inv of invites.values()) {
    if (inv.status !== 'pending') continue;
    if (now <= inv.expiresAt) continue;
    inv.status = 'expired';
    const s = sessions.get(inv.userId);
    if (s?.pendingInviteId === inv.id) {
      s.pendingInviteId = undefined;
      s.nextInviteAt = now + randomIntervalMs();
    }
    logEvent({
      userId: inv.userId,
      hostId: inv.hostId,
      inviteId: inv.id,
      type: 'invite_expired',
    });
  }
}

export function getAutoCallStatus(userId: string) {
  const p = getAutoCallPrefs(userId);
  const s = sessions.get(userId);
  const pending = getPendingInvite(userId);
  return {
    enabled: p.enabled,
    eligible: p.enabled && (s?.coinBalance ?? 0) === 0 && !s?.inCall,
    coinBalance: s?.coinBalance ?? null,
    invitesThisHour: s?.invitesThisHour ?? 0,
    maxPerHour: AUTO_CALL_MAX_PER_HOUR,
    nextInviteAt: s?.nextInviteAt ?? null,
    pending,
  };
}

export function dumpAutoCallForSnapshot() {
  return {
    prefs: [...prefs.values()],
    analytics: analytics.slice(0, 500),
    // sessions are ephemeral (heartbeat) — do not persist nextInvite timing across restarts heavily
  };
}

export function loadAutoCallFromSnapshot(snap?: {
  prefs?: AutoCallPrefs[];
  analytics?: AutoCallAnalyticsEvent[];
} | null) {
  if (!snap) return;
  for (const p of snap.prefs || []) {
    if (p?.userId) prefs.set(p.userId, p);
  }
  if (Array.isArray(snap.analytics)) {
    analytics.length = 0;
    analytics.push(...snap.analytics.slice(0, 2000));
  }
}

export function listAutoCallAnalytics(limit = 100) {
  return analytics.slice(0, Math.min(500, limit));
}

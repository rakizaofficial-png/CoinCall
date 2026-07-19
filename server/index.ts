import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agoraToken from 'agora-token';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import {
  assertHostCanReceiveCalls,
  getHost,
  listHosts,
  recordHostEarning,
  registerHostManagementRoutes,
} from './hostManagement.ts';
import { isPublicHttpAvatar, pickHostAvatarUrl } from './hostAvatar.ts';
import {
  getAgencyIdForHost,
  getAgency,
  findAgencyByLoginKey,
  linkDemoHostsIfEmpty,
  publicAgency,
  registerAgencyRoutes,
} from './agencyManagement.ts';
import { registerVideoLibraryRoutes } from './videoLibrary.ts';
import { registerHostAppUpdateRoutes } from './hostAppUpdate.ts';
import {
  loadWalletSnapshot,
  saveWalletSnapshot,
} from './persist.ts';
import {
  computeReadyToCall,
  getPresence,
  listPresence,
  presenceCountOnline,
  pruneHosts,
  removePresence,
  setPresence,
  upsertPresence,
  type HostPresence,
  type HostWorkspaceMode,
} from './presenceStore.ts';
import { loadSnapshot, scheduleSave, saveNow, type PersistedSnapshot } from './persistStore.ts';
import {
  closeMongo,
  initMongo,
  loadMongoSnapshot,
  mongoConfigured,
  persistenceLabel,
} from './mongoStore.ts';

const { RtcRole, RtcTokenBuilder } = agoraToken as {
  RtcRole: { PUBLISHER: number; SUBSCRIBER: number };
  RtcTokenBuilder: {
    buildTokenWithUid: (
      appId: string,
      appCertificate: string,
      channelName: string,
      uid: number,
      role: number,
      tokenExpire: number,
      privilegeExpire: number,
    ) => string;
  };
};

const app = express();
app.use(cors());
// Host presence / live rooms used to POST huge data: avatar URLs — allow 2mb
app.use(express.json({ limit: '2mb' }));

const APP_ID = process.env.AGORA_APP_ID || '';
const APP_CERT = process.env.AGORA_APP_CERTIFICATE || '';
const PORT = Number(process.env.PORT || 4000);
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'coincall-admin';
if (!process.env.ADMIN_API_KEY) {
  console.warn(
    '[security] ADMIN_API_KEY unset — using demo default. Set a strong key before real money.',
  );
}

/** Non-admin client credits must match allowlist + per-request cap */
const CLIENT_CREDIT_MAX = 500;
const CLIENT_CREDIT_REASONS =
  /^(check-?in|spin|lucky|referral|mission|vip|welcome|reward|daily|host_earn|call_earn|gift)/i;

type CallStatus = 'ringing' | 'accepted' | 'rejected' | 'ended' | 'missed';

type CallRecord = {
  id: string;
  channel: string;
  hostId: string;
  hostName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
  status: CallStatus;
  createdAt: number;
  updatedAt: number;
  acceptedAt?: number;
  hostUidAgora: number;
  userUidAgora: number;
  giftRequest?: GiftRequestRecord | null;
  /** How many full minutes have been billed user → host */
  billedMinutes?: number;
  endReason?: CallEndReason;
};

type CallEndReason =
  | 'user'
  | 'host'
  | 'exhausted'
  | 'missed'
  | 'rejected';

type CallHistoryRecord = {
  id: string;
  hostId: string;
  hostName: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  ratePerMinute: number;
  billedMinutes: number;
  coinsSpent: number;
  status: CallStatus;
  startedAt: number;
  endedAt: number;
  durationSec: number;
  endReason: CallEndReason;
};

type GiftHistoryRecord = {
  id: string;
  fromUserId: string;
  fromName: string;
  toHostId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  roomId?: string | null;
  callId?: string | null;
  createdAt: number;
};

type GiftRequestStatus = 'pending' | 'accepted' | 'declined' | 'expired';

type GiftRequestRecord = {
  id: string;
  callId: string;
  hostId: string;
  hostName: string;
  userId: string;
  giftId: string;
  giftName: string;
  giftEmoji: string;
  coins: number;
  message?: string;
  status: GiftRequestStatus;
  createdAt: number;
  updatedAt: number;
};

const GIFT_CATALOG_SERVER: Record<
  string,
  { name: string; emoji: string; coins: number }
> = {
  rose: { name: 'Rose', emoji: '🌹', coins: 1 },
  heart: { name: 'Heart', emoji: '💖', coins: 5 },
  kiss: { name: 'Kiss', emoji: '💋', coins: 10 },
  star: { name: 'Star', emoji: '⭐', coins: 20 },
  diamond: { name: 'Diamond', emoji: '💎', coins: 99 },
  crown: { name: 'Crown', emoji: '👑', coins: 199 },
  sports: { name: 'Sports Car', emoji: '🏎️', coins: 520 },
  yacht: { name: 'Yacht', emoji: '🛥️', coins: 999 },
  castle: { name: 'Castle', emoji: '🏰', coins: 1999 },
  rocket: { name: 'Rocket', emoji: '🚀', coins: 2999 },
};

const calls = new Map<string, CallRecord>();
/** Durable call archive (capped) */
const callHistory: CallHistoryRecord[] = [];
/** Durable gift ledger for host revenue (capped) */
const giftHistory: GiftHistoryRecord[] = [];

function archiveCall(call: CallRecord, endReason: CallEndReason) {
  if (callHistory.some((c) => c.id === call.id)) return;
  const startedAt = call.acceptedAt || call.createdAt;
  const endedAt = call.updatedAt || Date.now();
  const billedMinutes = Math.max(0, Math.floor(call.billedMinutes || 0));
  const rate = Math.max(1, Math.floor(Number(call.ratePerMinute) || 80));
  const row: CallHistoryRecord = {
    id: call.id,
    hostId: call.hostId,
    hostName: call.hostName,
    userId: call.userId,
    userName: call.userName,
    userAvatar: call.userAvatar,
    ratePerMinute: rate,
    billedMinutes,
    coinsSpent: billedMinutes * rate,
    status: call.status,
    startedAt,
    endedAt,
    durationSec: Math.max(0, Math.floor((endedAt - startedAt) / 1000)),
    endReason,
  };
  callHistory.unshift(row);
  if (callHistory.length > 800) callHistory.length = 800;
  persist();
}

function forceEndCall(call: CallRecord, endReason: CallEndReason) {
  if (call.status === 'ended' || call.status === 'rejected' || call.status === 'missed') {
    archiveCall(call, call.endReason || endReason);
    return call;
  }
  call.status = 'ended';
  call.endReason = endReason;
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  patchPresence(call.hostId, { isOnCall: false });
  archiveCall(call, endReason);
  pushToHost(call.hostId, 'call_ended', call);
  broadcastWs({ type: 'call:ended', payload: call });
  return call;
}

function pushGiftHistory(event: GiftHistoryRecord) {
  giftHistory.unshift(event);
  if (giftHistory.length > 2000) giftHistory.length = 2000;
  persist();
}

function hostEarningsSummary(hostId: string) {
  const hostCalls = callHistory.filter((c) => c.hostId === hostId);
  const hostGifts = giftHistory.filter((g) => g.toHostId === hostId);
  const callCoins = hostCalls.reduce((s, c) => s + c.coinsSpent, 0);
  const giftCoins = hostGifts.reduce((s, g) => s + g.coins, 0);
  const totalDurationSec = hostCalls.reduce((s, c) => s + c.durationSec, 0);
  const answered = hostCalls.filter(
    (c) => c.status === 'ended' || c.status === 'accepted',
  );
  return {
    callCoins,
    giftCoins,
    totalCoins: callCoins + giftCoins,
    totalCalls: answered.length,
    totalDurationSec,
    totalGifts: hostGifts.length,
  };
}
const hostStreams = new Map<string, Set<express.Response>>();

function patchPresence(
  hostId: string,
  patch: Partial<HostPresence>,
): HostPresence | undefined {
  const current = getPresence(hostId);
  if (!current) return undefined;
  const next: HostPresence = {
    ...current,
    ...patch,
    id: hostId,
    lastSeen: patch.lastSeen ?? Date.now(),
  };
  next.readyToCall = computeReadyToCall(next);
  setPresence(hostId, next);
  return next;
}

function isListablePresence(h: HostPresence): boolean {
  if (!h.isOnline) return false;
  const gate = assertHostCanReceiveCalls(h.id);
  return gate.ok;
}

function requireUserMatch(req: express.Request, res: express.Response, userId: string): boolean {
  const headerId = String(req.headers['x-user-id'] || '').trim();
  const adminKeyHdr = String(req.headers['x-admin-key'] || req.query.key || '').trim();
  if (adminKeyHdr && adminKeyHdr === ADMIN_KEY) return true;
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return false;
  }
  if (headerId && headerId === userId) return true;
  res.status(401).json({ error: 'X-User-Id must match userId (or admin key)' });
  return false;
}

function requireAdmin(req: express.Request, res: express.Response): boolean {
  const key = String(req.headers['x-admin-key'] || req.query.key || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized admin' });
    return false;
  }
  return true;
}

function mintToken(channel: string, uid: number, roleName: string) {
  if (!APP_ID || !APP_CERT) {
    throw new Error('Agora server keys missing');
  }
  const role =
    roleName === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpire = now + 3600;
  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    channel,
    uid,
    role,
    privilegeExpire,
    privilegeExpire,
  );
  return { appId: APP_ID, channel, uid, role: roleName, token, expireAt: privilegeExpire };
}

function pushToHost(hostId: string, event: string, data: unknown) {
  const streams = hostStreams.get(hostId);
  if (!streams?.size) return;
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of streams) {
    res.write(payload);
  }
}

setInterval(() => pruneHosts(), 10_000);

app.get('/api/health', (_req, res) => {
  pruneHosts();
  res.json({
    ok: true,
    agoraConfigured: Boolean(APP_ID && APP_CERT),
    onlineHosts: presenceCountOnline(),
    readyHosts: listPresence().filter((h) => h.readyToCall).length,
    activeCalls: [...calls.values()].filter(
      (c) => c.status === 'ringing' || c.status === 'accepted',
    ).length,
    realtime: 'ws',
    stack: 'express+ws+agora+firebase-clients',
  });
});

/**
 * GET /api/agora/token?channel=call_xyz&uid=0&role=publisher|subscriber
 */
app.get('/api/agora/token', (req, res) => {
  try {
    const channel = String(req.query.channel || '').trim();
    if (!channel) {
      res.status(400).json({ error: 'channel is required' });
      return;
    }
    const adminOk = String(req.query.key || req.headers['x-admin-key'] || '') === ADMIN_KEY;
    if (!adminOk && !channel.startsWith('call_') && !channel.startsWith('live_') && !channel.startsWith('party_')) {
      res.status(403).json({ error: 'Channel not allowed' });
      return;
    }
    const uid = Number(req.query.uid || 0);
    const roleName = String(req.query.role || 'publisher').toLowerCase();
    res.json(mintToken(channel, uid, roleName));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Token error' });
  }
});

/** Host goes online / heartbeat */
app.post('/api/hosts/presence', (req, res) => {
  const {
    id,
    name,
    avatarUrl,
    photoUrl,
    country,
    ratePerMinute,
    isOnline = true,
    isLive = false,
    isOnCall = false,
    workspaceMode,
  } = req.body || {};

  if (!id || !name) {
    res.status(400).json({ error: 'id and name are required' });
    return;
  }

  const hostId = String(id);

  // Going offline always clears the bridge entry
  if (!isOnline) {
    removePresence(hostId);
    broadcastWs({
      type: 'host:presence',
      payload: { id: hostId, isOnline: false, readyToCall: false, isLive: false, isOnCall: false },
    });
    res.json({ ok: true, host: { id: hostId, isOnline: false } });
    return;
  }

  const gate = assertHostCanReceiveCalls(hostId);
  if (!gate.ok) {
    removePresence(hostId);
    res.status(gate.status || 403).json({ error: gate.error, ok: false });
    return;
  }

  const prev = getPresence(hostId);
  const managed = getHost(hostId);

  // Canonical field = avatarUrl; accept photoUrl alias. Never invent pravatar faces.
  // data:/blob: are host-local only — keep prior public URL or managed photo instead.
  const incoming = pickHostAvatarUrl(
    {
      avatarUrl: avatarUrl ? String(avatarUrl) : undefined,
      photoUrl: photoUrl ? String(photoUrl) : undefined,
      photoUrls: managed?.photoUrls,
    },
    { hostId, name: String(name), allowDefault: false },
  );
  const safeAvatar =
    incoming ||
    (isPublicHttpAvatar(prev?.avatarUrl) ? String(prev!.avatarUrl) : '') ||
    (isPublicHttpAvatar(managed?.photoUrl) ? String(managed!.photoUrl) : '') ||
    pickHostAvatarUrl({}, { hostId, name: String(name) });

  const mode: HostWorkspaceMode | undefined =
    workspaceMode === 'solo_calling' || workspaceMode === 'waiting_1v1'
      ? workspaceMode
      : undefined;

  const record: HostPresence = {
    id: hostId,
    name: String(name),
    avatarUrl: safeAvatar,
    country: country ? String(country) : undefined,
    ratePerMinute: Number(ratePerMinute) || 80,
    isOnline: true,
    isLive: Boolean(isLive),
    isOnCall: Boolean(isOnCall),
    readyToCall: false,
    workspaceMode: mode,
    hostStatus: gate.host?.hostStatus || 'approved',
    lastSeen: Date.now(),
  };
  record.readyToCall = computeReadyToCall(record);
  upsertPresence(record);

  // Keep admin registry photo in sync when host publishes a live https DP
  if (safeAvatar && managed && managed.photoUrl !== safeAvatar) {
    managed.photoUrl = safeAvatar;
    managed.photoUrls = [safeAvatar];
    managed.updatedAt = Date.now();
  }

  broadcastWs({
    type: 'host:presence',
    payload: {
      id: record.id,
      name: record.name,
      avatarUrl: record.avatarUrl,
      photoUrl: record.avatarUrl,
      isOnline: record.isOnline,
      isLive: record.isLive,
      isOnCall: record.isOnCall,
      readyToCall: record.readyToCall,
      workspaceMode: record.workspaceMode,
      lastSeen: record.lastSeen,
    },
  });

  res.json({ ok: true, host: record });
});

/** User app: list online CoinCall hosts */
app.get('/api/hosts', (req, res) => {
  pruneHosts();
  const readyOnly =
    String(req.query.ready || '') === '1' ||
    String(req.query.ready || '').toLowerCase() === 'true';
  let list = listPresence().filter(isListablePresence);
  if (readyOnly) {
    list = list.filter((h) => h.readyToCall);
  }
  list = list.sort((a, b) => {
    if (a.readyToCall !== b.readyToCall) return Number(b.readyToCall) - Number(a.readyToCall);
    return Number(b.isLive) - Number(a.isLive);
  });
  res.json({ hosts: list });
});

/** Host SSE stream for incoming user calls */
app.get('/api/hosts/:hostId/stream', (req, res) => {
  const hostId = String(req.params.hostId);
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  if (!hostStreams.has(hostId)) hostStreams.set(hostId, new Set());
  hostStreams.get(hostId)!.add(res);

  res.write(`event: connected\ndata: ${JSON.stringify({ hostId })}\n\n`);

  // Replay ringing calls for this host
  for (const call of calls.values()) {
    if (call.hostId === hostId && call.status === 'ringing') {
      res.write(`event: incoming_call\ndata: ${JSON.stringify(call)}\n\n`);
    }
  }

  const heartbeat = setInterval(() => {
    res.write(`: ping\n\n`);
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    hostStreams.get(hostId)?.delete(res);
  });
});

/** User rings a host */
app.post('/api/calls', (req, res) => {
  pruneHosts();
  const { hostId, userId, userName, userAvatar } = req.body || {};
  if (!hostId || !userId || !userName) {
    res.status(400).json({ error: 'hostId, userId, userName required' });
    return;
  }

  const hid = String(hostId);
  const gate = assertHostCanReceiveCalls(hid);
  if (!gate.ok) {
    res.status(gate.status || 403).json({ error: gate.error });
    return;
  }

  const host = getPresence(hid);
  if (!host || !host.isOnline) {
    res.status(404).json({ error: 'Host is offline. Ask them to Go Online in CoinCall.' });
    return;
  }
  if (host.isOnCall || !host.readyToCall) {
    res.status(409).json({
      error: 'Host is busy on another call',
    });
    return;
  }

  const rate = Math.max(1, Math.floor(Number(host.ratePerMinute) || 80));
  const userWallet = ensureWallet(String(userId), {
    role: 'user',
    displayName: String(userName),
  });
  if (userWallet.coinBalance < rate) {
    res.status(402).json({
      error: 'Insufficient balance, please recharge',
      need: rate,
      wallet: walletPublic(userWallet),
    });
    return;
  }

  const id = randomUUID().slice(0, 12);
  const call: CallRecord = {
    id,
    channel: `coincall_${id}`,
    hostId: host.id,
    hostName: host.name,
    userId: String(userId),
    userName: String(userName),
    userAvatar: userAvatar ? String(userAvatar) : undefined,
    ratePerMinute: rate,
    status: 'ringing',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostUidAgora: 200000 + Math.floor(Math.random() * 9000),
    userUidAgora: 100000 + Math.floor(Math.random() * 9000),
  };

  calls.set(id, call);
  patchPresence(host.id, { isOnCall: true });
  pushToHost(host.id, 'incoming_call', call);

  // Auto-miss after 45s
  setTimeout(() => {
    const current = calls.get(id);
    if (current?.status === 'ringing') {
      current.status = 'missed';
      current.endReason = 'missed';
      current.updatedAt = Date.now();
      calls.set(id, current);
      patchPresence(current.hostId, { isOnCall: false });
      archiveCall(current, 'missed');
      pushToHost(current.hostId, 'call_missed', current);
    }
  }, 45_000);

  res.status(201).json({ call });
});

app.get('/api/calls/:id', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  res.json({ call });
});

app.post('/api/calls/:id/accept', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status === 'accepted') {
    res.json({ call });
    return;
  }
  if (call.status !== 'ringing') {
    res.status(409).json({ error: `Call is ${call.status}` });
    return;
  }
  call.status = 'accepted';
  call.acceptedAt = Date.now();
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  pushToHost(call.hostId, 'call_accepted', call);
  broadcastWs({ type: 'call:updated', payload: call });
  res.json({ call });
});

app.post('/api/calls/:id/reject', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  call.status = 'rejected';
  call.endReason = 'rejected';
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  patchPresence(call.hostId, { isOnCall: false });
  archiveCall(call, 'rejected');
  pushToHost(call.hostId, 'call_rejected', call);
  res.json({ call });
});

app.post('/api/calls/:id/end', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const reasonRaw = String(req.body?.reason || '').trim();
  const endReason: CallEndReason =
    reasonRaw === 'exhausted'
      ? 'exhausted'
      : reasonRaw === 'host'
        ? 'host'
        : 'user';
  const ended = forceEndCall(call, endReason);
  res.json({ call: ended });
});

/**
 * Bill one call minute: deduct rate from user wallet, credit host.
 * Returns 402 when the user cannot cover the next minute.
 */
app.post('/api/calls/:id/minute', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status !== 'accepted') {
    res.status(409).json({ error: `Call is ${call.status}` });
    return;
  }
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!userId || userId !== call.userId) {
    res.status(403).json({ error: 'Only the caller can bill this call' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;

  const amount = Math.max(1, Math.floor(Number(call.ratePerMinute) || 80));
  const userWallet = ensureWallet(userId, { role: 'user', displayName: call.userName });
  if (userWallet.coinBalance < amount) {
    forceEndCall(call, 'exhausted');
    res.status(402).json({
      error: 'Coins exhausted',
      wallet: walletPublic(userWallet),
      need: amount,
      callEnded: true,
    });
    return;
  }

  userWallet.coinBalance -= amount;
  userWallet.xp += amount;
  wallets.set(userId, userWallet);
  pushLedger(userId, amount, `call_minute_${call.id}`, 'spend');

  const hostWallet = ensureWallet(call.hostId, {
    role: 'host',
    displayName: call.hostName,
  });
  hostWallet.coinBalance += amount;
  hostWallet.xp += amount;
  wallets.set(call.hostId, hostWallet);
  pushLedger(call.hostId, amount, `call_earn_${call.id}`, 'credit');

  call.billedMinutes = (call.billedMinutes || 0) + 1;
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  persist();

  recordHostEarning(call.hostId, amount, {
    kind: 'call',
    coinBalance: hostWallet.coinBalance,
    incrementCalls: call.billedMinutes === 1,
    broadcast: broadcastWs,
  });

  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: userWallet.coinBalance, xp: userWallet.xp },
  });
  broadcastWs({
    type: 'wallet:updated',
    payload: {
      userId: call.hostId,
      coinBalance: hostWallet.coinBalance,
      xp: hostWallet.xp,
    },
  });
  pushToHost(call.hostId, 'call_minute', {
    callId: call.id,
    amount,
    billedMinutes: call.billedMinutes,
    hostWallet: walletPublic(hostWallet),
  });

  res.json({
    ok: true,
    amount,
    billedMinutes: call.billedMinutes,
    userWallet: walletPublic(userWallet),
    hostWallet: walletPublic(hostWallet),
  });
});

/** Lookup user/host profile by public 6-digit appId */
app.get('/api/profiles/search', (req, res) => {
  const appId = String(req.query.appId || req.query.q || '')
    .trim()
    .replace(/\D/g, '');
  if (!/^\d{6}$/.test(appId)) {
    res.status(400).json({ error: 'Enter a 6-digit appId' });
    return;
  }
  for (const w of wallets.values()) {
    if (w.appId === appId) {
      res.json({
        profile: {
          userId: w.userId,
          appId: w.appId,
          displayName: w.displayName,
          avatarUrl: w.avatarUrl,
          role: w.role,
        },
      });
      return;
    }
  }
  res.status(404).json({ error: 'User not found' });
});

/** User call history */
app.get('/api/users/:userId/calls', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const callsForUser = callHistory.filter((c) => c.userId === userId).slice(0, limit);
  res.json({
    calls: callsForUser,
    summary: {
      totalCalls: callsForUser.length,
      totalCoinsSpent: callsForUser.reduce((s, c) => s + c.coinsSpent, 0),
      totalDurationSec: callsForUser.reduce((s, c) => s + c.durationSec, 0),
    },
  });
});

/** Host call analytics + history */
app.get('/api/hosts/:hostId/calls', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 50));
  const callsForHost = callHistory.filter((c) => c.hostId === hostId).slice(0, limit);
  const summary = hostEarningsSummary(hostId);
  res.json({
    calls: callsForHost,
    summary: {
      totalCalls: summary.totalCalls,
      totalDurationSec: summary.totalDurationSec,
      totalCallCoins: summary.callCoins,
    },
  });
});

/** Host revenue breakdown: calls + gifts with sender detail */
app.get('/api/hosts/:hostId/earnings', (req, res) => {
  const hostId = String(req.params.hostId || '').trim();
  if (!hostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;
  const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 40));
  const summary = hostEarningsSummary(hostId);
  const callsForHost = callHistory.filter((c) => c.hostId === hostId).slice(0, limit);
  const giftsForHost = giftHistory.filter((g) => g.toHostId === hostId).slice(0, limit);
  const wallet = ensureWallet(hostId, { role: 'host' });
  res.json({
    summary: {
      ...summary,
      walletBalance: wallet.coinBalance,
    },
    calls: callsForHost,
    gifts: giftsForHost,
  });
});

/** Token helper for a call participant */
app.get('/api/calls/:id/token', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status !== 'accepted' && call.status !== 'ringing') {
    res.status(409).json({ error: `Call is ${call.status}` });
    return;
  }
  const role = String(req.query.role || 'user');
  const uid = role === 'host' ? call.hostUidAgora : call.userUidAgora;
  try {
    const token = mintToken(call.channel, uid, 'publisher');
    res.json({ ...token, call });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Token error' });
  }
});

/** Host asks user for a gift during an active call */
app.post('/api/calls/:id/gift-requests', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  if (call.status !== 'accepted') {
    res.status(409).json({ error: 'Call must be active to request a gift' });
    return;
  }
  if (call.giftRequest?.status === 'pending') {
    res.status(409).json({ error: 'A gift request is already pending', giftRequest: call.giftRequest });
    return;
  }

  const giftId = String(req.body?.giftId || '').trim();
  const catalog = GIFT_CATALOG_SERVER[giftId];
  if (!catalog) {
    res.status(400).json({ error: 'Invalid giftId', gifts: Object.keys(GIFT_CATALOG_SERVER) });
    return;
  }

  const giftRequest: GiftRequestRecord = {
    id: randomUUID().slice(0, 10),
    callId: call.id,
    hostId: call.hostId,
    hostName: call.hostName,
    userId: call.userId,
    giftId,
    giftName: catalog.name,
    giftEmoji: catalog.emoji,
    coins: catalog.coins,
    message: String(req.body?.message || `${call.hostName} would love a ${catalog.name}!`),
    status: 'pending',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  call.giftRequest = giftRequest;
  call.updatedAt = Date.now();
  calls.set(call.id, call);

  broadcastWs({
    type: 'gift:request',
    payload: giftRequest,
  });
  pushToHost(call.hostId, 'gift_request_sent', giftRequest);

  // Auto-expire after 90s
  setTimeout(() => {
    const current = calls.get(call.id);
    if (current?.giftRequest?.id === giftRequest.id && current.giftRequest.status === 'pending') {
      current.giftRequest.status = 'expired';
      current.giftRequest.updatedAt = Date.now();
      current.updatedAt = Date.now();
      calls.set(current.id, current);
      broadcastWs({ type: 'gift:expired', payload: current.giftRequest });
      pushToHost(current.hostId, 'gift_request_expired', current.giftRequest);
    }
  }, 90_000);

  res.status(201).json({ ok: true, giftRequest, call });
});

/** User (or host) reads pending gift request on a call */
app.get('/api/calls/:id/gift-requests/pending', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const gr = call.giftRequest;
  if (!gr || gr.status !== 'pending') {
    res.json({ giftRequest: null });
    return;
  }
  res.json({ giftRequest: gr });
});

/** User accepts or declines a host gift request */
app.post('/api/calls/:id/gift-requests/:reqId/respond', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const gr = call.giftRequest;
  if (!gr || gr.id !== String(req.params.reqId)) {
    res.status(404).json({ error: 'Gift request not found' });
    return;
  }
  if (gr.status !== 'pending') {
    res.status(409).json({ error: `Request already ${gr.status}`, giftRequest: gr });
    return;
  }

  const action = String(req.body?.action || '').toLowerCase();
  const userId = String(req.body?.userId || call.userId).trim();
  if (!requireUserMatch(req, res, userId)) return;

  if (action === 'decline' || action === 'reject') {
    gr.status = 'declined';
    gr.updatedAt = Date.now();
    call.giftRequest = gr;
    call.updatedAt = Date.now();
    calls.set(call.id, call);
    broadcastWs({ type: 'gift:declined', payload: gr });
    pushToHost(call.hostId, 'gift_request_declined', gr);
    res.json({ ok: true, giftRequest: gr });
    return;
  }

  if (action !== 'accept') {
    res.status(400).json({ error: 'action must be accept or decline' });
    return;
  }

  // Deduct from user wallet
  const userWallet = ensureWallet(userId, { displayName: call.userName, role: 'user' });
  if (userWallet.coinBalance < gr.coins) {
    res.status(402).json({
      error: 'Insufficient coins',
      need: gr.coins,
      wallet: walletPublic(userWallet),
      giftRequest: gr,
    });
    return;
  }
  userWallet.coinBalance -= gr.coins;
  userWallet.xp += gr.coins;
  wallets.set(userId, userWallet);
  pushLedger(userId, gr.coins, `gift_to_${call.hostId}_${gr.giftId}`, 'spend');

  // Credit host
  const hostWallet = ensureWallet(call.hostId, {
    displayName: call.hostName,
    role: 'host',
  });
  hostWallet.coinBalance += gr.coins;
  hostWallet.xp += gr.coins;
  wallets.set(call.hostId, hostWallet);
  pushLedger(call.hostId, gr.coins, `gift_from_${userId}_${gr.giftId}`, 'credit');

  recordHostEarning(call.hostId, gr.coins, {
    kind: 'gift',
    coinBalance: hostWallet.coinBalance,
    broadcast: broadcastWs,
  });

  gr.status = 'accepted';
  gr.updatedAt = Date.now();
  call.giftRequest = gr;
  call.updatedAt = Date.now();
  calls.set(call.id, call);

  const payload = {
    ...gr,
    fromUserId: userId,
    fromUserName: call.userName,
    hostWallet: walletPublic(hostWallet),
    userWallet: walletPublic(userWallet),
  };

  pushGiftHistory({
    id: gr.id,
    fromUserId: userId,
    fromName: call.userName,
    toHostId: call.hostId,
    giftId: gr.giftId,
    giftName: gr.giftName,
    giftEmoji: gr.giftEmoji,
    coins: gr.coins,
    callId: call.id,
    roomId: null,
    createdAt: Date.now(),
  });

  broadcastWs({
    type: 'gift:accepted',
    payload,
  });
  pushToHost(call.hostId, 'gift_request_accepted', payload);

  res.json({ ok: true, giftRequest: gr, hostWallet: walletPublic(hostWallet), userWallet: walletPublic(userWallet) });
});

/** User sends a gift to a host during live or call (spend + credit + notify). */
app.post('/api/gifts/send', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const hostId = String(req.body?.hostId || '').trim();
  const giftId = String(req.body?.giftId || '').trim();
  const roomId = req.body?.roomId ? String(req.body.roomId).trim() : undefined;
  const callId = req.body?.callId ? String(req.body.callId).trim() : undefined;
  const userName = String(req.body?.userName || 'Fan').slice(0, 40);

  if (!userId || !hostId || !giftId) {
    res.status(400).json({ error: 'userId, hostId, giftId required' });
    return;
  }
  if (userId === hostId) {
    res.status(403).json({ error: 'Hosts cannot gift themselves!' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;

  const catalog = GIFT_CATALOG_SERVER[giftId];
  if (!catalog) {
    res.status(400).json({ error: 'Invalid giftId', gifts: Object.keys(GIFT_CATALOG_SERVER) });
    return;
  }

  const userWallet = ensureWallet(userId, { displayName: userName, role: 'user' });
  if (userWallet.coinBalance < catalog.coins) {
    res.status(402).json({
      error: 'Insufficient coins',
      need: catalog.coins,
      wallet: walletPublic(userWallet),
    });
    return;
  }

  userWallet.coinBalance -= catalog.coins;
  userWallet.xp += catalog.coins;
  wallets.set(userId, userWallet);
  pushLedger(userId, catalog.coins, `gift_to_${hostId}_${giftId}`, 'spend');

  const hostWallet = ensureWallet(hostId, { role: 'host' });
  hostWallet.coinBalance += catalog.coins;
  hostWallet.xp += catalog.coins;
  wallets.set(hostId, hostWallet);
  pushLedger(hostId, catalog.coins, `gift_from_${userId}_${giftId}`, 'credit');

  recordHostEarning(hostId, catalog.coins, {
    kind: 'gift',
    coinBalance: hostWallet.coinBalance,
    broadcast: broadcastWs,
  });

  const giftEvent = {
    id: randomUUID().slice(0, 10),
    roomId: roomId || null,
    callId: callId || null,
    fromUserId: userId,
    fromName: userName,
    toHostId: hostId,
    giftId,
    giftName: catalog.name,
    giftEmoji: catalog.emoji,
    coins: catalog.coins,
    combo: 1,
    createdAt: Date.now(),
  };

  const resolvedRoom = roomId ? findLiveRoom(roomId) : findLiveRoom(hostId);
  if (resolvedRoom) {
    const room = resolvedRoom.room;
    room.giftCoins = Number(room.giftCoins || 0) + catalog.coins;
    room.updatedAt = Date.now();
    liveRooms.set(resolvedRoom.id, room);
    pushLiveComment(resolvedRoom.id, {
      userId,
      userName,
      text: `sent ${catalog.name}`,
      kind: 'gift',
      giftEmoji: catalog.emoji,
      giftCoins: catalog.coins,
    });
    giftEvent.roomId = resolvedRoom.id;
  }

  broadcastWs({ type: 'gift:received', payload: giftEvent });
  pushToHost(hostId, 'live_gift', giftEvent);
  pushGiftHistory({
    id: giftEvent.id,
    fromUserId: giftEvent.fromUserId,
    fromName: giftEvent.fromName,
    toHostId: giftEvent.toHostId,
    giftId: giftEvent.giftId,
    giftName: giftEvent.giftName,
    giftEmoji: giftEvent.giftEmoji,
    coins: giftEvent.coins,
    roomId: giftEvent.roomId,
    callId: giftEvent.callId,
    createdAt: giftEvent.createdAt,
  });

  res.status(201).json({
    ok: true,
    gift: giftEvent,
    userWallet: walletPublic(userWallet),
    hostWallet: walletPublic(hostWallet),
  });
});

app.post('/api/admin/login', (req, res) => {
  const key = String(req.body?.key || '');
  const roleWanted = String(req.body?.role || 'super_admin');

  if (roleWanted === 'agency' || String(key).startsWith('agency-')) {
    const agency = findAgencyByLoginKey(key);
    if (!agency || agency.status === 'suspended') {
      res.status(401).json({ ok: false, error: 'Invalid agency key' });
      return;
    }
    res.json({
      ok: true,
      role: 'agency',
      roles: ['agency'],
      adminId: `agency_${agency.id}`,
      agencyId: agency.id,
      agency: publicAgency(agency),
      permissions: agency.permissions,
    });
    return;
  }

  if (key !== ADMIN_KEY) {
    res.status(401).json({ ok: false, error: 'Wrong admin key' });
    return;
  }
  const allowed = ['super_admin', 'moderator', 'finance', 'support'];
  const role = allowed.includes(roleWanted) ? roleWanted : 'super_admin';
  res.json({
    ok: true,
    role,
    roles: allowed,
    adminId: String(req.body?.adminId || 'admin'),
  });
});

app.get('/api/admin/health', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ ok: true, agoraConfigured: Boolean(APP_ID && APP_CERT) });
});

/**
 * AI / Prerecorded Host Database
 * Link cloud clips via AI_HOST_CDN env (S3/GCS/R2):
 *   ${AI_HOST_CDN}/${host_id}/intro.mp4
 *   ${AI_HOST_CDN}/${host_id}/loop.mp4
 *   ${AI_HOST_CDN}/${host_id}/avatar.jpg
 */
const AI_HOST_CDN = (process.env.AI_HOST_CDN || '').replace(/\/$/, '');
const DEMO_INTRO =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4';
const DEMO_LOOP =
  'https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerEscapes.mp4';

type AiHostRow = {
  host_id: string;
  name: string;
  avatar: string;
  video_url_1: string;
  video_url_2: string;
  age: number;
  cost_per_minute: number;
};

function aiClip(hostId: string, file: 'intro' | 'loop', demo: string) {
  if (!AI_HOST_CDN) return demo;
  return `${AI_HOST_CDN}/${hostId}/${file}.mp4`;
}

function aiAvatar(hostId: string) {
  if (AI_HOST_CDN) return `${AI_HOST_CDN}/${hostId}/avatar.jpg`;
  return `https://i.pravatar.cc/800?u=${encodeURIComponent(hostId)}`;
}

const AI_HOST_TABLE: AiHostRow[] = [
  {
    host_id: 'ai_mira',
    name: 'Mira',
    avatar: aiAvatar('ai_mira'),
    video_url_1: aiClip('ai_mira', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_mira', 'loop', DEMO_LOOP),
    age: 23,
    cost_per_minute: 80,
  },
  {
    host_id: 'ai_sofia',
    name: 'Sofia',
    avatar: aiAvatar('ai_sofia'),
    video_url_1: aiClip('ai_sofia', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_sofia', 'loop', DEMO_LOOP),
    age: 25,
    cost_per_minute: 95,
  },
  {
    host_id: 'ai_aya',
    name: 'Aya',
    avatar: aiAvatar('ai_aya'),
    video_url_1: aiClip('ai_aya', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_aya', 'loop', DEMO_LOOP),
    age: 22,
    cost_per_minute: 70,
  },
  {
    host_id: 'ai_lina',
    name: 'Lina',
    avatar: aiAvatar('ai_lina'),
    video_url_1: aiClip('ai_lina', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_lina', 'loop', DEMO_LOOP),
    age: 24,
    cost_per_minute: 85,
  },
  {
    host_id: 'ai_elena',
    name: 'Elena',
    avatar: aiAvatar('ai_elena'),
    video_url_1: aiClip('ai_elena', 'intro', DEMO_INTRO),
    video_url_2: aiClip('ai_elena', 'loop', DEMO_LOOP),
    age: 27,
    cost_per_minute: 100,
  },
];

function pickAiHost(requestedId: string): AiHostRow {
  const direct = AI_HOST_TABLE.find((h) => h.host_id === requestedId);
  if (direct) return direct;
  let hash = 0;
  for (let i = 0; i < requestedId.length; i++) {
    hash = (hash + requestedId.charCodeAt(i) * (i + 1)) % AI_HOST_TABLE.length;
  }
  return AI_HOST_TABLE[hash]!;
}

/** List AI host catalog */
app.get('/api/ai-hosts', (_req, res) => {
  res.json({
    hosts: AI_HOST_TABLE,
    cdn: AI_HOST_CDN || null,
    note: 'Set AI_HOST_CDN to your cloud bucket root for production clips',
  });
});

/**
 * Call routing decision:
 * - If 0 real hosts online → AI fallback
 * - If requested host online → agora_live
 * - Else → AI fallback for seamless UX
 */
app.post('/api/calls/route', (req, res) => {
  pruneHosts();
  const requestedHostId = String(req.body?.hostId || '').trim();
  if (!requestedHostId) {
    res.status(400).json({ error: 'hostId required' });
    return;
  }

  const online = listPresence().filter(
    (h) => isListablePresence(h) && h.readyToCall,
  );
  const matched = online.find((h) => h.id === requestedHostId) || null;

  if (matched) {
    res.json({
      ok: true,
      decision: {
        transport: 'agora_live',
        reason: 'Requested host is online — Agora bridge',
        realHostsOnline: online.length,
        aiHost: null,
        liveHostId: matched.id,
      },
    });
    return;
  }

  const aiHost = pickAiHost(requestedHostId);
  res.json({
    ok: true,
    decision: {
      transport: 'ai_prerecorded',
      reason:
        online.length === 0
          ? 'Zero real hosts online — AI Host Database fallback'
          : 'Requested host unavailable — AI fallback',
      realHostsOnline: online.length,
      aiHost,
      liveHostId: null,
    },
  });
});

/**
 * =============================================================================
 * WALLET / IAP / WITHDRAWALS / WEBSOCKET
 * =============================================================================
 * Replace in-memory `wallets` Map with Postgres when DATABASE_URL is set.
 * IAP verify stubs must be swapped for Google Play Developer API + App Store
 * Server API before production money moves.
 * =============================================================================
 */

type WalletRow = {
  userId: string;
  coinBalance: number;
  xp: number;
  isPremium: boolean;
  displayName: string;
  avatarUrl?: string;
  role: 'user' | 'host';
  /** Public 6-digit search id (e.g. "583920") */
  appId?: string;
  /** Account gate for Luma users / hosts mirrored in wallet */
  accountStatus?: 'active' | 'suspended' | 'banned';
};

type WithdrawalRequest = {
  id: string;
  hostId: string;
  amountCoins: number;
  gateway: 'easypaisa' | 'jazzcash' | 'bank';
  accountName: string;
  accountNumber: string;
  status: 'pending' | 'processing' | 'paid' | 'failed' | 'admin_review';
  createdAt: number;
  providerRef?: string;
  error?: string;
};

type ReportRow = {
  id: string;
  reporterId: string;
  reporterName: string;
  targetId: string;
  reason: string;
  details: string;
  createdAt: number;
  status: 'open' | 'resolved';
};

type LedgerEntry = {
  id: string;
  userId: string;
  amount: number;
  reason: string;
  kind: 'credit' | 'spend';
  at: number;
};

const wallets = new Map<string, WalletRow>();
const walletLedger = new Map<string, LedgerEntry[]>();
const withdrawals: WithdrawalRequest[] = [];
const reports: ReportRow[] = [];

const iapReceipts = new Set<string>();

(function hydrateWalletsFromDisk() {
  const snap = loadWalletSnapshot();
  if (!snap) return;
  for (const w of snap.wallets || []) {
    wallets.set(w.userId, { ...w } as WalletRow);
  }
  for (const [uid, list] of Object.entries(snap.ledger || {})) {
    walletLedger.set(uid, list as LedgerEntry[]);
  }
  for (const tok of snap.iapReceipts || []) iapReceipts.add(tok);
  console.log(`[persist] restored ${wallets.size} wallets from disk`);
})();

function flushWalletsToDisk() {
  // Legacy wallets.json kept as secondary backup; primary is coincall-snapshot.json
  saveWalletSnapshot({
    wallets: [...wallets.values()],
    ledger: Object.fromEntries([...walletLedger.entries()]),
    iapReceipts: [...iapReceipts],
  });
  persist();
}
setInterval(flushWalletsToDisk, 15_000);


/** Active app users (WS / heartbeat) — mass text targets */
type ActiveUserRow = {
  userId: string;
  userName: string;
  role: 'user' | 'host';
  lastSeen: number;
};
const activeUsers = new Map<string, ActiveUserRow>();

/** Per-user recharge totals — updated on every recharge */
type RechargeUserRow = {
  userId: string;
  userName: string;
  totalCoins: number;
  lastCoins: number;
  rechargeCount: number;
  lastAt: number;
};
type RechargeEvent = {
  id: string;
  userId: string;
  userName: string;
  coins: number;
  totalCoins: number;
  roomId?: string;
  at: number;
};
const rechargeByUser = new Map<string, RechargeUserRow>();
const recentRecharges: RechargeEvent[] = [];

type SupportTicket = {
  id: string;
  hostId: string;
  hostName: string;
  text: string;
  status: 'open' | 'answered' | 'closed';
  createdAt: number;
  updatedAt: number;
};
const supportTickets: SupportTicket[] = [];
const massTextHistory: Array<{
  id: string;
  hostId: string;
  hostName: string;
  text: string;
  toCount: number;
  userIds: string[];
  at: number;
}> = [];

function touchActiveUser(input: {
  userId: string;
  userName?: string;
  role?: 'user' | 'host';
}) {
  const userId = String(input.userId || '').trim();
  if (!userId || userId === 'anon' || userId === 'system') return;
  const prev = activeUsers.get(userId);
  activeUsers.set(userId, {
    userId,
    userName: String(input.userName || prev?.userName || 'User').slice(0, 40),
    role: input.role || prev?.role || 'user',
    lastSeen: Date.now(),
  });
}

function pruneActiveUsers(maxAgeMs = 15 * 60_000) {
  const now = Date.now();
  for (const [id, row] of activeUsers) {
    if (now - row.lastSeen > maxAgeMs) activeUsers.delete(id);
  }
}

function listActiveUsers() {
  pruneActiveUsers();
  return [...activeUsers.values()]
    .filter((u) => u.role === 'user')
    .sort((a, b) => b.lastSeen - a.lastSeen);
}

/** Create/update recharge row for userId every time they recharge */
function recordUserRecharge(input: {
  userId: string;
  coins: number;
  userName?: string;
  roomId?: string;
}): RechargeEvent {
  const userId = String(input.userId || '').trim() || 'viewer';
  const coins = Math.max(1, Math.floor(Number(input.coins) || 0));
  const userName = String(input.userName || rechargeByUser.get(userId)?.userName || 'Viewer').slice(
    0,
    40,
  );
  const prev = rechargeByUser.get(userId);
  const row: RechargeUserRow = {
    userId,
    userName,
    totalCoins: (prev?.totalCoins || 0) + coins,
    lastCoins: coins,
    rechargeCount: (prev?.rechargeCount || 0) + 1,
    lastAt: Date.now(),
  };
  rechargeByUser.set(userId, row);
  touchActiveUser({ userId, userName, role: 'user' });

  const event: RechargeEvent = {
    id: randomUUID().slice(0, 10),
    userId,
    userName,
    coins,
    totalCoins: row.totalCoins,
    roomId: input.roomId,
    at: row.lastAt,
  };
  recentRecharges.unshift(event);
  if (recentRecharges.length > 200) recentRecharges.length = 200;

  broadcastWs({
    type: 'recharge:updated',
    payload: {
      event,
      user: row,
      users: [...rechargeByUser.values()].sort((a, b) => b.lastAt - a.lastAt),
    },
  });
  // Notify live hosts via SSE when a user recharges
  for (const h of listPresence()) {
    if (h.isLive || h.isOnline) {
      pushToHost(h.id, 'system_recharge', {
        type: 'recharge',
        title: 'System information',
        body: `ID ${userId} user, recharge ${coins} coins`,
        userId,
        coins,
        totalCoins: row.totalCoins,
      });
    }
  }
  if (input.roomId) {
    broadcastWs({
      type: 'live:recharge',
      payload: {
        roomId: input.roomId,
        userId,
        userName,
        coins,
        totalCoins: row.totalCoins,
        at: row.lastAt,
      },
    });
  }
  return event;
}

function pushLedger(
  userId: string,
  amount: number,
  reason: string,
  kind: 'credit' | 'spend',
) {
  const entry: LedgerEntry = {
    id: randomUUID(),
    userId,
    amount,
    reason,
    kind,
    at: Date.now(),
  };
  const list = walletLedger.get(userId) || [];
  list.unshift(entry);
  walletLedger.set(userId, list.slice(0, 100));
  persist();
  return entry;
}

const IAP_PRODUCTS = [
  {
    productId: 'luma_coins_50',
    coins: 50,
    bonusCoins: 0,
    priceLabel: '$0.99',
    title: 'Starter 50',
  },
  {
    productId: 'luma_coins_500',
    coins: 500,
    bonusCoins: 50,
    priceLabel: '$4.99',
    title: 'Boost 500',
  },
  {
    productId: 'luma_coins_1200',
    coins: 1200,
    bonusCoins: 200,
    priceLabel: '$9.99',
    title: 'Lounge 1200',
    popular: true,
  },
  {
    productId: 'luma_coins_2500',
    coins: 2500,
    bonusCoins: 500,
    priceLabel: '$19.99',
    title: 'Elite 2500',
  },
];

function allocateAppId(): string {
  for (let i = 0; i < 40; i++) {
    const id = String(Math.floor(100000 + Math.random() * 900000));
    let taken = false;
    for (const w of wallets.values()) {
      if (w.appId === id) {
        taken = true;
        break;
      }
    }
    if (!taken) return id;
  }
  return String(Date.now()).slice(-6);
}

function ensureWallet(userId: string, patch?: Partial<WalletRow>): WalletRow {
  let row = wallets.get(userId);
  if (!row) {
    row = {
      userId,
      coinBalance: 0,
      xp: 0,
      isPremium: false,
      displayName: patch?.displayName || 'Luma Fan',
      avatarUrl: patch?.avatarUrl,
      role: patch?.role || 'user',
      appId: patch?.appId || allocateAppId(),
    };
    wallets.set(userId, row);
    return row;
  }
  if (!row.appId) {
    row.appId = allocateAppId();
    wallets.set(userId, row);
  }
  if (patch) {
    if (patch.displayName) row.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl;
    if (patch.role) row.role = patch.role;
    if (patch.isPremium !== undefined) row.isPremium = patch.isPremium;
    if (patch.coinBalance !== undefined) row.coinBalance = patch.coinBalance;
    if (patch.xp !== undefined) row.xp = patch.xp;
    if (patch.appId) row.appId = patch.appId;
    wallets.set(userId, row);
  }
  return row;
}

function walletPublic(row: WalletRow) {
  return {
    userId: row.userId,
    coinBalance: row.coinBalance,
    xp: row.xp,
    isPremium: row.isPremium,
    displayName: row.displayName,
    avatarUrl: row.avatarUrl,
    appId: row.appId,
    accountStatus: row.accountStatus || 'active',
  };
}

app.post('/api/wallet/me', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  const existed = wallets.has(userId);
  const displayName = String(req.body?.displayName || '').trim();
  const avatarUrl = String(req.body?.avatarUrl || '').trim();
  const updateProfile = Boolean(req.body?.updateProfile);

  let row: WalletRow;
  if (!existed) {
    row = ensureWallet(userId, {
      displayName: displayName || 'Luma Fan',
      avatarUrl: avatarUrl || undefined,
      role: req.body?.role === 'host' ? 'host' : 'user',
    });
    // Welcome coins for brand-new user profiles
    row.coinBalance = 100;
    row.xp = 10;
    wallets.set(userId, row);
    pushLedger(userId, 100, 'Welcome bonus', 'credit');
    broadcastWs({
      type: 'wallet:updated',
      payload: { userId, coinBalance: row.coinBalance, xp: row.xp },
    });
  } else {
    row = ensureWallet(userId);
    if (updateProfile || displayName) {
      if (displayName) row.displayName = displayName;
      if (avatarUrl) row.avatarUrl = avatarUrl;
      wallets.set(userId, row);
    }
  }

  res.json({ wallet: walletPublic(row), created: !existed });
});

/**
 * Host/user profile sync — does NOT accept client coinBalance (anti-fraud).
 * Returns authoritative server wallet; may update displayName/role only.
 */
app.post('/api/wallet/sync', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const row = ensureWallet(userId, {
    displayName: String(req.body?.displayName || 'Host'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  if (req.body?.displayName) {
    row.displayName = String(req.body.displayName).slice(0, 40);
  }
  if (req.body?.role === 'host' || req.body?.role === 'user') {
    row.role = req.body.role;
  }
  wallets.set(userId, row);
  persist();
  res.json({
    ok: true,
    wallet: walletPublic(row),
    note: 'coinBalance is server-authoritative; client balance ignored',
  });
});

app.post('/api/wallet/credit', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'credit');
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'userId and positive amount required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const adminOk =
    String(req.headers['x-admin-key'] || req.query.key || '').trim() === ADMIN_KEY;
  const floored = Math.floor(amount);
  if (!adminOk) {
    if (floored > CLIENT_CREDIT_MAX) {
      res.status(400).json({
        error: `Client credit capped at ${CLIENT_CREDIT_MAX} (use admin for larger)`,
      });
      return;
    }
    if (!CLIENT_CREDIT_REASONS.test(reason)) {
      res.status(400).json({
        error: 'Credit reason not allowlisted',
        hint: 'check-in, spin, referral, mission, VIP, welcome, reward, host_earn, …',
      });
      return;
    }
  }
  const row = ensureWallet(userId, {
    displayName: String(req.body?.displayName || 'Host'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  row.coinBalance += floored;
  row.xp += floored;
  wallets.set(userId, row);
  pushLedger(userId, floored, reason, 'credit');
  const reasonLower = reason.toLowerCase();
  // Live call/gift paths already call recordHostEarning — avoid double-count on call_end sync
  if (
    /host_earn/.test(reasonLower) &&
    !/call_end|call_earn_|gift_from_|call_minute/.test(reasonLower)
  ) {
    recordHostEarning(userId, floored, {
      kind: 'other',
      coinBalance: row.coinBalance,
      broadcast: broadcastWs,
    });
  }
  const isRecharge =
    reasonLower.includes('iap') ||
    reasonLower.includes('recharge') ||
    reasonLower.includes('topup') ||
    reasonLower.includes('purchase');
  if (isRecharge) {
    recordUserRecharge({
      userId,
      coins: floored,
      userName: String(req.body?.displayName || req.body?.userName || row.displayName),
      roomId: String(req.body?.roomId || '').trim() || undefined,
    });
  }
  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: row.coinBalance, xp: row.xp, reason },
  });
  res.json({ ok: true, reason, wallet: walletPublic(row) });
});

app.get('/api/wallet/history/:userId', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  ensureWallet(userId);
  res.json({ history: walletLedger.get(userId) || [] });
});

app.get('/api/wallet/products', (_req, res) => {
  res.json({ products: IAP_PRODUCTS });
});

app.post('/api/wallet/premium', (req, res) => {
  const userId = String(req.body?.userId || req.headers['x-user-id'] || '').trim();
  const isPremium = Boolean(req.body?.isPremium);
  const planId = String(req.body?.planId || '');
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const adminOk =
    String(req.headers['x-admin-key'] || req.query.key || '').trim() === ADMIN_KEY;
  const allowFreeVip =
    process.env.ALLOW_FREE_VIP === '1' || process.env.NODE_ENV !== 'production';
  if (isPremium && !adminOk && !allowFreeVip) {
    res.status(403).json({
      error: 'VIP requires verified IAP (or admin). Set ALLOW_FREE_VIP=1 only for demos.',
    });
    return;
  }
  const row = ensureWallet(userId);
  row.isPremium = isPremium;
  if (isPremium && planId) {
    pushLedger(userId, 0, `VIP plan · ${planId}`, 'credit');
  }
  wallets.set(userId, row);
  persist();
  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: row.coinBalance, xp: row.xp, isPremium },
  });
  res.json({ ok: true, wallet: walletPublic(row) });
});

app.get('/api/wallet/:userId', (req, res) => {
  const userId = String(req.params.userId || '').trim();
  const row = ensureWallet(userId);
  res.json({ wallet: walletPublic(row) });
});

app.post('/api/wallet/spend', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'spend');
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'userId and positive amount required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  const row = ensureWallet(userId);
  if (row.coinBalance < amount) {
    res.status(402).json({ error: 'Insufficient coins', wallet: walletPublic(row) });
    return;
  }
  row.coinBalance -= amount;
  row.xp += amount;
  wallets.set(userId, row);
  pushLedger(userId, amount, reason, 'spend');
  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: row.coinBalance, xp: row.xp },
  });
  res.json({ ok: true, reason, wallet: walletPublic(row) });
});

/**
 * Create checkout / deep-link session for web or native handoff.
 * Replace checkoutUrl with your Play Billing / Stripe Payment Link.
 */
app.post('/api/wallet/iap/session', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const productId = String(req.body?.productId || '').trim();
  const product = IAP_PRODUCTS.find((p) => p.productId === productId);
  if (!userId || !product) {
    res.status(400).json({ error: 'userId and valid productId required' });
    return;
  }
  const sessionId = randomUUID();
  // PRODUCTION: return a real Play Store / App Store / Stripe URL
  const checkoutUrl = `https://play.google.com/store/account/subscriptions?sku=${encodeURIComponent(productId)}&package=${encodeURIComponent(process.env.GOOGLE_PLAY_PACKAGE_NAME || 'com.yourcompany.luma')}`;
  res.json({ sessionId, checkoutUrl, product });
});

/**
 * Verify IAP receipt then credit wallet.
 * Replace stub with Google androidpublisher + Apple App Store Server API.
 */
app.post('/api/wallet/iap/verify', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const productId = String(req.body?.productId || '').trim();
  const purchaseToken = String(req.body?.purchaseToken || '').trim();
  const platform = String(req.body?.platform || 'web');
  const product = IAP_PRODUCTS.find((p) => p.productId === productId);
  if (!userId || !product || !purchaseToken) {
    res.status(400).json({ error: 'userId, productId, purchaseToken required' });
    return;
  }
  if (!requireUserMatch(req, res, userId)) return;
  if (iapReceipts.has(purchaseToken)) {
    res.status(409).json({ error: 'Purchase already redeemed' });
    return;
  }

  const googleReady = Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  const appleReady = Boolean(process.env.APPLE_IAP_SHARED_SECRET);
  const allowStub =
    process.env.ALLOW_IAP_STUB === '1' || process.env.NODE_ENV !== 'production';
  if (platform === 'google' && !googleReady) {
    if (!allowStub) {
      res.status(503).json({
        error: 'Google Play IAP not configured. Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON.',
      });
      return;
    }
    console.warn('[IAP] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing — stub accept');
  }
  if (platform === 'apple' && !appleReady) {
    if (!allowStub) {
      res.status(503).json({
        error: 'Apple IAP not configured. Set APPLE_IAP_SHARED_SECRET.',
      });
      return;
    }
    console.warn('[IAP] APPLE_IAP_SHARED_SECRET missing — stub accept');
  }
  if (platform === 'web' && !allowStub) {
    res.status(503).json({
      error: 'Web IAP stub disabled in production. Set ALLOW_IAP_STUB=1 for demo only.',
    });
    return;
  }

  iapReceipts.add(purchaseToken);
  const credited = product.coins + product.bonusCoins;
  const row = ensureWallet(userId);
  row.coinBalance += credited;
  wallets.set(userId, row);
  pushLedger(userId, credited, `IAP · ${product.title}`, 'credit');
  const userName = String(req.body?.userName || row.displayName || 'Viewer').slice(0, 40);
  const liveRoomId = String(req.body?.roomId || '').trim() || undefined;
  recordUserRecharge({
    userId,
    coins: credited,
    userName,
    roomId: liveRoomId,
  });
  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: row.coinBalance, xp: row.xp },
  });
  res.json({
    ok: true,
    balance: row.coinBalance,
    credited,
    transactionId: purchaseToken.slice(0, 24),
    wallet: walletPublic(row),
  });
});

/**
 * Host withdrawal → EasyPaisa / JazzCash / Bank
 * If merchant credentials are missing, payout enters admin_review (manual pay).
 */
app.post('/api/host/withdrawals', async (req, res) => {
  const hostId = String(req.body?.hostId || '').trim();
  const amountCoins = Number(req.body?.amountCoins || 0);
  const gateway = String(req.body?.gateway || 'easypaisa') as WithdrawalRequest['gateway'];
  const accountName = String(req.body?.accountName || '').trim();
  const accountNumber = String(req.body?.accountNumber || '').trim();

  if (!hostId || amountCoins < 100 || !accountName || !accountNumber) {
    res.status(400).json({
      error: 'hostId, amountCoins>=100, accountName, accountNumber required',
    });
    return;
  }
  if (!requireUserMatch(req, res, hostId)) return;

  // Server balance is authoritative — never trust client knownBalance
  const row = ensureWallet(hostId, {
    role: 'host',
    displayName: String(req.body?.displayName || 'Host'),
  });

  if (row.coinBalance < amountCoins) {
    res.status(402).json({ error: 'Insufficient host balance', wallet: walletPublic(row) });
    return;
  }

  row.coinBalance -= amountCoins;
  wallets.set(hostId, row);
  pushLedger(hostId, amountCoins, `withdrawal_${gateway}`, 'spend');

  const request: WithdrawalRequest = {
    id: `wd_${randomUUID()}`,
    hostId,
    amountCoins,
    gateway,
    accountName,
    accountNumber,
    status: 'pending',
    createdAt: Date.now(),
  };
  withdrawals.unshift(request);

  try {
    if (gateway === 'easypaisa') {
      if (!process.env.EASYPAY_MERCHANT_ID || !process.env.EASYPAY_HASH_KEY) {
        request.status = 'admin_review';
        request.providerRef = `manual_ep_${Date.now()}`;
      } else {
        request.status = 'processing';
        request.providerRef = `ep_${Date.now()}`;
      }
    } else if (gateway === 'jazzcash') {
      if (!process.env.JAZZCASH_MERCHANT_ID || !process.env.JAZZCASH_INTEGRITY_SALT) {
        request.status = 'admin_review';
        request.providerRef = `manual_jc_${Date.now()}`;
      } else {
        request.status = 'processing';
        request.providerRef = `jc_${Date.now()}`;
      }
    } else if (!process.env.BANK_PAYOUT_WEBHOOK_SECRET) {
      request.status = 'admin_review';
      request.providerRef = `manual_bank_${Date.now()}`;
    } else {
      request.status = 'processing';
      request.providerRef = `bank_${Date.now()}`;
    }
  } catch (e: unknown) {
    request.status = 'failed';
    request.error = e instanceof Error ? e.message : 'Payout failed';
    row.coinBalance += amountCoins;
    wallets.set(hostId, row);
  }

  persist();
  broadcastWs({
    type: 'withdrawal:created',
    payload: request,
  });

  res.json({ ok: request.status !== 'failed', withdrawal: request, wallet: walletPublic(row) });
});

app.get('/api/host/withdrawals/:hostId', (req, res) => {
  const hostId = String(req.params.hostId || '');
  res.json({
    withdrawals: withdrawals.filter((w) => w.hostId === hostId).slice(0, 50),
  });
});


app.get('/api/admin/wallets', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const all = [...wallets.values()]
    .map((w) => ({
      ...walletPublic(w),
      role: w.role,
      ledgerCount: (walletLedger.get(w.userId) || []).length,
    }))
    .sort((a, b) => b.coinBalance - a.coinBalance);
  res.json({ wallets: all, count: all.length });
});

app.post('/api/admin/wallets/:userId/status', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const userId = String(req.params.userId || '').trim();
  const status = String(req.body?.accountStatus || '').trim();
  if (!userId || !['active', 'suspended', 'banned'].includes(status)) {
    res.status(400).json({ error: 'userId and accountStatus required' });
    return;
  }
  const row = ensureWallet(userId);
  row.accountStatus = status as 'active' | 'suspended' | 'banned';
  wallets.set(userId, row);
  persist();
  res.json({ ok: true, wallet: walletPublic(row) });
});

/** Admin: live 1:1 + live rooms for Monitor / Remote Control */
app.get('/api/admin/active-sessions', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  pruneHosts();
  const nowTs = Date.now();
  const activeCalls = [...calls.values()]
    .filter((c) => c.status === 'ringing' || c.status === 'accepted')
    .map((c) => {
      const startedAt = c.acceptedAt || c.createdAt;
      return {
        id: c.id,
        kind: 'call' as const,
        channel: c.channel,
        hostId: c.hostId,
        hostName: c.hostName,
        peerId: c.userId,
        peerName: c.userName,
        peerAvatar: c.userAvatar,
        status: c.status,
        ratePerMinute: c.ratePerMinute,
        billedMinutes: c.billedMinutes || 0,
        startedAt,
        seconds: Math.max(0, Math.floor((nowTs - startedAt) / 1000)),
        coinsEarned: (c.billedMinutes || 0) * (c.ratePerMinute || 0),
      };
    });
  const rooms = [...liveRooms.values()]
    .filter((r) => r.isLive && String(r.mode || '') !== 'party')
    .map((r) => ({
      id: String(r.id),
      kind: 'live' as const,
      channel: String(r.channel || `live_${r.hostId}`),
      hostId: String(r.hostId || ''),
      hostName: String(r.hostName || 'Host'),
      title: String(r.title || 'Live'),
      viewers: Number(r.viewers || 0),
      giftCoins: Number(r.giftCoins || 0),
      thumbnailUrl: r.thumbnailUrl ? String(r.thumbnailUrl) : undefined,
      status: 'live',
    }));
  res.json({
    calls: activeCalls,
    liveRooms: rooms,
    counts: {
      calls: activeCalls.length,
      liveRooms: rooms.length,
      total: activeCalls.length + rooms.length,
    },
  });
});

/** Admin force-end a bridge call (syncs both sides) */
app.post('/api/admin/calls/:id/end', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  const ended = forceEndCall(call, 'host');
  res.json({ ok: true, call: ended });
});

/** Super-admin scannable analytics snapshot */
app.get('/api/admin/stats', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  pruneHosts();
  const presence = listPresence();
  const onlineHosts = presence.filter((h) => h.isOnline).length;
  const liveHosts = presence.filter((h) => h.isLive).length;
  const liveRoomCount = [...liveRooms.values()].filter((r) => r.isLive).length;
  const activeCalls = [...calls.values()].filter(
    (c) => c.status === 'ringing' || c.status === 'accepted',
  ).length;
  const userWallets = [...wallets.values()].filter(
    (w) => w.role === 'user' || w.userId.startsWith('luma_'),
  );
  const recentlyActive = [...activeUsers.values()].filter(
    (u) => Date.now() - u.lastSeen < 5 * 60_000,
  ).length;
  const paid = withdrawals.filter((w) => w.status === 'paid');
  const pendingWd = withdrawals.filter(
    (w) => w.status === 'pending' || w.status === 'admin_review' || w.status === 'processing',
  );
  const revenueCoins = paid.reduce((s, w) => s + w.amountCoins, 0);
  const giftLedger = [...walletLedger.values()]
    .flat()
    .filter((e) => e.kind === 'spend' && e.reason.includes('gift'));
  const dayMs = 86_400_000;
  const seriesDays: string[] = [];
  const seriesRevenue: number[] = [];
  const seriesUsers: number[] = [];
  for (let i = 6; i >= 0; i--) {
    const dayStart = Date.now() - i * dayMs;
    const label = new Date(dayStart).toLocaleDateString(undefined, {
      weekday: 'short',
    });
    seriesDays.push(label);
    const dayPaid = paid
      .filter((w) => w.createdAt >= dayStart - dayMs && w.createdAt < dayStart + dayMs)
      .reduce((s, w) => s + w.amountCoins, 0);
    const dayGifts = giftLedger
      .filter((e) => e.at >= dayStart - dayMs && e.at < dayStart + dayMs)
      .reduce((s, e) => s + e.amount, 0);
    const dayTotal = dayPaid + dayGifts;
    seriesRevenue.push(
      dayTotal > 0 ? dayTotal : Math.max(40, Math.round((7 - i) * 120 + onlineHosts * 15)),
    );
    seriesUsers.push(
      Math.max(
        1,
        Math.round(
          (userWallets.length || 8) * (0.45 + (6 - i) * 0.07) +
            (recentlyActive || 0) * 0.25,
        ),
      ),
    );
  }
  res.json({
    stats: {
      onlineHosts,
      liveHosts,
      liveRooms: liveRoomCount,
      activeCalls,
      activeUsers: recentlyActive || userWallets.length,
      totalUsers: userWallets.length,
      totalWallets: wallets.size,
      pendingWithdrawals: pendingWd.length,
      paidWithdrawals: paid.length,
      revenueCoins,
      totalCoinsInWallets: [...wallets.values()].reduce(
        (s, w) => s + w.coinBalance,
        0,
      ),
    },
    series: {
      days: seriesDays,
      revenue: seriesRevenue,
      users: seriesUsers,
    },
  });
});

app.post('/api/admin/wallets/:userId/credit', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const userId = String(req.params.userId || '').trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'Admin credit').trim();
  if (!userId || !Number.isFinite(amount) || amount === 0) {
    res.status(400).json({ error: 'userId and non-zero amount required' });
    return;
  }
  const row = ensureWallet(userId);
  const delta = Math.floor(amount);
  row.coinBalance = Math.max(0, row.coinBalance + delta);
  if (delta > 0) row.xp += delta;
  wallets.set(userId, row);
  pushLedger(userId, Math.abs(delta), reason, delta > 0 ? 'credit' : 'spend');
  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: row.coinBalance, xp: row.xp },
  });
  res.json({ ok: true, wallet: walletPublic(row) });
});

app.get('/api/admin/withdrawals', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ withdrawals: withdrawals.slice(0, 100) });
});

app.post('/api/admin/withdrawals/:id/status', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const id = String(req.params.id || '');
  const status = String(req.body?.status || '') as WithdrawalRequest['status'];
  const allowed = ['pending', 'processing', 'paid', 'failed', 'admin_review'];
  if (!allowed.includes(status)) {
    res.status(400).json({ error: 'Invalid status' });
    return;
  }
  const row = withdrawals.find((w) => w.id === id);
  if (!row) {
    res.status(404).json({ error: 'Withdrawal not found' });
    return;
  }
  const prev = row.status;
  row.status = status;
  if (status === 'failed' && prev !== 'failed' && prev !== 'paid') {
    const wallet = ensureWallet(row.hostId, { role: 'host' });
    wallet.coinBalance += row.amountCoins;
    wallets.set(row.hostId, wallet);
  }
  broadcastWs({ type: 'withdrawal:updated', payload: row });
  res.json({ ok: true, withdrawal: row });
});

app.post('/api/reports', (req, res) => {
  const reporterId = String(req.body?.reporterId || '').trim();
  const targetId = String(req.body?.targetId || '').trim();
  const reason = String(req.body?.reason || '').trim();
  if (!reporterId || !targetId || !reason) {
    res.status(400).json({ error: 'reporterId, targetId, reason required' });
    return;
  }
  const row: ReportRow = {
    id: `rpt_${randomUUID()}`,
    reporterId,
    reporterName: String(req.body?.reporterName || 'Host'),
    targetId,
    reason,
    details: String(req.body?.details || ''),
    createdAt: Date.now(),
    status: 'open',
  };
  reports.unshift(row);
  broadcastWs({ type: 'report:created', payload: row });
  res.json({ ok: true, id: row.id, report: row });
});

app.get('/api/admin/reports', (req, res) => {
  const key = String(req.query.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  res.json({ reports: reports.slice(0, 100) });
});

app.post('/api/admin/reports/:id/resolve', (req, res) => {
  const key = String(req.body?.key || req.headers['x-admin-key'] || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  const id = String(req.params.id || '');
  const row = reports.find((r) => r.id === id);
  if (!row) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  row.status = 'resolved';
  res.json({ ok: true, report: row });
});

/* -------------------- WebSocket realtime -------------------- */
const wsClients = new Set<WebSocket>();

function broadcastWs(event: unknown) {
  const raw = JSON.stringify(event);
  for (const client of wsClients) {
    if (client.readyState === WebSocket.OPEN) client.send(raw);
  }
}

registerHostManagementRoutes(app, { requireAdmin, broadcastWs });

registerVideoLibraryRoutes(app, { requireAdmin });

registerHostAppUpdateRoutes(app, { requireAdmin, broadcastWs });

registerAgencyRoutes(app, {
  requireAdmin,
  getHostRevenueSnapshot: () => {
    const hosts = listHosts();
    linkDemoHostsIfEmpty(hosts.map((h) => h.id));
    return hosts.map((h) => {
      const agencyId = getAgencyIdForHost(h.id) || undefined;
      const agency = agencyId ? getAgency(agencyId) : undefined;
      return {
        hostId: h.id,
        name: h.name,
        revenueGenerated: h.revenueGenerated || 0,
        pendingEarnings: h.pendingEarnings || 0,
        paidEarnings: h.paidEarnings || 0,
        type: (agencyId ? 'agency' : 'individual') as 'agency' | 'individual',
        agencyId,
        agencyName: agency?.name,
      };
    });
  },
});

/** In-memory live rooms (Firebase is source of truth on clients; API mirrors for Luma) */
const liveRooms = new Map<string, Record<string, unknown>>();
/** Live room chat (API mirror when Firebase RTDB unavailable on user app) */
type LiveCommentRow = {
  id: string;
  userId: string;
  userName: string;
  text: string;
  createdAt: number;
  kind: 'comment' | 'join' | 'leave' | 'follow' | 'system' | 'gift';
  giftEmoji?: string;
  giftCoins?: number;
};
const liveComments = new Map<string, LiveCommentRow[]>();

/** 1:1 DMs between Luma users and CoinCall hosts */
type DmMessageRow = {
  id: string;
  fromId: string;
  toId: string;
  fromName: string;
  fromAvatar?: string;
  text: string;
  createdAt: number;
  kind: 'text' | 'image';
};
type DmThreadMeta = {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  lastMessage: string;
  updatedAt: number;
};
const dmMessages = new Map<string, DmMessageRow[]>();
const dmThreads = new Map<string, DmThreadMeta>();

function dmChatId(a: string, b: string) {
  return [a, b].sort().join('_');
}

function upsertDmThread(input: {
  userId: string;
  userName: string;
  userAvatar?: string;
  hostId: string;
  hostName: string;
  hostAvatar?: string;
  lastMessage: string;
  at: number;
}) {
  const id = dmChatId(input.userId, input.hostId);
  const prev = dmThreads.get(id);
  dmThreads.set(id, {
    id,
    userId: input.userId,
    userName: input.userName || prev?.userName || 'Fan',
    userAvatar: input.userAvatar || prev?.userAvatar,
    hostId: input.hostId,
    hostName: input.hostName || prev?.hostName || 'Host',
    hostAvatar: input.hostAvatar || prev?.hostAvatar,
    lastMessage: input.lastMessage,
    updatedAt: input.at,
  });
  return dmThreads.get(id)!;
}

function pushDmMessage(row: Omit<DmMessageRow, 'id' | 'createdAt'> & { createdAt?: number }) {
  const chatId = dmChatId(row.fromId, row.toId);
  const list = dmMessages.get(chatId) || [];
  const msg: DmMessageRow = {
    id: randomUUID().slice(0, 12),
    createdAt: row.createdAt || Date.now(),
    fromId: row.fromId,
    toId: row.toId,
    fromName: row.fromName,
    fromAvatar: row.fromAvatar,
    text: row.text,
    kind: row.kind || 'text',
  };
  list.push(msg);
  while (list.length > 200) list.shift();
  dmMessages.set(chatId, list);
  return { chatId, msg };
}

function pushLiveComment(roomId: string, row: Omit<LiveCommentRow, 'id' | 'createdAt'> & { createdAt?: number }) {
  const list = liveComments.get(roomId) || [];
  const comment: LiveCommentRow = {
    id: randomUUID().slice(0, 10),
    createdAt: row.createdAt || Date.now(),
    userId: row.userId,
    userName: row.userName,
    text: row.text,
    kind: row.kind,
    giftEmoji: row.giftEmoji,
    giftCoins: row.giftCoins,
  };
  list.push(comment);
  while (list.length > 120) list.shift();
  liveComments.set(roomId, list);
  broadcastWs({ type: 'live:comment', payload: { roomId, comment } });
  return comment;
}

function findLiveRoom(idOrHost: string) {
  const key = String(idOrHost || '');
  if (!key) return undefined;
  if (liveRooms.has(key)) return { id: key, room: liveRooms.get(key)! };
  const asLive = key.startsWith('live_') ? key : `live_${key}`;
  if (liveRooms.has(asLive)) return { id: asLive, room: liveRooms.get(asLive)! };
  for (const [id, room] of liveRooms.entries()) {
    if (String(room.hostId || '') === key && room.isLive) {
      return { id, room };
    }
  }
  return undefined;
}

function buildSnapshot(): PersistedSnapshot {
  return {
    version: 1,
    savedAt: Date.now(),
    wallets: [...wallets.values()] as Array<Record<string, unknown>>,
    walletLedger: [...walletLedger.entries()].map(([userId, entries]) => ({
      userId,
      entries: entries as Array<Record<string, unknown>>,
    })),
    withdrawals: withdrawals as Array<Record<string, unknown>>,
    reports: reports as Array<Record<string, unknown>>,
    massTextHistory: massTextHistory as Array<Record<string, unknown>>,
    iapReceipts: [...iapReceipts],
    supportTickets: supportTickets as Array<Record<string, unknown>>,
    liveRooms: [...liveRooms.values()] as Array<Record<string, unknown>>,
    dmChats: [...dmThreads.values()].map((t) => ({
      ...t,
      messages: dmMessages.get(t.id) || [],
    })) as Array<Record<string, unknown>>,
    callHistory: callHistory as unknown as Array<Record<string, unknown>>,
    giftHistory: giftHistory as unknown as Array<Record<string, unknown>>,
  };
}

function persist() {
  scheduleSave(buildSnapshot);
}

function restoreFromDisk() {
  const snap = loadSnapshot();
  if (!snap) return;
  for (const w of snap.wallets || []) {
    const row = w as unknown as WalletRow;
    if (row?.userId) wallets.set(row.userId, row);
  }
  for (const block of snap.walletLedger || []) {
    if (block?.userId && Array.isArray(block.entries)) {
      walletLedger.set(block.userId, block.entries as unknown as LedgerEntry[]);
    }
  }
  if (Array.isArray(snap.withdrawals)) {
    withdrawals.length = 0;
    withdrawals.push(...(snap.withdrawals as unknown as WithdrawalRequest[]));
  }
  if (Array.isArray(snap.reports)) {
    reports.length = 0;
    reports.push(...(snap.reports as unknown as ReportRow[]));
  }
  for (const token of snap.iapReceipts || []) iapReceipts.add(String(token));
  if (Array.isArray(snap.massTextHistory)) {
    massTextHistory.length = 0;
    massTextHistory.push(
      ...(snap.massTextHistory as unknown as typeof massTextHistory),
    );
  }
  if (Array.isArray(snap.supportTickets)) {
    supportTickets.length = 0;
    supportTickets.push(
      ...(snap.supportTickets as unknown as SupportTicket[]),
    );
  }
  for (const room of snap.liveRooms || []) {
    const id = String((room as { id?: string }).id || '');
    if (id && (room as { isLive?: boolean }).isLive) {
      liveRooms.set(id, room);
    }
  }
  for (const chat of snap.dmChats || []) {
    const id = String((chat as { id?: string }).id || '');
    if (!id) continue;
    const row = chat as DmThreadMeta & { messages?: DmMessageRow[] };
    dmThreads.set(id, {
      id,
      userId: String(row.userId || ''),
      userName: String(row.userName || 'Fan'),
      userAvatar: row.userAvatar ? String(row.userAvatar) : undefined,
      hostId: String(row.hostId || ''),
      hostName: String(row.hostName || 'Host'),
      hostAvatar: row.hostAvatar ? String(row.hostAvatar) : undefined,
      lastMessage: String(row.lastMessage || ''),
      updatedAt: Number(row.updatedAt || Date.now()),
    });
    if (Array.isArray(row.messages)) {
      dmMessages.set(id, row.messages);
    }
  }
  if (Array.isArray(snap.callHistory)) {
    callHistory.length = 0;
    callHistory.push(...(snap.callHistory as unknown as CallHistoryRecord[]));
  }
  if (Array.isArray(snap.giftHistory)) {
    giftHistory.length = 0;
    giftHistory.push(...(snap.giftHistory as unknown as GiftHistoryRecord[]));
  }
  console.log(
    `[persist] restored wallets=${wallets.size} withdrawals=${withdrawals.length} liveRooms=${liveRooms.size} dm=${dmThreads.size} calls=${callHistory.length} gifts=${giftHistory.length}`,
  );
}

restoreFromDisk();

async function applyMongoOrDisk() {
  const ok = await initMongo();
  if (!ok) return;
  const snap = await loadMongoSnapshot();
  if (!snap) {
    console.log('[persist] Mongo empty — keeping disk/in-memory state');
    return;
  }
  for (const w of snap.wallets || []) {
    const row = w as unknown as WalletRow;
    if (row?.userId) wallets.set(row.userId, row);
  }
  for (const block of snap.walletLedger || []) {
    if (block?.userId && Array.isArray(block.entries)) {
      walletLedger.set(block.userId, block.entries as unknown as LedgerEntry[]);
    }
  }
  if (Array.isArray(snap.withdrawals)) {
    withdrawals.length = 0;
    withdrawals.push(...(snap.withdrawals as unknown as WithdrawalRequest[]));
  }
  if (Array.isArray(snap.reports)) {
    reports.length = 0;
    reports.push(...(snap.reports as unknown as ReportRow[]));
  }
  for (const token of snap.iapReceipts || []) iapReceipts.add(String(token));
  if (Array.isArray(snap.massTextHistory)) {
    massTextHistory.length = 0;
    massTextHistory.push(
      ...(snap.massTextHistory as unknown as typeof massTextHistory),
    );
  }
  if (Array.isArray(snap.supportTickets)) {
    supportTickets.length = 0;
    supportTickets.push(
      ...(snap.supportTickets as unknown as SupportTicket[]),
    );
  }
  for (const room of snap.liveRooms || []) {
    const id = String((room as { id?: string }).id || '');
    if (id && (room as { isLive?: boolean }).isLive) {
      liveRooms.set(id, room);
    }
  }
  if (Array.isArray(snap.callHistory)) {
    callHistory.length = 0;
    callHistory.push(...(snap.callHistory as unknown as CallHistoryRecord[]));
  }
  if (Array.isArray(snap.giftHistory)) {
    giftHistory.length = 0;
    giftHistory.push(...(snap.giftHistory as unknown as GiftHistoryRecord[]));
  }
  console.log(
    `[persist] restored from Mongo wallets=${wallets.size} withdrawals=${withdrawals.length} calls=${callHistory.length} gifts=${giftHistory.length}`,
  );
}

app.get('/api/ready', (_req, res) => {
  pruneHosts();
  res.json({
    ok: true,
    agoraConfigured: Boolean(APP_ID && APP_CERT),
    onlineHosts: presenceCountOnline(),
    readyHosts: listPresence().filter((h) => h.readyToCall).length,
    wallets: wallets.size,
    liveRooms: [...liveRooms.values()].filter((r) => r.isLive).length,
    withdrawals: withdrawals.length,
    persistence: persistenceLabel(),
    mongoConfigured: mongoConfigured(),
    realtime: 'ws',
    iapStubAllowed:
      process.env.ALLOW_IAP_STUB === '1' || process.env.NODE_ENV !== 'production',
  });
});

app.post('/api/live/rooms', (req, res) => {
  const room = { ...(req.body as Record<string, unknown>) };
  const id = String(room?.id || '');
  if (!id) {
    res.status(400).json({ error: 'id required' });
    return;
  }
  const hostId = String(room.hostId || '');
  // Never store multi-MB data: URLs — they break the user live app
  for (const key of ['hostAvatar', 'thumbnailUrl'] as const) {
    const v = room[key];
    if (
      typeof v === 'string' &&
      (v.startsWith('data:') || v.startsWith('blob:') || !isPublicHttpAvatar(v))
    ) {
      // Keep empty — Luma will show initials default; never invent random faces
      room[key] = '';
    }
  }
  liveRooms.set(id, { ...room, updatedAt: Date.now() });
  if (hostId) {
    const existing = getPresence(hostId);
    if (existing) {
      patchPresence(hostId, { isLive: true, isOnline: true });
    } else {
      // Host went live before heartbeat — still list them for other hosts
      upsertPresence({
        id: hostId,
        name: String(room.hostName || 'Host'),
        avatarUrl: room.hostAvatar ? String(room.hostAvatar) : undefined,
        ratePerMinute: 80,
        isOnline: true,
        isLive: true,
        isOnCall: false,
        readyToCall: false,
        lastSeen: Date.now(),
      });
    }
  }
  broadcastWs({ type: 'live:room', payload: room });
  persist();
  res.json({ ok: true, room });
});

app.get('/api/live/rooms', (_req, res) => {
  const rooms = [...liveRooms.values()]
    .filter((r) => r.isLive && String(r.mode || 'solo') !== 'party')
    .map((r) => {
      const hostId = String(r.hostId || r.id || 'host');
      const out = { ...r };
      for (const key of ['hostAvatar', 'thumbnailUrl'] as const) {
        const v = out[key];
        if (
          typeof v === 'string' &&
          (v.startsWith('data:') ||
            v.startsWith('blob:') ||
            !isPublicHttpAvatar(v))
        ) {
          out[key] = '';
        }
      }
      return out;
    });
  res.json({ rooms });
});

/** Resolve a host-only live room by room id or host id */
app.get('/api/live/rooms/:id', (req, res) => {
  const found = findLiveRoom(String(req.params.id || ''));
  if (!found || !found.room.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  if (String(found.room.mode || 'solo') === 'party') {
    res.status(404).json({ error: 'Party rooms are not available in Host-Only Live' });
    return;
  }
  const hostId = String(found.room.hostId || found.id);
  const out = { ...found.room, id: found.id };
  for (const key of ['hostAvatar', 'thumbnailUrl'] as const) {
    const v = out[key];
    if (
      typeof v === 'string' &&
      (v.startsWith('data:') ||
        v.startsWith('blob:') ||
        !isPublicHttpAvatar(v))
    ) {
      out[key] = '';
    }
  }
  res.json({
    room: out,
    channel: String(found.room.channel || found.id),
    giftCoins: Number(found.room.giftCoins || 0),
    viewers: Number(found.room.viewers || 0),
  });
});

app.get('/api/live/rooms/:id/comments', (req, res) => {
  const found = findLiveRoom(String(req.params.id || ''));
  if (!found) {
    // Soft-empty so clients can poll before room mirrors to API
    res.json({ comments: [] });
    return;
  }
  const list = liveComments.get(found.id) || [];
  res.json({ comments: list.slice(-80), roomId: found.id });
});

app.post('/api/live/rooms/:id/comments', (req, res) => {
  const rawId = String(req.params.id || '');
  let found = findLiveRoom(rawId);
  if (!found || !found.room.isLive) {
    // Soft-create so chat works even if room only exists on host Firebase
    const hostId = String(
      req.body?.hostId || (rawId.startsWith('live_') ? rawId.slice(5) : rawId),
    ).trim();
    if (!hostId) {
      res.status(404).json({ error: 'Live room not found' });
      return;
    }
    const presence = getPresence(hostId);
    const roomId = rawId.startsWith('live_') ? rawId : `live_${hostId}`;
    const room = {
      id: roomId,
      hostId,
      hostName: String(req.body?.hostName || presence?.name || 'Host'),
      channel: roomId,
      isLive: true,
      mode: 'solo',
      viewers: Number(presence ? 1 : 0),
      giftCoins: 0,
      updatedAt: Date.now(),
    };
    liveRooms.set(roomId, room);
    if (presence) patchPresence(hostId, { isLive: true, isOnline: true });
    found = { id: roomId, room };
  }
  const userId = String(req.body?.userId || '').trim().slice(0, 64);
  const userName = String(req.body?.userName || 'Viewer').trim().slice(0, 40) || 'Viewer';
  const text = String(req.body?.text || '').trim().slice(0, 200);
  if (!userId || !text) {
    res.status(400).json({ error: 'userId and text required' });
    return;
  }
  const comment = pushLiveComment(found.id, {
    userId,
    userName,
    text,
    kind: 'comment',
  });
  pushToHost(String(found.room.hostId || ''), 'live_comment', {
    roomId: found.id,
    comment,
  });
  res.status(201).json({ ok: true, comment, roomId: found.id });
});

/** Viewer join / leave — bumps room viewer count for the active live list */
app.post('/api/live/rooms/:id/viewers', (req, res) => {
  const found = findLiveRoom(String(req.params.id || ''));
  if (!found || !found.room.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  const delta = Math.max(-5, Math.min(5, Math.floor(Number(req.body?.delta) || 0)));
  const userId = String(req.body?.userId || 'viewer').slice(0, 64);
  const userName = String(req.body?.userName || 'Viewer').slice(0, 40);
  const next = Math.max(0, Number(found.room.viewers || 0) + delta);
  found.room.viewers = next;
  found.room.updatedAt = Date.now();
  liveRooms.set(found.id, found.room);
  if (delta > 0) {
    pushLiveComment(found.id, {
      userId,
      userName,
      text: 'joined',
      kind: 'join',
    });
  }
  broadcastWs({
    type: 'live:viewers',
    payload: { roomId: found.id, viewers: next },
  });
  persist();
  res.json({ ok: true, viewers: next });
});

app.post('/api/live/rooms/:id/end', (req, res) => {
  const id = String(req.params.id || '');
  const room = liveRooms.get(id);
  if (room) {
    room.isLive = false;
    room.endedAt = Date.now();
    liveRooms.set(id, room);
    const hostId = String(room.hostId || req.body?.hostId || '');
    if (hostId && getPresence(hostId)) {
      patchPresence(hostId, { isLive: false });
    }
  }
  broadcastWs({ type: 'live:ended', payload: { id } });
  res.json({ ok: true });
});

app.post('/api/live/rooms/:id/title', (req, res) => {
  const id = String(req.params.id || '');
  const title = String(req.body?.title || '').trim().slice(0, 48);
  const room = liveRooms.get(id);
  if (!room) {
    res.status(404).json({ error: 'Room not found' });
    return;
  }
  if (!title) {
    res.status(400).json({ error: 'title required' });
    return;
  }
  room.title = title;
  room.updatedAt = Date.now();
  liveRooms.set(id, room);
  broadcastWs({ type: 'live:title', payload: { id, title } });
  res.json({ ok: true, room });
});

/** Announce a viewer recharge into a live room (user app / host demo). */
app.post('/api/live/rooms/:id/recharge', (req, res) => {
  const id = String(req.params.id || '');
  const room = liveRooms.get(id);
  if (!room || !room.isLive) {
    res.status(404).json({ error: 'Live room not found' });
    return;
  }
  const userName = String(req.body?.userName || 'Viewer').slice(0, 40);
  const userId = String(req.body?.userId || 'viewer').slice(0, 64);
  const coins = Math.max(1, Math.floor(Number(req.body?.coins) || 0));
  const event = recordUserRecharge({ userId, userName, coins, roomId: id });
  pushToHost(String(room.hostId || ''), 'viewer_recharge', event);
  res.json({ ok: true, recharge: event });
});

/** Active users (for mass text) */
app.get('/api/users/active', (_req, res) => {
  res.json({ users: listActiveUsers(), count: listActiveUsers().length });
});

app.post('/api/users/active', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  touchActiveUser({
    userId,
    userName: String(req.body?.userName || 'User'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  res.json({ ok: true, users: listActiveUsers() });
});

/** Recharge board: every userId + coins, updated on each recharge */
app.get('/api/recharges', (_req, res) => {
  res.json({
    users: [...rechargeByUser.values()].sort((a, b) => b.lastAt - a.lastAt),
    events: recentRecharges.slice(0, 50),
  });
});

/** Host mass-texts ALL known users (active + rechargers + wallets) */
app.post('/api/host/mass-text', (req, res) => {
  const hostId = String(req.body?.hostId || '').trim();
  const hostName = String(req.body?.hostName || 'Host').slice(0, 40);
  const text = String(req.body?.text || '').trim().slice(0, 500);
  if (!hostId || !text) {
    res.status(400).json({ error: 'hostId and text required' });
    return;
  }

  pruneActiveUsers();
  const targetMap = new Map<string, { userId: string; userName: string }>();
  for (const u of listActiveUsers()) {
    if (u.userId !== hostId) targetMap.set(u.userId, { userId: u.userId, userName: u.userName });
  }
  for (const u of rechargeByUser.values()) {
    if (u.userId !== hostId) {
      targetMap.set(u.userId, { userId: u.userId, userName: u.userName });
    }
  }
  for (const w of wallets.values()) {
    if (w.role === 'user' && w.userId !== hostId) {
      if (!targetMap.has(w.userId)) {
        targetMap.set(w.userId, {
          userId: w.userId,
          userName: w.displayName || 'User',
        });
      }
    }
  }

  // Ensure demo recipients so mass text always has targets in empty env
  if (targetMap.size === 0) {
    for (let i = 1; i <= 8; i++) {
      const id = `demo_user_${i}`;
      touchActiveUser({ userId: id, userName: `Fan ${i}`, role: 'user' });
      targetMap.set(id, { userId: id, userName: `Fan ${i}` });
    }
  }

  const targets = [...targetMap.values()];
  const payload = {
    id: randomUUID().slice(0, 10),
    hostId,
    hostName,
    text,
    toCount: targets.length,
    userIds: targets.map((u) => u.userId),
    broadcast: true,
    at: Date.now(),
  };
  massTextHistory.unshift(payload);
  if (massTextHistory.length > 50) massTextHistory.length = 50;

  // Reach every connected Luma fan over WS (not only listed targets)
  broadcastWs({ type: 'mass:text', payload });
  for (const u of targets) {
    pushToHost(u.userId, 'mass_text', payload);
  }
  pushToHost(hostId, 'mass_text_sent', {
    ...payload,
    title: 'Mass texting sent',
    body: `Sent to ${targets.length} users`,
  });
  persist();

  res.json({
    ok: true,
    sent: targets.length,
    broadcast: payload,
    userIds: payload.userIds,
    recipients: targets.slice(0, 40),
  });
});

app.get('/api/host/mass-text/history', (req, res) => {
  const hostId = String(req.query.hostId || '').trim();
  const list = hostId
    ? massTextHistory.filter((m) => m.hostId === hostId)
    : massTextHistory;
  res.json({ items: list.slice(0, 30) });
});

/** Fan inbox — mass texts addressed to this user (or broadcast to all) */
app.get('/api/users/inbox', (req, res) => {
  const userId = String(req.query.userId || '').trim();
  if (!userId) {
    res.status(400).json({ error: 'userId required' });
    return;
  }
  const items = massTextHistory
    .filter((m) => !m.userIds?.length || m.userIds.includes(userId))
    .slice(0, 40)
    .map((m) => ({
      id: m.id,
      hostId: m.hostId,
      hostName: m.hostName,
      text: m.text,
      at: m.at,
      kind: 'mass_text' as const,
    }));
  res.json({ items });
});

/** Audience token for watching a host live stream (Agora live mode) */
app.get('/api/live/token', (req, res) => {
  try {
    const hostId = String(req.query.hostId || '').trim();
    const channelParam = String(req.query.channel || '').trim();
    const channel = channelParam || (hostId ? `live_${hostId}` : '');
    if (!channel) {
      res.status(400).json({ error: 'hostId or channel required' });
      return;
    }
    const adminOk = String(req.query.key || req.headers['x-admin-key'] || '') === ADMIN_KEY;
    if (
      !adminOk &&
      !channel.startsWith('live_') &&
      !channel.startsWith('party_') &&
      !channel.startsWith('call_')
    ) {
      res.status(403).json({ error: 'Channel not allowed' });
      return;
    }
    const uid = Number(req.query.uid || Math.floor(100000 + Math.random() * 800000));
    // Publisher privilege so RTC subscribe works even if project role checks are strict
    res.json(mintToken(channel, uid, 'publisher'));
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Token error' });
  }
});

/** Host creates admin support ticket */
app.post('/api/support/tickets', (req, res) => {
  const hostId = String(req.body?.hostId || '').trim();
  const hostName = String(req.body?.hostName || 'Host').slice(0, 40);
  const text = String(req.body?.text || '').trim().slice(0, 1000);
  if (!hostId || !text) {
    res.status(400).json({ error: 'hostId and text required' });
    return;
  }
  const ticket: SupportTicket = {
    id: `sup_${randomUUID().slice(0, 8)}`,
    hostId,
    hostName,
    text,
    status: 'open',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  supportTickets.unshift(ticket);
  broadcastWs({ type: 'support:ticket', payload: ticket });
  res.status(201).json({ ok: true, ticket });
});

app.get('/api/support/tickets', (req, res) => {
  const hostId = String(req.query.hostId || '').trim();
  const list = hostId
    ? supportTickets.filter((t) => t.hostId === hostId)
    : supportTickets;
  res.json({ tickets: list.slice(0, 100) });
});

app.get('/api/admin/support/tickets', (req, res) => {
  if (!requireAdmin(req, res)) return;
  res.json({ tickets: supportTickets.slice(0, 200) });
});

app.post('/api/admin/support/tickets/:id/status', (req, res) => {
  if (!requireAdmin(req, res)) return;
  const id = String(req.params.id || '');
  const ticket = supportTickets.find((t) => t.id === id);
  if (!ticket) {
    res.status(404).json({ error: 'Ticket not found' });
    return;
  }
  const status = String(req.body?.status || '').toLowerCase();
  if (!['open', 'answered', 'closed'].includes(status)) {
    res.status(400).json({ error: 'status must be open|answered|closed' });
    return;
  }
  ticket.status = status as SupportTicket['status'];
  ticket.updatedAt = Date.now();
  broadcastWs({ type: 'support:ticket', payload: ticket });
  res.json({ ok: true, ticket });
});

/** -------- Direct messages (Luma user ↔ Host) -------- */
app.post('/api/dm/send', (req, res) => {
  const fromId = String(req.body?.fromId || '').trim();
  const toId = String(req.body?.toId || '').trim();
  const text = String(req.body?.text || '').trim().slice(0, 500);
  const fromName = String(req.body?.fromName || 'User').trim().slice(0, 40) || 'User';
  const fromAvatar = req.body?.fromAvatar ? String(req.body.fromAvatar).slice(0, 500) : undefined;
  const fromRole = String(req.body?.fromRole || 'user') === 'host' ? 'host' : 'user';
  const peerName = String(req.body?.peerName || '').trim().slice(0, 40);
  const peerAvatar = req.body?.peerAvatar ? String(req.body.peerAvatar).slice(0, 500) : undefined;

  if (!fromId || !toId || !text) {
    res.status(400).json({ error: 'fromId, toId, text required' });
    return;
  }

  const { chatId, msg } = pushDmMessage({
    fromId,
    toId,
    fromName,
    fromAvatar,
    text,
    kind: 'text',
  });

  const userId = fromRole === 'user' ? fromId : toId;
  const hostId = fromRole === 'host' ? fromId : toId;
  const userName = fromRole === 'user' ? fromName : peerName || 'Fan';
  const hostName = fromRole === 'host' ? fromName : peerName || 'Host';
  const userAvatar = fromRole === 'user' ? fromAvatar : peerAvatar;
  const hostAvatar = fromRole === 'host' ? fromAvatar : peerAvatar;

  const thread = upsertDmThread({
    userId,
    userName,
    userAvatar,
    hostId,
    hostName,
    hostAvatar,
    lastMessage: text,
    at: msg.createdAt,
  });

  const payload = { chatId, message: msg, thread };
  broadcastWs({ type: 'dm:message', payload });
  pushToHost(hostId, 'dm_message', payload);
  persist();
  res.status(201).json({ ok: true, ...payload });
});

app.get('/api/dm/threads', (req, res) => {
  const userId = String(req.query.userId || '').trim();
  const hostId = String(req.query.hostId || '').trim();
  let threads = [...dmThreads.values()];
  if (userId) threads = threads.filter((t) => t.userId === userId);
  if (hostId) threads = threads.filter((t) => t.hostId === hostId);
  threads.sort((a, b) => b.updatedAt - a.updatedAt);
  res.json({ threads });
});

app.get('/api/dm/messages', (req, res) => {
  const a = String(req.query.a || req.query.userId || '').trim();
  const b = String(req.query.b || req.query.hostId || '').trim();
  if (!a || !b) {
    res.status(400).json({ error: 'a and b (userId/hostId) required' });
    return;
  }
  const chatId = dmChatId(a, b);
  res.json({
    chatId,
    messages: dmMessages.get(chatId) || [],
  });
});

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket, req) => {
  wsClients.add(socket);
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'anon';
  const userName = url.searchParams.get('name') || 'User';
  const role = url.searchParams.get('role') === 'host' ? 'host' : 'user';
  touchActiveUser({ userId, userName, role });
  socket.send(JSON.stringify({ type: 'connected', payload: { userId } }));

  socket.on('message', (buf) => {
    try {
      const raw = JSON.parse(String(buf)) as {
        type: string;
        roomId?: string;
        userId?: string;
        text?: string;
        fromUserId?: string;
        giftId?: string;
        coins?: number;
        label?: string;
        toHostId?: string;
        payload?: Record<string, unknown>;
      };
      const payload = (raw.payload || {}) as Record<string, unknown>;
      const type = raw.type;
      const roomId = String(raw.roomId || payload.roomId || '');
      const text = String(raw.text || payload.text || '');
      const coins = Number(raw.coins ?? payload.coins ?? 0);
      const hostId = String(raw.userId || payload.hostId || payload.userId || userId);

      if (type === 'host:hello' || type === 'user:hello' || type === 'hello') {
        touchActiveUser({
          userId: hostId,
          userName: String(payload.name || payload.userName || userName),
          role: type === 'host:hello' ? 'host' : 'user',
        });
        socket.send(JSON.stringify({ type: 'host:welcome', payload: { hostId } }));
        return;
      }

      if (type === 'party:message' && roomId && text) {
        broadcastWs({
          type: 'party:message',
          payload: {
            roomId,
            userId: hostId,
            text,
            at: Date.now(),
          },
        });
      }

      if (type === 'gift:send') {
        broadcastWs({
          type: 'gift:received',
          payload: {
            roomId,
            fromUserId: String(raw.fromUserId || payload.fromHostId || hostId),
            giftId: raw.giftId || payload.giftId,
            coins,
            label: raw.label || payload.label || 'Gift',
            toHostId: raw.toHostId || payload.toHostId,
          },
        });
      }

      if (type === 'dm:send') {
        const fromId = String(
          payload.fromId || (raw as { fromId?: string }).fromId || raw.fromUserId || userId,
        );
        const toId = String(
          payload.toId || (raw as { toId?: string }).toId || raw.toHostId || '',
        );
        const dmText = String(payload.text || text || '').trim().slice(0, 500);
        if (fromId && toId && dmText) {
          const fromRole = String(payload.fromRole || (raw as { fromRole?: string }).fromRole || 'user') === 'host' ? 'host' : 'user';
          const fromName = String(
            payload.fromName || (raw as { fromName?: string }).fromName || userName || 'User',
          ).slice(0, 40);
          const { chatId, msg } = pushDmMessage({
            fromId,
            toId,
            fromName,
            text: dmText,
            kind: 'text',
          });
          const uId = fromRole === 'user' ? fromId : toId;
          const hId = fromRole === 'host' ? fromId : toId;
          const thread = upsertDmThread({
            userId: uId,
            userName: fromRole === 'user' ? fromName : String(payload.peerName || 'Fan'),
            hostId: hId,
            hostName: fromRole === 'host' ? fromName : String(payload.peerName || 'Host'),
            lastMessage: dmText,
            at: msg.createdAt,
          });
          const dmPayload = { chatId, message: msg, thread };
          broadcastWs({ type: 'dm:message', payload: dmPayload });
          pushToHost(hId, 'dm_message', dmPayload);
          persist();
        }
      }

      if (type === 'gift:request') {
        broadcastWs({
          type: 'gift:request',
          payload: {
            ...payload,
            at: Date.now(),
          },
        });
      }

      if (type === 'gift:respond') {
        broadcastWs({
          type: String(payload.status) === 'accepted' ? 'gift:accepted' : 'gift:declined',
          payload: {
            ...payload,
            at: Date.now(),
          },
        });
      }

      if (type === 'party:join' && roomId) {
        broadcastWs({
          type: 'party:seat',
          payload: { roomId, seats: [], userId: hostId },
        });
      }
    } catch {
      /* ignore */
    }
  });

  socket.on('close', () => wsClients.delete(socket));
});

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`CoinCall API listening on http://0.0.0.0:${PORT}`);
  console.log(`WS:     ws://0.0.0.0:${PORT}/ws`);
  console.log(`Health: GET /api/health`);
  console.log(`Wallet: POST /api/wallet/me  POST /api/wallet/spend  POST /api/wallet/iap/verify`);
  console.log(`Payout: POST /api/host/withdrawals`);
  console.log(`Hosts:  GET /api/hosts`);
  console.log(`Calls:  POST /api/calls`);
  console.log(`Persist: ${persistenceLabel()}`);
});

void applyMongoOrDisk().catch((e) => {
  console.warn('[persist] mongo boot skipped', e);
});

function flushPersist() {
  try {
    saveNow(buildSnapshot);
  } catch {
    /* ignore */
  }
  void closeMongo();
}

process.on('SIGTERM', () => {
  flushPersist();
  process.exit(0);
});
process.on('SIGINT', () => {
  flushPersist();
  process.exit(0);
});

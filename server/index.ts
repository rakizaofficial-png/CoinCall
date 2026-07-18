import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agoraToken from 'agora-token';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { registerHostManagementRoutes } from './hostManagement.ts';

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
app.use(express.json());

const APP_ID = process.env.AGORA_APP_ID || '';
const APP_CERT = process.env.AGORA_APP_CERTIFICATE || '';
const PORT = Number(process.env.PORT || 4000);
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'coincall-admin';
const HOST_TTL_MS = 90_000;

type HostPresence = {
  id: string;
  name: string;
  avatarUrl?: string;
  country?: string;
  ratePerMinute: number;
  isOnline: boolean;
  isLive: boolean;
  isOnCall: boolean;
  lastSeen: number;
};

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
  hostUidAgora: number;
  userUidAgora: number;
  giftRequest?: GiftRequestRecord | null;
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

const hosts = new Map<string, HostPresence>();
const calls = new Map<string, CallRecord>();
const hostStreams = new Map<string, Set<express.Response>>();

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

function pruneHosts() {
  const now = Date.now();
  for (const [id, h] of hosts) {
    if (now - h.lastSeen > HOST_TTL_MS) {
      hosts.delete(id);
    }
  }
}

setInterval(pruneHosts, 10_000);

app.get('/api/health', (_req, res) => {
  pruneHosts();
  res.json({
    ok: true,
    agoraConfigured: Boolean(APP_ID && APP_CERT),
    onlineHosts: [...hosts.values()].filter((h) => h.isOnline).length,
    activeCalls: [...calls.values()].filter(
      (c) => c.status === 'ringing' || c.status === 'accepted',
    ).length,
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
    country,
    ratePerMinute,
    isOnline = true,
    isLive = false,
    isOnCall = false,
  } = req.body || {};

  if (!id || !name) {
    res.status(400).json({ error: 'id and name are required' });
    return;
  }

  // blob: / data: avatars only work inside the host browser — drop them for Luma
  let safeAvatar = avatarUrl ? String(avatarUrl) : undefined;
  if (
    safeAvatar &&
    (safeAvatar.startsWith('blob:') ||
      safeAvatar.startsWith('data:') ||
      safeAvatar.length > 500)
  ) {
    safeAvatar = undefined;
  }

  const record: HostPresence = {
    id: String(id),
    name: String(name),
    avatarUrl:
      safeAvatar ||
      `https://i.pravatar.cc/150?u=${encodeURIComponent(String(id))}`,
    country: country ? String(country) : undefined,
    ratePerMinute: Number(ratePerMinute) || 80,
    isOnline: Boolean(isOnline),
    isLive: Boolean(isLive),
    isOnCall: Boolean(isOnCall),
    lastSeen: Date.now(),
  };

  if (!record.isOnline) {
    hosts.delete(record.id);
  } else {
    hosts.set(record.id, record);
  }

  res.json({ ok: true, host: record });
});

/** User app: list online CoinCall hosts */
app.get('/api/hosts', (_req, res) => {
  pruneHosts();
  const list = [...hosts.values()]
    .filter((h) => h.isOnline)
    .sort((a, b) => Number(b.isLive) - Number(a.isLive));
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

  const host = hosts.get(String(hostId));
  if (!host || !host.isOnline) {
    res.status(404).json({ error: 'Host is offline. Ask them to Go Online in CoinCall.' });
    return;
  }
  if (host.isOnCall) {
    res.status(409).json({ error: 'Host is busy on another call' });
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
    ratePerMinute: host.ratePerMinute,
    status: 'ringing',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    hostUidAgora: 200000 + Math.floor(Math.random() * 9000),
    userUidAgora: 100000 + Math.floor(Math.random() * 9000),
  };

  calls.set(id, call);
  host.isOnCall = true;
  hosts.set(host.id, host);
  pushToHost(host.id, 'incoming_call', call);

  // Auto-miss after 45s
  setTimeout(() => {
    const current = calls.get(id);
    if (current?.status === 'ringing') {
      current.status = 'missed';
      current.updatedAt = Date.now();
      calls.set(id, current);
      const h = hosts.get(current.hostId);
      if (h) {
        h.isOnCall = false;
        hosts.set(h.id, h);
      }
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
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  pushToHost(call.hostId, 'call_accepted', call);
  res.json({ call });
});

app.post('/api/calls/:id/reject', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  call.status = 'rejected';
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  const h = hosts.get(call.hostId);
  if (h) {
    h.isOnCall = false;
    hosts.set(h.id, h);
  }
  pushToHost(call.hostId, 'call_rejected', call);
  res.json({ call });
});

app.post('/api/calls/:id/end', (req, res) => {
  const call = calls.get(String(req.params.id));
  if (!call) {
    res.status(404).json({ error: 'Call not found' });
    return;
  }
  call.status = 'ended';
  call.updatedAt = Date.now();
  calls.set(call.id, call);
  const h = hosts.get(call.hostId);
  if (h) {
    h.isOnCall = false;
    hosts.set(h.id, h);
  }
  pushToHost(call.hostId, 'call_ended', call);
  res.json({ call });
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

  broadcastWs({
    type: 'gift:accepted',
    payload,
  });
  pushToHost(call.hostId, 'gift_request_accepted', payload);

  res.json({ ok: true, giftRequest: gr, hostWallet: walletPublic(hostWallet), userWallet: walletPublic(userWallet) });
});

app.post('/api/admin/login', (req, res) => {
  const key = String(req.body?.key || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ ok: false, error: 'Wrong admin key' });
    return;
  }
  const role = String(req.body?.role || 'super_admin');
  const allowed = ['super_admin', 'moderator', 'finance', 'support'];
  res.json({
    ok: true,
    role: allowed.includes(role) ? role : 'super_admin',
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

  const online = [...hosts.values()].filter((h) => h.isOnline && !h.isOnCall);
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
  for (const h of hosts.values()) {
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
    };
    wallets.set(userId, row);
    return row;
  }
  if (patch) {
    if (patch.displayName) row.displayName = patch.displayName;
    if (patch.avatarUrl !== undefined) row.avatarUrl = patch.avatarUrl;
    if (patch.role) row.role = patch.role;
    if (patch.isPremium !== undefined) row.isPremium = patch.isPremium;
    if (patch.coinBalance !== undefined) row.coinBalance = patch.coinBalance;
    if (patch.xp !== undefined) row.xp = patch.xp;
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

app.post('/api/wallet/sync', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const coinBalance = Number(req.body?.coinBalance);
  if (!userId || !Number.isFinite(coinBalance) || coinBalance < 0) {
    res.status(400).json({ error: 'userId and non-negative coinBalance required' });
    return;
  }
  const row = ensureWallet(userId, {
    displayName: String(req.body?.displayName || 'Host'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  row.coinBalance = Math.floor(coinBalance);
  wallets.set(userId, row);
  broadcastWs({
    type: 'wallet:updated',
    payload: { userId, coinBalance: row.coinBalance, xp: row.xp },
  });
  res.json({ ok: true, wallet: walletPublic(row) });
});

app.post('/api/wallet/credit', (req, res) => {
  const userId = String(req.body?.userId || '').trim();
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'credit');
  if (!userId || !Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'userId and positive amount required' });
    return;
  }
  const row = ensureWallet(userId, {
    displayName: String(req.body?.displayName || 'Host'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  row.coinBalance += Math.floor(amount);
  row.xp += Math.floor(amount);
  wallets.set(userId, row);
  pushLedger(userId, Math.floor(amount), reason, 'credit');
  const reasonLower = reason.toLowerCase();
  const isRecharge =
    reasonLower.includes('iap') ||
    reasonLower.includes('recharge') ||
    reasonLower.includes('topup') ||
    reasonLower.includes('purchase') ||
    req.body?.role === 'user';
  if (isRecharge) {
    recordUserRecharge({
      userId,
      coins: Math.floor(amount),
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
  const row = ensureWallet(userId);
  row.isPremium = isPremium;
  if (isPremium && planId) {
    pushLedger(userId, 0, `VIP plan · ${planId}`, 'credit');
  }
  wallets.set(userId, row);
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
  if (iapReceipts.has(purchaseToken)) {
    res.status(409).json({ error: 'Purchase already redeemed' });
    return;
  }

  const googleReady = Boolean(process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON);
  const appleReady = Boolean(process.env.APPLE_IAP_SHARED_SECRET);
  if (platform === 'google' && !googleReady) {
    console.warn('[IAP] GOOGLE_PLAY_SERVICE_ACCOUNT_JSON missing — stub accept');
  }
  if (platform === 'apple' && !appleReady) {
    console.warn('[IAP] APPLE_IAP_SHARED_SECRET missing — stub accept');
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

  // Prefer client-synced balance if provided (Firebase is source of truth on host app)
  const knownBalance = Number(req.body?.knownBalance);
  const row = ensureWallet(hostId, {
    role: 'host',
    displayName: String(req.body?.displayName || 'Host'),
  });
  if (Number.isFinite(knownBalance) && knownBalance >= 0) {
    row.coinBalance = Math.floor(knownBalance);
  }

  if (row.coinBalance < amountCoins) {
    res.status(402).json({ error: 'Insufficient host balance', wallet: walletPublic(row) });
    return;
  }

  row.coinBalance -= amountCoins;
  wallets.set(hostId, row);

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

/** In-memory live rooms (Firebase is source of truth on clients; API mirrors for Luma) */
const liveRooms = new Map<string, Record<string, unknown>>();

app.post('/api/live/rooms', (req, res) => {
  const room = req.body as Record<string, unknown>;
  const id = String(room?.id || '');
  if (!id) {
    res.status(400).json({ error: 'id required' });
    return;
  }
  liveRooms.set(id, { ...room, updatedAt: Date.now() });
  const hostId = String(room.hostId || '');
  if (hostId && hosts.has(hostId)) {
    const h = hosts.get(hostId)!;
    h.isLive = true;
    h.isOnline = true;
    h.lastSeen = Date.now();
    hosts.set(hostId, h);
  }
  broadcastWs({ type: 'live:room', payload: room });
  res.json({ ok: true, room });
});

app.get('/api/live/rooms', (_req, res) => {
  const rooms = [...liveRooms.values()].filter((r) => r.isLive);
  res.json({ rooms });
});

app.post('/api/live/rooms/:id/end', (req, res) => {
  const id = String(req.params.id || '');
  const room = liveRooms.get(id);
  if (room) {
    room.isLive = false;
    room.endedAt = Date.now();
    liveRooms.set(id, room);
    const hostId = String(room.hostId || req.body?.hostId || '');
    if (hostId && hosts.has(hostId)) {
      const h = hosts.get(hostId)!;
      h.isLive = false;
      h.lastSeen = Date.now();
      hosts.set(hostId, h);
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
    at: Date.now(),
  };
  massTextHistory.unshift(payload);
  if (massTextHistory.length > 50) massTextHistory.length = 50;

  broadcastWs({ type: 'mass:text', payload });
  for (const u of targets) {
    pushToHost(u.userId, 'mass_text', payload);
  }
  pushToHost(hostId, 'mass_text_sent', {
    ...payload,
    title: 'Mass texting sent',
    body: `Sent to ${targets.length} users`,
  });

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

      if (type === 'host:hello' || type === 'user:hello') {
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
});

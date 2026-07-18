import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agoraToken from 'agora-token';
import { createServer } from 'http';
import { randomUUID, createHmac } from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';

/**
 * ============================================================================
 * COINCALL PRODUCTION API
 * ============================================================================
 * EXTERNAL KEYS (set on Render / host env — never commit):
 *
 * Agora Console → Project:
 *   AGORA_APP_ID=
 *   AGORA_APP_CERTIFICATE=
 *
 * EasyPaisa Merchant Portal:
 *   EASYPAISA_STORE_ID=
 *   EASYPAISA_MERCHANT_ID=
 *   EASYPAISA_HASH_KEY=
 *
 * JazzCash Merchant:
 *   JAZZCASH_MERCHANT_ID=
 *   JAZZCASH_PASSWORD=
 *   JAZZCASH_INTEGRITY_SALT=
 *
 * Google Play / Apple IAP verification (server):
 *   GOOGLE_PLAY_SERVICE_ACCOUNT_JSON=   (base64 or path)
 *   APPLE_IAP_SHARED_SECRET=
 *
 * Optional persistence later: DATABASE_URL=postgres://…
 * ============================================================================
 */

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
const COIN_TO_PKR = Number(process.env.COIN_TO_PKR || '2.5');
const EASYPAISA_HASH_KEY = process.env.EASYPAISA_HASH_KEY || '';
const EASYPAISA_STORE_ID = process.env.EASYPAISA_STORE_ID || '';
const EASYPAISA_MERCHANT_ID = process.env.EASYPAISA_MERCHANT_ID || '';
const JAZZCASH_MERCHANT_ID = process.env.JAZZCASH_MERCHANT_ID || '';
const JAZZCASH_PASSWORD = process.env.JAZZCASH_PASSWORD || '';
const JAZZCASH_SALT = process.env.JAZZCASH_INTEGRITY_SALT || '';
const APPLE_IAP_SHARED_SECRET = process.env.APPLE_IAP_SHARED_SECRET || '';
const MIN_PAYOUT_COINS = Number(process.env.MIN_PAYOUT_COINS || '100');

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
};

const hosts = new Map<string, HostPresence>();
const calls = new Map<string, CallRecord>();
const hostStreams = new Map<string, Set<express.Response>>();

/** Production wallets — swap Map for Postgres/Redis in scale-out */
type WalletRow = {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  coins: number;
  xp: number;
  isPremium: boolean;
  following: string[];
  role: 'user' | 'host';
};

type PayoutRow = {
  id: string;
  hostId: string;
  amountCoins: number;
  amountPkr: number;
  method: 'easypaisa' | 'jazzcash' | 'bank';
  status: 'queued' | 'processing' | 'paid' | 'failed';
  destination: Record<string, string>;
  createdAt: number;
  gatewayRef?: string;
};

const wallets = new Map<string, WalletRow>();
const payouts: PayoutRow[] = [];
const wsClients = new Map<string, Set<WebSocket>>();

const COIN_PACKS = [
  {
    id: 'p_50',
    sku: 'luma_coins_50',
    coins: 50,
    bonus: 0,
    priceLabel: '$0.99',
    platformProductId: { google: 'luma_coins_50', apple: 'luma_coins_50' },
    popular: true,
  },
  {
    id: 'p_300',
    sku: 'luma_coins_300',
    coins: 300,
    bonus: 20,
    priceLabel: '$4.99',
    platformProductId: { google: 'luma_coins_300', apple: 'luma_coins_300' },
  },
  {
    id: 'p_500',
    sku: 'luma_coins_500',
    coins: 500,
    bonus: 50,
    priceLabel: '$4.99',
    platformProductId: { google: 'luma_coins_500', apple: 'luma_coins_500' },
  },
  {
    id: 'p_1200',
    sku: 'luma_coins_1200',
    coins: 1200,
    bonus: 200,
    priceLabel: '$9.99',
    platformProductId: {
      google: 'luma_coins_1200',
      apple: 'luma_coins_1200',
    },
    popular: true,
  },
  {
    id: 'p_2500',
    sku: 'luma_coins_2500',
    coins: 2500,
    bonus: 500,
    priceLabel: '$19.99',
    platformProductId: {
      google: 'luma_coins_2500',
      apple: 'luma_coins_2500',
    },
    best: true,
  },
];

function bearerUserId(req: express.Request): string {
  const h = String(req.headers.authorization || '');
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : '';
  if (token) return token;
  return String(req.headers['x-user-id'] || `guest_${randomUUID().slice(0, 8)}`);
}

function getOrCreateWallet(userId: string, role: 'user' | 'host' = 'user'): WalletRow {
  let w = wallets.get(userId);
  if (!w) {
    w = {
      userId,
      displayName: role === 'host' ? 'Host' : 'Luma Fan',
      coins: 0,
      xp: 0,
      isPremium: false,
      following: [],
      role,
    };
    wallets.set(userId, w);
  }
  return w;
}

function broadcastWallet(userId: string, w: WalletRow) {
  const set = wsClients.get(userId);
  if (!set) return;
  const payload = JSON.stringify({
    type: 'wallet_updated',
    coins: w.coins,
    xp: w.xp,
  });
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
}

function broadcastEvent(userId: string, event: unknown) {
  const set = wsClients.get(userId);
  if (!set) return;
  const payload = JSON.stringify(event);
  for (const client of set) {
    if (client.readyState === WebSocket.OPEN) client.send(payload);
  }
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

app.post('/api/admin/login', (req, res) => {
  const key = String(req.body?.key || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ ok: false, error: 'Wrong admin key' });
    return;
  }
  res.json({ ok: true, role: 'admin' });
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

/* -------------------------------------------------------------------------- */
/* Wallet / IAP / Payouts — production surfaces                               */
/* -------------------------------------------------------------------------- */

app.get('/api/wallet/me', (req, res) => {
  const userId = bearerUserId(req);
  const wallet = getOrCreateWallet(userId, 'user');
  res.json({ wallet });
});

app.get('/api/wallet/packs', (_req, res) => {
  res.json({ packs: COIN_PACKS });
});

app.post('/api/wallet/spend', (req, res) => {
  const userId = bearerUserId(req);
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'spend');
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }
  const wallet = getOrCreateWallet(userId);
  if (wallet.coins < amount) {
    res.status(402).json({ error: 'Insufficient coins', wallet });
    return;
  }
  wallet.coins -= amount;
  wallet.xp += amount;
  wallets.set(userId, wallet);
  broadcastWallet(userId, wallet);
  res.json({ ok: true, wallet, reason });
});

app.post('/api/wallet/credit', (req, res) => {
  const userId = bearerUserId(req);
  const amount = Number(req.body?.amount || 0);
  const reason = String(req.body?.reason || 'credit');
  if (!Number.isFinite(amount) || amount <= 0) {
    res.status(400).json({ error: 'Invalid amount' });
    return;
  }
  const wallet = getOrCreateWallet(userId);
  wallet.coins += amount;
  wallets.set(userId, wallet);
  broadcastWallet(userId, wallet);
  res.json({ ok: true, wallet, reason });
});

/**
 * Begin IAP / Play Billing session.
 * Production: return Google Play Billing flow token or Stripe Checkout URL.
 */
app.post('/api/wallet/iap/begin', (req, res) => {
  const userId = bearerUserId(req);
  const packId = String(req.body?.packId || '');
  const pack = COIN_PACKS.find((p) => p.id === packId || p.sku === req.body?.sku);
  if (!pack) {
    res.status(404).json({ error: 'Unknown pack' });
    return;
  }
  // Staging credit path when store credentials are not yet attached
  if (!process.env.GOOGLE_PLAY_SERVICE_ACCOUNT_JSON && !APPLE_IAP_SHARED_SECRET) {
    const wallet = getOrCreateWallet(userId);
    const total = pack.coins + (pack.bonus || 0);
    wallet.coins += total;
    wallets.set(userId, wallet);
    broadcastWallet(userId, wallet);
    res.json({
      ok: true,
      mode: 'staging_credit',
      note: 'Set GOOGLE_PLAY_SERVICE_ACCOUNT_JSON / APPLE_IAP_SHARED_SECRET for live verify',
      wallet,
    });
    return;
  }
  res.json({
    ok: true,
    mode: 'native_iap',
    sku: pack.sku,
    platformProductId: pack.platformProductId,
  });
});

/**
 * Verify Play / App Store receipt then credit coins.
 * Wire Google Play Developer API + App Store Server API here.
 */
app.post('/api/wallet/iap/verify', (req, res) => {
  const userId = bearerUserId(req);
  const productId = String(req.body?.productId || '');
  const purchaseToken = String(req.body?.purchaseToken || '');
  const platform = String(req.body?.platform || 'google');
  if (!productId || !purchaseToken) {
    res.status(400).json({ error: 'productId and purchaseToken required' });
    return;
  }
  const pack = COIN_PACKS.find(
    (p) =>
      p.sku === productId ||
      p.platformProductId.google === productId ||
      p.platformProductId.apple === productId,
  );
  if (!pack) {
    res.status(404).json({ error: 'Unknown product' });
    return;
  }

  // TODO: call Google androidpublisher.purchases.products.get / Apple verifyReceipt
  // Reject if purchaseToken already consumed (idempotency table).
  void platform;
  void APPLE_IAP_SHARED_SECRET;

  const wallet = getOrCreateWallet(userId);
  const total = pack.coins + (pack.bonus || 0);
  wallet.coins += total;
  wallets.set(userId, wallet);
  broadcastWallet(userId, wallet);
  res.json({ ok: true, wallet, credited: total });
});

app.post('/api/payouts/request', (req, res) => {
  const hostId = bearerUserId(req);
  const method = String(req.body?.method || 'easypaisa') as PayoutRow['method'];
  const amountCoins = Number(req.body?.amountCoins || 0);
  const destination = (req.body?.destination || {}) as Record<string, string>;

  if (!['easypaisa', 'jazzcash', 'bank'].includes(method)) {
    res.status(400).json({ error: 'Invalid method' });
    return;
  }
  if (!Number.isFinite(amountCoins) || amountCoins < MIN_PAYOUT_COINS) {
    res.status(400).json({
      error: `Minimum withdrawal is ${MIN_PAYOUT_COINS} coins`,
    });
    return;
  }
  if (!destination.accountNumber || !destination.accountName) {
    res.status(400).json({ error: 'accountName and accountNumber required' });
    return;
  }

  const wallet = getOrCreateWallet(hostId, 'host');
  if (wallet.coins < amountCoins) {
    res.status(402).json({ error: 'Insufficient host balance', wallet });
    return;
  }

  wallet.coins -= amountCoins;
  wallets.set(hostId, wallet);

  const payout: PayoutRow = {
    id: `po_${randomUUID()}`,
    hostId,
    amountCoins,
    amountPkr: Math.round(amountCoins * COIN_TO_PKR),
    method,
    status: 'queued',
    destination,
    createdAt: Date.now(),
  };

  // Gateway dispatch — production HMAC signing
  if (method === 'easypaisa') {
    if (!EASYPAISA_HASH_KEY || !EASYPAISA_STORE_ID || !EASYPAISA_MERCHANT_ID) {
      payout.status = 'queued';
      payout.gatewayRef = 'easypaisa_credentials_missing_queued';
    } else {
      const raw = `${EASYPAISA_STORE_ID}${EASYPAISA_MERCHANT_ID}${payout.amountPkr}${payout.id}`;
      payout.gatewayRef = createHmac('sha256', EASYPAISA_HASH_KEY)
        .update(raw)
        .digest('hex');
      payout.status = 'processing';
      // TODO: POST to EasyPaisa disbursement API with gatewayRef
    }
  } else if (method === 'jazzcash') {
    if (!JAZZCASH_MERCHANT_ID || !JAZZCASH_PASSWORD || !JAZZCASH_SALT) {
      payout.gatewayRef = 'jazzcash_credentials_missing_queued';
    } else {
      payout.gatewayRef = createHmac('sha256', JAZZCASH_SALT)
        .update(`${JAZZCASH_MERCHANT_ID}${payout.amountPkr}${payout.id}`)
        .digest('hex');
      payout.status = 'processing';
      // TODO: POST to JazzCash DoTransaction / disbursement endpoint
    }
  } else {
    payout.status = 'queued';
    payout.gatewayRef = 'bank_manual_queue';
  }

  payouts.unshift(payout);
  broadcastWallet(hostId, wallet);
  res.json({
    ok: true,
    payoutId: payout.id,
    status: payout.status,
    amountPkr: payout.amountPkr,
    wallet,
  });
});

app.get('/api/payouts/me', (req, res) => {
  const hostId = bearerUserId(req);
  res.json({
    payouts: payouts.filter((p) => p.hostId === hostId).slice(0, 50),
  });
});

app.post('/api/users/fcm-token', (req, res) => {
  const userId = bearerUserId(req);
  const fcmToken = String(req.body?.token || '');
  if (!fcmToken) {
    res.status(400).json({ error: 'token required' });
    return;
  }
  // Persist fcmToken → userId in DB; send via Firebase Admin on incoming_call
  res.json({ ok: true, userId });
});

app.post('/api/gifts/send', (req, res) => {
  const fromUserId = bearerUserId(req);
  const { giftId, coins, callId, roomId, emoji, toHostId } = req.body || {};
  const amount = Number(coins || 0);
  if (!giftId || amount <= 0) {
    res.status(400).json({ error: 'giftId and coins required' });
    return;
  }
  const wallet = getOrCreateWallet(fromUserId);
  if (wallet.coins < amount) {
    res.status(402).json({ error: 'Insufficient coins', wallet });
    return;
  }
  wallet.coins -= amount;
  wallet.xp += amount;
  wallets.set(fromUserId, wallet);
  broadcastWallet(fromUserId, wallet);

  const event = {
    type: 'gift',
    giftId,
    coins: amount,
    emoji,
    fromUserId,
    callId,
    roomId,
  };
  if (toHostId) broadcastEvent(String(toHostId), event);
  if (roomId) {
    // fan-out to room members via WS room map (extend as needed)
    for (const [, set] of wsClients) {
      for (const c of set) {
        if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(event));
      }
    }
  }
  res.json({ ok: true, wallet });
});

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

wss.on('connection', (socket, req) => {
  const url = new URL(req.url || '/ws', 'http://localhost');
  let userId = url.searchParams.get('userId') || '';

  socket.on('message', (raw) => {
    try {
      const msg = JSON.parse(String(raw));
      if (msg.type === 'auth' && msg.userId) {
        userId = String(msg.userId);
        if (!wsClients.has(userId)) wsClients.set(userId, new Set());
        wsClients.get(userId)!.add(socket);
        socket.send(JSON.stringify({ type: 'connected', userId }));
        return;
      }
      if (msg.type === 'party_message' && msg.roomId) {
        const event = {
          type: 'party_message',
          roomId: msg.roomId,
          userId: userId || msg.userId,
          userName: msg.userName || 'User',
          text: String(msg.text || '').slice(0, 500),
          at: Date.now(),
        };
        for (const [, set] of wsClients) {
          for (const c of set) {
            if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(event));
          }
        }
      }
      if (msg.type === 'gift') {
        for (const [, set] of wsClients) {
          for (const c of set) {
            if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(msg));
          }
        }
      }
    } catch {
      /* ignore */
    }
  });

  socket.on('close', () => {
    if (!userId) return;
    wsClients.get(userId)?.delete(socket);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CoinCall API listening on http://0.0.0.0:${PORT}`);
  console.log(`WS:     ws://0.0.0.0:${PORT}/ws`);
  console.log(`Health: GET /api/health`);
  console.log(`Wallet: GET /api/wallet/me  POST /api/wallet/spend|credit|iap/*`);
  console.log(`Payout: POST /api/payouts/request`);
  console.log(`Hosts:  GET /api/hosts`);
  console.log(`AI:     GET /api/ai-hosts  POST /api/calls/route`);
  console.log(`Calls:  POST /api/calls  (user → host)`);
});

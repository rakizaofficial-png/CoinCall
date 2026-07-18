import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agoraToken from 'agora-token';
import { randomUUID } from 'crypto';
import { createServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';

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
      role: patch?.role || 'user',
    };
    wallets.set(userId, row);
  } else if (patch) {
    row = { ...row, ...patch };
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
  const row = ensureWallet(userId, {
    displayName: String(req.body?.displayName || 'Luma Fan'),
    role: req.body?.role === 'host' ? 'host' : 'user',
  });
  res.json({ wallet: walletPublic(row) });
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

const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket, req) => {
  wsClients.add(socket);
  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const userId = url.searchParams.get('userId') || 'anon';
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

      if (type === 'host:hello') {
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

import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agoraToken from 'agora-token';
import { randomUUID } from 'crypto';

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

app.listen(PORT, '0.0.0.0', () => {
  console.log(`CoinCall API listening on http://0.0.0.0:${PORT}`);
  console.log(`Health: GET /api/health`);
  console.log(`Hosts:  GET /api/hosts`);
  console.log(`Calls:  POST /api/calls  (user → host)`);
});

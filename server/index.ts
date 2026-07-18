import 'dotenv/config';
import cors from 'cors';
import express from 'express';
import agoraToken from 'agora-token';

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
const PORT = Number(process.env.PORT || 3000);
const ADMIN_KEY = process.env.ADMIN_API_KEY || 'coincall-admin';

function requireAdmin(req: express.Request, res: express.Response): boolean {
  const key = String(req.headers['x-admin-key'] || req.query.key || '');
  if (key !== ADMIN_KEY) {
    res.status(401).json({ error: 'Unauthorized admin' });
    return false;
  }
  return true;
}

app.get('/api/health', (_req, res) => {
  res.json({
    ok: true,
    agoraConfigured: Boolean(APP_ID && APP_CERT),
  });
});

/**
 * GET /api/agora/token?channel=call_xyz&uid=0&role=publisher|subscriber
 */
app.get('/api/agora/token', (req, res) => {
  if (!APP_ID || !APP_CERT) {
    res.status(500).json({ error: 'Agora server keys missing' });
    return;
  }

  const channel = String(req.query.channel || '').trim();
  if (!channel) {
    res.status(400).json({ error: 'channel is required' });
    return;
  }

  const uid = Number(req.query.uid || 0);
  const roleName = String(req.query.role || 'publisher').toLowerCase();
  const role =
    roleName === 'subscriber' ? RtcRole.SUBSCRIBER : RtcRole.PUBLISHER;
  const expireSeconds = 3600;
  const now = Math.floor(Date.now() / 1000);
  const privilegeExpire = now + expireSeconds;

  const token = RtcTokenBuilder.buildTokenWithUid(
    APP_ID,
    APP_CERT,
    channel,
    uid,
    role,
    privilegeExpire,
    privilegeExpire,
  );

  res.json({
    appId: APP_ID,
    channel,
    uid,
    role: roleName,
    token,
    expireAt: privilegeExpire,
  });
});

/** Admin ping — used by web panel login check */
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
  console.log(`Agora token: GET /api/agora/token?channel=test`);
  console.log(`Admin login: POST /api/admin/login`);
});

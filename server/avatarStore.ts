/**
 * Host avatar store — accepts data:/base64 photos and serves public https URLs
 * so Luma can load them when Firebase Storage upload fails on the host web app.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Express, Request, Response } from 'express';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), '.data');
const AVATAR_DIR = join(DATA_DIR, 'avatars');
const META_FILE = join(AVATAR_DIR, 'meta.json');

type Meta = Record<string, { updatedAt: number; contentType: string }>;

function ensureDir() {
  if (!existsSync(AVATAR_DIR)) mkdirSync(AVATAR_DIR, { recursive: true });
}

function loadMeta(): Meta {
  ensureDir();
  if (!existsSync(META_FILE)) return {};
  try {
    return JSON.parse(readFileSync(META_FILE, 'utf8')) as Meta;
  } catch {
    return {};
  }
}

function saveMeta(meta: Meta) {
  ensureDir();
  writeFileSync(META_FILE, JSON.stringify(meta));
}

function filePath(hostId: string) {
  const safe = hostId.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  return join(AVATAR_DIR, `${safe}.jpg`);
}

function apiPublicBase(req?: Request) {
  const envBase = String(process.env.API_PUBLIC_URL || '').replace(/\/$/, '');
  if (envBase) return envBase;
  if (req) {
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https');
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || '');
    if (host) return `${proto}://${host}`;
  }
  return 'https://coincall-api.onrender.com';
}

export function avatarPublicUrl(hostId: string, req?: Request, version?: number) {
  const v = version || loadMeta()[hostId]?.updatedAt || Date.now();
  return `${apiPublicBase(req)}/api/hosts/${encodeURIComponent(hostId)}/avatar?v=${v}`;
}

export function hasStoredAvatar(hostId: string) {
  return existsSync(filePath(hostId));
}

/** Decode data URL / raw base64 → jpeg buffer */
export function decodeImagePayload(raw: string): Buffer | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  try {
    if (s.startsWith('data:')) {
      const m = /^data:([^;]+);base64,(.+)$/s.exec(s);
      if (!m) return null;
      const buf = Buffer.from(m[2], 'base64');
      return buf.length > 200 ? buf : null;
    }
    const buf = Buffer.from(s, 'base64');
    return buf.length > 200 ? buf : null;
  } catch {
    return null;
  }
}

export function saveHostAvatar(hostId: string, raw: string): {
  ok: boolean;
  url?: string;
  error?: string;
} {
  const id = String(hostId || '').trim();
  if (!id) return { ok: false, error: 'hostId required' };
  const buf = decodeImagePayload(raw);
  if (!buf) return { ok: false, error: 'Invalid image payload' };
  if (buf.length > 2_500_000) return { ok: false, error: 'Image too large' };

  ensureDir();
  writeFileSync(filePath(id), buf);
  const meta = loadMeta();
  meta[id] = { updatedAt: Date.now(), contentType: 'image/jpeg' };
  saveMeta(meta);
  return { ok: true, url: avatarPublicUrl(id, undefined, meta[id].updatedAt) };
}

export function registerAvatarRoutes(app: Express) {
  /** Host uploads DP (data URL or base64) → public https URL for Luma */
  app.post('/api/hosts/:hostId/avatar', (req: Request, res: Response) => {
    const hostId = String(req.params.hostId || '').trim();
    const raw = String(
      req.body?.image || req.body?.dataUrl || req.body?.avatarUrl || '',
    );
    const headerUser = String(req.headers['x-user-id'] || '').trim();
    if (headerUser && headerUser !== hostId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const saved = saveHostAvatar(hostId, raw);
    if (!saved.ok) {
      res.status(400).json({ error: saved.error });
      return;
    }
    res.json({ ok: true, avatarUrl: saved.url });
  });

  /** Public image for Next/Luma <img src> */
  app.get('/api/hosts/:hostId/avatar', (req: Request, res: Response) => {
    const hostId = String(req.params.hostId || '').trim();
    const path = filePath(hostId);
    if (!existsSync(path)) {
      res.status(404).json({ error: 'No avatar' });
      return;
    }
    const buf = readFileSync(path);
    const etag = createHash('sha1').update(buf).digest('hex').slice(0, 16);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('ETag', etag);
    res.send(buf);
  });
}

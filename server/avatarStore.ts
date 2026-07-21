/**
 * Host avatar store — accepts data:/base64 photos and serves public https URLs
 * so Luma can load them when Firebase Storage upload fails on the host web app.
 *
 * Files live under DATA_DIR/avatars and are also embedded in the JSON snapshot
 * so Render redeploys don't leave Luma with dead /avatar?v=… links.
 */

import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import type { Express, Request, Response } from 'express';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), '.data');
const AVATAR_DIR = join(DATA_DIR, 'avatars');
const META_FILE = join(AVATAR_DIR, 'meta.json');

type Meta = Record<string, { updatedAt: number; contentType: string }>;

export type AvatarSnapshotRow = {
  hostId: string;
  contentType: string;
  updatedAt: number;
  base64: string;
};

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

export function userAvatarPublicUrl(userId: string, req?: Request, version?: number) {
  const key = userAvatarKey(userId);
  const v = version || loadMeta()[key]?.updatedAt || Date.now();
  return `${apiPublicBase(req)}/api/users/${encodeURIComponent(userId)}/avatar?v=${v}`;
}

function userAvatarKey(userId: string) {
  return `user_${String(userId || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 72)}`;
}

export function hasStoredAvatar(hostId: string) {
  return existsSync(filePath(hostId));
}

export function saveUserAvatar(userId: string, raw: string): {
  ok: boolean;
  url?: string;
  error?: string;
} {
  const id = String(userId || '').trim();
  if (!id) return { ok: false, error: 'userId required' };
  const key = userAvatarKey(id);
  const saved = saveHostAvatar(key, raw);
  if (!saved.ok) return saved;
  return {
    ok: true,
    url: userAvatarPublicUrl(id, undefined, loadMeta()[key]?.updatedAt),
  };
}

export function hasStoredUserAvatar(userId: string) {
  return existsSync(filePath(userAvatarKey(userId)));
}

/** True when URL points at our /api/hosts/:id/avatar or /api/users/:id/avatar endpoint */
export function isApiAvatarUrl(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  return /\/api\/(?:hosts|users)\/[^/]+\/avatar(?:\?|$)/i.test(url.trim());
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

/** Embed avatars in the durable JSON snapshot (survives process restart). */
export function dumpAvatarsForSnapshot(maxBytes = 2_500_000): AvatarSnapshotRow[] {
  ensureDir();
  const meta = loadMeta();
  const rows: AvatarSnapshotRow[] = [];
  let files: string[] = [];
  try {
    files = readdirSync(AVATAR_DIR).filter((f) => f.endsWith('.jpg'));
  } catch {
    return rows;
  }
  for (const file of files) {
    const hostId = file.replace(/\.jpg$/, '');
    const path = join(AVATAR_DIR, file);
    try {
      const buf = readFileSync(path);
      if (buf.length < 200 || buf.length > maxBytes) continue;
      const m = meta[hostId] || { updatedAt: Date.now(), contentType: 'image/jpeg' };
      rows.push({
        hostId,
        contentType: m.contentType || 'image/jpeg',
        updatedAt: m.updatedAt || Date.now(),
        base64: buf.toString('base64'),
      });
    } catch {
      /* skip bad file */
    }
  }
  return rows;
}

export function restoreAvatarsFromSnapshot(rows?: AvatarSnapshotRow[] | null) {
  if (!Array.isArray(rows) || !rows.length) return 0;
  ensureDir();
  const meta = loadMeta();
  let n = 0;
  for (const row of rows) {
    const id = String(row?.hostId || '').trim();
    if (!id || !row.base64) continue;
    try {
      const buf = Buffer.from(row.base64, 'base64');
      if (buf.length < 200) continue;
      writeFileSync(filePath(id), buf);
      meta[id] = {
        updatedAt: Number(row.updatedAt) || Date.now(),
        contentType: row.contentType || 'image/jpeg',
      };
      n += 1;
    } catch {
      /* skip */
    }
  }
  saveMeta(meta);
  return n;
}

/**
 * Prefer durable on-disk avatar (embedded in snapshot) over remote HTTPS
 * that may 404 after Storage misconfig. Fall back to public HTTPS candidates.
 */
export function resolveStoredOrHttpAvatar(
  hostId: string,
  candidates: Array<string | null | undefined>,
  req?: Request,
): string {
  if (hasStoredAvatar(hostId)) {
    return avatarPublicUrl(hostId, req);
  }
  for (const c of candidates) {
    const u = String(c || '').trim();
    if (!u) continue;
    if (isApiAvatarUrl(u)) continue;
    if (
      (u.startsWith('http://') || u.startsWith('https://')) &&
      !u.startsWith('data:') &&
      !u.startsWith('blob:')
    ) {
      return u;
    }
  }
  return '';
}

export function registerAvatarRoutes(
  app: Express,
  opts?: { onSaved?: (hostId: string, avatarUrl: string) => void },
) {
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
    const avatarUrl = saved.url || '';
    opts?.onSaved?.(hostId, avatarUrl);
    res.json({ ok: true, avatarUrl });
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
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('ETag', etag);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  });

  /** Luma user gallery upload → durable JPEG on disk (+ snapshot) */
  app.post('/api/users/:userId/avatar', (req: Request, res: Response) => {
    const userId = String(req.params.userId || '').trim();
    const raw = String(
      req.body?.image || req.body?.dataUrl || req.body?.avatarUrl || '',
    );
    const headerUser = String(req.headers['x-user-id'] || '').trim();
    if (headerUser && headerUser !== userId) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const saved = saveUserAvatar(userId, raw);
    if (!saved.ok) {
      res.status(400).json({ error: saved.error });
      return;
    }
    opts?.onSaved?.(userId, saved.url || '');
    res.json({ ok: true, avatarUrl: saved.url });
  });

  app.get('/api/users/:userId/avatar', (req: Request, res: Response) => {
    const userId = String(req.params.userId || '').trim();
    const path = filePath(userAvatarKey(userId));
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
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.setHeader('ETag', etag);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.send(buf);
  });
}

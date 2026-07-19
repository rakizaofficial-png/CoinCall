/**
 * Admin Video Library — additive media management.
 * Upload → auto-process (thumbnail, compress, metadata) → CRUD for admin.
 * Public read of enabled/approved videos for user preview UX.
 *
 * Does NOT modify existing AI host / call / wallet routes.
 */
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import type { Express, Request, Response } from 'express';
import multer from 'multer';

const execFileAsync = promisify(execFile);

const DATA_DIR = process.env.DATA_DIR || path.join(process.cwd(), '.data');
const MEDIA_ROOT = path.join(DATA_DIR, 'media', 'videos');
const LIBRARY_FILE = path.join(DATA_DIR, 'video-library.json');

export type VideoCategory =
  | 'preview'
  | 'teaser'
  | 'welcome'
  | 'ai_host'
  | 'promo'
  | 'other';

export type MetadataApproval = 'pending' | 'approved' | 'rejected';
export type ProcessStatus = 'uploaded' | 'processing' | 'ready' | 'failed';

export type VideoResolutionVariant = {
  label: 'original' | '1080p' | '720p' | '480p' | '360p';
  width?: number;
  height?: number;
  bitrateKbps?: number;
  fileName: string;
  sizeBytes: number;
  url: string;
};

export type LibraryVideo = {
  id: string;
  originalFileName: string;
  title: string;
  description: string;
  tags: string[];
  category: VideoCategory;
  language: string;
  languageConfidence: number;
  durationSec: number;
  thumbnailUrl: string;
  previewFrameUrl: string;
  variants: VideoResolutionVariant[];
  streamUrl: string;
  enabled: boolean;
  metadataApproval: MetadataApproval;
  generated: {
    title: string;
    description: string;
    tags: string[];
    language: string;
    previewFrameSec: number;
  };
  sortOrder: number;
  viewCount: number;
  processStatus: ProcessStatus;
  processLog: string[];
  processError?: string;
  createdAt: number;
  updatedAt: number;
  replacedAt?: number;
};

type LibraryStore = { version: 1; videos: LibraryVideo[] };

const viewCache = new Map<string, { at: number; count: number }>();
let ffmpegAvailable: boolean | null = null;

function ensureDirs() {
  fs.mkdirSync(MEDIA_ROOT, { recursive: true });
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore(): LibraryStore {
  ensureDirs();
  try {
    if (!fs.existsSync(LIBRARY_FILE)) return { version: 1, videos: [] };
    const raw = JSON.parse(fs.readFileSync(LIBRARY_FILE, 'utf8')) as LibraryStore;
    if (!raw?.videos) return { version: 1, videos: [] };
    return { version: 1, videos: raw.videos };
  } catch {
    return { version: 1, videos: [] };
  }
}

function saveStore(store: LibraryStore) {
  ensureDirs();
  const tmp = `${LIBRARY_FILE}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, LIBRARY_FILE);
}

function publicMediaUrl(req: Request, relPath: string) {
  const base =
    process.env.PUBLIC_API_URL ||
    `${req.protocol}://${req.get('host') || 'localhost:4000'}`;
  return `${base.replace(/\/$/, '')}/media/videos/${relPath}`;
}

function videoDir(id: string) {
  return path.join(MEDIA_ROOT, id);
}

async function hasFfmpeg(): Promise<boolean> {
  if (ffmpegAvailable !== null) return ffmpegAvailable;
  try {
    await execFileAsync('ffmpeg', ['-version'], { timeout: 5000 });
    await execFileAsync('ffprobe', ['-version'], { timeout: 5000 });
    ffmpegAvailable = true;
  } catch {
    ffmpegAvailable = false;
  }
  return ffmpegAvailable;
}

async function probeDuration(filePath: string): Promise<number> {
  try {
    const { stdout } = await execFileAsync(
      'ffprobe',
      [
        '-v', 'error',
        '-show_entries', 'format=duration',
        '-of', 'default=noprint_wrappers=1:nokey=1',
        filePath,
      ],
      { timeout: 30_000 },
    );
    const n = Number(stdout.trim());
    return Number.isFinite(n) ? Math.max(0, Math.round(n * 10) / 10) : 0;
  } catch {
    return 0;
  }
}

function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, '');
  return (
    base
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase())
      .slice(0, 80) || 'Untitled Preview'
  );
}

function detectLanguage(input: {
  fileName: string;
  title?: string;
  description?: string;
}): { language: string; confidence: number } {
  const text = `${input.fileName} ${input.title || ''} ${input.description || ''}`;
  if (/[\u0600-\u06FF]/.test(text)) return { language: 'ar', confidence: 0.85 };
  if (/[\u3040-\u30ff\u3400-\u9fff]/.test(text)) {
    if (/[\u3040-\u309f]/.test(text)) return { language: 'ja', confidence: 0.8 };
    return { language: 'zh', confidence: 0.75 };
  }
  if (/[\uac00-\ud7af]/.test(text)) return { language: 'ko', confidence: 0.8 };
  if (/\b(hola|gracias|español|amor)\b/i.test(text))
    return { language: 'es', confidence: 0.55 };
  if (/\b(bonjour|merci|français)\b/i.test(text))
    return { language: 'fr', confidence: 0.55 };
  if (/\b(olá|obrigad|português)\b/i.test(text))
    return { language: 'pt', confidence: 0.55 };
  if (/\b(arabic|uae|dubai|egypt)\b/i.test(text))
    return { language: 'ar', confidence: 0.45 };
  if (/\b(korean|seoul|korea)\b/i.test(text))
    return { language: 'ko', confidence: 0.45 };
  if (/\b(japan|tokyo|japanese)\b/i.test(text))
    return { language: 'ja', confidence: 0.45 };
  return { language: 'en', confidence: 0.7 };
}

function generateMetadata(input: {
  fileName: string;
  category: VideoCategory;
  durationSec: number;
  language: string;
}) {
  const title = titleFromFileName(input.fileName);
  const mins = Math.max(1, Math.round(input.durationSec / 60) || 1);
  const description = `Premium ${input.category.replace('_', ' ')} clip · ~${mins} min · optimized for fast streaming. Perfect for private preview and engagement.`;
  const tags = Array.from(
    new Set([
      input.category,
      input.language,
      'preview',
      'streaming',
      'luma',
      ...(input.durationSec < 30 ? ['teaser', 'short'] : ['feature']),
      ...title
        .toLowerCase()
        .split(/\s+/)
        .filter((w) => w.length > 2)
        .slice(0, 4),
    ]),
  );
  const previewFrameSec = Math.min(
    Math.max(0.8, input.durationSec * 0.18 || 1),
    Math.max(0.5, (input.durationSec || 3) - 0.5),
  );
  return { title, description, tags, previewFrameSec };
}

async function extractThumbnail(
  inputPath: string,
  outPath: string,
  atSec: number,
): Promise<boolean> {
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y', '-ss', String(Math.max(0, atSec)),
        '-i', inputPath,
        '-frames:v', '1', '-q:v', '2', outPath,
      ],
      { timeout: 60_000 },
    );
    return fs.existsSync(outPath);
  } catch {
    return false;
  }
}

async function compressVariant(
  inputPath: string,
  outPath: string,
  height: number,
  crf: number,
): Promise<{ ok: boolean; size: number }> {
  try {
    await execFileAsync(
      'ffmpeg',
      [
        '-y', '-i', inputPath,
        '-vf', `scale=-2:${height}`,
        '-c:v', 'libx264', '-preset', 'fast', '-crf', String(crf),
        '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart',
        outPath,
      ],
      { timeout: 300_000 },
    );
    const st = fs.statSync(outPath);
    return { ok: true, size: st.size };
  } catch {
    return { ok: false, size: 0 };
  }
}

function writePlaceholderThumb(outPath: string, title: string) {
  const safe = title.replace(/[<>&]/g, '').slice(0, 28);
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="800" height="1200" viewBox="0 0 800 1200">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0812"/>
      <stop offset="50%" stop-color="#1a0a2e"/>
      <stop offset="100%" stop-color="#ff2a7a"/>
    </linearGradient>
  </defs>
  <rect width="800" height="1200" fill="url(#g)"/>
  <text x="400" y="580" text-anchor="middle" fill="#00f0ff" font-family="system-ui" font-size="42" font-weight="700">PREVIEW</text>
  <text x="400" y="640" text-anchor="middle" fill="#ffffff" font-family="system-ui" font-size="28">${safe}</text>
</svg>`;
  fs.writeFileSync(outPath, svg);
}

async function processVideoAsset(
  video: LibraryVideo,
  req: Request,
  clientThumbDataUrl?: string,
  clientDuration?: number,
): Promise<LibraryVideo> {
  const dir = videoDir(video.id);
  const originalPath = path.join(dir, 'original.mp4');
  const log: string[] = [...video.processLog];
  const push = (m: string) => log.push(`${new Date().toISOString()} · ${m}`);

  video.processStatus = 'processing';
  video.updatedAt = Date.now();
  push('Pipeline started');

  const ff = await hasFfmpeg();
  push(ff ? 'ffmpeg detected' : 'ffmpeg unavailable — using fallback pipeline');

  let duration = clientDuration && clientDuration > 0 ? clientDuration : 0;
  if (ff && fs.existsSync(originalPath)) {
    duration = (await probeDuration(originalPath)) || duration;
  }
  video.durationSec = duration;
  push(`Duration ${duration}s`);

  const lang = detectLanguage({
    fileName: video.originalFileName,
    title: video.title,
  });
  const gen = generateMetadata({
    fileName: video.originalFileName,
    category: video.category,
    durationSec: duration,
    language: lang.language,
  });
  video.generated = {
    title: gen.title,
    description: gen.description,
    tags: gen.tags,
    language: lang.language,
    previewFrameSec: gen.previewFrameSec,
  };
  if (!video.title || video.title === 'Untitled Preview') video.title = gen.title;
  if (!video.description) video.description = gen.description;
  if (!video.tags.length) video.tags = gen.tags;
  video.language = lang.language;
  video.languageConfidence = lang.confidence;
  video.metadataApproval = 'pending';
  push(`Metadata generated · lang=${lang.language}`);

  const thumbJpg = path.join(dir, 'thumb.jpg');
  const previewJpg = path.join(dir, 'preview.jpg');
  const thumbSvg = path.join(dir, 'thumb.svg');

  if (clientThumbDataUrl?.startsWith('data:image/')) {
    try {
      const m = clientThumbDataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (m) {
        const buf = Buffer.from(m[2]!, 'base64');
        const ext = m[1]!.includes('png') ? 'png' : 'jpg';
        const p = path.join(dir, `thumb.${ext}`);
        fs.writeFileSync(p, buf);
        fs.copyFileSync(p, path.join(dir, `preview.${ext}`));
        video.thumbnailUrl = publicMediaUrl(req, `${video.id}/thumb.${ext}`);
        video.previewFrameUrl = publicMediaUrl(req, `${video.id}/preview.${ext}`);
        push('Client-captured thumbnail saved');
      }
    } catch {
      push('Client thumbnail decode failed');
    }
  }

  if (ff && fs.existsSync(originalPath)) {
    const okThumb = await extractThumbnail(originalPath, thumbJpg, gen.previewFrameSec);
    const okPrev = await extractThumbnail(
      originalPath,
      previewJpg,
      Math.min(gen.previewFrameSec + 0.6, Math.max(0, duration - 0.2)),
    );
    if (okThumb) {
      video.thumbnailUrl = publicMediaUrl(req, `${video.id}/thumb.jpg`);
      push('High-quality thumbnail extracted');
    }
    if (okPrev) {
      video.previewFrameUrl = publicMediaUrl(req, `${video.id}/preview.jpg`);
      push('Best preview frame selected');
    }
  }

  if (!video.thumbnailUrl) {
    writePlaceholderThumb(thumbSvg, video.title);
    video.thumbnailUrl = publicMediaUrl(req, `${video.id}/thumb.svg`);
    video.previewFrameUrl = video.thumbnailUrl;
    push('SVG placeholder thumbnail created');
  }

  const origStat = fs.existsSync(originalPath) ? fs.statSync(originalPath) : { size: 0 };
  const variants: VideoResolutionVariant[] = [
    {
      label: 'original',
      fileName: 'original.mp4',
      sizeBytes: origStat.size,
      url: publicMediaUrl(req, `${video.id}/original.mp4`),
    },
  ];

  if (ff && fs.existsSync(originalPath)) {
    const plans: { label: VideoResolutionVariant['label']; h: number; crf: number }[] = [
      { label: '720p', h: 720, crf: 26 },
      { label: '480p', h: 480, crf: 28 },
      { label: '360p', h: 360, crf: 30 },
    ];
    for (const plan of plans) {
      const outName = `${plan.label}.mp4`;
      const outPath = path.join(dir, outName);
      push(`Compressing ${plan.label}…`);
      const result = await compressVariant(originalPath, outPath, plan.h, plan.crf);
      if (result.ok) {
        variants.push({
          label: plan.label,
          height: plan.h,
          fileName: outName,
          sizeBytes: result.size,
          url: publicMediaUrl(req, `${video.id}/${outName}`),
        });
        push(`${plan.label} ready (${Math.round(result.size / 1024)} KB)`);
      } else {
        push(`${plan.label} skipped (encode error)`);
      }
    }
  } else {
    variants.push({
      label: '720p',
      height: 720,
      fileName: 'original.mp4',
      sizeBytes: origStat.size,
      url: publicMediaUrl(req, `${video.id}/original.mp4`),
    });
    push('Alias variants registered (install ffmpeg for real multi-res)');
  }

  video.variants = variants;
  const prefer =
    variants.find((v) => v.label === '720p') ||
    variants.find((v) => v.label === '480p') ||
    variants[0]!;
  video.streamUrl = prefer.url;
  video.processLog = log;
  video.processStatus = 'ready';
  video.updatedAt = Date.now();
  push('Pipeline complete · faststart optimized where possible');
  return video;
}

function listVideos(): LibraryVideo[] {
  return loadStore().videos.sort((a, b) => a.sortOrder - b.sortOrder);
}

function getVideo(id: string): LibraryVideo | undefined {
  return loadStore().videos.find((v) => v.id === id);
}

function upsertVideo(row: LibraryVideo) {
  const store = loadStore();
  const i = store.videos.findIndex((v) => v.id === row.id);
  if (i >= 0) store.videos[i] = row;
  else store.videos.push(row);
  saveStore(store);
}

function deleteVideoFiles(id: string) {
  try {
    fs.rmSync(videoDir(id), { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => {
      ensureDirs();
      const tmp = path.join(MEDIA_ROOT, '_tmp');
      fs.mkdirSync(tmp, { recursive: true });
      cb(null, tmp);
    },
    filename: (_req, file, cb) => {
      cb(null, `${Date.now()}_${file.originalname.replace(/[^\w.\-]+/g, '_')}`);
    },
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (
      !file.mimetype.startsWith('video/') &&
      !file.originalname.match(/\.(mp4|webm|mov|m4v)$/i)
    ) {
      cb(new Error('Only video uploads are allowed'));
      return;
    }
    cb(null, true);
  },
});

function publicVideoDto(v: LibraryVideo) {
  return {
    id: v.id,
    title: v.title,
    description: v.description,
    tags: v.tags,
    category: v.category,
    language: v.language,
    durationSec: v.durationSec,
    thumbnailUrl: v.thumbnailUrl,
    previewFrameUrl: v.previewFrameUrl,
    streamUrl: v.streamUrl,
    variants: v.variants.map((x) => ({
      label: x.label,
      url: x.url,
      height: x.height,
      sizeBytes: x.sizeBytes,
    })),
    sortOrder: v.sortOrder,
    viewCount: v.viewCount,
  };
}

export function registerVideoLibraryRoutes(
  app: Express,
  deps: {
    requireAdmin: (req: Request, res: Response) => boolean;
  },
) {
  ensureDirs();

  app.get('/media/videos/:id/:file', (req, res) => {
    const id = String(req.params.id || '').replace(/[^a-zA-Z0-9_\-]/g, '');
    const file = String(req.params.file || '').replace(/[^a-zA-Z0-9_.\-]/g, '');
    if (!id || !file) {
      res.status(400).json({ error: 'Invalid path' });
      return;
    }
    const full = path.join(MEDIA_ROOT, id, file);
    if (!full.startsWith(path.join(MEDIA_ROOT, id)) || !fs.existsSync(full)) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const hot = viewCache.get(id) || { at: 0, count: 0 };
    hot.count += 1;
    hot.at = Date.now();
    viewCache.set(id, hot);

    res.setHeader('Cache-Control', 'public, max-age=86400, stale-while-revalidate=604800');
    res.setHeader('Accept-Ranges', 'bytes');
    const ext = path.extname(file).toLowerCase();
    if (ext === '.svg') res.type('image/svg+xml');
    else if (ext === '.jpg' || ext === '.jpeg') res.type('image/jpeg');
    else if (ext === '.png') res.type('image/png');
    else if (ext === '.mp4') res.type('video/mp4');
    else if (ext === '.webm') res.type('video/webm');
    const abs = path.resolve(full);
    res.sendFile(abs, (err) => {
      if (err && !res.headersSent) {
        res.status(404).json({ error: 'Not found', detail: String(err.message || err) });
      }
    });
  });

  app.get('/api/media/videos', (req, res) => {
    const category = String(req.query.category || '');
    const q = String(req.query.q || '').toLowerCase().trim();
    let rows = listVideos().filter(
      (v) =>
        v.enabled &&
        v.metadataApproval === 'approved' &&
        v.processStatus === 'ready',
    );
    if (category) rows = rows.filter((v) => v.category === category);
    if (q) {
      rows = rows.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.description.toLowerCase().includes(q) ||
          v.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    rows = [...rows].sort((a, b) => {
      const ha = viewCache.get(a.id)?.count || a.viewCount;
      const hb = viewCache.get(b.id)?.count || b.viewCount;
      if (hb !== ha) return hb - ha;
      return a.sortOrder - b.sortOrder;
    });
    res.setHeader('Cache-Control', 'public, max-age=30');
    res.json({
      videos: rows.map(publicVideoDto),
      cachedIds: [...viewCache.entries()]
        .sort((a, b) => b[1].count - a[1].count)
        .slice(0, 10)
        .map(([id]) => id),
    });
  });

  app.get('/api/media/videos/:id', (req, res) => {
    const v = getVideo(String(req.params.id));
    if (!v || !v.enabled || v.metadataApproval !== 'approved') {
      res.status(404).json({ error: 'Video not found' });
      return;
    }
    v.viewCount += 1;
    upsertVideo(v);
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({ video: publicVideoDto(v) });
  });

  app.get('/api/admin/videos', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const q = String(req.query.q || '').toLowerCase().trim();
    let rows = listVideos();
    if (q) {
      rows = rows.filter(
        (v) =>
          v.title.toLowerCase().includes(q) ||
          v.id.includes(q) ||
          v.tags.some((t) => t.toLowerCase().includes(q)),
      );
    }
    res.json({ videos: rows, ffmpeg: ffmpegAvailable, hotCache: Object.fromEntries(viewCache) });
  });

  app.get('/api/admin/videos/:id', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const v = getVideo(String(req.params.id));
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    res.json({ video: v });
  });

  app.post(
    '/api/admin/videos/upload',
    (req, res, next) => {
      if (!deps.requireAdmin(req, res)) return;
      next();
    },
    upload.single('video'),
    async (req, res) => {
      try {
        if (!req.file) {
          res.status(400).json({ error: 'Missing video file' });
          return;
        }
        const id = `vid_${randomUUID().slice(0, 12)}`;
        const dir = videoDir(id);
        fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, 'original.mp4');
        try {
          fs.renameSync(req.file.path, dest);
        } catch {
          fs.copyFileSync(req.file.path, dest);
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        }

        const category = (String(req.body?.category || 'preview') || 'preview') as VideoCategory;
        const now = Date.now();
        const store = loadStore();
        let row: LibraryVideo = {
          id,
          originalFileName: req.file.originalname,
          title: titleFromFileName(req.file.originalname),
          description: '',
          tags: [],
          category,
          language: 'en',
          languageConfidence: 0,
          durationSec: Number(req.body?.durationSec || 0) || 0,
          thumbnailUrl: '',
          previewFrameUrl: '',
          variants: [],
          streamUrl: publicMediaUrl(req, `${id}/original.mp4`),
          enabled: false,
          metadataApproval: 'pending',
          generated: {
            title: '',
            description: '',
            tags: [],
            language: 'en',
            previewFrameSec: 1,
          },
          sortOrder: store.videos.length,
          viewCount: 0,
          processStatus: 'uploaded',
          processLog: [`${new Date().toISOString()} · Uploaded`],
          createdAt: now,
          updatedAt: now,
        };
        upsertVideo(row);
        row = await processVideoAsset(
          row,
          req,
          String(req.body?.thumbnailDataUrl || ''),
          Number(req.body?.durationSec || 0),
        );
        upsertVideo(row);
        res.json({ ok: true, video: row });
      } catch (e: unknown) {
        res.status(500).json({
          error: e instanceof Error ? e.message : 'Upload failed',
        });
      }
    },
  );

  app.patch('/api/admin/videos/:id', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const v = getVideo(String(req.params.id));
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    const b = req.body || {};
    if (typeof b.title === 'string') v.title = b.title.trim().slice(0, 120);
    if (typeof b.description === 'string') v.description = b.description.trim().slice(0, 800);
    if (Array.isArray(b.tags))
      v.tags = b.tags.map((t: unknown) => String(t).trim()).filter(Boolean).slice(0, 24);
    if (typeof b.category === 'string') v.category = b.category as VideoCategory;
    if (typeof b.language === 'string') v.language = b.language.slice(0, 12);
    if (typeof b.enabled === 'boolean') v.enabled = b.enabled;
    if (
      b.metadataApproval === 'pending' ||
      b.metadataApproval === 'approved' ||
      b.metadataApproval === 'rejected'
    ) {
      v.metadataApproval = b.metadataApproval;
    }
    if (typeof b.sortOrder === 'number') v.sortOrder = b.sortOrder;
    v.updatedAt = Date.now();
    upsertVideo(v);
    res.json({ ok: true, video: v });
  });

  app.post('/api/admin/videos/:id/approve-metadata', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const v = getVideo(String(req.params.id));
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    if (Boolean(req.body?.useGenerated)) {
      v.title = v.generated.title || v.title;
      v.description = v.generated.description || v.description;
      v.tags = v.generated.tags?.length ? v.generated.tags : v.tags;
      v.language = v.generated.language || v.language;
    }
    v.metadataApproval = 'approved';
    v.enabled = req.body?.enable !== false ? true : v.enabled;
    v.updatedAt = Date.now();
    upsertVideo(v);
    res.json({ ok: true, video: v });
  });

  app.post('/api/admin/videos/:id/reject-metadata', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const v = getVideo(String(req.params.id));
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    v.metadataApproval = 'rejected';
    v.enabled = false;
    v.updatedAt = Date.now();
    upsertVideo(v);
    res.json({ ok: true, video: v });
  });

  app.post('/api/admin/videos/reorder', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const ids = Array.isArray(req.body?.ids) ? req.body.ids.map(String) : [];
    if (!ids.length) {
      res.status(400).json({ error: 'ids required' });
      return;
    }
    const store = loadStore();
    const map = new Map(store.videos.map((v) => [v.id, v]));
    ids.forEach((id: string, i: number) => {
      const row = map.get(id);
      if (row) {
        row.sortOrder = i;
        row.updatedAt = Date.now();
      }
    });
    saveStore(store);
    res.json({ ok: true, videos: listVideos() });
  });

  app.post(
    '/api/admin/videos/:id/replace',
    (req, res, next) => {
      if (!deps.requireAdmin(req, res)) return;
      next();
    },
    upload.single('video'),
    async (req, res) => {
      try {
        const v = getVideo(String(req.params.id));
        if (!v) {
          res.status(404).json({ error: 'Not found' });
          return;
        }
        if (!req.file) {
          res.status(400).json({ error: 'Missing video file' });
          return;
        }
        const dir = videoDir(v.id);
        fs.mkdirSync(dir, { recursive: true });
        const dest = path.join(dir, 'original.mp4');
        try {
          fs.renameSync(req.file.path, dest);
        } catch {
          fs.copyFileSync(req.file.path, dest);
          try { fs.unlinkSync(req.file.path); } catch { /* ignore */ }
        }
        v.originalFileName = req.file.originalname;
        v.processStatus = 'uploaded';
        v.replacedAt = Date.now();
        v.processLog.push(`${new Date().toISOString()} · Replaced source`);
        const next = await processVideoAsset(
          v,
          req,
          String(req.body?.thumbnailDataUrl || ''),
          Number(req.body?.durationSec || 0),
        );
        next.metadataApproval = 'pending';
        upsertVideo(next);
        res.json({ ok: true, video: next });
      } catch (e: unknown) {
        res.status(500).json({
          error: e instanceof Error ? e.message : 'Replace failed',
        });
      }
    },
  );

  app.post('/api/admin/videos/:id/reprocess', async (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const v = getVideo(String(req.params.id));
    if (!v) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    try {
      const next = await processVideoAsset(v, req);
      upsertVideo(next);
      res.json({ ok: true, video: next });
    } catch (e: unknown) {
      res.status(500).json({
        error: e instanceof Error ? e.message : 'Reprocess failed',
      });
    }
  });

  app.delete('/api/admin/videos/:id', (req, res) => {
    if (!deps.requireAdmin(req, res)) return;
    const id = String(req.params.id);
    const store = loadStore();
    const before = store.videos.length;
    store.videos = store.videos.filter((v) => v.id !== id);
    if (store.videos.length === before) {
      res.status(404).json({ error: 'Not found' });
      return;
    }
    saveStore(store);
    deleteVideoFiles(id);
    viewCache.delete(id);
    res.json({ ok: true });
  });

  // Warm ffmpeg check once on boot
  void hasFfmpeg().then((ok) => {
    console.log(`[video-library] ffmpeg ${ok ? 'ready' : 'not found (fallback mode)'}`);
  });
}

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  approveVideoMetadata,
  captureVideoPoster,
  deleteAdminVideo,
  listAdminVideos,
  patchAdminVideo,
  rejectVideoMetadata,
  reorderAdminVideos,
  replaceAdminVideo,
  reprocessAdminVideo,
  uploadAdminVideo,
  type LibraryVideo,
} from '../videoApi';

const CATEGORIES = [
  'preview',
  'teaser',
  'welcome',
  'ai_host',
  'promo',
  'other',
] as const;

function formatDur(sec: number) {
  if (!sec) return '—';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

function formatBytes(n: number) {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function VideoLibraryPanel() {
  const [videos, setVideos] = useState<LibraryVideo[]>([]);
  const [ffmpeg, setFfmpeg] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [category, setCategory] = useState<string>('preview');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<LibraryVideo | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editLang, setEditLang] = useState('');
  const [editCat, setEditCat] = useState('preview');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await listAdminVideos(q);
      setVideos(data.videos || []);
      setFfmpeg(data.ffmpeg);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!selected) return;
    setEditTitle(selected.title);
    setEditDesc(selected.description);
    setEditTags(selected.tags.join(', '));
    setEditLang(selected.language);
    setEditCat(selected.category);
  }, [selected]);

  const grouped = useMemo(() => {
    const map = new Map<string, LibraryVideo[]>();
    for (const v of videos) {
      const list = map.get(v.category) || [];
      list.push(v);
      map.set(v.category, list);
    }
    return map;
  }, [videos]);

  const onUpload = async (file: File | null) => {
    if (!file || busy) return;
    setBusy(true);
    setError('');
    try {
      let thumb: string | undefined;
      let durationSec: number | undefined;
      try {
        const poster = await captureVideoPoster(file);
        thumb = poster.dataUrl;
        durationSec = poster.durationSec;
      } catch {
        /* optional */
      }
      const { video } = await uploadAdminVideo({
        file,
        category,
        thumbnailDataUrl: thumb,
        durationSec,
      });
      setSelected(video);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const saveMeta = async () => {
    if (!selected || busy) return;
    setBusy(true);
    try {
      const { video } = await patchAdminVideo(selected.id, {
        title: editTitle,
        description: editDesc,
        tags: editTags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
        language: editLang,
        category: editCat,
      });
      setSelected(video);
      await load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const move = async (id: string, dir: -1 | 1) => {
    const ids = videos.map((v) => v.id);
    const i = ids.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j]!, ids[i]!];
    setBusy(true);
    try {
      const { videos: next } = await reorderAdminVideos(ids);
      setVideos(next);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Reorder failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="video-library">
      <div className="page-head">
        <div>
          <h2>Video Library</h2>
          <p>
            Admin-only uploads · auto thumbnail, compress, metadata ·{' '}
            {ffmpeg === true
              ? 'ffmpeg online'
              : ffmpeg === false
                ? 'ffmpeg offline (fallback)'
                : 'checking ffmpeg…'}
          </p>
        </div>
      </div>

      {error ? <div className="banner danger">{error}</div> : null}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="row" style={{ gap: 12, flexWrap: 'wrap', alignItems: 'end' }}>
          <label className="field">
            <span>Search metadata</span>
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="title, tag, id…"
            />
          </label>
          <label className="field">
            <span>Upload category</span>
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </label>
          <label className="btn primary" style={{ cursor: busy ? 'wait' : 'pointer' }}>
            {busy ? 'Processing…' : 'Upload video'}
            <input
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              hidden
              disabled={busy}
              onChange={(e) => void onUpload(e.target.files?.[0] || null)}
            />
          </label>
          <button type="button" className="btn" onClick={() => void load()} disabled={busy}>
            Refresh
          </button>
        </div>
      </div>

      <div className="video-library-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Media library ({videos.length})</h3>
          {loading ? <p className="muted">Loading…</p> : null}
          {!loading && !videos.length ? (
            <p className="muted">No videos yet — upload your first clip.</p>
          ) : null}

          {[...grouped.entries()].map(([cat, rows]) => (
            <div key={cat} style={{ marginBottom: 18 }}>
              <h4 style={{ textTransform: 'uppercase', letterSpacing: '0.08em', opacity: 0.7 }}>
                {cat} · {rows.length}
              </h4>
              <div className="video-cards">
                {rows.map((v) => (
                  <motion.button
                    type="button"
                    key={v.id}
                    className={`video-card ${selected?.id === v.id ? 'active' : ''}`}
                    onClick={() => setSelected(v)}
                    whileHover={{ y: -2 }}
                    layout
                  >
                    <div className="video-thumb">
                      {v.thumbnailUrl ? (
                        <img src={v.thumbnailUrl} alt="" />
                      ) : (
                        <div className="thumb-fallback">No thumb</div>
                      )}
                      <span className="badge preview-badge">Preview</span>
                      <span className="badge dur">{formatDur(v.durationSec)}</span>
                    </div>
                    <div className="video-meta">
                      <strong>{v.title}</strong>
                      <span className="muted">
                        {v.language.toUpperCase()} · {v.processStatus} ·{' '}
                        {v.metadataApproval}
                        {v.enabled ? ' · ON' : ' · OFF'}
                      </span>
                    </div>
                    <div className="row" style={{ gap: 6, marginTop: 8 }}>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          void move(v.id, -1);
                        }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        className="btn ghost"
                        onClick={(e) => {
                          e.stopPropagation();
                          void move(v.id, 1);
                        }}
                      >
                        ↓
                      </button>
                    </div>
                  </motion.button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {selected ? (
            <motion.div
              key={selected.id}
              className="card"
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
            >
              <h3 style={{ marginTop: 0 }}>Edit · {selected.id}</h3>
              <video
                key={selected.streamUrl}
                src={selected.streamUrl}
                poster={selected.thumbnailUrl}
                controls
                playsInline
                style={{
                  width: '100%',
                  borderRadius: 12,
                  background: '#000',
                  maxHeight: 360,
                }}
              />

              <div className="field" style={{ marginTop: 12 }}>
                <span>Title</span>
                <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} />
              </div>
              <div className="field">
                <span>Description</span>
                <textarea
                  rows={3}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
              </div>
              <div className="field">
                <span>Tags (comma-separated)</span>
                <input value={editTags} onChange={(e) => setEditTags(e.target.value)} />
              </div>
              <div className="row" style={{ gap: 12 }}>
                <label className="field" style={{ flex: 1 }}>
                  <span>Language</span>
                  <input value={editLang} onChange={(e) => setEditLang(e.target.value)} />
                </label>
                <label className="field" style={{ flex: 1 }}>
                  <span>Category</span>
                  <select value={editCat} onChange={(e) => setEditCat(e.target.value)}>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="generated-box">
                <p className="muted" style={{ marginTop: 0 }}>
                  Auto-generated (approve to apply)
                </p>
                <p>
                  <strong>{selected.generated.title}</strong>
                </p>
                <p className="muted">{selected.generated.description}</p>
                <p className="muted">{selected.generated.tags?.join(' · ')}</p>
                <p className="muted">
                  Detected language: {selected.generated.language} (
                  {Math.round((selected.languageConfidence || 0) * 100)}%)
                </p>
              </div>

              <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 12 }}>
                <button type="button" className="btn primary" disabled={busy} onClick={() => void saveMeta()}>
                  Save metadata
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void approveVideoMetadata(selected.id, {
                      useGenerated: true,
                      enable: true,
                    }).then((r) => {
                      setSelected(r.video);
                      return load();
                    })
                  }
                >
                  Approve + enable
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void rejectVideoMetadata(selected.id).then((r) => {
                      setSelected(r.video);
                      return load();
                    })
                  }
                >
                  Reject
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void patchAdminVideo(selected.id, {
                      enabled: !selected.enabled,
                    }).then((r) => {
                      setSelected(r.video);
                      return load();
                    })
                  }
                >
                  {selected.enabled ? 'Disable' : 'Enable'}
                </button>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    void reprocessAdminVideo(selected.id).then((r) => {
                      setSelected(r.video);
                      return load();
                    })
                  }
                >
                  Reprocess
                </button>
                <label className="btn" style={{ cursor: busy ? 'wait' : 'pointer' }}>
                  Replace video
                  <input
                    type="file"
                    accept="video/*"
                    hidden
                    disabled={busy}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (!f) return;
                      void (async () => {
                        setBusy(true);
                        try {
                          let thumb: string | undefined;
                          let durationSec: number | undefined;
                          try {
                            const poster = await captureVideoPoster(f);
                            thumb = poster.dataUrl;
                            durationSec = poster.durationSec;
                          } catch {
                            /* optional */
                          }
                          const { video } = await replaceAdminVideo(selected.id, {
                            file: f,
                            thumbnailDataUrl: thumb,
                            durationSec,
                          });
                          setSelected(video);
                          await load();
                        } catch (err: unknown) {
                          setError(
                            err instanceof Error ? err.message : 'Replace failed',
                          );
                        } finally {
                          setBusy(false);
                        }
                      })();
                    }}
                  />
                </label>
                <button
                  type="button"
                  className="btn danger"
                  disabled={busy}
                  onClick={() => {
                    if (!confirm('Delete this video permanently?')) return;
                    void deleteAdminVideo(selected.id).then(() => {
                      setSelected(null);
                      return load();
                    });
                  }}
                >
                  Delete
                </button>
              </div>

              <h4>Variants</h4>
              <ul className="muted">
                {selected.variants.map((x) => (
                  <li key={`${x.label}-${x.url}`}>
                    {x.label}
                    {x.height ? ` · ${x.height}p` : ''} · {formatBytes(x.sizeBytes)} ·{' '}
                    <a href={x.url} target="_blank" rel="noreferrer">
                      open
                    </a>
                  </li>
                ))}
              </ul>

              <h4>Process log</h4>
              <pre className="process-log">
                {(selected.processLog || []).slice(-20).join('\n')}
              </pre>
            </motion.div>
          ) : (
            <div className="card muted">Select a video to edit metadata and approvals.</div>
          )}
        </AnimatePresence>
      </div>

      <style>{`
        .video-library-grid {
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          gap: 16px;
        }
        @media (max-width: 980px) {
          .video-library-grid { grid-template-columns: 1fr; }
        }
        .video-cards {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
          gap: 10px;
        }
        .video-card {
          text-align: left;
          border: 1px solid rgba(255,255,255,0.08);
          background: rgba(255,255,255,0.03);
          border-radius: 14px;
          padding: 8px;
          color: inherit;
          cursor: pointer;
        }
        .video-card.active {
          border-color: rgba(0,240,255,0.55);
          box-shadow: 0 0 0 1px rgba(0,240,255,0.25);
        }
        .video-thumb {
          position: relative;
          aspect-ratio: 3/4;
          border-radius: 10px;
          overflow: hidden;
          background: #111;
        }
        .video-thumb img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .thumb-fallback {
          display: grid;
          place-items: center;
          height: 100%;
          opacity: 0.5;
        }
        .badge {
          position: absolute;
          font-size: 10px;
          font-weight: 700;
          padding: 3px 6px;
          border-radius: 999px;
          background: rgba(0,0,0,0.65);
        }
        .preview-badge {
          top: 8px;
          left: 8px;
          color: #00f0ff;
          border: 1px solid rgba(0,240,255,0.4);
        }
        .dur {
          bottom: 8px;
          right: 8px;
          color: #fff;
        }
        .video-meta {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-top: 8px;
        }
        .generated-box {
          margin-top: 12px;
          padding: 12px;
          border-radius: 12px;
          background: rgba(255,42,122,0.08);
          border: 1px solid rgba(255,42,122,0.2);
        }
        .process-log {
          max-height: 180px;
          overflow: auto;
          font-size: 11px;
          background: rgba(0,0,0,0.35);
          padding: 10px;
          border-radius: 10px;
        }
      `}</style>
    </div>
  );
}

/**
 * Admin Video Library API client.
 */
import { adminKey, apiBaseUrl } from './firebase';

export type LibraryVideo = {
  id: string;
  originalFileName: string;
  title: string;
  description: string;
  tags: string[];
  category: string;
  language: string;
  languageConfidence: number;
  durationSec: number;
  thumbnailUrl: string;
  previewFrameUrl: string;
  variants: {
    label: string;
    url: string;
    height?: number;
    sizeBytes: number;
  }[];
  streamUrl: string;
  enabled: boolean;
  metadataApproval: 'pending' | 'approved' | 'rejected';
  generated: {
    title: string;
    description: string;
    tags: string[];
    language: string;
    previewFrameSec: number;
  };
  sortOrder: number;
  viewCount: number;
  processStatus: string;
  processLog: string[];
  createdAt: number;
  updatedAt: number;
};

function adminHeaders(json = true): HeadersInit {
  const h: Record<string, string> = {
    'x-admin-key': localStorage.getItem('cc_admin_key') || adminKey,
    'x-admin-id': localStorage.getItem('cc_admin_id') || 'admin',
    'x-admin-role': localStorage.getItem('cc_admin_role') || 'super_admin',
  };
  if (json) h['Content-Type'] = 'application/json';
  return h;
}

async function parse<T>(res: Response): Promise<T> {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(
      (data as { error?: string }).error || `Request failed (${res.status})`,
    );
  }
  return data as T;
}

export async function listAdminVideos(q = '') {
  const qs = q ? `?q=${encodeURIComponent(q)}` : '';
  return parse<{
    videos: LibraryVideo[];
    ffmpeg: boolean | null;
  }>(
    await fetch(`${apiBaseUrl}/admin/videos${qs}`, {
      headers: adminHeaders(),
      cache: 'no-store',
    }),
  );
}

export async function patchAdminVideo(
  id: string,
  body: Partial<LibraryVideo>,
) {
  return parse<{ ok: boolean; video: LibraryVideo }>(
    await fetch(`${apiBaseUrl}/admin/videos/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: adminHeaders(),
      body: JSON.stringify(body),
    }),
  );
}

export async function approveVideoMetadata(
  id: string,
  opts?: { useGenerated?: boolean; enable?: boolean },
) {
  return parse<{ ok: boolean; video: LibraryVideo }>(
    await fetch(
      `${apiBaseUrl}/admin/videos/${encodeURIComponent(id)}/approve-metadata`,
      {
        method: 'POST',
        headers: adminHeaders(),
        body: JSON.stringify(opts || { useGenerated: true, enable: true }),
      },
    ),
  );
}

export async function rejectVideoMetadata(id: string) {
  return parse<{ ok: boolean; video: LibraryVideo }>(
    await fetch(
      `${apiBaseUrl}/admin/videos/${encodeURIComponent(id)}/reject-metadata`,
      { method: 'POST', headers: adminHeaders(), body: '{}' },
    ),
  );
}

export async function deleteAdminVideo(id: string) {
  return parse<{ ok: boolean }>(
    await fetch(`${apiBaseUrl}/admin/videos/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    }),
  );
}

export async function reorderAdminVideos(ids: string[]) {
  return parse<{ ok: boolean; videos: LibraryVideo[] }>(
    await fetch(`${apiBaseUrl}/admin/videos/reorder`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify({ ids }),
    }),
  );
}

export async function reprocessAdminVideo(id: string) {
  return parse<{ ok: boolean; video: LibraryVideo }>(
    await fetch(
      `${apiBaseUrl}/admin/videos/${encodeURIComponent(id)}/reprocess`,
      { method: 'POST', headers: adminHeaders(), body: '{}' },
    ),
  );
}

/** Capture a poster frame from a local File for upload thumbnail */
export function captureVideoPoster(
  file: File,
): Promise<{ dataUrl: string; durationSec: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    video.src = url;
    video.onloadedmetadata = () => {
      const seekTo = Math.min(1.2, Math.max(0.2, video.duration * 0.15 || 0.5));
      video.currentTime = seekTo;
    };
    video.onseeked = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 1280;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('Canvas unavailable');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.88);
        resolve({ dataUrl, durationSec: video.duration || 0 });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read video'));
    };
  });
}

export async function uploadAdminVideo(input: {
  file: File;
  category: string;
  thumbnailDataUrl?: string;
  durationSec?: number;
}) {
  const fd = new FormData();
  fd.append('video', input.file);
  fd.append('category', input.category);
  if (input.thumbnailDataUrl)
    fd.append('thumbnailDataUrl', input.thumbnailDataUrl);
  if (input.durationSec != null)
    fd.append('durationSec', String(input.durationSec));

  const res = await fetch(`${apiBaseUrl}/admin/videos/upload`, {
    method: 'POST',
    headers: {
      'x-admin-key': localStorage.getItem('cc_admin_key') || adminKey,
      'x-admin-id': localStorage.getItem('cc_admin_id') || 'admin',
      'x-admin-role': localStorage.getItem('cc_admin_role') || 'super_admin',
    },
    body: fd,
  });
  return parse<{ ok: boolean; video: LibraryVideo }>(res);
}

export async function replaceAdminVideo(
  id: string,
  input: {
    file: File;
    thumbnailDataUrl?: string;
    durationSec?: number;
  },
) {
  const fd = new FormData();
  fd.append('video', input.file);
  if (input.thumbnailDataUrl)
    fd.append('thumbnailDataUrl', input.thumbnailDataUrl);
  if (input.durationSec != null)
    fd.append('durationSec', String(input.durationSec));

  const res = await fetch(
    `${apiBaseUrl}/admin/videos/${encodeURIComponent(id)}/replace`,
    {
      method: 'POST',
      headers: {
        'x-admin-key': localStorage.getItem('cc_admin_key') || adminKey,
        'x-admin-id': localStorage.getItem('cc_admin_id') || 'admin',
        'x-admin-role': localStorage.getItem('cc_admin_role') || 'super_admin',
      },
      body: fd,
    },
  );
  return parse<{ ok: boolean; video: LibraryVideo }>(res);
}

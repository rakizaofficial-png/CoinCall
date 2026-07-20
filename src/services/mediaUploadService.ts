/**
 * Host apply media — compress locally, then upload to Firebase Storage
 * so Luma / the presence API receive a public https avatarUrl (not data:).
 */
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { env } from '../config/env';
import { getFirebaseStorage, isFirebaseReady } from '../lib/firebase';
import { isPublicHttpAvatar } from '../utils/hostAvatar';

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    promise
      .then((v) => {
        clearTimeout(t);
        resolve(v);
      })
      .catch((e) => {
        clearTimeout(t);
        reject(e);
      });
  });
}

async function uriToBlob(uri: string): Promise<Blob> {
  if (uri.startsWith('data:')) {
    const res = await fetch(uri);
    return res.blob();
  }
  if (typeof XMLHttpRequest !== 'undefined') {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', uri, true);
      xhr.responseType = 'blob';
      xhr.onload = () => {
        if (xhr.status === 200 || xhr.status === 0) resolve(xhr.response);
        else reject(new Error('Could not read photo'));
      };
      xhr.onerror = () => reject(new Error('Could not read photo'));
      xhr.timeout = 12_000;
      xhr.ontimeout = () => reject(new Error('Could not read photo'));
      xhr.send();
    });
  }
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Could not read photo');
  return res.blob();
}

async function compressToJpegDataUrl(
  blob: Blob,
  maxEdge = 720,
  quality = 0.62,
): Promise<string> {
  if (typeof document === 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(String(reader.result || ''));
      reader.onerror = () => reject(new Error('encode failed'));
      reader.readAsDataURL(blob);
    });
  }

  const bitmap = await createImageBitmap(blob);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    bitmap.close?.();
    throw new Error('Canvas unavailable');
  }
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close?.();

  const out = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('Compress failed'))),
      'image/jpeg',
      quality,
    );
  });

  if (out.size > 700_000 && quality > 0.45) {
    return compressToJpegDataUrl(out, Math.min(maxEdge, 720), quality - 0.15);
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('encode failed'));
    reader.readAsDataURL(out);
  });
}

/** Local preview URL (may be data:) — for in-app display only. */
export async function prepareLocalPhotoUrl(uri: string): Promise<string> {
  if (!uri) throw new Error('Photo is required');
  if (isPublicHttpAvatar(uri) || uri.startsWith('data:')) {
    return uri;
  }
  try {
    const blob = await withTimeout(uriToBlob(uri), 10_000, 'Reading photo');
    return await withTimeout(compressToJpegDataUrl(blob), 12_000, 'Compressing photo');
  } catch {
    return uri;
  }
}

/** Upload any local/data URI to Firebase Storage → public https URL. */
export async function tryUploadToStorage(input: {
  hostUid: string;
  uri: string;
  pathSuffix: string;
}): Promise<string | null> {
  if (!isFirebaseReady() || !env.firebase.storageBucket) return null;
  if (isPublicHttpAvatar(input.uri)) return input.uri.trim();

  try {
    const blob = await withTimeout(uriToBlob(input.uri), 12_000, 'Read');
    const ref = storageRef(
      getFirebaseStorage(),
      `hosts/${input.hostUid}/${input.pathSuffix}`,
    );
    await withTimeout(
      uploadBytes(ref, blob, { contentType: blob.type || 'image/jpeg' }),
      20_000,
      'Storage',
    );
    return await withTimeout(getDownloadURL(ref), 10_000, 'URL');
  } catch (e) {
    console.warn('[mediaUpload] Storage upload failed', e);
    return null;
  }
}

/**
 * Ensure a URL Luma can load. Prefer Firebase Storage https;
 * fall back to CoinCall API avatar store; never return data:/blob:.
 */
export async function ensurePublicAvatarUrl(
  hostUid: string,
  uri: string,
): Promise<string | null> {
  if (!uri) return null;
  const trimmed = uri.trim();
  const isApiAvatar = /\/api\/hosts\/[^/]+\/avatar(?:\?|$)/i.test(trimmed);

  if (isPublicHttpAvatar(trimmed) && !isApiAvatar) return trimmed;

  // Dead or unverified API avatar link — do not trust without a local re-upload
  if (isPublicHttpAvatar(trimmed) && isApiAvatar) {
    try {
      const res = await fetch(trimmed, { method: 'GET' });
      const ct = String(res.headers.get('content-type') || '');
      if (res.ok && (ct.startsWith('image/') || ct.includes('octet-stream'))) {
        return trimmed;
      }
    } catch {
      /* re-upload below if we have local bytes — caller may pass data: next */
    }
    return null;
  }

  const remote = await tryUploadToStorage({
    hostUid,
    uri: trimmed,
    pathSuffix: `avatar_${Date.now()}.jpg`,
  });
  if (remote && isPublicHttpAvatar(remote)) return remote;

  // Firebase often fails on web — host the JPEG on coincall-api instead
  try {
    const base = env.apiBaseUrl.replace(/\/$/, '');
    const prepared = await prepareLocalPhotoUrl(trimmed);
    const res = await fetch(`${base}/hosts/${encodeURIComponent(hostUid)}/avatar`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': hostUid,
      },
      body: JSON.stringify({ image: prepared }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      avatarUrl?: string;
      error?: string;
    };
    if (res.ok && data.avatarUrl && isPublicHttpAvatar(data.avatarUrl)) {
      return data.avatarUrl;
    }
  } catch (e) {
    console.warn('[mediaUpload] API avatar upload failed', e);
  }
  return null;
}

export type UploadProgressStage = 'photos' | 'video' | 'id' | 'selfie' | 'done';

export async function uploadHostApplicationMedia(
  input: {
    hostUid: string;
    photoUris: string[];
    videoUri?: string;
    idDocumentUri?: string;
    selfieUri?: string;
  },
  onStage?: (stage: UploadProgressStage) => void,
): Promise<{
  photoUrls: string[];
  videoUrl: string;
  idDocumentUrl?: string;
  selfieUrl?: string;
}> {
  onStage?.('photos');
  const photoUrls: string[] = [];
  for (let i = 0; i < input.photoUris.length; i += 1) {
    const local = await prepareLocalPhotoUrl(input.photoUris[i]);
    const publicUrl = await ensurePublicAvatarUrl(input.hostUid, local);
    photoUrls.push(publicUrl || local);
  }

  let videoUrl = '';
  if (input.videoUri?.trim()) {
    onStage?.('video');
    const remote = await tryUploadToStorage({
      hostUid: input.hostUid,
      uri: input.videoUri.trim(),
      pathSuffix: `intro_${Date.now()}.mp4`,
    });
    videoUrl = remote || '';
    // Keep local URI as last resort for in-app preview when Storage fails
    if (!videoUrl) videoUrl = input.videoUri.trim();
  }

  let idDocumentUrl: string | undefined;
  let selfieUrl: string | undefined;
  if (input.idDocumentUri) {
    onStage?.('id');
    const local = await prepareLocalPhotoUrl(input.idDocumentUri);
    idDocumentUrl =
      (await ensurePublicAvatarUrl(input.hostUid, local)) || local;
  }
  if (input.selfieUri) {
    onStage?.('selfie');
    const local = await prepareLocalPhotoUrl(input.selfieUri);
    selfieUrl = (await ensurePublicAvatarUrl(input.hostUid, local)) || local;
  }

  onStage?.('done');
  return { photoUrls, videoUrl, idDocumentUrl, selfieUrl };
}

/** @deprecated kept for call-site compatibility */
export async function uploadHostMedia(input: {
  hostUid: string;
  uri: string;
  kind: 'image' | 'video';
  index?: number;
  folder?: 'photos' | 'docs' | 'video';
}): Promise<string> {
  if (input.kind === 'video') {
    return (
      (await tryUploadToStorage({
        hostUid: input.hostUid,
        uri: input.uri,
        pathSuffix: `intro_${Date.now()}.mp4`,
      })) || ''
    );
  }
  const local = await prepareLocalPhotoUrl(input.uri);
  const remote = await ensurePublicAvatarUrl(input.hostUid, local);
  return remote || local;
}

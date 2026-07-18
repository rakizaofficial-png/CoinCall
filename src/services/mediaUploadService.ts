/**
 * Host apply media — local-first (no Storage wait).
 * Firebase Storage often hangs on localhost CORS; we compress photos to
 * small data URLs so submit always completes in a few seconds.
 */
import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { env } from '../config/env';
import { getFirebaseStorage, isFirebaseReady } from '../lib/firebase';

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
    // Native: keep original URI (no canvas). Storage optional later.
    return URL.createObjectURL
      ? await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(String(reader.result || ''));
          reader.onerror = () => reject(new Error('encode failed'));
          reader.readAsDataURL(blob);
        })
      : '';
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

  // Keep under ~700KB for RTDB-friendly payloads
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

/** Fast local photo URL — never waits on Firebase Storage. */
export async function prepareLocalPhotoUrl(uri: string): Promise<string> {
  if (!uri) throw new Error('Photo is required');
  if (uri.startsWith('http://') || uri.startsWith('https://') || uri.startsWith('data:')) {
    return uri;
  }
  try {
    const blob = await withTimeout(uriToBlob(uri), 10_000, 'Reading photo');
    return await withTimeout(compressToJpegDataUrl(blob), 12_000, 'Compressing photo');
  } catch {
    // Last resort: keep picker URI so apply still works in-session
    return uri;
  }
}

/** Optional Storage upload — short timeout, never blocks apply. */
export async function tryUploadToStorage(input: {
  hostUid: string;
  uri: string;
  pathSuffix: string;
}): Promise<string | null> {
  if (!isFirebaseReady() || !env.firebase.storageBucket) return null;
  if (input.uri.startsWith('http://') || input.uri.startsWith('https://')) {
    return input.uri;
  }
  if (input.uri.startsWith('data:')) return null; // already embedded

  try {
    const blob = await withTimeout(uriToBlob(input.uri), 8_000, 'Read');
    const ref = storageRef(
      getFirebaseStorage(),
      `hosts/${input.hostUid}/${input.pathSuffix}`,
    );
    await withTimeout(
      uploadBytes(ref, blob, { contentType: blob.type || 'image/jpeg' }),
      8_000,
      'Storage',
    );
    return await withTimeout(getDownloadURL(ref), 6_000, 'URL');
  } catch {
    return null;
  }
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
    // Local compress only — Storage is skipped so apply never hangs on CORS
    photoUrls.push(await prepareLocalPhotoUrl(input.photoUris[i]));
  }

  // Optional video: skip Storage entirely (often hangs). Apply without video.
  let videoUrl = '';
  if (input.videoUri?.trim()) {
    onStage?.('video');
    videoUrl = '';
  }

  let idDocumentUrl: string | undefined;
  let selfieUrl: string | undefined;
  if (input.idDocumentUri) {
    onStage?.('id');
    idDocumentUrl = await prepareLocalPhotoUrl(input.idDocumentUri);
  }
  if (input.selfieUri) {
    onStage?.('selfie');
    selfieUrl = await prepareLocalPhotoUrl(input.selfieUri);
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
  const remote = await tryUploadToStorage({
    hostUid: input.hostUid,
    uri: input.uri,
    pathSuffix: `${input.folder || 'photos'}/file_${input.index ?? 0}_${Date.now()}.jpg`,
  });
  return remote || local;
}

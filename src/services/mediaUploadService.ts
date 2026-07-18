import { getDownloadURL, ref as storageRef, uploadBytes } from 'firebase/storage';
import { getFirebaseStorage, isFirebaseReady } from '../lib/firebase';

function extFromUri(uri: string, fallback: string) {
  const clean = uri.split('?')[0] || '';
  const match = clean.match(/\.([a-zA-Z0-9]+)$/);
  return match?.[1]?.toLowerCase() || fallback;
}

function contentTypeFor(ext: string, kind: 'image' | 'video') {
  if (kind === 'video') {
    if (ext === 'mov') return 'video/quicktime';
    if (ext === 'webm') return 'video/webm';
    return 'video/mp4';
  }
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  if (ext === 'gif') return 'image/gif';
  return 'image/jpeg';
}

async function uriToBlob(uri: string): Promise<Blob> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error('Could not read selected media file.');
  return res.blob();
}

export async function uploadHostMedia(input: {
  hostUid: string;
  uri: string;
  kind: 'image' | 'video';
  index?: number;
}): Promise<string> {
  if (!isFirebaseReady()) {
    // Demo / offline mode — keep local URI so apply still works without Storage
    return input.uri;
  }
  if (input.uri.startsWith('http://') || input.uri.startsWith('https://')) {
    return input.uri;
  }

  const ext = extFromUri(input.uri, input.kind === 'video' ? 'mp4' : 'jpg');
  const blob = await uriToBlob(input.uri);
  const path =
    input.kind === 'video'
      ? `hosts/${input.hostUid}/intro_${Date.now()}.${ext}`
      : `hosts/${input.hostUid}/photos/photo_${input.index ?? 0}_${Date.now()}.${ext}`;

  const ref = storageRef(getFirebaseStorage(), path);
  await uploadBytes(ref, blob, {
    contentType: contentTypeFor(ext, input.kind),
    cacheControl: 'public,max-age=31536000',
  });
  return getDownloadURL(ref);
}

export async function uploadHostApplicationMedia(input: {
  hostUid: string;
  photoUris: string[];
  videoUri: string;
}): Promise<{ photoUrls: string[]; videoUrl: string }> {
  const photoUrls: string[] = [];
  for (let i = 0; i < input.photoUris.length; i += 1) {
    const url = await uploadHostMedia({
      hostUid: input.hostUid,
      uri: input.photoUris[i],
      kind: 'image',
      index: i,
    });
    photoUrls.push(url);
  }
  const videoUrl = await uploadHostMedia({
    hostUid: input.hostUid,
    uri: input.videoUri,
    kind: 'video',
  });
  return { photoUrls, videoUrl };
}

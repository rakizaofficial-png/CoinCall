/**
 * Single source of truth for host profile images across Host app ↔ API ↔ Luma.
 * Canonical field name: `avatarUrl` (aliases: `photoUrl`, first of `photoUrls`).
 */

const PLACEHOLDER_HINTS = [
  'i.pravatar.cc',
  'pravatar.cc',
  'dicebear.com',
  'placeholder',
  'via.placeholder',
];

export function isPublicHttpAvatar(url?: string | null): boolean {
  if (!url || typeof url !== 'string') return false;
  const u = url.trim();
  if (!u) return false;
  if (u.startsWith('data:') || u.startsWith('blob:') || u.startsWith('file:')) {
    return false;
  }
  if (!(u.startsWith('http://') || u.startsWith('https://'))) return false;
  const lower = u.toLowerCase();
  if (PLACEHOLDER_HINTS.some((h) => lower.includes(h))) return false;
  return true;
}

/** Neutral initials avatar — only when no real photo exists */
export function defaultHostAvatar(hostId: string, name?: string): string {
  const label = encodeURIComponent(
    (name || hostId || 'H').trim().slice(0, 2).toUpperCase() || 'H',
  );
  return `https://ui-avatars.com/api/?name=${label}&background=1a1520&color=f5f0ea&size=512&bold=true`;
}

/**
 * Pick the first real public photo from common host profile fields.
 * Never invents a random face crop when a live URL exists.
 */
export function pickHostAvatarUrl(
  input: {
    avatarUrl?: string | null;
    photoUrl?: string | null;
    photoUrls?: string[] | null;
    hostAvatar?: string | null;
    thumbnailUrl?: string | null;
  },
  opts?: { hostId?: string; name?: string; allowDefault?: boolean },
): string {
  const candidates = [
    input.avatarUrl,
    input.photoUrl,
    ...(Array.isArray(input.photoUrls) ? input.photoUrls : []),
    input.hostAvatar,
    input.thumbnailUrl,
  ];
  for (const c of candidates) {
    if (isPublicHttpAvatar(c)) return String(c).trim();
  }
  if (opts?.allowDefault === false) return '';
  return defaultHostAvatar(opts?.hostId || 'host', opts?.name);
}

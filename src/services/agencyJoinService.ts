import { env } from '../config/env';
import * as Linking from 'expo-linking';

function apiBase() {
  return env.apiBaseUrl.replace(/\/$/, '');
}

export async function trackReferralClick(referralCode: string) {
  const code = referralCode.trim();
  if (!code) return;
  try {
    await fetch(`${apiBase()}/agency/referral/click`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ referralCode: code }),
    });
  } catch {
    /* non-blocking */
  }
}

export async function joinAgencyByCode(hostId: string, referralCode: string) {
  const code = referralCode.trim();
  if (!hostId || !code) {
    return { ok: false as const, error: 'Host id and referral code required' };
  }
  const res = await fetch(`${apiBase()}/host/join-agency`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': hostId,
    },
    body: JSON.stringify({ hostId, referralCode: code }),
  });
  const data = (await res.json()) as {
    ok?: boolean;
    agencyId?: string;
    agencyName?: string;
    referralCode?: string;
    joined?: boolean;
    error?: string;
  };
  if (!res.ok) {
    return { ok: false as const, error: data.error || 'Join failed' };
  }
  return {
    ok: true as const,
    agencyId: data.agencyId || '',
    agencyName: data.agencyName || '',
    referralCode: data.referralCode || code,
    joined: !!data.joined,
  };
}

/** Parse agency ref from deep link / hash join URL */
export function referralCodeFromUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    const parsed = Linking.parse(url);
    const q = parsed.queryParams?.ref;
    if (typeof q === 'string' && q.trim()) return q.trim();
    const hash = url.includes('#') ? url.split('#')[1] : '';
    const m = /[?&]ref=([^&]+)/i.exec(hash || url);
    if (m?.[1]) return decodeURIComponent(m[1]);
  } catch {
    /* ignore */
  }
  return null;
}

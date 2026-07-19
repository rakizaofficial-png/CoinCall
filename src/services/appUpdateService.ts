/**
 * Host app force-update — listens to API + Firebase appConfig/hostApp.
 */

import Constants from 'expo-constants';
import { onValue, ref } from 'firebase/database';
import { Platform } from 'react-native';
import { env } from '../config/env';
import { getFirebaseDb, isFirebaseReady } from '../lib/firebase';

export type HostAppUpdateConfig = {
  latestVersion: string;
  minVersion: string;
  forceUpdate: boolean;
  title: string;
  message: string;
  iosStoreUrl: string;
  androidStoreUrl: string;
  webUpdateUrl: string;
  updatedAt?: number;
  needsForceUpdate?: boolean;
};

export function getHostAppVersion(): string {
  return (
    Constants.expoConfig?.version ||
    Constants.nativeApplicationVersion ||
    '1.0.0'
  );
}

export function compareSemver(a: string, b: string): number {
  const pa = String(a || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const pb = String(b || '0')
    .replace(/^v/i, '')
    .split(/[.+-]/)
    .map((x) => parseInt(x, 10) || 0);
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

export function shouldForceUpdate(cfg: HostAppUpdateConfig | null): boolean {
  if (!cfg?.forceUpdate) return false;
  if (cfg.needsForceUpdate === true) return true;
  const current = getHostAppVersion();
  return compareSemver(current, cfg.minVersion || '0.0.0') < 0;
}

export function pickStoreUrl(cfg: HostAppUpdateConfig): string {
  if (Platform.OS === 'ios' && cfg.iosStoreUrl) return cfg.iosStoreUrl;
  if (Platform.OS === 'android' && cfg.androidStoreUrl) return cfg.androidStoreUrl;
  return cfg.webUpdateUrl || cfg.androidStoreUrl || cfg.iosStoreUrl || '';
}

export async function fetchHostAppUpdate(): Promise<HostAppUpdateConfig | null> {
  const base = (env.apiBaseUrl || 'https://coincall-api.onrender.com/api').replace(
    /\/$/,
    '',
  );
  const version = encodeURIComponent(getHostAppVersion());
  try {
    const res = await fetch(`${base}/host/app-update?version=${version}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as HostAppUpdateConfig;
  } catch {
    return null;
  }
}

/** Realtime Firebase listener for admin force-update pushes */
export function listenHostAppUpdate(
  onChange: (cfg: HostAppUpdateConfig) => void,
): () => void {
  if (!isFirebaseReady()) return () => undefined;
  const r = ref(getFirebaseDb(), 'appConfig/hostApp');
  return onValue(r, (snap) => {
    if (!snap.exists()) return;
    const val = snap.val() as HostAppUpdateConfig;
    if (!val || typeof val !== 'object') return;
    onChange({
      latestVersion: String(val.latestVersion || '1.0.0'),
      minVersion: String(val.minVersion || '1.0.0'),
      forceUpdate: Boolean(val.forceUpdate),
      title: String(val.title || 'Update required'),
      message: String(
        val.message ||
          'A new CoinCall Host version is available. Please update to continue.',
      ),
      iosStoreUrl: String(val.iosStoreUrl || ''),
      androidStoreUrl: String(val.androidStoreUrl || ''),
      webUpdateUrl: String(val.webUpdateUrl || ''),
      updatedAt: Number(val.updatedAt || 0),
    });
  });
}

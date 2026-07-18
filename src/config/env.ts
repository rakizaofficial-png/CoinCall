/**
 * ============================================================================
 * COINCALL HOST CLIENT — PRODUCTION ENV
 * ============================================================================
 *
 * STEP-BY-STEP KEY SETUP
 * 1) API: EXPO_PUBLIC_API_BASE_URL=https://YOUR-API/api
 * 2) Agora: EXPO_PUBLIC_AGORA_APP_ID= (certificate on API only)
 * 3) Firebase: EXPO_PUBLIC_FIREBASE_* from Firebase Console Web app
 * 4) Payouts: merchant secrets live on API (EASYPAISA_*, JAZZCASH_*) — NOT here
 * ============================================================================
 */

const PRODUCTION_API = 'https://coincall-api.onrender.com/api';

const read = (key: string, fallback = '') =>
  (process.env[key] ?? fallback).trim();

function resolveApiBaseUrl() {
  const fromEnv = read('EXPO_PUBLIC_API_BASE_URL').replace(/\/$/, '');
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (
      host.includes('onrender.com') ||
      host.includes('coincall-host') ||
      (!host.includes('localhost') && !host.includes('127.0.0.1'))
    ) {
      if (fromEnv.includes('onrender.com')) return fromEnv;
      return PRODUCTION_API;
    }
  }
  if (fromEnv) return fromEnv;
  return PRODUCTION_API;
}

export const env = {
  appEnv: read('EXPO_PUBLIC_APP_ENV', 'production'),
  apiBaseUrl: resolveApiBaseUrl(),

  firebase: {
    apiKey: read('EXPO_PUBLIC_FIREBASE_API_KEY'),
    authDomain: read('EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN'),
    projectId: read('EXPO_PUBLIC_FIREBASE_PROJECT_ID'),
    storageBucket: read('EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: read('EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID'),
    appId: read('EXPO_PUBLIC_FIREBASE_APP_ID'),
    vapidKey: read('EXPO_PUBLIC_FIREBASE_VAPID_KEY'),
    databaseURL: read('EXPO_PUBLIC_FIREBASE_DATABASE_URL'),
  },

  agora: {
    appId: read('EXPO_PUBLIC_AGORA_APP_ID'),
  },

  stripe: {
    publishableKey: read('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  },

  /** Host auth token storage key — JWT from /api/auth/login */
  authTokenKey: 'coincall_host_token',
} as const;

export function getMissingProductionKeys(): string[] {
  const missing: string[] = [];
  if (!env.apiBaseUrl) missing.push('EXPO_PUBLIC_API_BASE_URL');
  if (!env.agora.appId) missing.push('EXPO_PUBLIC_AGORA_APP_ID');
  return missing;
}

export function isConfigured() {
  return getMissingProductionKeys().length === 0;
}

export function getHostAuthToken(): string {
  if (typeof localStorage === 'undefined') return '';
  return (
    localStorage.getItem(env.authTokenKey) ||
    localStorage.getItem('coincall_user_token') ||
    ''
  );
}

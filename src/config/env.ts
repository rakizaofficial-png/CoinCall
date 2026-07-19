/**
 * Public client config only.
 * Secrets (Agora certificate, Stripe secret, DB URL) stay on the backend.
 *
 * Production fallbacks: Firebase web config + Agora App ID are public client
 * values. Render static builds often miss EXPO_PUBLIC_* at export time, which
 * left the host stuck in "Demo mode". Env vars still override when present.
 */
const PRODUCTION_API = 'https://coincall-api.onrender.com/api';

/** Public Firebase web app (lovecall-2291e) — safe to ship in client bundles */
const PROD_FIREBASE = {
  apiKey: 'AIzaSyBzFRXeuDvjq6RG5VR4oky0Ra93AvVFZ50',
  authDomain: 'lovecall-2291e.firebaseapp.com',
  projectId: 'lovecall-2291e',
  storageBucket: 'lovecall-2291e.firebasestorage.app',
  messagingSenderId: '469302066716',
  appId: '1:469302066716:web:79d8e7bce979bcf17529d9',
  databaseURL: 'https://lovecall-2291e-default-rtdb.firebaseio.com',
} as const;

const PROD_AGORA_APP_ID = '91b304d27075417e9b9e9b5358448656';

const read = (key: string, fallback = '') =>
  (process.env[key] ?? fallback).trim();

function resolveApiBaseUrl() {
  const fromEnv = read('EXPO_PUBLIC_API_BASE_URL').replace(/\/$/, '');
  // Hosted web must never use localhost — Luma users hit the public API
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (
      host.includes('onrender.com') ||
      host.includes('coincall-host') ||
      (!host.includes('localhost') && !host.includes('127.0.0.1'))
    ) {
      // Prefer env if it already points at Render; otherwise force production API
      if (fromEnv.includes('onrender.com')) return fromEnv;
      return PRODUCTION_API;
    }
  }
  // Native / EAS builds: prefer baked-in env, else production API
  if (fromEnv) return fromEnv;
  return PRODUCTION_API;
}

export const env = {
  appEnv: read('EXPO_PUBLIC_APP_ENV', 'production'),
  apiBaseUrl: resolveApiBaseUrl(),

  firebase: {
    apiKey: read('EXPO_PUBLIC_FIREBASE_API_KEY', PROD_FIREBASE.apiKey),
    authDomain: read(
      'EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN',
      PROD_FIREBASE.authDomain,
    ),
    projectId: read(
      'EXPO_PUBLIC_FIREBASE_PROJECT_ID',
      PROD_FIREBASE.projectId,
    ),
    storageBucket: read(
      'EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET',
      PROD_FIREBASE.storageBucket,
    ),
    messagingSenderId: read(
      'EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID',
      PROD_FIREBASE.messagingSenderId,
    ),
    appId: read('EXPO_PUBLIC_FIREBASE_APP_ID', PROD_FIREBASE.appId),
    vapidKey: read('EXPO_PUBLIC_FIREBASE_VAPID_KEY'),
    databaseURL: read(
      'EXPO_PUBLIC_FIREBASE_DATABASE_URL',
      PROD_FIREBASE.databaseURL,
    ),
  },

  agora: {
    appId: read('EXPO_PUBLIC_AGORA_APP_ID', PROD_AGORA_APP_ID),
  },

  stripe: {
    publishableKey: read('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY'),
  },
} as const;

export function getMissingProductionKeys(): string[] {
  const missing: string[] = [];
  if (!env.apiBaseUrl) missing.push('EXPO_PUBLIC_API_BASE_URL');
  if (!env.firebase.apiKey) missing.push('EXPO_PUBLIC_FIREBASE_API_KEY');
  if (!env.firebase.projectId) missing.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (!env.firebase.appId) missing.push('EXPO_PUBLIC_FIREBASE_APP_ID');
  if (!env.agora.appId) missing.push('EXPO_PUBLIC_AGORA_APP_ID');
  return missing;
}

export function isConfigured() {
  return getMissingProductionKeys().length === 0;
}

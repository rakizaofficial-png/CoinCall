/**
 * Public client config only.
 * Secrets (Agora certificate, Stripe secret, DB URL) stay on the backend.
 */
const PRODUCTION_API = 'https://coincall-api.onrender.com/api';

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
  if (fromEnv) return fromEnv;
  return PRODUCTION_API;
}

export const env = {
  appEnv: read('EXPO_PUBLIC_APP_ENV', 'development'),
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
} as const;

export function getMissingProductionKeys(): string[] {
  const missing: string[] = [];
  if (!env.apiBaseUrl) missing.push('EXPO_PUBLIC_API_BASE_URL');
  if (!env.firebase.apiKey) missing.push('EXPO_PUBLIC_FIREBASE_API_KEY');
  if (!env.firebase.projectId) missing.push('EXPO_PUBLIC_FIREBASE_PROJECT_ID');
  if (!env.firebase.appId) missing.push('EXPO_PUBLIC_FIREBASE_APP_ID');
  if (!env.agora.appId) missing.push('EXPO_PUBLIC_AGORA_APP_ID');
  if (!env.stripe.publishableKey) missing.push('EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY');
  return missing;
}

export function isConfigured() {
  return getMissingProductionKeys().length === 0;
}

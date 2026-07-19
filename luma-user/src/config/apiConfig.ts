/**
 * =============================================================================
 * LUMA USER APP — PRODUCTION API / SDK CONFIGURATION
 * =============================================================================
 *
 * STEP-BY-STEP EXTERNAL SETUP (do this before going live):
 *
 * 1) AGORA (1v1 / Party / PK video)
 *    - Create account: https://console.agora.io/
 *    - Create a project → copy App ID
 *    - Enable "Primary Certificate" → copy App Certificate (SERVER ONLY — never put in Next.js)
 *    - Put App ID in: NEXT_PUBLIC_AGORA_APP_ID
 *    - Put Certificate on CoinCall API only: AGORA_APP_CERTIFICATE
 *    - Tokens must be minted by your backend (`/api/calls/:id/token`) — never client-side.
 *
 * 2) COINCALL API (this is your source of truth for hosts, wallet, calls)
 *    - Deploy CoinCall/server (Render / Fly / Railway)
 *    - Set NEXT_PUBLIC_API_BASE_URL=https://YOUR-API.onrender.com/api
 *
 * 3) FIREBASE (optional FCM push for incoming-call alerts)
 *    - Firebase console → Project settings → Your apps → Web app
 *    - Copy config into NEXT_PUBLIC_FIREBASE_* below
 *    - Cloud Messaging → Web Push certificates → VAPID key
 *
 * 4) GOOGLE PLAY BILLING / APPLE IAP
 *    - Play Console → Monetize → Products → create managed products matching
 *      productIds in src/lib/payments/iapCatalog.ts
 *    - App Store Connect → In-App Purchases → same productIds
 *    - Server verifies purchase tokens via /api/wallet/iap/verify
 *
 * 5) AI HOST CDN (fallback prerecorded clips)
 *    - Upload intro.mp4 / loop.mp4 / teaser.mp4 to S3/GCS/R2
 *    - Set NEXT_PUBLIC_AI_HOST_CDN=https://bucket.../ai-hosts
 *
 * Copy this file's keys into `.env.local` (never commit secrets).
 * =============================================================================
 */

const read = (key: string, fallback = "") =>
  (typeof process !== "undefined" ? process.env[key] : undefined)?.trim() ||
  fallback;

export const apiConfig = {
  env: read("NEXT_PUBLIC_APP_ENV", "production"),

  /** CoinCall Express API root including `/api` */
  apiBaseUrl: read(
    "NEXT_PUBLIC_API_BASE_URL",
    "https://coincall-api.onrender.com/api",
  ).replace(/\/$/, ""),

  /** WebSocket URL — derived from API host unless overridden */
  wsUrl: (() => {
    const explicit = read("NEXT_PUBLIC_WS_URL");
    if (explicit) return explicit.replace(/\/$/, "");
    const api = read(
      "NEXT_PUBLIC_API_BASE_URL",
      "https://coincall-api.onrender.com/api",
    ).replace(/\/$/, "");
    try {
      const u = new URL(api.replace(/\/api$/, ""));
      u.protocol = u.protocol === "https:" ? "wss:" : "ws:";
      u.pathname = "/ws";
      return u.toString().replace(/\/$/, "");
    } catch {
      return "wss://coincall-api.onrender.com/ws";
    }
  })(),

  agora: {
    /** Public App ID only — certificate stays on server */
    appId: read("NEXT_PUBLIC_AGORA_APP_ID"),
  },

  firebase: {
    apiKey: read("NEXT_PUBLIC_FIREBASE_API_KEY"),
    authDomain: read("NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN"),
    projectId: read("NEXT_PUBLIC_FIREBASE_PROJECT_ID"),
    storageBucket: read("NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET"),
    messagingSenderId: read("NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID"),
    appId: read("NEXT_PUBLIC_FIREBASE_APP_ID"),
    vapidKey: read("NEXT_PUBLIC_FIREBASE_VAPID_KEY"),
  },

  aiHostCdn: read("NEXT_PUBLIC_AI_HOST_CDN"),
  welcomeTeaserUrl: read("NEXT_PUBLIC_WELCOME_TEASER_URL"),

  /**
   * Anonymous device user id — replace with real auth (Firebase Auth / JWT)
   * once you wire login. Stored in localStorage under this key.
   */
  deviceUserKey: "luma_device_user_id",
} as const;

export function getMissingClientKeys(): string[] {
  const missing: string[] = [];
  if (!apiConfig.apiBaseUrl) missing.push("NEXT_PUBLIC_API_BASE_URL");
  if (!apiConfig.agora.appId) missing.push("NEXT_PUBLIC_AGORA_APP_ID");
  return missing;
}

export function requireApiBase(): string {
  const base = apiConfig.apiBaseUrl;
  if (!base) {
    throw new Error(
      "NEXT_PUBLIC_API_BASE_URL is not set. See src/config/apiConfig.ts setup guide.",
    );
  }
  return base;
}

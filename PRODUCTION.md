# Production readiness (CoinCall)

## Stack (actual)

| Layer | Technology |
|-------|------------|
| Host app | Expo / React Native (web export on Render) |
| User app (Luma) | Next.js |
| API | Express + native **WebSocket** (`/ws`) + Agora tokens |
| Host/Admin data | Firebase Auth + RTDB |
| Wallet / live mirror | In-memory Maps + **JSON snapshot** (`.data/` or `DATA_DIR`) |

This is **not** MongoDB + Socket.IO. Realtime is native `ws`. Persistence is file snapshot (mount a Render disk via `DATA_DIR` for durability across restarts).

## Production checklist

1. Render env (API): `AGORA_APP_ID`, `AGORA_APP_CERTIFICATE`, `ADMIN_API_KEY`, optional `DATA_DIR`, `ALLOW_IAP_STUB=1` only for demo credits.
2. Render env (Host): all `EXPO_PUBLIC_FIREBASE_*`, `EXPO_PUBLIC_AGORA_APP_ID`, `EXPO_PUBLIC_API_BASE_URL`.
3. Render env (Luma): `NEXT_PUBLIC_API_BASE_URL`, optional `NEXT_PUBLIC_AGORA_APP_ID` (tokens from API include `appId`).
4. Smoke: `npm run smoke`
5. Build: `npm run build:all`

## Core flows verified by smoke + recent fixes

- Health / hosts / live token
- Mass text → Luma inbox (WS)
- Live join (Agora RTC audience)
- 1v1 call bridge + disconnect UI
- Wallet me/spend APIs

## Known limits (honest)

- Free Render sleep clears online presence until hosts heartbeat again.
- IAP verify is stubbed unless Google/Apple credentials are set (blocked in production unless `ALLOW_IAP_STUB=1`).
- Luma auth is device-localStorage id (not full account OTP yet).
- Voice-only call UI is not a separate product surface (video call with mute covers voice).

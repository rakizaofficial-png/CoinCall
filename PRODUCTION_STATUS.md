# Production status (2026-07-19)

## Architecture (actual)
- **User app:** Next.js (`luma-coincall-user` / `myapp`) — not Expo
- **Host app:** Expo React Native (`CoinCall`)
- **API:** Express + native `ws` (not Socket.IO)
- **State:** In-memory Maps + **disk wallet snapshot** (`.data/wallets.json`); Firebase on host/admin for profiles/chat
- **MongoDB / Socket.IO:** Not in use yet — `DATABASE_URL` reserved for future

## Hardened this release
- Wallet credit/spend/premium/IAP require matching `X-User-Id` (or admin key)
- Agora public token gated to `call_` / `live_` / `party_` channels
- Wallet persistence flush every 15s
- Luma live room no longer crashes on API host IDs
- Luma rewards/VIP no longer mint coins locally on API failure

## Still required for full money production
- Real Play/App Store IAP verification secrets
- Real EasyPaisa/JazzCash merchant credentials
- Durable multi-instance DB (Mongo/Postgres)
- Firebase Auth on user app (currently device UUID)
- Real chat/live stream (user chat still demo UI)

## Demo accounts
- Admin: `coincall-admin`
- Agency: `agency-nova` / `agency-luxe`

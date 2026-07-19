# Production status (2026-07-19)

## Architecture (actual)
- **User app:** Next.js (`luma-coincall-user` / `myapp`) — not Expo
- **Host app:** Expo React Native (`CoinCall`)
- **API:** Express + native `ws` (not Socket.IO)
- **State:** In-memory Maps + **disk snapshot** (`.data/coincall-snapshot.json`) + optional **Mongo** when `MONGODB_URI` / mongodb `DATABASE_URL` is set
- **MongoDB:** Optional dual-write layer implemented — **not live on Render until URI is configured**
- **Socket.IO:** Not in use (native `ws` only)

## Hardened this release
- Wallet credit/spend/premium/IAP require matching `X-User-Id` (or admin key)
- Client `/wallet/credit` allowlisted + 500-coin cap (admin bypass)
- `/wallet/sync` no longer accepts client `coinBalance` (server-authoritative)
- Withdrawals require `X-User-Id`; removed `knownBalance` overwrite
- `/api/live/token` gated to `live_` / `party_` / `call_` channels
- Gifts send/respond require user match
- Free VIP blocked in production unless `ALLOW_FREE_VIP=1`
- Host wallet sync/credit send `X-User-Id`
- Luma call billing uses awaited `spendAsync`; AI fallback disclosed in toast
- GiftSheet sends `X-User-Id`
- Optional Mongo snapshot upsert (disk always written first)

## Verified on production (pre-this-deploy smoke)
- `agoraConfigured: true` — token mint works for `live_*` channels
- `/api/ai-hosts` returns prerecorded CDN catalog (not generative AI)
- Wallet credit without `X-User-Id` → 401

## Still required for full money production
- Set `MONGODB_URI` (or mongodb `DATABASE_URL`) + Render persistent `DATA_DIR` for durable multi-instance wallets
- Real Play/App Store IAP verification secrets
- Real EasyPaisa/JazzCash merchant credentials
- Firebase Auth / JWT on user app (currently device UUID + spoofable header)
- Real chat / live audience Agora viewer (Luma live/party/messages still largely demo UI)
- OTP auth, Socket.IO migration (not planned — keep `ws` unless product requires it)
- Strong non-demo `ADMIN_API_KEY` if still using default

## Demo accounts
- Admin: `coincall-admin`
- Agency: `agency-nova` / `agency-luxe`

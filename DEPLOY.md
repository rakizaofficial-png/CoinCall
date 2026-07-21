# Deploy on Render (API + Host + Admin + Luma user)

## Live URLs (after Blueprint deploy)
| Service | URL | Role |
|---------|-----|------|
| `coincall-api` | https://coincall-api.onrender.com | Backend (tokens + call bridge) |
| `coincall-host` | https://coincall-host.onrender.com | Host web app |
| `coincall-admin` | https://coincall-admin.onrender.com | Admin panel |
| `luma-user` | https://luma-user.onrender.com | Fan / user app |

## 1) Deploy CoinCall (API + Host + Admin)
1. Open https://dashboard.render.com/blueprints/new
2. Connect GitHub repo **CoinCall** (`rakizaofficial-png/CoinCall`)
3. Confirm `render.yaml` → **Deploy Blueprint**
4. Fill secrets when prompted:

### coincall-api
```
AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...
ADMIN_API_KEY=coincall-admin
```

### coincall-host (same public Firebase + Agora App ID as local `.env`)
```
EXPO_PUBLIC_FIREBASE_API_KEY=...
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN=...
EXPO_PUBLIC_FIREBASE_PROJECT_ID=...
EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET=...
EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
EXPO_PUBLIC_FIREBASE_APP_ID=...
EXPO_PUBLIC_FIREBASE_DATABASE_URL=...
EXPO_PUBLIC_AGORA_APP_ID=...
EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY=...
```
`EXPO_PUBLIC_API_BASE_URL` is already set to `https://coincall-api.onrender.com/api`.

### coincall-admin
```
VITE_ADMIN_KEY=coincall-admin
VITE_FIREBASE_*=...
VITE_AGORA_APP_ID=...
```
`VITE_API_BASE_URL` is already set.

## 2) Deploy Luma user app
Luma now lives in this repo at `luma-user/` (host-bridge feed fix included).

**Preferred (same Blueprint as CoinCall):**
1. Open Render → CoinCall Blueprint → **Sync** / redeploy so `luma-user` service appears from `render.yaml`
2. Or create Web Service → repo **CoinCall** → **Root Directory** = `luma-user`
3. Build: `npm install --include=dev && npm run build` · Start: `npm start`
4. Env: `NEXT_PUBLIC_API_BASE_URL=https://coincall-api.onrender.com/api`

**If you still use the old `luma-coincall-user` repo:** reconnect that Render service to **CoinCall** with rootDir `luma-user`, or grant this agent push access to `luma-coincall-user` so we can update it directly.

## 3) Luma Android (Google Play)
Package name must be **`com.coincall.luma`**. Build from `luma-app/` — see [luma-app/PLAY_STORE.md](luma-app/PLAY_STORE.md).

```bash
cd luma-app && npm install && npx eas build --platform android --profile production
```

Do **not** upload the host app (`com.coincall.host`) to the Luma Play listing.

## 4) Test
1. Open host URL → log in → **Go Online**
2. Open Luma → **1v1** → call the live host
3. Accept on host → video connects (Agora)

## Notes
- Free services sleep after idle (~30s cold start).
- Never put `AGORA_APP_CERTIFICATE` in host/user/admin — API only.

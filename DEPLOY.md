# Deploy CoinCall (GitHub + Render)

## What Render hosts
| Service | URL after deploy | Purpose |
|---------|------------------|---------|
| `coincall-api` | `https://coincall-api.onrender.com` | Agora tokens + admin login |
| `coincall-admin` | `https://coincall-admin.onrender.com` | Web admin panel |

The Expo host mobile/web app runs locally / EAS. Point it at the Render API URL.

## 1) GitHub
Already pushed if you used the agent push. Otherwise:
```bash
git push -u origin main
```

## 2) Render Blueprint
1. Open https://dashboard.render.com
2. **New** → **Blueprint**
3. Connect the GitHub repo `CoinCall`
4. Apply `render.yaml`
5. Fill secret env vars when prompted

### API (`coincall-api`) env
```
AGORA_APP_ID=...
AGORA_APP_CERTIFICATE=...
ADMIN_API_KEY=coincall-admin
```

### Admin (`coincall-admin`) env (build-time)
```
VITE_API_BASE_URL=https://coincall-api.onrender.com/api
VITE_ADMIN_KEY=coincall-admin
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_FIREBASE_DATABASE_URL=...
VITE_AGORA_APP_ID=...
```

## 3) Host app `.env`
```
EXPO_PUBLIC_API_BASE_URL=https://coincall-api.onrender.com/api
```
(Keep the same Firebase + Agora App ID values.)

## Free plan note
Render free web services sleep after idle. First request may take ~30s to wake.

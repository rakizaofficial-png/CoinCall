# CoinCall Admin Panel

Web control center for the host app.

## Features
- Approve / reject / ban hosts (photo + video review)
- Set coins, force online/offline
- Remote commands into host app
- **Silent 1:1 monitor** — join live calls behind the host (host cannot see admin)

## Setup
1. Copy env:
   ```bash
   cp admin/.env.example admin/.env
   ```
2. Fill `admin/.env` from the host app `.env`:
   - `EXPO_PUBLIC_FIREBASE_*` → `VITE_FIREBASE_*`
   - `EXPO_PUBLIC_AGORA_APP_ID` → `VITE_AGORA_APP_ID`
   - `EXPO_PUBLIC_API_BASE_URL` → `VITE_API_BASE_URL`
3. In `server/.env` set:
   ```
   ADMIN_API_KEY=coincall-admin
   ```
4. Run:
   ```bash
   npm run server
   npm run admin
   ```
5. Open http://localhost:5173  
   Login key: `coincall-admin` (or your `VITE_ADMIN_KEY`)

## Silent video
When a host starts a 1:1 call, it appears under **Live 1:1**.  
Click **Enter silent** — admin joins Agora as subscriber only (no camera/mic published).

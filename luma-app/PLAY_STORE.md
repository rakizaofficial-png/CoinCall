# Luma Android (Play Store)

Package name: **`com.coincall.luma`**

This folder builds the **Luma user** Android App Bundle for Google Play.  
Do **not** upload the CoinCall **host** build (`com.coincall.host`) to this Play listing.

## 1) One-time setup

```bash
cd luma-app
npm install
npx eas login
npx eas init
```

`eas init` links the project and writes `extra.eas.projectId` in `app.config.ts`.

Optional env for a custom web URL:

```bash
export EXPO_PUBLIC_LUMA_URL=https://luma-user.onrender.com
```

## 2) Build the `.aab` for Play Console

```bash
cd luma-app
npx eas build --platform android --profile production
```

When the build finishes, download the **`.aab`** from the EAS dashboard.

## 3) Upload to Google Play

1. Open your Play app created with package **`com.coincall.luma`**
2. **Release** → **Production** (or Internal testing)
3. **Create new release** → upload the `.aab` from step 2
4. The package name must match exactly: `com.coincall.luma`

## Troubleshooting

| Error | Fix |
|-------|-----|
| Package name must be `com.coincall.luma` | Build from **`luma-app/`**, not the repo root host app |
| Wrong app uploaded | Host app = `com.coincall.host` · Luma = `com.coincall.luma` |
| WebView blank | Ensure `luma-user` is deployed on Render |

## Host app (separate listing)

CoinCall Host uses package **`com.coincall.host`** from the repo root (`app.config.ts`).  
Create a **different** Play Console app if you publish the host APK later.

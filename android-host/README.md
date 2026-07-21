# CoinCall Host — Native Android (Material 3)

Production-oriented **Kotlin + Jetpack Compose** host application for CoinCall 1:1 video calling.

Package ID: `com.coincall.host`  
Min SDK 26 · Target SDK 35 · Compose BOM 2024.12 · Hilt · Retrofit · Encrypted prefs

## Architecture

```
app/
  core/          network · security · ui theme/components · util
  data/          api DTOs · local DataStore · HostRepository
  domain/        models (host never sees admin/global wallet APIs)
  presentation/  feature screens + navigation
  di/            Hilt modules
```

Clean layering:

- **Presentation** → ViewModels (`StateFlow`) + Compose UI
- **Data** → `HostRepository` talks only to host-safe `/api/*` routes
- **Security** → encrypted token store, root detection, screenshot protection on calls, HTTPS-only network config

Hosts **cannot** change coin prices, edit user wallets, read admin data, other hosts, or other agencies — those APIs are simply not exposed in `HostApi`.

## Features mapped

| Area | Screens / modules |
|---|---|
| Auth | Login, Register, Forgot/Reset password, biometric flag, session + devices |
| Dashboard | Today/week/month/total earnings, balances, online toggle, growth chart, KPIs |
| Profile | Edit profile fields, completion, verified badge |
| KYC | Selfie + document status + progress |
| Presence | Online / Offline / Busy / Away / Vacation, auto-reject |
| Calling | Incoming + active call UI, mute/speaker/camera/beauty, timer, network, report/block, FLAG_SECURE |
| History | Search + filters, duration, coins |
| Wallet / Withdraw | Balances, histories, Easypaisa/JazzCash/Bank/Crypto request flow |
| Chat / Help | DM hub, support tickets, FAQ from `/api/help-center` |
| Agency / Referral | Join by code, share link |
| Settings | Theme, language, push, biometric, logout |
| Notifications | Admin / payment / call feed |

## Open in Android Studio

1. Open the `android-host/` folder (not the monorepo root).
2. Let Gradle sync (AGP 8.7 / Gradle 8.9).
3. Create `local.properties` with `sdk.dir=/path/to/Android/sdk`.
4. Run **app** on a device/emulator.

```bash
cd android-host
./gradlew :app:assembleDebug
```

## API

Default base URL (BuildConfig):

`https://coincall-api.onrender.com/api/`

Auth: host session stored in `EncryptedSharedPreferences`; every request sends `X-User-Id` + optional Bearer token via `AuthInterceptor`.

## Google Play checklist

- [ ] Replace SSL pin placeholder in `NetworkModule` before enabling `SSL_PINNING_ENABLED`
- [ ] Wire Firebase Auth / JWT issuer for production login (current bridge creates secure local session + `/host/login-event`)
- [ ] Integrate Agora SDK in `CallActivity` for HD media
- [ ] Attach Play App Signing + privacy policy + data safety form
- [ ] Turn on R8 (already enabled for release)

## Related apps in monorepo

- Expo host (`/src`) — cross-platform companion already shipping via EAS
- Admin web (`/admin`) — ops console (not bundled into this APK)

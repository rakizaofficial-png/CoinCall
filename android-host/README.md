# CoinCall Host — Native Android (Material 3)

Production-oriented **Kotlin + Jetpack Compose** host application for CoinCall 1:1 video calling.

Package ID: `com.coincall.host`  
Min SDK 26 · Target SDK 35 · Compose BOM 2024.12 · Hilt · Retrofit · Encrypted prefs · JWT session

## Architecture

```
app/
  core/          agora · calc · network · permissions · push · security · ui
  data/          api DTOs · local DataStore · HostRepository
  domain/        models (host never sees admin/global wallet APIs)
  presentation/  feature screens + navigation
  di/            Hilt modules (incl. AgoraModule)
```

Clean layering:

- **Presentation** → ViewModels (`StateFlow`) + Compose UI
- **Data** → `HostRepository` talks only to host-safe `/api/*` routes
- **Security** → encrypted token store, HS256 JWT-shaped sessions, root detection, screenshot protection on calls, HTTPS-only network config

Hosts **cannot** change coin prices, edit user wallets, read admin data, other hosts, or other agencies — those APIs are simply not exposed in `HostApi`.

## Features mapped

| Area | Screens / modules |
|---|---|
| Auth | Login, OTP, Register, Forgot/Reset password, biometric flag, JWT session |
| Dashboard | Today/week/month/total earnings, balances, online toggle, schedule, reviews |
| Profile | Bio, languages, completion, verified badge |
| KYC | Selfie + CNIC + Passport + approval status |
| Presence | Online / Offline / Busy / Away / Vacation, auto-reject, schedule |
| Calling | Incoming + active call, Agora façade, mute/speaker/camera/switch/beauty, timer + coin calc, FLAG_SECURE |
| History | Call history with coins |
| Wallet / Withdraw | Daily/weekly/monthly coin earnings, pending/approved filters, gateway validation |
| Chat | Fan DMs, dedicated Admin + Agency threads, Help Center tickets |
| Agency / Referral | Join by code, commission (read-only), share link |
| Settings | Dark mode, language, push, biometric, logout, devices |
| Notifications | In-app feed + local push channels (FCM-ready) |
| Reviews | Ratings + host ranking |

## Verify (no SDK required)

```bash
node scripts/verify-android-host.mjs
# or full A–Z matrix:
node scripts/audit-android-host.mjs
```

## Open in Android Studio (APK)

1. Open the `android-host/` folder (not the monorepo root).
2. Let Gradle sync (AGP 8.7 / Gradle 8.9).
3. Create `local.properties` with `sdk.dir=/path/to/Android/sdk`.
4. Run **app** on a device/emulator.

```bash
cd android-host
./gradlew :app:assembleDebug
./gradlew :app:assembleRelease
```

## API

Default base URL (BuildConfig):

`https://coincall-api.onrender.com/api/`

Auth: JWT-shaped host token in `EncryptedSharedPreferences`; requests send `X-User-Id`, `X-Client-Role: host`, and `Authorization: Bearer` when JWT is valid.

## Google Play checklist

- [ ] Replace SSL pin placeholder in `NetworkModule` before enabling `SSL_PINNING_ENABLED`
- [ ] Wire Firebase Auth / server-issued JWTs for production login
- [ ] Swap `StubAgoraEngine` for SDK impl in `AgoraModule`
- [ ] Wire real OTP SMS/email provider (QA accepts `123456`)
- [ ] Attach gallery/camera picker + Firebase Storage for KYC media
- [ ] Attach Play App Signing + privacy policy + data safety form
- [x] R8 minify enabled for release

## Related apps in monorepo

- Expo host (`/src`) — cross-platform companion already shipping via EAS
- Admin web (`/admin`) — ops console (not bundled into this APK)

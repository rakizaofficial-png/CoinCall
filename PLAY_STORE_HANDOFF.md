# CoinCall Host — Android / Play Store handoff

## App identity

- Store name: CoinCall Beauty
- Android package: `com.coincall.host`
- Version: `1.0.6`
- Version code: `7` (production builds auto-increment through EAS)
- Minimum Android: API 24
- Target Android: API 35
- Production API: `https://coincall-api.onrender.com/api`
- Build artifact: Android App Bundle (`.aab`)

## Production build

```sh
npm ci
npm run build:android
```

The production EAS profile is already configured for a Play Store App Bundle.
An Expo account with access to project
`28dee9ee-23a0-4a69-948b-c153c5aa11c1` and Android signing credentials is
required to produce the signed AAB.

## Play Console submission

1. Create the app as **CoinCall Beauty** with package `com.coincall.host`.
2. Upload the signed `.aab` to Internal testing first.
3. Complete Data safety for account/profile data, device data, camera,
   microphone, user-generated chat/media, call/live metadata, and wallet
   activity.
4. Add a privacy-policy URL and support contact.
5. Declare camera, microphone, notifications, photo/video access, Bluetooth,
   and wake-lock permissions where Play Console asks.
6. Complete content rating, ads declaration, target audience, app access, and
   account-deletion declarations.
7. Test camera permission, live start, chat, paid live entry, 1:1 call,
   background/foreground recovery, and withdrawal on physical Android devices.

## Implemented in this handoff

- Server-first live lock with validated 10–9,999 coin fee and visible failures.
- Live chat now reports API failures instead of silently losing messages.
- Admin finance control to set each host's coins-per-minute call price.
- Admin analytics no longer fabricates fallback revenue/user chart values.
- Expo SDK packages aligned; Expo Doctor passes 20/20.
- Deprecated Expo/React Native APIs fixed for the current SDK.
- Existing Agora built-in native beauty presets retained (no additional paid
  filter SDK or license was introduced).

## Verification

- Expo Doctor: 20/20
- TypeScript: pass
- Expo production web export: pass
- Admin production build: pass
- Backend ledger/reward tests: pass
- Android host structural audit: 66/66
- Host/user deployed production audit: 23/23

## Remaining credential/device work

- A signed AAB cannot be generated without the Expo/EAS account and Android
  signing credentials.
- Camera and Agora behavior must still be tested on at least one real Android
  device; browser and structural checks cannot prove OEM camera behavior.
- The separate `android-host` Kotlin prototype still contains a stub Agora
  engine. The Play Store app in this handoff is the Expo/React Native project
  at the repository root, which already contains the real `react-native-agora`
  integration.

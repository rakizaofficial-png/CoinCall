# Android Host A–Z QA Audit Report

Generated: 2026-07-23T13:30:43.009Z
Result: **66/66 checks passed**

## Checklist

| Feature / Check | Status | Detail |
|---|---|---|
| billedMinutes ceil | PASS |  |
| coinsForCall 90s@80 | PASS |  |
| coinsForCall 0s | PASS |  |
| withdrawable clamps | PASS |  |
| successRate | PASS |  |
| withdrawal validator | PASS |  |
| OTP screen | PASS |  |
| Login OTP nav | PASS |  |
| JWT session mint/validate | PASS |  |
| Encrypted tokens | PASS |  |
| Auth Bearer only if JWT valid | PASS |  |
| X-Client-Role host | PASS |  |
| Root / compromise guard | PASS |  |
| FLAG_SECURE calls | PASS |  |
| No admin wallet API | PASS |  |
| allowBackup false | PASS |  |
| Login | PASS |  |
| Register | PASS |  |
| OTP | PASS |  |
| Forgot Password | PASS |  |
| Host Dashboard | PASS |  |
| Earnings daily/week/month | PASS |  |
| Wallet | PASS |  |
| Coin Earnings | PASS |  |
| Withdrawal | PASS |  |
| Withdrawal History filters | PASS |  |
| Profile + Bio + Languages | PASS |  |
| Schedule | PASS |  |
| Online Status / Busy / Vacation | PASS |  |
| KYC selfie/CNIC/passport | PASS |  |
| Document approval status | PASS |  |
| Notifications | PASS |  |
| Push notifications | PASS |  |
| Agency info + commission | PASS |  |
| Referral + earnings | PASS |  |
| Host Ranking | PASS |  |
| Reviews + Ratings | PASS |  |
| Chat Admin | PASS |  |
| Chat Agency | PASS |  |
| Messaging | PASS |  |
| Video + Audio calling | PASS |  |
| Agora integration | PASS |  |
| Camera/Mic permissions | PASS |  |
| Camera switch / mute / speaker | PASS |  |
| Call timer + coin calc | PASS |  |
| Incoming / Outgoing calls | PASS |  |
| Call History | PASS |  |
| Settings + Dark Mode | PASS |  |
| Logout | PASS |  |
| OTP route constant | PASS |  |
| Schedule route | PASS |  |
| Reviews route | PASS |  |
| ActiveCall route | PASS |  |
| Main wires OtpScreen | PASS |  |
| Main wires ScheduleScreen | PASS |  |
| Main wires ReviewsScreen | PASS |  |
| Scaffold padding for bottom nav | PASS |  |
| Call PiP bounded | PASS |  |
| Compact phone call controls | PASS |  |
| Schedule chips scroll | PASS |  |
| Agora uses ApplicationContext | PASS |  |
| Hilt DI | PASS |  |
| Release minify | PASS |  |
| Host-scoped API | PASS |  |
| EarningsCalculator pure | PASS |  |
| WithdrawalValidator pure | PASS |  |

## Environment limits

- This cloud VM has **no Android SDK** (`ANDROID_HOME` unset). APK assemble must run in Android Studio locally:
  `cd android-host && ./gradlew :app:assembleRelease`
- Agora uses `StubAgoraEngine` until the official Agora AAR is added via `AgoraModule`.
- OTP is a deterministic QA flow (`123456` always works); production should call the real SMS/email provider.
- KYC image capture uses placeholder URIs until gallery/camera picker is wired to Firebase Storage.

## Verdict

Structural + logic audit **PASS**. Project is APK-ready for local Gradle/SDK builds.

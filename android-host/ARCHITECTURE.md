# CoinCall Host Android — Architecture & Security

## Clean architecture

```
UI (Compose) → ViewModel → HostRepository → HostApi (Retrofit) → CoinCall backend
                     ↘ SecureTokenStore / JwtSession / HostPreferences
                     ↘ AgoraEngine (Stub ↔ SDK)
```

No admin APIs are referenced. Host scope is enforced by:

1. Omitting admin routes from `HostApi`
2. Sending only the signed-in host id via `X-User-Id` + `X-Client-Role: host`
3. Attaching `Authorization: Bearer` only when JWT validates
4. Server-side checks on profile/wallet/withdrawal routes
5. Client-side `WithdrawalValidator` before payout requests

## Module map

| Package | Responsibility |
|---|---|
| `core.ui.theme` | Material 3 color/typography |
| `core.ui.components` | Cards, buttons, shimmer, empty/error |
| `core.network` | Retrofit API + JWT-aware auth interceptor |
| `core.security` | Root check, encrypted tokens, JWT mint/validate, FLAG_SECURE |
| `core.agora` | Agora engine façade + stub (swap in `AgoraModule`) |
| `core.calc` | Pure earnings + withdrawal math (unit-testable) |
| `core.permissions` | Camera / mic helpers |
| `core.push` | Notification channels + local push helper |
| `data.repository` | Single host façade |
| `presentation.*` | Feature screens (auth, call, wallet, chat, kyc, …) |

## Offline & errors

- Repository returns `Result<T>`
- Screens show `ErrorBanner` + retry
- Empty states for history/chat/notifications
- Shimmer skeletons on dashboard first load

## Scalability

- Feature packages isolated for future multi-module split (`:feature:wallet`, `:feature:call`)
- Hilt singleton repository ready for Room cache layer
- WorkManager can be added for presence heartbeats
- Release builds enable R8 minify + resource shrink

## Production auth note

Current login mints an HS256 JWT-shaped session, registers `/host/login-event` + wallet sync. For Play Store production, replace the password branch in `HostRepository.login` with Firebase Auth / your JWT issuer, then store access+refresh tokens in `SecureTokenStore`. OTP UI is ready; wire the SMS/email provider and remove the QA code `123456`.

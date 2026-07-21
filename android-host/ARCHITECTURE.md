# CoinCall Host Android — Architecture & Security

## Clean architecture

```
UI (Compose) → ViewModel → HostRepository → HostApi (Retrofit) → CoinCall backend
                     ↘ SecureTokenStore / HostPreferences
```

No admin APIs are referenced. Host scope is enforced by:

1. Omitting admin routes from `HostApi`
2. Sending only the signed-in host id via `X-User-Id`
3. Server-side checks on profile/wallet/withdrawal routes

## Module map

| Package | Responsibility |
|---|---|
| `core.ui.theme` | Material 3 color/typography |
| `core.ui.components` | Cards, buttons, shimmer, empty/error |
| `core.network` | Retrofit API + auth interceptor |
| `core.security` | Root check, encrypted tokens, FLAG_SECURE |
| `data.repository` | Single host façade |
| `presentation.*` | Feature screens |

## Offline & errors

- Repository returns `Result<T>`
- Screens show `ErrorBanner` + retry
- Empty states for history/chat/notifications
- Shimmer skeletons on dashboard first load

## Scalability

- Feature packages isolated for future multi-module split (`:feature:wallet`, `:feature:call`)
- Hilt singleton repository ready for Room cache layer
- WorkManager can be added for presence heartbeats

## Production auth note

Current login creates a secure on-device session and registers `/host/login-event` + wallet sync. For Play Store production, replace the password branch in `HostRepository.login` with Firebase Auth / your JWT issuer, then store access+refresh tokens in `SecureTokenStore`.

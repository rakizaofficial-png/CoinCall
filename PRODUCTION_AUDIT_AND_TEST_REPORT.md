# PRODUCTION AUDIT AND TEST REPORT

## A. Executive Summary

- **Overall status:** PARTIAL
- **Production readiness score:** 54/100
- **Release recommendation:** NO-GO for real-money calls/live until the blockers below are resolved.
- **Critical blockers:** active calls, live rooms, presence and non-payment ledger mutations are still memory/snapshot based; a MongoDB replica-set backed authority has not yet been deployed or exercised. Real Agora two-device verification is unavailable locally.
- **Completed in this change:** server-owned/Admin-configurable rate-unit pricing, connection-gated call billing, scoped call token authorization, restricted generic Agora tokens, client connection acknowledgements, and root lint isolation from nested generated output.

## B. Architecture Discovered

| Component | Implementation found |
| --- | --- |
| Primary User app | Next.js 16 in repository root |
| Secondary User app | Next.js in `luma-user/` |
| Host app | Expo/React Native in `src/` |
| Admin | Vite/React in `admin/` |
| API | Express 5 in `server/index.ts` |
| Database | MongoDB for payment records; disk/Mongo snapshots plus in-memory maps for legacy application state |
| RTC/RTM | Agora RTC and RTM; token generation is server-side |
| Financial components | `coinLedger.ts`, payment product/transaction store, withdrawals, agency earnings, payment routes |

## C. Feature Matrix

| Feature | User App | Host App | Backend | Admin | Test Status | Final Status |
| --- | --- | --- | --- | --- | --- | --- |
| Call price `rate × 10` | FIXED | FIXED | FIXED | FIXED | PASS unit/Admin build | FIXED |
| Connection-gated first charge | FIXED | FIXED | FIXED | NOT APPLICABLE | PASS unit | FIXED |
| Per-minute idempotency | PARTIAL | PARTIAL | PASS in legacy ledger | PARTIAL | PASS existing | PARTIAL |
| Google/Stripe payment verification | PASS | NOT APPLICABLE | PASS type-check/test | PASS | PASS existing | PARTIAL — provider dashboards required |
| Call token membership check | FIXED | FIXED | FIXED | NOT APPLICABLE | Build/type check | FIXED |
| Generic Agora token access | NOT APPLICABLE | NOT APPLICABLE | FIXED | NOT APPLICABLE | Code review | FIXED |
| Persistent multi-instance calls/live | PARTIAL | PARTIAL | FAIL | PARTIAL | BLOCKED | FAIL |
| Live lock authority | PARTIAL | PARTIAL | PARTIAL | PARTIAL | BLOCKED | PARTIAL |
| Two-device Agora call | BLOCKED | BLOCKED | BLOCKED | NOT APPLICABLE | BLOCKED | BLOCKED |

## D. Bugs Found and Fixed

### AUD-001 — Incorrect call price model

- **Severity:** Critical
- **Root cause:** a hard-coded 30–40 value represented both host rate and user charge.
- **Repair:** `server/callPricing.ts` stores a host rate and derives `chargePerMinute = hostRate × RATE_UNIT_COINS`; default is `3 × 10 = 30`. Legacy 30/40 values normalize to rate units during reads.
- **Files changed:** `server/callPricing.ts`, `server/hostManagement.ts`, `server/index.ts`, `admin/src/components/PricingPanel.tsx`.
- **Evidence:** `callPricing.test.ts` passes.

### AUD-002 — Billing could start before media joined

- **Severity:** Critical
- **Root cause:** billing was scheduled after acceptance with a five-second delay.
- **Repair:** both authenticated participants must call `POST /api/calls/:id/rtc-connected`; billing begins only when both connection reports exist. The initial minute is charged at confirmed connection, then every 60 seconds.
- **Files changed:** `server/callBillingPolicy.ts`, `server/index.ts`, User/Host call clients.
- **Evidence:** call billing policy test passes.

### AUD-003 — Arbitrary Agora token minting

- **Severity:** Critical
- **Root cause:** `/api/agora/token` accepted a caller-selected channel, UID, and publisher role.
- **Repair:** generic token endpoint is now admin-only; call token endpoint validates a server call participant and requested role.
- **Evidence:** route code review and client type-check.

### AUD-004 — Root lint scanned nested generated artifacts

- **Severity:** Medium
- **Repair:** root ESLint now ignores `CoinCall/**` and `expo-app/**`; each nested project remains responsible for its own lint configuration.

## E. Remaining Problems

| Severity | Exact reason | Required resolution |
| --- | --- | --- |
| Critical | Calls, live rooms, presence, gifts and legacy wallet mutations remain in process memory and snapshot storage. | Move these records and locks to Mongo collections with replica-set transactions and deploy against Atlas/another replica set. |
| Critical | Legacy identity compatibility accepts `X-User-Id` for accounts not present in the server account store. | Complete a single bearer/Firebase principal middleware migration and remove legacy header compatibility after app rollout. |
| High | RTC connection reports prove authenticated SDK join attempts, not independently observable remote media. | Validate actual participant/media events with real Agora test accounts and add a server-side session heartbeat/reconnect policy. |
| High | Live create/comment/viewer routes still accept client-controlled room/profile fields. | Move live lifecycle and viewer membership to authenticated server commands before production. |
| High | Existing Admin credential fallback is unsafe if `ADMIN_API_KEY` is unset. | Configure a strong secret in Render; make startup fail in production if absent. |
| Blocked | No local real User/Host test accounts, Agora credentials, physical devices/emulators, Push credentials, or Mongo replica-set test environment. | Supply test environment access; run and attach two-client evidence. |

## F. Tests and Build Evidence

- `server`: `npm test` — **PASS**, 23 tests.
- `server`: payment type-check — **PASS**.
- Root Next.js TypeScript check — **PASS** after the changed client wiring.
- Nested Luma TypeScript check — **PASS** after installing lockfile-pinned dependencies; production build remains blocked by unavailable Google Fonts network access in this environment.
- Full server TypeScript check — **PARTIAL**; existing errors remain around Express request typing and unrelated host avatar/room metadata.
- Real Agora, push notification, live lock, database transaction, and two-device tests — **BLOCKED**; no credentials or devices were available.

## G. Release Gate

Do not release real-money calling/live features until the Critical and High items in section E are closed, Mongo replica transactions are verified, and a real User/Host Agora test proves the final ledger reconciliation.

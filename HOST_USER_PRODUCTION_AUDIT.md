# Host ↔ User Production Audit

Generated: 2026-07-23T13:31:46.937Z
Result: **23/23**

| Check | Status | Detail |
|---|---|---|
| API health | PASS |  |
| Agora configured | PASS |  |
| Mongo configured | PASS | persistence=mongo+disk |
| Host web HTTP 200 | PASS | https://coincall-host.onrender.com |
| User (Luma) web HTTP 200 | PASS | https://luma-user.onrender.com |
| User wallet create | PASS |  |
| Host wallet create | PASS |  |
| Wallet credit requires auth | PASS |  |
| Gift send auth+catalog path | PASS | status=201 |
| Gift send rejects missing X-User-Id | PASS |  |
| Hosts list | PASS |  |
| Call route AI fallback | PASS | ai_prerecorded |
| Live Agora token | PASS |  |
| DM send | PASS | status=201 |
| Withdrawal history endpoint | PASS |  |
| Help center | PASS | ok |
| GiftSheet sends X-User-Id | PASS |  |
| Call uses device wallet id | PASS |  |
| Call bills /calls/:id/minute | PASS |  |
| Gift prices match server rose bouquet=10 | PASS |  |
| Host no double-mint call_end | PASS |  |
| Host forgot password UI | PASS |  |
| User DM wired to /dm/send | PASS |  |

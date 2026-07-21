# CoinCall-HostApp

**LOCKED: single workspace. Host Application only.**

Open this repo via **`CoinCall-HostApp.code-workspace`** — one root, named `CoinCall-HostApp`. Do not add other folders, clones, or workspace files.

## Scope lock

| In scope | Out of scope |
|----------|--------------|
| Host Expo app at repo root | User / Luma app (`luma-user/`, `luma-app/`) |
| `src/components`, `src/screens`, `src/services` | Creating new workspaces or sibling project folders |
| Host UI, states, Agora/Firebase host logic | Modifying User App files |

The workspace file hides `luma-user/`, `luma-app/`, and `admin/` from the editor sidebar so work stays on the Host App.

## Host directory structure

```
CoinCall-HostApp/
├── App.tsx
├── app.config.ts
├── src/
│   ├── components/   # UI cards, dashboards, host chrome
│   ├── screens/      # Host Home, call, party/live, auth, system
│   ├── services/     # API, Agora, Firebase wrappers
│   ├── context/
│   ├── navigation/
│   ├── theme/
│   └── ...
└── server/           # Host-facing API (shared backend; do not treat as a second app workspace)
```

## Run (Host only)

```bash
npm install
npm start
```

## Mandate

1. **One workspace** — `CoinCall-HostApp` only  
2. **Host App only** — no User App edits  
3. **No new workspace files** — do not create alternate `.code-workspace` files  
4. **No redundancy** — extend existing `src/` paths; do not duplicate trees  

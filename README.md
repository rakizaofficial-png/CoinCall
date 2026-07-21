# CoinCall

**This repository is the only CoinCall project.** Open this folder alone in Cursor — do not add sibling copies, old Luma clones, or empty starter apps to the same workspace.

## What’s inside (one monorepo)

| Path | Role |
|------|------|
| `/` (repo root) | Host Expo app (`com.coincall.host`) |
| `luma-user/` | Luma fan web app (Next.js) |
| `luma-app/` | Luma Android Play wrapper (`com.coincall.luma`) |
| `admin/` | Admin web panel |
| `server/` | API + WebSocket + Agora tokens |

These subfolders are **parts of CoinCall**, not separate projects. Keep them.

## Open a clean workspace

1. In Cursor: **File → Open Folder…** → choose only `CoinCall` (or open `CoinCall.code-workspace`).
2. If the sidebar shows extra roots (`myapp`, `my-mobile-app`, `luma-coincall-user`, a second `CoinCall`, etc.): right‑click each extra folder → **Remove Folder from Workspace**.
3. Prefer one clone path, e.g. `~/CoinCall`. Delete or archive other local copies so you don’t open the wrong one later.

## Archive / stop using

| Item | Action |
|------|--------|
| GitHub `rakizaofficial-png/luma-coincall-user` | **Archive** on GitHub. Luma lives in `luma-user/` here. Point Render at this repo with root `luma-user`. |
| Local folders like `myapp`, `my-mobile-app`, duplicate `CoinCall*` | Move to an Archive folder or delete after confirming this repo has the code you need. |
| Old Cursor agent chats | Archive in the Agents UI; they are history, not your app source. |

## Deploy & production

See [DEPLOY.md](DEPLOY.md) and [PRODUCTION.md](PRODUCTION.md).

## Quick local commands

```bash
npm install
npm start                 # Host app
npm run server            # API
npm run admin             # Admin panel
npm --prefix luma-user run dev
```

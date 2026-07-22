# Zuko canonical repository

**Source of truth for User App / Zuko:** https://github.com/rakizaofficial-png/zuko-call

## Policy
- All future Zuko / User App feature work must be merged on **zuko-call**, not only in CoinCall `luma-user/`.
- CoinCall `luma-user/` is a Render-vendored mirror.
- Host + API changes stay in https://github.com/rakizaofficial-png/CoinCall

## Apply this production sync to zuko-call
This agent prepared branch content but **could not push** (GitHub token has no write access to `zuko-call`).

```bash
git clone https://github.com/rakizaofficial-png/zuko-call.git
cd zuko-call
git checkout -b cursor/zuko-prod-sync-465d
git apply path/to/SYNC_TO_ZUKO_CALL.patch
# or cherry-pick from the patch file in this folder
git push -u origin cursor/zuko-prod-sync-465d
gh pr create --base main --title "Zuko 1.1.0 production sync"
```

Patch file: `luma-user/SYNC_TO_ZUKO_CALL.patch`

## Grant Cursor write access
Add the Cursor GitHub App / grant push permission on `rakizaofficial-png/zuko-call` so future agents can open PRs there directly.

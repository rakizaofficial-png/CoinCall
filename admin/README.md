# CoinCall Admin Panel (Web)

Modern **browser-based** control center for CoinCall + Luma.

**Live:** https://coincall-admin.onrender.com

## Sections
- **Overview** — live stats + shortcuts
- **Hosts** — KYC, approvals, bulk actions, audit
- **Luma users** — auto profiles, wallets, coin adjust
- **Live calls** — silent Agora monitor
- **Remote control** — tip / online / end call
- **Payouts** — EasyPaisa / JazzCash / bank
- **Reports** — abuse queue

## Local run (web)
```bash
cd admin
cp .env.example .env   # fill VITE_* from host app
npm install
npm run dev
```
Open http://localhost:5173  
Login key: `coincall-admin` (or `VITE_ADMIN_KEY`)

## Production
Deployed on Render from `CoinCall` repo `admin/` rootDir.
API must expose `/api/admin/*` with matching `ADMIN_API_KEY`.

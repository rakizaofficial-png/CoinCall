# Production status (2026-07-21) — storage architecture

## Where data lives
- **Shared live API:** `https://coincall-api.onrender.com/api` (User + Host)
- **Cloud DB:** MongoDB Atlas when `MONGODB_URI` is set (dual-write with disk). Until then: `persistence: local_dot_data`
- **Host media:** Firebase Storage (`EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET`) — https URLs only in DB
- **Host auth:** Firebase Auth + Realtime Database
- **Not used:** PostgreSQL, Firestore, SQLite, Cloudinary, S3 SDK

## Verify after setting MONGODB_URI
`GET /api/ready` → `mongoConfigured: true`, `persistence: "mongo+disk"`

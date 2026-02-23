# PRISM (Performance Reporting, Insights & Status Management)

This repo contains a container-ready MVP for the PRISM governance and execution management system.

## Quick Start (Docker)

1. `docker compose up --build`
2. Backend: `http://localhost:4000/health`
3. Frontend: `http://localhost:5173`

Seeded admin user:
- Email: `admin@prism.local`
- OTP: `1111`

## Local Dev (optional)

Backend:
- `cd backend`
- `npm install`
- `npm run dev`

Frontend:
- `cd frontend`
- `npm install`
- `npm run dev`

## Notes
- All permissions enforced server-side.
- Scheduled jobs run daily at 02:00 server time for archival, escalations, and publishing snapshots.
- Publishing snapshots can also be triggered manually via `POST /api/snapshots/generate`.

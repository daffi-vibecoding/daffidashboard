# OpenClaw Dashboard (Vite + Supabase)

A production-ready OpenClaw dashboard with Supabase auth + Postgres and a cron jobs view. Built with Vite + vanilla HTML/CSS/JS.

## Quick Start (Local)

1. Install deps

```bash
npm install
```

2. Create `.env` from `.env.example`

```bash
cp .env.example .env
```

3. Run Vite

```bash
npm run dev
```

## Supabase Setup

1. Create a Supabase project.
2. In the SQL editor, run `supabase/seed.sql`.
3. In Auth settings:
   - Enable Email provider.
   - Add your site URL and the redirect URL (for Vercel) so magic links return to the app.
4. Only these emails are allowed by policy and UI:
   - `dfirwin2@gmail.com`
   - `jones.amanda892@gmail.com`
   - `daffi.amjdfi@gmail.com`

Note: The UI blocks other emails from requesting magic links, and RLS blocks data access for any other account.

## Vercel Deployment

1. Push the repo to GitHub.
2. Create a Vercel project from the repo.
3. Set Environment Variables in Vercel (Project Settings):
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_ANON_KEY`
   - Optional: `VITE_USAGE_API_URL` (if you host an API usage endpoint)
4. Build command: `npm run build`
5. Output directory: `dist`

## Cron Jobs Sync Script

A server-side script is included to sync OpenClaw cron jobs into Supabase.

```bash
npm run sync:cron
```

Required env vars for the script:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- Optional: `OPENCLAW_BIN` (defaults to `openclaw`)

The script calls `openclaw cron list --json` when available and falls back to `openclaw cron list`.

## Notes

- Kanban data is stored in Supabase tables (`boards`, `columns`, `cards`).
- UI preferences (theme, filters, compact mode) are stored in localStorage only.
- API usage charts are optional; set `VITE_USAGE_API_URL` to enable.

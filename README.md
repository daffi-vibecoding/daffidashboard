# OpenClaw Dashboard (Supabase)

Mobile-friendly web dashboard for:
- Kanban board (stored in Supabase)
- Cron Jobs list + detail view (stored in Supabase)
- API cost tracking UI (works in local mode when `server.js` is used; hosted deploys won’t have access to your local OpenClaw logs)

## Supabase setup

1) Create a Supabase project.

2) Enable **Auth → Email → Magic link**.

3) Run the SQL in `supabase/schema.sql` in the Supabase SQL editor.
   - This creates `kanban_boards` + `cron_jobs` tables.
   - RLS policies restrict access to the signed-in user **and** enforce an allowlist of exactly:
     - `dfirwin2@gmail.com`
     - `jones.amanda892@gmail.com`

## Local dev (Vite)

```bash
npm install

# required
export VITE_SUPABASE_URL="https://gatnjthisbqtvbjbqcqh.supabase.co"
export VITE_SUPABASE_ANON_KEY="<your anon/publishable key>"

npm run dev
```

Open http://localhost:5177

## Deploy (Vercel)

1) Import this repo/folder into Vercel.

2) Set environment variables:
- `VITE_SUPABASE_URL` = `https://gatnjthisbqtvbjbqcqh.supabase.co`
- `VITE_SUPABASE_ANON_KEY` = `sb_publishable_ij16OCGF-6FVF_vqKVYUPg_lZ7qW4ou`

3) Build settings:
- Build command: `npm run build`
- Output directory: `dist`

## Cron job sync script (OpenClaw → Supabase)

This pulls the current OpenClaw cron job list from your machine and upserts into Supabase.

Prereqs:
- You must have the Supabase **service role** key available locally (do **not** put this in Vercel).
- The target user must exist in Supabase Auth (they can create it by signing in once via magic link).

Run:

```bash
export SUPABASE_URL="https://gatnjthisbqtvbjbqcqh.supabase.co"
export SUPABASE_SERVICE_ROLE_KEY="<service role key>"
export TARGET_EMAIL="dfirwin2@gmail.com"

npm run sync:cron
```

## Notes

- Allowlist enforcement exists in **two places**:
  - Frontend: blocks login attempts for non-allowlisted emails.
  - Database: RLS policy checks the JWT email.

- The Kanban board is stored as a JSON document per user in `kanban_boards.data` to preserve the existing fields/features.

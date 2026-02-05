-- Supabase schema for OpenClaw Dashboard
-- Run in Supabase SQL editor.

-- Kanban board stored as a JSON document per user.
create table if not exists public.kanban_boards (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.kanban_boards enable row level security;

-- Only the signed-in user can read/write their board.
create policy "kanban_select_own"
  on public.kanban_boards for select
  using (auth.uid() = user_id);

create policy "kanban_insert_own"
  on public.kanban_boards for insert
  with check (auth.uid() = user_id);

create policy "kanban_update_own"
  on public.kanban_boards for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Cron jobs (per user).
create table if not exists public.cron_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  schedule text,
  enabled boolean not null default true,
  description text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists cron_jobs_user_name_unique
  on public.cron_jobs (user_id, name);

alter table public.cron_jobs enable row level security;

create policy "cron_select_own"
  on public.cron_jobs for select
  using (auth.uid() = user_id);

create policy "cron_insert_own"
  on public.cron_jobs for insert
  with check (auth.uid() = user_id);

create policy "cron_update_own"
  on public.cron_jobs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "cron_delete_own"
  on public.cron_jobs for delete
  using (auth.uid() = user_id);

-- OPTIONAL allowlist guard at the DB level.
-- This prevents *any* other authenticated user from reading/writing even their own rows.
-- Update exactly the two emails if you ever change the allowlist.
create or replace function public.is_allowlisted_user()
returns boolean
language sql
stable
as $$
  select coalesce(auth.jwt() ->> 'email', '') in (
    'dfirwin2@gmail.com',
    'jones.amanda892@gmail.com'
  );
$$;

alter policy "kanban_select_own" on public.kanban_boards
  using (auth.uid() = user_id and public.is_allowlisted_user());
alter policy "kanban_insert_own" on public.kanban_boards
  with check (auth.uid() = user_id and public.is_allowlisted_user());
alter policy "kanban_update_own" on public.kanban_boards
  using (auth.uid() = user_id and public.is_allowlisted_user())
  with check (auth.uid() = user_id and public.is_allowlisted_user());

alter policy "cron_select_own" on public.cron_jobs
  using (auth.uid() = user_id and public.is_allowlisted_user());
alter policy "cron_insert_own" on public.cron_jobs
  with check (auth.uid() = user_id and public.is_allowlisted_user());
alter policy "cron_update_own" on public.cron_jobs
  using (auth.uid() = user_id and public.is_allowlisted_user())
  with check (auth.uid() = user_id and public.is_allowlisted_user());
alter policy "cron_delete_own" on public.cron_jobs
  using (auth.uid() = user_id and public.is_allowlisted_user());

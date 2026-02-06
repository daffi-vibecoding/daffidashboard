-- OpenClaw Dashboard schema + RLS
-- Run in Supabase SQL editor

create extension if not exists pgcrypto;

create table if not exists public.boards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.columns (
  id uuid primary key default gen_random_uuid(),
  board_id uuid not null references public.boards(id) on delete cascade,
  title text not null,
  position bigint not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  column_id uuid not null references public.columns(id) on delete cascade,
  title text not null,
  owner text,
  tags text[] not null default '{}',
  priority text not null default 'medium',
  due_date timestamptz,
  notes text,
  position bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.cron_jobs (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  schedule text not null,
  enabled boolean not null default true,
  description text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger cards_set_updated_at
before update on public.cards
for each row
execute function public.set_updated_at();

-- System status table (synced from OpenClaw every 10 minutes)
create table if not exists public.system_status (
  id bigint primary key default 1,
  timestamp timestamptz not null default now(),
  model text not null,
  default_model text not null,
  thinking text not null,
  sessions_count int not null default 0,
  sessions jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  runtime jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  constraint single_row check (id = 1)
);

create trigger system_status_updated_at
  before update on public.system_status
  for each row
execute function public.set_updated_at();

alter table public.boards enable row level security;
alter table public.columns enable row level security;
alter table public.cards enable row level security;
alter table public.cron_jobs enable row level security;
alter table public.system_status enable row level security;

create policy "boards_allowlist"
  on public.boards
  for all
  using (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
    and owner_id = auth.uid()
  )
  with check (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
    and owner_id = auth.uid()
  );

create policy "columns_allowlist"
  on public.columns
  for all
  using (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
    and exists (
      select 1 from public.boards b
      where b.id = columns.board_id
      and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
    and exists (
      select 1 from public.boards b
      where b.id = columns.board_id
      and b.owner_id = auth.uid()
    )
  );

create policy "cards_allowlist"
  on public.cards
  for all
  using (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
    and exists (
      select 1 from public.columns c
      join public.boards b on b.id = c.board_id
      where c.id = cards.column_id
      and b.owner_id = auth.uid()
    )
  )
  with check (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
    and exists (
      select 1 from public.columns c
      join public.boards b on b.id = c.board_id
      where c.id = cards.column_id
      and b.owner_id = auth.uid()
    )
  );

create policy "cron_allowlist"
  on public.cron_jobs
  for all
  using (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
  )
  with check (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
  );

create policy "system_status_allowlist"
  on public.system_status
  for select
  using (
    auth.email() in ('dfirwin2@gmail.com','jones.amanda892@gmail.com','daffi@donirwin.xyz')
  );

create index if not exists idx_columns_board on public.columns(board_id);
create index if not exists idx_cards_column on public.cards(column_id);
create index if not exists idx_cards_position on public.cards(position);
create index if not exists idx_cron_jobs_name on public.cron_jobs(name);

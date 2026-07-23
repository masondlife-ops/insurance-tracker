-- Agent Hub — cloud sync database setup
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- It's safe to run again later (it won't error on things that already exist).
--
-- Three tables, one row per user each:
--   pnl_state      -> the Deals & PNL tracker's data
--   activity_state -> the Activity (call metrics) tracker's data
--   carrier_state  -> the Carrier links tab (portals + logins)
-- Security rules make sure a logged-in user can only read/write their own row.

-- ===== Deals & PNL =====
create table if not exists public.pnl_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.pnl_state enable row level security;

drop policy if exists "read own row"   on public.pnl_state;
drop policy if exists "insert own row" on public.pnl_state;
drop policy if exists "update own row" on public.pnl_state;
create policy "read own row"   on public.pnl_state for select using (auth.uid() = user_id);
create policy "insert own row" on public.pnl_state for insert with check (auth.uid() = user_id);
create policy "update own row" on public.pnl_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== Activity (call metrics) =====
create table if not exists public.activity_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.activity_state enable row level security;

drop policy if exists "read own row"   on public.activity_state;
drop policy if exists "insert own row" on public.activity_state;
drop policy if exists "update own row" on public.activity_state;
create policy "read own row"   on public.activity_state for select using (auth.uid() = user_id);
create policy "insert own row" on public.activity_state for insert with check (auth.uid() = user_id);
create policy "update own row" on public.activity_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ===== Carrier links =====
create table if not exists public.carrier_state (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.carrier_state enable row level security;

drop policy if exists "read own row"   on public.carrier_state;
drop policy if exists "insert own row" on public.carrier_state;
drop policy if exists "update own row" on public.carrier_state;
create policy "read own row"   on public.carrier_state for select using (auth.uid() = user_id);
create policy "insert own row" on public.carrier_state for insert with check (auth.uid() = user_id);
create policy "update own row" on public.carrier_state for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

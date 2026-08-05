-- ============================================================================
-- Per-user preferences for the agent hub.
--
-- Run this once in the Supabase SQL editor. It is idempotent -- re-running it
-- is safe and is how you pick up later policy fixes.
--
-- Until this runs, the hub still works: hub-prefs.js falls back to storing
-- preferences in localStorage only, so nothing breaks, they just don't follow
-- the account to another device.
-- ============================================================================

create table if not exists public.user_prefs (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  data       jsonb       not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.user_prefs enable row level security;

-- Same shape as pnl_state / activity_state: a row is readable and writable
-- only by the user it belongs to. No cross-user access of any kind -- an
-- agency owner has no business reading an agent's UI preferences.
drop policy if exists "prefs: read own"   on public.user_prefs;
drop policy if exists "prefs: insert own" on public.user_prefs;
drop policy if exists "prefs: update own" on public.user_prefs;
drop policy if exists "prefs: delete own" on public.user_prefs;

create policy "prefs: read own"
  on public.user_prefs for select
  using (auth.uid() = user_id);

create policy "prefs: insert own"
  on public.user_prefs for insert
  with check (auth.uid() = user_id);

create policy "prefs: update own"
  on public.user_prefs for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "prefs: delete own"
  on public.user_prefs for delete
  using (auth.uid() = user_id);

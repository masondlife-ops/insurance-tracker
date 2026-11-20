-- ============================================================================
-- supabase-pnl-snapshot.sql -- a point-in-time copy of every agent's deal data.
--
-- Run this ONCE in the Supabase SQL editor before shipping a release that
-- changes the shape of pnl_state. It exists so a bad migration can be undone
-- for everyone at once, without asking a single agent to export anything.
--
-- Safe to re-run: each run adds a new labelled snapshot rather than replacing
-- the last one, so you can take one before each risky release.
-- ============================================================================

create table if not exists public.pnl_state_backup (
  id          bigserial primary key,
  user_id     uuid not null,
  data        jsonb not null,
  label       text not null,
  taken_at    timestamptz not null default now()
);

create index if not exists pnl_state_backup_user_idx
  on public.pnl_state_backup (user_id, taken_at desc);

-- Backups are owner-only: no agent can read another's, and nobody reads these
-- through the public key at all. Restores are done here, by you.
alter table public.pnl_state_backup enable row level security;
revoke all on public.pnl_state_backup from anon, authenticated;

-- ---------------------------------------------------------------------------
-- Take the snapshot. Change the label each time so you can tell them apart.
-- ---------------------------------------------------------------------------
insert into public.pnl_state_backup (user_id, data, label)
select user_id, data, 'before clients release'
  from public.pnl_state;

-- What you just captured:
select label, count(*) as agents, min(taken_at) as taken_at
  from public.pnl_state_backup
 group by label
 order by min(taken_at) desc;

-- ---------------------------------------------------------------------------
-- RESTORE -- not run by default. Uncomment only if a release has to be undone,
-- and check the label first. This overwrites current data with the snapshot.
-- ---------------------------------------------------------------------------
-- update public.pnl_state p
--    set data = b.data, updated_at = now()
--   from public.pnl_state_backup b
--  where b.user_id = p.user_id
--    and b.label = 'before clients release';

-- Restore one agent only:
-- update public.pnl_state p
--    set data = b.data, updated_at = now()
--   from public.pnl_state_backup b
--  where b.user_id = p.user_id
--    and b.label = 'before clients release'
--    and p.user_id = '<the agent uuid>';

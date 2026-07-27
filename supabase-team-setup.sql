-- Agency owner roll-up — database setup
-- Paste this whole file into the Supabase SQL Editor and click "Run".
-- Safe to run again later.
--
-- What this adds:
--   agencies        -> one row per agency (owner + a join code to share with agents)
--   agency_members  -> which agents belong to which agency
--   team_summary    -> each agent's PRODUCTION NUMBERS ONLY (no client names or phones)
--
-- Privacy by design: agents' client details live in pnl_state, which the owner can
-- NEVER read. The owner can only read team_summary rows for agents in his own agency.

-- ===== Agencies =====
create table if not exists public.agencies (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid unique not null references auth.users (id) on delete cascade,
  name        text not null,
  join_code   text unique not null,
  owner_level int,          -- the owner's contract level, for the override spread
  created_at  timestamptz not null default now()
);
alter table public.agencies add column if not exists owner_level int;
alter table public.agencies enable row level security;

drop policy if exists "owner reads own agency"   on public.agencies;
drop policy if exists "owner creates own agency" on public.agencies;
drop policy if exists "owner updates own agency" on public.agencies;
create policy "owner reads own agency"   on public.agencies for select using (auth.uid() = owner_id);
create policy "owner creates own agency" on public.agencies for insert with check (auth.uid() = owner_id);
create policy "owner updates own agency" on public.agencies for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ===== Members =====
create table if not exists public.agency_members (
  agent_id    uuid primary key references auth.users (id) on delete cascade,
  agency_id   uuid not null references public.agencies (id) on delete cascade,
  agent_name  text,
  agency_name text,   -- copied on join so an agent can see it without reading agencies
  joined_at   timestamptz not null default now()
);
alter table public.agency_members add column if not exists agency_name text;
alter table public.agency_members enable row level security;

drop policy if exists "agent reads own membership"  on public.agency_members;
drop policy if exists "agent leaves agency"         on public.agency_members;
drop policy if exists "owner reads agency roster"   on public.agency_members;
create policy "agent reads own membership" on public.agency_members for select using (auth.uid() = agent_id);
create policy "agent leaves agency"        on public.agency_members for delete using (auth.uid() = agent_id);
create policy "owner reads agency roster"  on public.agency_members for select using (
  exists (select 1 from public.agencies a where a.id = agency_members.agency_id and a.owner_id = auth.uid())
);
-- joining happens through join_agency() below, not a direct insert

-- ===== Production summary (numbers only — no client PII) =====
create table if not exists public.team_summary (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
alter table public.team_summary enable row level security;

drop policy if exists "agent reads own summary"    on public.team_summary;
drop policy if exists "agent writes own summary"   on public.team_summary;
drop policy if exists "agent updates own summary"  on public.team_summary;
drop policy if exists "owner reads member summary" on public.team_summary;
create policy "agent reads own summary"   on public.team_summary for select using (auth.uid() = user_id);
create policy "agent writes own summary"  on public.team_summary for insert with check (auth.uid() = user_id);
create policy "agent updates own summary" on public.team_summary for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "owner reads member summary" on public.team_summary for select using (
  exists (
    select 1 from public.agency_members m
    join public.agencies a on a.id = m.agency_id
    where m.agent_id = team_summary.user_id and a.owner_id = auth.uid()
  )
);

-- ===== Joining an agency by code =====
-- Runs with elevated rights so an agent can join by code without being able to
-- browse the agencies table. Returns the agency name.
create or replace function public.join_agency(p_code text, p_name text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency_id uuid;
  v_agency_name text;
begin
  select id, name into v_agency_id, v_agency_name
  from public.agencies
  where upper(join_code) = upper(btrim(p_code));

  if v_agency_id is null then
    raise exception 'That agency code was not found.';
  end if;

  insert into public.agency_members (agent_id, agency_id, agent_name, agency_name)
  values (auth.uid(), v_agency_id, nullif(btrim(p_name), ''), v_agency_name)
  on conflict (agent_id) do update
    set agency_id = excluded.agency_id,
        agent_name = coalesce(excluded.agent_name, public.agency_members.agent_name),
        agency_name = excluded.agency_name;

  return v_agency_name;
end;
$$;

revoke all on function public.join_agency(text, text) from public;
grant execute on function public.join_agency(text, text) to authenticated;

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
drop policy if exists "owner deletes own agency" on public.agencies;
create policy "owner deletes own agency" on public.agencies for delete using (auth.uid() = owner_id);
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
drop policy if exists "agent deletes own summary"  on public.team_summary;
drop policy if exists "owner reads member summary" on public.team_summary;
create policy "agent reads own summary"   on public.team_summary for select using (auth.uid() = user_id);
create policy "agent writes own summary"  on public.team_summary for insert with check (auth.uid() = user_id);
create policy "agent updates own summary" on public.team_summary for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
-- needed so "Leave agency" actually removes the agent's published numbers
create policy "agent deletes own summary" on public.team_summary for delete using (auth.uid() = user_id);
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

-- ============================================================
-- Leaderboard + agency goal (added later — safe to re-run)
-- ============================================================

-- Monthly agency goals for ISSUED AP, set by the owner: { "2026-07": 50000 }
alter table public.agencies add column if not exists goals jsonb not null default '{}'::jsonb;

-- Agents need to see each other's PRODUCTION for the leaderboard, but they must not
-- be able to browse the tables directly. This function runs with elevated rights and
-- returns only: the caller's own agency name, its goals, and each member's production
-- summary (which never contains client names or phone numbers).
create or replace function public.agency_board()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_agency  uuid;
  v_name    text;
  v_goals   jsonb;
  v_owner   uuid;
  v_members jsonb;
begin
  -- the caller's agency: either they belong to one, or they own one
  select coalesce(
           (select m.agency_id from public.agency_members m where m.agent_id = auth.uid()),
           (select a.id        from public.agencies a       where a.owner_id = auth.uid())
         ) into v_agency;

  if v_agency is null then
    return null;
  end if;

  select a.name, coalesce(a.goals, '{}'::jsonb), a.owner_id
    into v_name, v_goals, v_owner
  from public.agencies a
  where a.id = v_agency;

  -- everyone in the agency: the members, plus the owner himself (once)
  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_members
  from (
    select m.agent_id,
           coalesce(m.agent_name, s.data->>'agentName', 'Agent') as agent_name,
           coalesce(s.data, '{}'::jsonb) as data
    from public.agency_members m
    left join public.team_summary s on s.user_id = m.agent_id
    where m.agency_id = v_agency

    union all

    select v_owner,
           coalesce(os.data->>'agentName', 'Owner') as agent_name,
           coalesce(os.data, '{}'::jsonb) as data
    from public.agencies a
    left join public.team_summary os on os.user_id = v_owner
    where a.id = v_agency
      and not exists (
        select 1 from public.agency_members m2
        where m2.agency_id = v_agency and m2.agent_id = v_owner
      )
  ) x;

  return jsonb_build_object('agency_name', v_name, 'goals', v_goals, 'members', v_members);
end;
$$;

revoke all on function public.agency_board() from public;
grant execute on function public.agency_board() to authenticated;

-- ============================================================
-- Agency hierarchy (added later — safe to re-run)
-- Lets one agency sit underneath another (e.g. "On Top Next" reports up
-- into "Inevitable"), so a sub-agency owner's production rolls up into
-- every agency above them in the chain.
-- ============================================================

alter table public.agencies add column if not exists parent_agency_id uuid references public.agencies (id) on delete set null;

do $$
begin
  alter table public.agencies drop constraint if exists agencies_no_self_parent;
  alter table public.agencies add constraint agencies_no_self_parent check (parent_agency_id is distinct from id);
exception when others then null;
end $$;

-- Attach the caller's own agency underneath another agency's join code.
-- Rejects self-attachment and any cycle (attaching under your own descendant).
create or replace function public.join_parent_agency(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_agency   uuid;
  v_target_id   uuid;
  v_target_name text;
  v_walk        uuid;
  v_depth       int := 0;
begin
  select id into v_my_agency from public.agencies where owner_id = auth.uid();
  if v_my_agency is null then
    raise exception 'Create your own agency first, then attach it to a parent.';
  end if;

  select id, name into v_target_id, v_target_name
  from public.agencies
  where upper(join_code) = upper(btrim(p_code));

  if v_target_id is null then
    raise exception 'That agency code was not found.';
  end if;
  if v_target_id = v_my_agency then
    raise exception 'An agency can''t attach to itself.';
  end if;

  -- walk the target's ancestor chain; if it leads back to me, this would create a loop
  v_walk := v_target_id;
  loop
    exit when v_walk is null or v_depth > 25;
    if v_walk = v_my_agency then
      raise exception '% is already beneath your agency — attaching would create a loop.', v_target_name;
    end if;
    select parent_agency_id into v_walk from public.agencies where id = v_walk;
    v_depth := v_depth + 1;
  end loop;

  update public.agencies set parent_agency_id = v_target_id where id = v_my_agency;
  return v_target_name;
end;
$$;

revoke all on function public.join_parent_agency(text) from public;
grant execute on function public.join_parent_agency(text) to authenticated;

create or replace function public.leave_parent_agency()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.agencies set parent_agency_id = null where owner_id = auth.uid();
end;
$$;

revoke all on function public.leave_parent_agency() from public;
grant execute on function public.leave_parent_agency() to authenticated;

-- Everyone's production across my agency AND every sub-agency beneath it,
-- rolled all the way up (capped at 10 levels deep as a safety net).
-- Each row is tagged with the name of the agency that person actually belongs
-- to, so a top-level owner can see who's in which sub-agency.
create or replace function public.agency_rollup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_agency   uuid;
  v_name        text;
  v_goals       jsonb;
  v_members     jsonb;
  v_children    jsonb;
  v_parent_id   uuid;
  v_parent_name text;
begin
  select id, name, coalesce(goals, '{}'::jsonb), parent_agency_id
    into v_my_agency, v_name, v_goals, v_parent_id
  from public.agencies where owner_id = auth.uid();

  if v_my_agency is null then
    return null;
  end if;

  if v_parent_id is not null then
    select name into v_parent_name from public.agencies where id = v_parent_id;
  end if;

  with recursive descendants as (
    select id, name, owner_id, parent_agency_id, 0 as depth
    from public.agencies where id = v_my_agency
    union all
    select a.id, a.name, a.owner_id, a.parent_agency_id, d.depth + 1
    from public.agencies a
    join descendants d on a.parent_agency_id = d.id
    where d.depth < 10
  )
  -- one row per unique person: if someone is a direct member of more than one
  -- agency in this tree (e.g. joined both me and a sub-agency beneath me), don't
  -- double-count their production -- show them once, preferring the shallowest
  -- (most direct) relationship to the agency being viewed.
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_members
  from (
    select distinct on (agent_id) agent_id, agent_name, data, agency_name, depth
    from (
      -- every agent who directly joined me OR any sub-agency beneath me
      select m.agent_id,
             coalesce(m.agent_name, s.data->>'agentName', 'Agent') as agent_name,
             coalesce(s.data, '{}'::jsonb) as data,
             d.name as agency_name, d.depth
      from descendants d
      join public.agency_members m on m.agency_id = d.id
      left join public.team_summary s on s.user_id = m.agent_id

      union all

      -- each sub-agency owner's OWN production (not me -- my own book is handled
      -- separately client-side, same as the single-agency view already does)
      select d.owner_id as agent_id,
             coalesce(os.data->>'agentName', 'Owner') as agent_name,
             coalesce(os.data, '{}'::jsonb) as data,
             d.name as agency_name, d.depth
      from descendants d
      left join public.team_summary os on os.user_id = d.owner_id
      where d.depth > 0
        and not exists (
          select 1 from public.agency_members m2
          where m2.agency_id = d.id and m2.agent_id = d.owner_id
        )
    ) raw
    order by agent_id, depth asc
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('name', c.name)), '[]'::jsonb) into v_children
  from public.agencies c
  where c.parent_agency_id = v_my_agency;

  return jsonb_build_object('agency_name', v_name, 'goals', v_goals, 'members', v_members, 'children', v_children, 'parent_name', v_parent_name);
end;
$$;

revoke all on function public.agency_rollup() from public;
grant execute on function public.agency_rollup() to authenticated;

-- ============================================================
-- Multi-agency membership (added later — safe to re-run)
-- Lets a single agent belong to MORE than one agency directly at once
-- (not just through the hierarchy above) — e.g. an agent who is a member
-- of both "On Top Next" and "Inevitable". Each membership is independent;
-- leaving one doesn't touch the others.
-- ============================================================

-- was a single-column primary key (agent_id) — that silently overwrote an
-- existing membership whenever someone joined a second agency. Widen it to
-- (agent_id, agency_id) so multiple rows per agent are allowed.
alter table public.agency_members drop constraint if exists agency_members_pkey;
alter table public.agency_members add constraint agency_members_pkey primary key (agent_id, agency_id);

-- joining a second/third agency now ADDS a row instead of overwriting the
-- existing one; re-joining the same agency still just updates your name.
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
  on conflict (agent_id, agency_id) do update
    set agent_name = coalesce(excluded.agent_name, public.agency_members.agent_name),
        agency_name = excluded.agency_name;

  return v_agency_name;
end;
$$;

revoke all on function public.join_agency(text, text) from public;
grant execute on function public.join_agency(text, text) to authenticated;

-- leave ONE specific agency without touching any other memberships
create or replace function public.leave_agency(p_agency_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.agency_members where agent_id = auth.uid() and agency_id = p_agency_id;
end;
$$;

revoke all on function public.leave_agency(uuid) from public;
grant execute on function public.leave_agency(uuid) to authenticated;

-- every agency I'm part of — as an agent I joined, or one I own — so the
-- Leaderboard tab can offer a switcher when someone belongs to more than one
create or replace function public.my_agencies()
returns jsonb
language sql
security definer
set search_path = public
stable
as $$
  select coalesce(jsonb_agg(jsonb_build_object('agency_id', u.agency_id, 'agency_name', u.agency_name, 'role', u.role)), '[]'::jsonb)
  from (
    select distinct on (agency_id) agency_id, agency_name, role
    from (
      select id as agency_id, name as agency_name, 'owner' as role, 1 as pri
      from public.agencies where owner_id = auth.uid()
      union all
      select agency_id, agency_name, 'member' as role, 2 as pri
      from public.agency_members where agent_id = auth.uid()
    ) both_roles
    order by agency_id, pri
  ) u;
$$;

revoke all on function public.my_agencies() from public;
grant execute on function public.my_agencies() to authenticated;

-- agency_board() now takes an explicit agency id, since a person can belong
-- to more than one and the Leaderboard tab needs to ask for a specific one
drop function if exists public.agency_board();

create or replace function public.agency_board(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name    text;
  v_goals   jsonb;
  v_owner   uuid;
  v_members jsonb;
  v_allowed boolean;
begin
  select exists(select 1 from public.agencies where id = p_agency_id and owner_id = auth.uid())
      or exists(select 1 from public.agency_members where agency_id = p_agency_id and agent_id = auth.uid())
    into v_allowed;

  if not v_allowed then
    return null;
  end if;

  select a.name, coalesce(a.goals, '{}'::jsonb), a.owner_id
    into v_name, v_goals, v_owner
  from public.agencies a
  where a.id = p_agency_id;

  select coalesce(jsonb_agg(to_jsonb(x)), '[]'::jsonb) into v_members
  from (
    select m.agent_id,
           coalesce(m.agent_name, s.data->>'agentName', 'Agent') as agent_name,
           coalesce(s.data, '{}'::jsonb) as data
    from public.agency_members m
    left join public.team_summary s on s.user_id = m.agent_id
    where m.agency_id = p_agency_id

    union all

    select v_owner,
           coalesce(os.data->>'agentName', 'Owner') as agent_name,
           coalesce(os.data, '{}'::jsonb) as data
    from public.agencies a
    left join public.team_summary os on os.user_id = v_owner
    where a.id = p_agency_id
      and not exists (
        select 1 from public.agency_members m2
        where m2.agency_id = p_agency_id and m2.agent_id = v_owner
      )
  ) x;

  return jsonb_build_object('agency_name', v_name, 'goals', v_goals, 'members', v_members);
end;
$$;

revoke all on function public.agency_board(uuid) from public;
grant execute on function public.agency_board(uuid) to authenticated;

-- ============================================================
-- Correct multi-level override cascade (added later — safe to re-run)
-- The rollup used to compute a top owner's override as the FULL spread
-- from their level down to the actual agent's level, even across sub-
-- agencies. That overstates it: real overrides cascade one hop at a time
-- — each level only earns the spread between itself and whoever is
-- DIRECTLY beneath it, not the whole way down. This adds a "cap_level"
-- to each row: the contract level of the direct sub-agency (if any) the
-- production flows through, so the caller's override stops there instead
-- of reaching all the way to the bottom.
-- ============================================================

create or replace function public.agency_rollup()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_my_agency   uuid;
  v_name        text;
  v_goals       jsonb;
  v_members     jsonb;
  v_children    jsonb;
  v_parent_id   uuid;
  v_parent_name text;
begin
  select id, name, coalesce(goals, '{}'::jsonb), parent_agency_id
    into v_my_agency, v_name, v_goals, v_parent_id
  from public.agencies where owner_id = auth.uid();

  if v_my_agency is null then
    return null;
  end if;

  if v_parent_id is not null then
    select name into v_parent_name from public.agencies where id = v_parent_id;
  end if;

  with recursive descendants as (
    select id, name, owner_id, parent_agency_id, 0 as depth,
           null::uuid as branch_child_id      -- depth 0 = my own agency; no cap, use the agent's own level
    from public.agencies where id = v_my_agency
    union all
    select a.id, a.name, a.owner_id, a.parent_agency_id, d.depth + 1,
           -- the direct child of MINE that this branch descends from: itself at
           -- depth 1, or inherited unchanged for every level deeper than that
           case when d.depth = 0 then a.id else d.branch_child_id end
    from public.agencies a
    join descendants d on a.parent_agency_id = d.id
    where d.depth < 10
  ),
  branch_levels as (
    select d.id as agency_id, b.owner_level as cap_level
    from descendants d
    left join public.agencies b on b.id = d.branch_child_id
  )
  select coalesce(jsonb_agg(x), '[]'::jsonb) into v_members
  from (
    select distinct on (agent_id) agent_id, agent_name, data, agency_name, depth, cap_level
    from (
      select m.agent_id,
             coalesce(m.agent_name, s.data->>'agentName', 'Agent') as agent_name,
             coalesce(s.data, '{}'::jsonb) as data,
             d.name as agency_name, d.depth, bl.cap_level
      from descendants d
      join public.agency_members m on m.agency_id = d.id
      left join public.team_summary s on s.user_id = m.agent_id
      left join branch_levels bl on bl.agency_id = d.id

      union all

      select d.owner_id as agent_id,
             coalesce(os.data->>'agentName', 'Owner') as agent_name,
             coalesce(os.data, '{}'::jsonb) as data,
             d.name as agency_name, d.depth, bl.cap_level
      from descendants d
      left join public.team_summary os on os.user_id = d.owner_id
      left join branch_levels bl on bl.agency_id = d.id
      where d.depth > 0
        and not exists (
          select 1 from public.agency_members m2
          where m2.agency_id = d.id and m2.agent_id = d.owner_id
        )
    ) raw
    order by agent_id, depth asc
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('name', c.name)), '[]'::jsonb) into v_children
  from public.agencies c
  where c.parent_agency_id = v_my_agency;

  return jsonb_build_object('agency_name', v_name, 'goals', v_goals, 'members', v_members, 'children', v_children, 'parent_name', v_parent_name);
end;
$$;

revoke all on function public.agency_rollup() from public;
grant execute on function public.agency_rollup() to authenticated;

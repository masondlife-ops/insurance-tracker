-- =============================================================================
-- Fix override credit when someone belongs to BOTH a parent agency and one of
-- its sub-agencies.
--
-- The problem
-- -----------
-- agency_rollup() lists one row per person, resolving anyone reachable by more
-- than one path with:   distinct on (agent_id) ... order by agent_id, depth asc
--
-- "depth asc" keeps the SHALLOWEST path. An agent who is a direct member of the
-- parent AND a member of a sub-agency therefore resolves to depth 0, which
-- bypasses the override cap -- the parent owner is credited the full spread down
-- to the agent's own level instead of stopping at the sub-agency owner's level.
--
-- Worked example (real numbers from this account):
--   Inevitable owner 110, On Top Next owner 85, agent 80.
--   Intended:  Inevitable earns 110-85 = 25, On Top Next earns 85-80 = 5.
--   Actual:    Inevitable earns 110-80 = 30, swallowing On Top Next's 5.
--
-- The fix is one word: prefer the DEEPEST path, so production is attributed
-- through the sub-agency and cap_level applies. Membership rows are untouched,
-- so the agent keeps access to both leaderboards.
--
-- NOTE: this REDUCES the parent owner's override where it applies. That is the
-- correction, but tell them before running it.
--
-- Safe to re-run. Replaces the function body only; no data is modified.
-- =============================================================================

create or replace function public.agency_rollup()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
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
           null::uuid as branch_child_id
    from public.agencies where id = v_my_agency
    union all
    select a.id, a.name, a.owner_id, a.parent_agency_id, d.depth + 1,
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
    -- CHANGED: was "depth asc". Attribute production through the sub-agency it
    -- actually came through, so the override stops at that owner's level.
    order by agent_id, depth desc
  ) x;

  select coalesce(jsonb_agg(jsonb_build_object('name', c.name)), '[]'::jsonb) into v_children
  from public.agencies c
  where c.parent_agency_id = v_my_agency;

  return jsonb_build_object('agency_name', v_name, 'goals', v_goals, 'members', v_members, 'children', v_children, 'parent_name', v_parent_name);
end;
$function$;

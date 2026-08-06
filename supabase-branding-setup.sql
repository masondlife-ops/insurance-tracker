-- ============================================================================
-- Agency branding.
--
-- Replaces the hand-maintained undeniable/ fork: instead of a second copy of
-- every page with a hardcoded brand bar, the hub renders the bar from the
-- caller's own agency row, so any agency can be branded with no new files.
--
-- Run this once in the Supabase SQL editor. Idempotent -- safe to re-run.
--
-- SAFETY: the new column is nullable and every existing row stays NULL until
-- explicitly populated, so this changes nothing for anyone until step 2 below.
-- ============================================================================

-- 1. The column ------------------------------------------------------------
alter table public.agencies
  add column if not exists branding jsonb;

comment on column public.agencies.branding is
  'Optional brand bar config: {name, logoUrl, welcome, tagline, accent}. '
  'NULL means the agency uses the plain unbranded hub.';


-- 2. Reader ----------------------------------------------------------------
-- agencies is deliberately owner-read-only (an agent reading it directly would
-- create a recursive-policy problem with the owner-roster policy, which is why
-- agency_name is denormalised into agency_members). So branding is exposed the
-- same way the leaderboard is: a SECURITY DEFINER function scoped strictly to
-- the caller's OWN agency. It returns branding and nothing else -- no roster,
-- no join code, no production numbers.
create or replace function public.my_branding()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_agency uuid;
  v_parent uuid;
  v_brand  jsonb;
  v_name   text;
begin
  -- Owning an agency wins over being a member of one.
  select id into v_agency from public.agencies where owner_id = auth.uid() limit 1;
  if v_agency is null then
    select agency_id into v_agency from public.agency_members where agent_id = auth.uid() limit 1;
  end if;
  if v_agency is null then
    return null;                       -- not in an agency: plain hub
  end if;

  select branding, parent_agency_id into v_brand, v_parent
  from public.agencies where id = v_agency;

  -- A downline agency with no branding of its own inherits its parent's, so
  -- everyone under the same house looks the same without duplicating config.
  if (v_brand is null or v_brand = '{}'::jsonb) and v_parent is not null then
    select branding into v_brand from public.agencies where id = v_parent;
  end if;

  if v_brand is null or v_brand = '{}'::jsonb then
    return null;
  end if;

  -- The greeting is the person, not the agency. Falls back to the name the
  -- agent joined under, so it stops being a hardcoded string in the markup.
  select agent_name into v_name
  from public.agency_members
  where agent_id = auth.uid() and agent_name is not null
  limit 1;

  if v_name is not null and (v_brand ->> 'welcome') is null then
    v_brand := v_brand || jsonb_build_object('welcome', v_name);
  end if;

  return v_brand;
end;
$$;

revoke all on function public.my_branding() from public;
grant execute on function public.my_branding() to authenticated;


-- 3. Populate Inevitable HQ -------------------------------------------------
-- Matched by id so it can't accidentally hit another agency. 'On Top Next' is
-- a child of this row and inherits automatically via the parent lookup above.
update public.agencies
set branding = jsonb_build_object(
      'name',    'Inevitable HQ',
      'logoUrl', 'https://masondlife-ops.github.io/insurance-tracker/brand/inevitable.png',
      'tagline', 'Built different. Proven always.'
    )
where id = 'afe1f92d-f507-479c-9b1f-fa8f7efa624b';


-- 4. Check ------------------------------------------------------------------
select name, branding is not null as has_branding, branding ->> 'name' as brand_name
from public.agencies
order by created_at;

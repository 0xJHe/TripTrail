-- 006 Running late without "Ask AI": the suggested new day is always the simple-rules one.
-- Paste into Supabase > SQL Editor > Run (once, after 005). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

alter table late_alerts drop column if exists ai_plan;
alter table late_alerts drop column if exists chosen;
delete from api_usage where kind = 'ai_replan';

-- Accept the suggested new day ('rules') or keep the original ('keep'), once for the group.
-- Accepting moves the stops' times and drops stops in one go; everyone's Today and Plan
-- change live through Realtime. Returns false if someone already decided.
create or replace function decide_new_day(p_stop uuid, p_choice text)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  a late_alerts%rowtype;
  v_me uuid;
begin
  select * into a from late_alerts where stop_id = p_stop for update;
  if not found then raise exception 'No running-late card for this stop'; end if;
  if not is_member(a.trip_id) then raise exception 'Not a member of this trip'; end if;
  if a.status <> 'open' then return false; end if;
  select id into v_me from members where trip_id = a.trip_id and user_id = auth.uid();

  if p_choice = 'keep' then
    update late_alerts set status = 'kept', decided_by = v_me, decided_at = now() where stop_id = p_stop;
    return true;
  end if;
  if p_choice <> 'rules' then raise exception 'Choose rules or keep'; end if;

  update late_alerts set
    status = 'accepted', decided_by = v_me, decided_at = now(),
    original = (
      select jsonb_agg(jsonb_build_object('id', s.id, 'planned_time', s.planned_time,
                                          'planned_end', s.planned_end, 'status', s.status))
      from stops s join jsonb_to_recordset(a.plan->'items') x("stopId" uuid) on s.id = x."stopId"
      where s.trip_id = a.trip_id)
  where stop_id = p_stop;

  update stops s set planned_time = x.start, planned_end = x."end"
    from jsonb_to_recordset(a.plan->'items') x("stopId" uuid, start timestamptz, "end" timestamptz, dropped boolean)
   where s.id = x."stopId" and s.trip_id = a.trip_id and s.status = 'planned'
     and not coalesce(x.dropped, false) and x.start is not null;
  update stops s set status = 'dropped'
    from jsonb_to_recordset(a.plan->'items') x("stopId" uuid, dropped boolean)
   where s.id = x."stopId" and s.trip_id = a.trip_id and s.status = 'planned'
     and coalesce(x.dropped, false) and not coalesce(s.is_booked, false);
  return true;
end $$;

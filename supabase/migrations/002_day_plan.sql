-- 002 day plan: everyone chooses a trip, the plan is built once, stops are shared live.
-- Paste into Supabase > SQL Editor > Run (once). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- The trip each member has chosen on the Results screen (they can change it any time).
alter table members add column if not exists chosen_option_id uuid references trip_options(id) on delete set null;

-- Build the plan once, when every member has chosen the same trip.
-- Locks the trip row so two people tapping "Build the plan" together only build it once.
-- Returns true if this call built the plan, false if it was already built.
create or replace function build_plan(p_trip uuid, p_option uuid, p_start date, p_end date, p_stops jsonb)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  t trips%rowtype;
  opt trip_options%rowtype;
begin
  if not is_member(p_trip) then raise exception 'Not a member of this trip'; end if;
  select * into t from trips where id = p_trip for update;
  if t.stage = 'decided' then return false; end if; -- already built
  if exists (select 1 from members where trip_id = p_trip and chosen_option_id is distinct from p_option) then
    raise exception 'Not everyone has chosen this trip yet';
  end if;
  select * into opt from trip_options where id = p_option and trip_id = p_trip;
  if not found then raise exception 'That trip option is gone'; end if;

  insert into stops (trip_id, day_number, position, name, address, lat, lng, planned_time, planned_end,
                     price, is_estimate, is_booked, is_outdoor, tip, category, priority)
  select p_trip, s.day_number, s.position, s.name, s.address, s.lat, s.lng, s.planned_time, s.planned_end,
         coalesce(s.price, 0), coalesce(s.is_estimate, true), coalesce(s.is_booked, false),
         coalesce(s.is_outdoor, false), s.tip, s.category, coalesce(s.priority, 2)
  from jsonb_populate_recordset(null::stops, p_stops) s;

  update trips
     set stage = 'decided', winning_option_id = p_option, destination = opt.name,
         start_date = coalesce(p_start, start_date), end_date = coalesce(p_end, end_date)
   where id = p_trip;
  return true;
end $$;

-- Trips picked with the old "Build the plan" button have no stops yet: send them
-- back to the Results screen so the group chooses and builds the plan.
update trips set stage = 'voting'
 where stage = 'decided' and not exists (select 1 from stops s where s.trip_id = trips.id);

-- Plan changes show up live on everyone's phone.
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'stops') then
    alter publication supabase_realtime add table stops;
  end if;
end $$;

-- 003 Google Places: cache, per-trip daily call limit, place IDs on stops.
-- Paste into Supabase > SQL Editor > Run (once). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- Every Google result (stops, landmark photos, search suggestions, place details),
-- including "nothing found", so the same thing is never looked up twice.
-- Only the Edge Functions use it (service role): RLS is on with no policies.
create table if not exists google_cache (
  key text primary key,            -- e.g. 'stop:kek lok si temple, penang' or 'photo:wat arun, bangkok'
  kind text not null,              -- stop | photo | autocomplete | place
  data jsonb not null,
  created_at timestamptz default now()
);
alter table google_cache enable row level security;

-- Google calls per trip per day (Malaysia time). Max 60, counted before each call.
create table if not exists google_usage (
  trip_id uuid references trips(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (trip_id, day)
);
alter table google_usage enable row level security;

-- Count one Google call for the trip; false when today's limit is already reached.
create or replace function take_google_call(p_trip uuid, p_limit int default 60)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  used int;
begin
  insert into google_usage (trip_id, day, calls) values (p_trip, today, 1)
  on conflict (trip_id, day) do update set calls = google_usage.calls + 1
    where google_usage.calls < p_limit
  returning calls into used;
  return used is not null;
end $$;
revoke execute on function take_google_call(uuid, int) from public, anon, authenticated;
grant execute on function take_google_call(uuid, int) to service_role;

-- Google place ID for each stop (address, lat and lng already exist).
alter table stops add column if not exists place_id text;

-- build_plan now also saves the address and place ID from Google.
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
                     price, is_estimate, is_booked, is_outdoor, tip, category, priority, place_id)
  select p_trip, s.day_number, s.position, s.name, s.address, s.lat, s.lng, s.planned_time, s.planned_end,
         coalesce(s.price, 0), coalesce(s.is_estimate, true), coalesce(s.is_booked, false),
         coalesce(s.is_outdoor, false), s.tip, s.category, coalesce(s.priority, 2), s.place_id
  from jsonb_populate_recordset(null::stops, p_stops) s;

  update trips
     set stage = 'decided', winning_option_id = p_option, destination = opt.name,
         start_date = coalesce(p_start, start_date), end_date = coalesce(p_end, end_date)
   where id = p_trip;
  return true;
end $$;

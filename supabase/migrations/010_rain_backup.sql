-- 010 Rain backup.
-- Paste into Supabase > SQL Editor > Run (once, after 009). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- One rain card per outdoor stop, shared by the group: the first phone that finds rain
-- coming within the hour saves it with up to 3 indoor options; everyone sees it through
-- Realtime. Go (swap a place in) / Keep plan closes it for everyone.
create table if not exists rain_alerts (
  stop_id uuid primary key references stops(id) on delete cascade, -- the outdoor stop
  trip_id uuid not null references trips(id) on delete cascade,
  day_number int not null,
  checked_at timestamptz not null, -- now() of the check (the fake time in Demo mode)
  rain_in_min int not null,        -- minutes from checked_at until the rain
  options jsonb not null default '[]'::jsonb, -- up to 3 indoor places; [] = "consider moving it"
  status text not null default 'open', -- open | swapped | kept
  picked jsonb,                    -- the option swapped in
  added_stop_id uuid references stops(id) on delete set null, -- at the stop already: the new stop
  original jsonb,                  -- the outdoor stop before the swap (Demo mode Reset puts it back)
  decided_by uuid references members(id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz default now()
);
create index if not exists rain_alerts_trip_idx on rain_alerts (trip_id);
alter table rain_alerts enable row level security;
drop policy if exists "rain alerts all" on rain_alerts;
create policy "rain alerts all" on rain_alerts for all using (is_member(trip_id)) with check (is_member(trip_id));

-- Answer the rain card, once for the group:
--   'go'   = swap the option with place id p_place in for the outdoor stop, keeping its time slot.
--            Still to come: the stop becomes that place. Already there: the stop ends at p_now
--            and the place is added from p_start to p_end (the rest of the slot).
--   'keep' = keep the plan.
-- Returns false if someone already decided (or the stop can't change any more).
create or replace function decide_rain(p_stop uuid, p_choice text, p_place text default null,
  p_now timestamptz default null, p_start timestamptz default null, p_end timestamptz default null)
returns boolean language plpgsql security invoker set search_path = public as $$
declare
  a rain_alerts%rowtype;
  s stops%rowtype;
  o jsonb;
  v_me uuid;
  v_new uuid;
  v_now timestamptz := coalesce(p_now, now());
begin
  select * into a from rain_alerts where stop_id = p_stop for update;
  if not found then raise exception 'No rain card for this stop'; end if;
  if not is_member(a.trip_id) then raise exception 'Not a member of this trip'; end if;
  if a.status <> 'open' then return false; end if;
  select id into v_me from members where trip_id = a.trip_id and user_id = auth.uid();

  if p_choice = 'keep' then
    update rain_alerts set status = 'kept', decided_by = v_me, decided_at = now() where stop_id = p_stop;
    return true;
  end if;
  if p_choice <> 'go' then raise exception 'Choose go or keep'; end if;

  select x into o from jsonb_array_elements(a.options) x where x->>'placeId' = p_place limit 1;
  if o is null then raise exception 'That place is not on the rain card'; end if;
  select * into s from stops where id = p_stop and trip_id = a.trip_id for update;
  if not found or s.status not in ('planned', 'arrived') or coalesce(s.is_booked, false) then return false; end if;

  update rain_alerts set original = jsonb_build_object(
      'name', s.name, 'address', s.address, 'lat', s.lat, 'lng', s.lng, 'place_id', s.place_id,
      'price', s.price, 'is_estimate', s.is_estimate, 'is_outdoor', s.is_outdoor, 'category', s.category,
      'tip', s.tip, 'note', s.note, 'halal_available', s.halal_available,
      'status', s.status, 'left_at', s.left_at, 'planned_end', s.planned_end)
  where stop_id = p_stop;

  if s.status = 'planned' then
    update stops set
      name = o->>'name', address = null, lat = (o->>'lat')::float8, lng = (o->>'lng')::float8,
      place_id = o->>'placeId', price = coalesce((o->>'price')::numeric, 0), is_estimate = true,
      is_outdoor = false, category = o->>'category', tip = null, note = null, halal_available = null
    where id = p_stop;
  else
    update stops set status = 'done', left_at = v_now, planned_end = v_now where id = p_stop;
    insert into stops (trip_id, day_number, position, name, lat, lng, planned_time, planned_end,
                       price, is_estimate, is_booked, is_outdoor, category, place_id, priority)
    values (a.trip_id, s.day_number, s.position, o->>'name', (o->>'lat')::float8, (o->>'lng')::float8,
            coalesce(p_start, v_now), coalesce(p_end, s.planned_end), coalesce((o->>'price')::numeric, 0),
            true, false, false, o->>'category', o->>'placeId', s.priority)
    returning id into v_new;
  end if;

  update rain_alerts set status = 'swapped', picked = o, added_stop_id = v_new, decided_by = v_me, decided_at = now()
  where stop_id = p_stop;
  return true;
end $$;

-- Demo mode Reset: forget rain cards checked after p_after, putting the swapped stops back
-- and removing the stops they added. Latest first.
create or replace function undo_rain_alerts(p_trip uuid, p_after timestamptz)
returns int language plpgsql security invoker set search_path = public as $$
declare
  a record;
  n int;
begin
  if not is_member(p_trip) then raise exception 'Not a member of this trip'; end if;
  for a in
    select stop_id, original, added_stop_id from rain_alerts
     where trip_id = p_trip and checked_at > p_after and status = 'swapped' and original is not null
     order by checked_at desc
  loop
    update stops s set
      name = a.original->>'name', address = a.original->>'address',
      lat = (a.original->>'lat')::float8, lng = (a.original->>'lng')::float8,
      place_id = a.original->>'place_id', price = coalesce((a.original->>'price')::numeric, 0),
      is_estimate = coalesce((a.original->>'is_estimate')::boolean, true),
      is_outdoor = coalesce((a.original->>'is_outdoor')::boolean, false),
      category = a.original->>'category', tip = a.original->>'tip', note = a.original->>'note',
      halal_available = (a.original->>'halal_available')::boolean,
      planned_end = (a.original->>'planned_end')::timestamptz,
      -- Ended by the swap: back to being there (Reset's own visit undo may already have moved it on).
      status = case when a.original->>'status' = 'arrived' and s.status = 'done' then 'arrived' else s.status end,
      left_at = case when a.original->>'status' = 'arrived' and s.status = 'done' then null else s.left_at end
     where s.id = a.stop_id and s.trip_id = p_trip;
    if a.added_stop_id is not null then
      delete from stops where id = a.added_stop_id and trip_id = p_trip;
    end if;
  end loop;
  delete from rain_alerts where trip_id = p_trip and checked_at > p_after;
  get diagnostics n = row_count;
  return n;
end $$;

-- Realtime: everyone's rain card opens and closes live.
do $$
begin
  alter publication supabase_realtime add table rain_alerts;
exception when duplicate_object then null;
end $$;

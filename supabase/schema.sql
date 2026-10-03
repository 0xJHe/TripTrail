-- TripTrail — Supabase schema. Paste into Supabase > SQL Editor > Run.

create extension if not exists "pgcrypto";

create table trips (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  destination text,
  month text,
  length_min int, -- trip length is a range ("2 – 3 days"): length_min .. length_days
  length_days int,
  dates_fixed boolean default false,
  start_date date,
  end_date date,
  join_code text unique not null,
  created_by uuid references auth.users(id),
  winning_option_id uuid,
  stage text not null default 'preferences', -- preferences | voting | decided
  created_at timestamptz default now()
);

create table members (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  user_id uuid references auth.users(id),
  display_name text not null,
  avatar_color text,
  joined_at timestamptz default now(),
  unique (trip_id, user_id)
);

create table preferences (
  member_id uuid primary key references members(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade, -- for Realtime filters
  daily_budget numeric,
  free_dates date[] default '{}',
  food_needs text[] default '{}',
  must_haves text[] default '{}',
  no_go text,
  updated_at timestamptz default now()
);

create table trip_options (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  name text not null,
  cost_per_person numeric,
  start_date date,
  end_date date,
  tags text[] default '{}',
  summary text,
  fits_everyone boolean default false,
  plan_json jsonb,
  position int not null default 0, -- order the options were generated in
  created_at timestamptz default now()
);

create table votes (
  member_id uuid references members(id) on delete cascade,
  option_id uuid references trip_options(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade, -- for Realtime filters
  liked boolean not null,
  primary key (member_id, option_id)
);
create index preferences_trip_idx on preferences (trip_id);
create index votes_trip_idx on votes (trip_id);

create table stops (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  day_number int not null,
  position int not null,
  name text not null,
  address text,
  lat double precision,
  lng double precision,
  planned_time timestamptz,
  planned_end timestamptz,
  price numeric default 0,
  is_estimate boolean default true,
  is_booked boolean default false,
  is_outdoor boolean default false,
  tip text,
  status text default 'planned', -- planned | arrived | done | dropped
  arrived_at timestamptz,
  left_at timestamptz,
  actual_cost numeric,
  category text, -- flight | hotel | sight | food | beach | shopping
  priority int default 2, -- 1 = drop first when re-planning, 3 = keep
  note text,
  halal_available boolean
);

create table locations (
  id bigserial primary key,
  member_id uuid references members(id) on delete cascade,
  trip_id uuid references trips(id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  battery int,
  recorded_at timestamptz default now()
);
create index on locations (trip_id, recorded_at desc);

create table spends (
  id uuid primary key default gen_random_uuid(),
  stop_id uuid references stops(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  amount numeric not null,
  confirmed boolean default true,
  created_at timestamptz default now()
);

create table pins (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  type text not null, -- spot | vehicle
  name text,
  lat double precision not null,
  lng double precision not null,
  photo_url text,
  created_at timestamptz default now()
);

create table meet_points (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid references trips(id) on delete cascade,
  set_by uuid references members(id),
  lat double precision not null,
  lng double precision not null,
  rejoin_at timestamptz,
  active boolean default true,
  created_at timestamptz default now()
);

create table day_closures (
  trip_id uuid references trips(id) on delete cascade,
  member_id uuid references members(id) on delete cascade,
  day_number int not null,
  closed_at timestamptz default now(),
  primary key (member_id, day_number)
);

-- Row Level Security: members of a trip can see and change that trip's rows.
alter table trips enable row level security;
alter table members enable row level security;
alter table preferences enable row level security;
alter table trip_options enable row level security;
alter table votes enable row level security;
alter table stops enable row level security;
alter table locations enable row level security;
alter table spends enable row level security;
alter table pins enable row level security;
alter table meet_points enable row level security;
alter table day_closures enable row level security;

create or replace function is_member(t uuid) returns boolean
language sql stable security definer as $$
  select exists (select 1 from members where trip_id = t and user_id = auth.uid());
$$;

-- trips: anyone signed in can create; members can read/update; join by code is done
-- through a security-definer function so the code never exposes other trips.
create policy "trips insert" on trips for insert with check (auth.uid() = created_by);
create policy "trips read" on trips for select using (is_member(id));
-- The creator can read the trip they just inserted, before their members row exists.
create policy "trips read own" on trips for select using (created_by = auth.uid());
create policy "trips update" on trips for update using (is_member(id));

create policy "members read" on members for select using (is_member(trip_id));
create policy "members insert self" on members for insert with check (user_id = auth.uid());
create policy "members update self" on members for update using (user_id = auth.uid());

create policy "prefs all" on preferences for all
  using (exists (select 1 from members m where m.id = member_id and is_member(m.trip_id)));

create policy "options all" on trip_options for all using (is_member(trip_id));
create policy "votes all" on votes for all
  using (exists (select 1 from members m where m.id = member_id and is_member(m.trip_id)));
create policy "stops all" on stops for all using (is_member(trip_id));
create policy "locations all" on locations for all using (is_member(trip_id));
create policy "spends all" on spends for all
  using (exists (select 1 from stops s where s.id = stop_id and is_member(s.trip_id)));
create policy "pins all" on pins for all using (is_member(trip_id));
create policy "meet all" on meet_points for all using (is_member(trip_id));
create policy "closures all" on day_closures for all using (is_member(trip_id));

-- Join a trip by code (bypasses RLS safely). Codes are typed by hand, so match case-insensitively.
create or replace function join_trip(code text, name text, color text)
returns uuid language plpgsql security definer set search_path = public as $$
declare t uuid;
begin
  select id into t from trips where join_code = lower(trim(code));
  if t is null then raise exception 'Invalid join code'; end if;
  insert into members (trip_id, user_id, display_name, avatar_color)
  values (t, auth.uid(), name, nullif(color, ''))
  on conflict (trip_id, user_id) do update set display_name = excluded.display_name;
  return t;
end $$;

-- Realtime
alter publication supabase_realtime add table
  locations, stops, pins, meet_points, spends, members, votes, trips, preferences, trip_options;

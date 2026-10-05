-- 004 Weather and pin photos.
-- Paste into Supabase > SQL Editor > Run (once). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- Weather calls per trip per day (Malaysia time), max 30, counted before each call.
-- Separate from google_usage (Places), so weather can't use up the planning calls.
-- Only the weather Edge Function uses it (service role): RLS is on with no policies.
create table if not exists weather_usage (
  trip_id uuid references trips(id) on delete cascade,
  day date not null,
  calls int not null default 0,
  primary key (trip_id, day)
);
alter table weather_usage enable row level security;

create or replace function take_weather_call(p_trip uuid, p_limit int default 30)
returns boolean language plpgsql security definer set search_path = public as $$
declare
  today date := (now() at time zone 'Asia/Kuala_Lumpur')::date;
  used int;
begin
  insert into weather_usage (trip_id, day, calls) values (p_trip, today, 1)
  on conflict (trip_id, day) do update set calls = weather_usage.calls + 1
    where weather_usage.calls < p_limit
  returning calls into used;
  return used is not null;
end $$;
revoke execute on function take_weather_call(uuid, int) from public, anon, authenticated;
grant execute on function take_weather_call(uuid, int) to service_role;

-- Pin photos: private bucket, one folder per trip ("<trip id>/<file>.jpg").
-- Members of the trip can add and see its photos; pins.photo_url keeps the path.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pin-photos', 'pin-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

drop policy if exists "pin photos read" on storage.objects;
create policy "pin photos read" on storage.objects for select to authenticated
  using (bucket_id = 'pin-photos' and public.is_member(((storage.foldername(name))[1])::uuid));

drop policy if exists "pin photos add" on storage.objects;
create policy "pin photos add" on storage.objects for insert to authenticated
  with check (bucket_id = 'pin-photos' and public.is_member(((storage.foldername(name))[1])::uuid));

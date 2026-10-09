-- 009 Spend check for every stop, booking extras, and extra spends.
-- Paste into Supabase > SQL Editor > Run (once, after 008). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- day_number: the trip day the spend counts on. Spend-check answers use their stop's day
-- (booked stops: "Spent anything extra?" once per day per booking); extra spends logged
-- with "+ Add spend" on the Plan tab have no stop, just a day and an optional note.
alter table spends add column if not exists day_number int;
update spends sp set day_number = s.day_number from stops s where s.id = sp.stop_id and sp.day_number is null;
update spends set day_number = 1 where day_number is null;
alter table spends alter column day_number set not null;
alter table spends add column if not exists note text;

-- One answer per person per stop per day (extra spends have no stop, so any number of them).
alter table spends drop constraint if exists spends_stop_id_member_id_key;
drop index if exists spends_stop_member_key;
create unique index if not exists spends_stop_member_day_key on spends (stop_id, member_id, day_number);

-- Everyone in the trip can read; each person adds, changes and deletes only their own.
-- A spend's stop, if any, must be in the same trip.
drop policy if exists "spends insert own" on spends;
drop policy if exists "spends update own" on spends;
create policy "spends insert own" on spends for insert with check (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = spends.trip_id)
  and (stop_id is null or exists (select 1 from stops s where s.id = stop_id and s.trip_id = spends.trip_id)));
create policy "spends update own" on spends for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (
    exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = spends.trip_id)
    and (stop_id is null or exists (select 1 from stops s where s.id = stop_id and s.trip_id = spends.trip_id)));

-- 012 Delete pins.
-- Paste into Supabase > SQL Editor > Run (once, after 011). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- Deleting a pin first sets deleted_at (an UPDATE, which Realtime sends to everyone filtered
-- by trip_id, so the pin disappears live), then removes the row. Realtime can't filter DELETE
-- events by trip_id, so the row delete alone wouldn't reach the other phones.
alter table pins add column if not exists deleted_at timestamptz;

-- Everyone in the trip sees its pins; only the person who pinned one can change or delete it.
drop policy if exists "pins all" on pins;
drop policy if exists "pins read" on pins;
drop policy if exists "pins insert own" on pins;
drop policy if exists "pins update own" on pins;
drop policy if exists "pins delete own" on pins;
create policy "pins read" on pins for select using (is_member(trip_id));
create policy "pins insert own" on pins for insert with check (
  exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = pins.trip_id));
create policy "pins update own" on pins for update
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()))
  with check (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid() and m.trip_id = pins.trip_id));
create policy "pins delete own" on pins for delete
  using (exists (select 1 from members m where m.id = member_id and m.user_id = auth.uid()));

-- Pin photos: the person who uploaded a photo may delete it (storage sets owner on upload).
drop policy if exists "pin photos delete own" on storage.objects;
create policy "pin photos delete own" on storage.objects for delete to authenticated
  using (bucket_id = 'pin-photos' and owner = auth.uid());

-- 021 Indexes for the app's most frequent reads, so they stay fast as the tables grow:
-- a trip's stops (by day), its trip options and pins, each member's latest position,
-- and "trips I'm in". No data, RLS, function or trigger changes.
-- Paste into Supabase > SQL Editor > Run (once, after 020). Safe to re-run.

create index if not exists stops_trip_day_idx on stops (trip_id, day_number);
create index if not exists trip_options_trip_idx on trip_options (trip_id);
create index if not exists pins_trip_idx on pins (trip_id);
create index if not exists locations_trip_member_idx on locations (trip_id, member_id, recorded_at desc);
create index if not exists members_user_idx on members (user_id);

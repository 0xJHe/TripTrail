-- 016 Split & rejoin: group B's own stops ("+ Add a stop" during a split).
-- Paste into Supabase > SQL Editor > Run (once, after 015). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.

-- A stop with split_id belongs to that split's group B only (the app shows it to them, ticks it
-- off on their phones and asks only them the spend check). null = the shared plan.
-- Removing the split removes its stops.
alter table stops add column if not exists split_id uuid references meet_points(id) on delete cascade;
create index if not exists stops_split_idx on stops (split_id) where split_id is not null;

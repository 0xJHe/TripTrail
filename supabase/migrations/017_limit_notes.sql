-- 017 Clear daily-limit notes: the running-early and rain cards remember when a free daily
-- limit (our 10 nearby searches a day, or Google's own quota) left them without suggestions,
-- so every phone shows "Suggestions paused · free daily limit reached, resets tomorrow".
-- Paste into Supabase > SQL Editor > Run (once, after 016). Safe to re-run.
-- Only for databases made before this change: schema.sql already includes all of it.
-- (Place search's own counter needs no SQL: it uses api_usage with the kinds 'place_search'
-- and 'place_search_calls'. late_alerts.travel_source can now also be 'limited'.)

alter table early_alerts add column if not exists limited boolean not null default false;
alter table rain_alerts add column if not exists limited boolean not null default false;

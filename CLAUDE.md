# TripTrail — project brain file

Read this fully before doing anything. Follow it on every task.

## What we are building

TripTrail is a group trip planner (Android, Expo/React Native) that uses the group's
live location to keep the itinerary accurate during the trip. Everyone sets their
budget, free dates and preferences, votes by swiping on AI-generated trip options,
and the app builds a day-by-day itinerary with a time, price and location on every
stop. During the trip it compares where the group actually is against the plan and,
when they are running late, early, separated, or about to get rained on, proposes a
fixed version of the day. Works solo too (no voting, no group map).

Full product spec: README.md (sections 1, 3, 5). Visual design: design/prototype.html
(15 screens, numbered). When a task says "match screen N", open that file.

## Feature list (all of this gets built)

Planning:
1. Create trip + invite by link/join code (screen 1)
2. Preferences: daily budget, free dates on a calendar, food needs, 3 must-haves,
   1 no-go, "2 of 4 have answered" (screen 2)
3. Date finder: days all members are free
4. AI trip options from everyone's answers (screen 3)
5. Swipe to vote; most likes wins (screens 3, 4)
6. AI day-by-day itinerary with time + price per stop; flights/hotel entered
   manually as booked stops (screen 5)
7. Edit any stop, add a stop (screen 5)
8. Budget bar: spent / planned / budget (screen 5)

During the trip:
9. Auto-arrive: stop ticks itself off within ~100 m; real journey time shifts
   later stops (screen 6)
10. Running late: Now / Travel / Starts tiles, suggested new day (simple rules,
    no AI), cost change, Accept new day / Keep original (screen 7)
11. Running early: one nearby suggestion within budget, Add this / Go to next
    stop (screen 8)
12. Group map: positions + battery %, far-from-group alert, low-battery alert,
    auto-broadcast last known location under 15% (screen 11)
13. Set meet point with directions + per-person ETA; Split & rejoin (screens 11, 12)
14. Pin spot: Spot / Vehicle, name, optional photo, shows on group map, Add to
    plan / Directions (screen 13)
15. "We're done here" button (screens 6–9)
16. Rain backup: rain at current location in next hour -> 3 nearby indoor
    options within budget and food needs (screen 10)
17. Spend check on leaving a food stop: "About RM 16 spent?" tick or enter
    amount (screen 9)
18. First-timer tip on arrival (screen 6)
19. Done for today: planned vs actual, edit tomorrow, location off for the night,
    back on 1 h before tomorrow's first stop (screen 14)
20. Day recap story card: route walked, stop emojis, km / stops / hours /
    weather, Share + Download (screen 15)

## Tech stack (do not change)

- Expo SDK (latest), React Native, TypeScript, Expo Router (file-based routes).
- Supabase: anonymous auth with display name, Postgres, Realtime, Storage (pin photos).
- Supabase Edge Functions (folder `supabase/functions/`, Deno + TypeScript) for
  ALL external APIs: Gemini, Google Maps Places / Distance Matrix, Google
  Weather, JAKIM halal lookup. The Gemini and Google keys live only in Supabase
  secrets (`npx supabase secrets set NAME=value`; GEMINI_API_KEY is set).
  App code never holds them. App only holds EXPO_PUBLIC_SUPABASE_URL and
  EXPO_PUBLIC_SUPABASE_ANON_KEY from .env (EXPO_PUBLIC_API_BASE_URL is no
  longer needed).
  The app calls them with `supabase.functions.invoke(name, { body })`, which
  sends the user's JWT. Each function checks the caller's Supabase JWT
  (Authorization: Bearer) and that they are a member of the trip before doing
  work. lib/ai.ts and lib/distance.ts call these functions; in Demo mode /
  offline demo they return seed/fake-ai.json instead.
  Deploy: `npx supabase functions deploy <name> --project-ref <ref> --no-verify-jwt`
  (the project uses the new sb_publishable keys, so the function checks the JWT
  itself). Logs: Supabase dashboard > Edge Functions > <name> > Logs.
- expo-location + expo-task-manager for background location.
- react-native-maps for maps.
- Zustand for client state. React Query (TanStack) for Supabase reads.
- Jest + @testing-library/react-native for tests.

## Folder rules

app/                  Expo Router routes only (thin; they import from features)
  (tabs)/plan.tsx  today.tsx  map.tsx  group.tsx
features/
  trip/               sign-in, create trip, join, invite link, members
  planning/           preferences, date finder, trip options, swipe, vote, itinerary, edit stop
  today/              today card, arrive/leave detection, late, early, done-here, rain, tips
  money/              budget bar, spend check
  group/              group map, meet point, split & rejoin, pins
  recap/              done for today, day recap card
lib/
  supabase.ts         client
  location.ts         location service (real + demo)
  clock.ts            now() — real or demo time
  distance.ts         haversine, ETA helpers, cached Distance Matrix calls
  theme.ts            colours, spacing, fonts
seed/
  penang.json         full demo trip: options, 3 days of stops with real lat/lng, prices, tips
  demo-route.json     fake location timeline that triggers late, early, rain, split
supabase/
  schema.sql          tables + RLS
supabase/functions/   Supabase Edge Functions (Deno), one folder each with index.ts:
  generate-trip-options  generate-itinerary  eta
  nearby-suggestion      rain-check          halal-check
  _shared/            shared: gemini client, google client, auth check, zod schemas,
                      tripOptions.ts (types + sample options, also imported by lib/ai.ts;
                      files here must stay plain TS with no imports so React Native
                      and Deno can both use them)
design/prototype.html  the 15 screens
__tests__/            tests mirror feature folders

Each feature folder has: screens/, components/, hooks/, api.ts (Supabase calls),
types.ts. Keep screens under ~200 lines; split into components.

## Design tokens (lib/theme.ts)

- navy #14284F: headers, all "Now" blocks (white text on navy)
- teal #00A38F: every primary action button
- red #D64545 = problem (running late), green #2E9E5B = good news (running early,
  cost change 0), amber #E39B21 = worth knowing (far member, low battery),
  blue #3B7DD8 = weather (rain)
- Colour is never the only signal: every alert has an icon and a plain headline.
- Font Inter, sizes 12 / 14 / 17 / 24. Card radius 16. Primary button full width,
  pinned to the bottom, min height 48.
- Bottom tabs on every main screen: Plan · Today · Map · Group.
- Money: estimates shown with "~" (e.g. ~RM 16). Currency RM.

## Demo mode (must always work)

Settings has a Demo mode toggle. When on:
- lib/location.ts replays seed/demo-route.json instead of GPS.
- lib/clock.ts returns a settable fake time; a small debug bar lets you jump
  the clock and skip to the next event.
- The Edge Functions are still called, but if they fail, or demo mode is
  on and "offline demo" is checked, responses come from seed/fake-ai.json.
Every feature must be testable in Demo mode from a room, not a real trip.

Time and location rule (built; follow it in every live-trip feature):
- Get the time ONLY from lib/clock.ts: `now()` or the `useNow()` hook. Never call
  `new Date()` / `Date.now()` for "what time is it" in Today, alerts, arrive/leave,
  late/early, rain, group map, recap, etc.
- Get positions ONLY from lib/location.ts: `getGroupLocation()` or the
  `useGroupLocation()` hook (members, battery, centre, `rainSoon` in demo). Never
  import expo-location anywhere else.
- Demo mode lives in lib/demo.ts (Settings > Demo mode, saved on the phone). The fake
  route is built from the open trip's Day plan by features/demo/route.ts: it walks
  stop to stop and includes arriving late, leaving early, rain near an outdoor stop,
  and one member 900 m away with low battery. The "late" moment is the
  30-min-before check while the group is still at the stop before (screen 7). The bar at the top (+15 min, Next
  event, Reset) is features/demo/components/DemoBar.tsx.

## Behaviour rules for you (the agent)

- Only edit the folder(s) named in the task plus tests. Ask before touching
  lib/, schema.sql, or this file.
- Before a task that touches more than 3 files, list the files you will
  create/change first.
- After changes: run `npx tsc --noEmit` and `npx jest`; fix errors before
  saying done. Do not leave TODOs for the core flow.
- Seed data first, real API second. Every screen must render with
  seed/penang.json when tables are empty.
- Gemini: ask for JSON only, validate with zod, retry once, then fall back to
  seed data. Never crash on a bad AI response.
- Cache Distance Matrix results (same origin/destination within 10 min) to
  protect quota.
- Realtime subscriptions are filtered by trip_id and cleaned up on unmount.
- No API keys in app code or in git. .env is gitignored; .env.example lists names.
- Keep README.md and images/ untouched unless the task is "update README".
- Commit message style: short, present tense, e.g. "add preferences screen".

## Key logic (so every feature uses the same rules)

- Arrived: within 100 m of stop for 2 consecutive readings -> status "arrived",
  arrived_at = now. Left: more than 150 m away for 3 minutes after arrived ->
  left_at = now, status "done".
  Two stops within 150 m of each other: arriving at the next one only counts from
  15 min before its planned start (being near it early doesn't skip the current stop).
- Running late (features/today/late.ts, supabase/functions/_shared/eta.ts + newDay.ts):
  check the next stop once ~30 min before it starts and once when the group leaves
  a stop if the next starts in < 30 min (max 2 checks, one card per stop, shared
  in late_alerts). Only before the stop's planned start: it is an early warning,
  never checked once the start time has passed. Travel = straight line at 25 km/h;
  only if that is within 10 min of the start or later, ask the eta function (Google
  Routes, one phone per stop, max 20 calls per trip per day).
  now + travel > planned_time + 5 min -> late card.
  Suggested new day = simple rules, no AI: the late stop moves to the arrival time
  ("next slot", even a meal); later stops shift and those with spare time are
  shortened; only booked stops (hotel, flights) never move; if the day would still
  end > 30 min after the original plan's end, drop the lowest-priority stop.
  Accept / Keep original = decide_new_day RPC (once for the group).
- Running early: left_at < planned_end - 20 min -> show early card -> call
  nearby-suggestion.
- Rain: rain-check says rain at current position within 60 min and the current
  or next stop is outdoor -> show rain card.
- Far from group: any member > 500 m from the group centroid -> amber alert.
- Low battery: < 15% -> amber alert + write last known location to group.
- Spend check: when leaving a stop with is_estimate = true -> prompt.
- Location on: from 60 min before the day's first stop until the member taps
  Done for today.

// "· free daily limit reached, resets tomorrow" notes: one style everywhere, and only
// when a daily limit really caused the fallback. No Supabase or Google calls.
import { render, screen } from '@testing-library/react-native';

import { isLimitText, LIMIT_REACHED, limitText } from '@/components/ui/LimitNote';
import { Notes } from '@/features/planning/components/NoteLine';
import { PlaceSuggestions } from '@/features/planning/components/PlaceSuggestions';
import type { Stop } from '@/features/planning/types';
import { LateCard } from '@/features/today/components/LateCard';
import { RainCard } from '@/features/today/components/RainCard';
import { WeatherLine } from '@/features/today/components/WeatherLine';
import { earlyAlertFor } from '@/features/today/early';
import type { LateState } from '@/features/today/hooks/useLateAlert';
import type { RainState } from '@/features/today/hooks/useRainAlert';
import { rainAlertFor } from '@/features/today/rain';
import { WEATHER_PAUSED } from '@/features/today/weather';
import { AI_USED_UP_PLAN_NOTE, GOOGLE_LIMIT_NOTE } from '@/supabase/functions/_shared/itinerary';
import type { NearbySuggestion } from '@/supabase/functions/_shared/nearby';
import { AI_USED_UP_NOTE } from '@/supabase/functions/_shared/tripOptions';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('one style', () => {
  it('every limit note ends with "· free daily limit reached, resets tomorrow"', () => {
    expect(limitText('Suggestions paused')).toBe('Suggestions paused · free daily limit reached, resets tomorrow');
    for (const note of [AI_USED_UP_NOTE, AI_USED_UP_PLAN_NOTE, GOOGLE_LIMIT_NOTE, WEATHER_PAUSED.text]) {
      expect(note.endsWith(` · ${LIMIT_REACHED}`)).toBe(true);
      expect(isLimitText(note)).toBe(true);
    }
    expect(isLimitText('No dates suit all 4, these suit 3 of 4')).toBe(false);
  });

  it('a function note with a limit line and a fit line shows each its own way', async () => {
    await render(<Notes text={`${AI_USED_UP_NOTE}\nSome trips are over the lowest budget (RM 150 a day)`} />);
    expect(screen.getByTestId('limit-note')).toBeTruthy();
    expect(screen.getByText(AI_USED_UP_NOTE)).toBeTruthy();
    expect(screen.getByText('Some trips are over the lowest budget (RM 150 a day)')).toBeTruthy();
  });

  it('a note without a limit has no limit line', async () => {
    await render(<Notes text="No dates suit all 4, these suit 3 of 4" />);
    expect(screen.queryByTestId('limit-note')).toBeNull();
  });
});

describe('weather line', () => {
  it('says "Weather paused · ..." instead of hiding', async () => {
    await render(<WeatherLine weather={WEATHER_PAUSED} onNavy />);
    expect(screen.getByText('Weather paused · free daily limit reached, resets tomorrow')).toBeTruthy();
  });
});

describe('place search', () => {
  const props = { suggestions: [], searching: false, onPick: jest.fn() };

  it('limit reached: the paused note, and the name can still be typed', async () => {
    await render(<PlaceSuggestions {...props} limited failed={false} />);
    expect(screen.getByText('Place search paused · free daily limit reached, resets tomorrow')).toBeTruthy();
    expect(screen.getByText('You can still type the name.')).toBeTruthy();
  });

  it('another failure keeps its own message, no limit note', async () => {
    await render(<PlaceSuggestions {...props} limited={false} failed />);
    expect(screen.getByText("Couldn't search places right now. You can still type the name.")).toBeTruthy();
    expect(screen.queryByTestId('limit-note')).toBeNull();
  });
});

describe('running early and rain cards', () => {
  const coffee = { placeId: 'p1', name: 'Kopi C' } as NearbySuggestion;
  const base = { tripId: 't1', left: null, next: { id: 's2', day_number: 1 }, now: Date.UTC(2026, 9, 12, 5), travelMin: 5, spareMin: 60 };

  it('the early card is marked limited only when the limit left it without a suggestion', () => {
    expect(earlyAlertFor({ ...base, suggestion: null, limited: true })).toMatchObject({ limited: true });
    expect(earlyAlertFor({ ...base, suggestion: coffee, limited: true })).not.toHaveProperty('limited');
    expect(earlyAlertFor({ ...base, suggestion: null, limited: false })).not.toHaveProperty('limited');
  });

  it('the rain card is marked limited only when the limit left it without options', () => {
    const rain = { tripId: 't1', stop: { id: 's2', day_number: 1 }, now: base.now, rainIn: 40, options: [] };
    expect(rainAlertFor({ ...rain, limited: true })).toMatchObject({ limited: true });
    expect(rainAlertFor({ ...rain, limited: false })).not.toHaveProperty('limited');
  });

  const rainState = (limited: boolean) =>
    ({
      alert: { options: [], limited },
      stop: { id: 's1', name: 'Armenian Street murals' } as Stop,
      minutes: 40,
      note: null,
      go: jest.fn(),
      keep: jest.fn(),
      deciding: null,
    }) as unknown as RainState;

  it('rain card: "Suggestions paused · ..." when the limit was the reason', async () => {
    await render(<RainCard rain={rainState(true)} />);
    expect(screen.getByText('Suggestions paused · free daily limit reached, resets tomorrow')).toBeTruthy();
    expect(screen.getByText('Keep plan')).toBeTruthy();
  });

  it('rain card: nothing found for another reason keeps the usual line', async () => {
    await render(<RainCard rain={rainState(false)} />);
    expect(screen.queryByTestId('limit-note')).toBeNull();
    expect(screen.getByText(/Nothing indoor nearby fits the budget/)).toBeTruthy();
  });
});

describe('running late Travel tile', () => {
  const stop = { id: 's2', name: 'Penang Hill', planned_time: '2026-10-12T06:00:00Z' } as Stop;
  const late = (travel_source: string) =>
    ({
      alert: { stop_id: 's2', travel_min: 35, travel_source },
      plan: { items: [], costChange: 0, endsAt: null },
      accept: jest.fn(),
      keep: jest.fn(),
      deciding: null,
      note: null,
    }) as unknown as LateState;

  it('"Estimated · free daily limit..." when the limit stopped the Google check', async () => {
    await render(<LateCard late={late('limited')} stop={stop} time={new Date('2026-10-12T05:40:00Z')} next={null} />);
    expect(screen.getByText('Estimated · free daily limit reached, resets tomorrow')).toBeTruthy();
  });

  it('no note for the ordinary free estimate', async () => {
    await render(<LateCard late={late('estimate')} stop={stop} time={new Date('2026-10-12T05:40:00Z')} next={null} />);
    expect(screen.queryByTestId('limit-note')).toBeNull();
  });
});

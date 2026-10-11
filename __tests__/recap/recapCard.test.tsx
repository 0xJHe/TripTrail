import { render, screen } from '@testing-library/react-native';

import { RecapCard } from '@/features/recap/components/RecapCard';
import type { DayRecap } from '@/features/recap/hooks/useDayRecap';
import { offsetMeters } from '@/lib/distance';

jest.mock('@/lib/supabase', () => ({ supabase: {} }));
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const HOME = { lat: 5.4141, lng: 100.3288 };

function recap(over: Partial<DayRecap> = {}): DayRecap {
  return {
    hasPositions: true,
    stops: [
      { id: 'a', name: 'Muntri Street', category: 'hotel', ...HOME },
      { id: 'b', name: 'Kek Lok Si', category: 'sight', ...offsetMeters(HOME, 5700, 2280) },
    ],
    meters: 6150,
    outMs: 9.5 * 3_600_000,
    weather: { tempC: 31, words: 'mostly sunny', kind: 'sunny' },
    dateLine: 'DAY 1 · MONDAY 12 OCT',
    title: 'Day 1 done',
    trip: { name: 'Penang' },
    people: [{ key: 'm1', name: 'Aisha', color: '#00A38F' }],
    ...over,
  } as unknown as DayRecap;
}

describe('RecapCard', () => {
  it('shows the trip, day, stops and the four stats', async () => {
    await render(<RecapCard recap={recap()} width={300} />);
    expect(screen.getByText('Penang')).toBeTruthy();
    expect(screen.getByText('DAY 1 · MONDAY 12 OCT')).toBeTruthy();
    expect(screen.getByText('6.2')).toBeTruthy();
    expect(screen.getByText('2')).toBeTruthy();
    expect(screen.getByText('9.5h')).toBeTruthy();
    expect(screen.getByText('31°')).toBeTruthy();
    expect(screen.getByText('Start')).toBeTruthy();
    expect(screen.getByText('End')).toBeTruthy();
    expect(screen.getByText('mostly sunny')).toBeTruthy();
    expect(screen.getByText('🏨')).toBeTruthy();
    expect(screen.getByText('🛕')).toBeTruthy();
  });

  it('leaves the weather out when there is none, and shows – for km and hours without positions', async () => {
    await render(<RecapCard recap={recap({ weather: null, hasPositions: false })} width={300} />);
    expect(screen.queryByText('31°')).toBeNull();
    expect(screen.getAllByText('–')).toHaveLength(2);
  });
});

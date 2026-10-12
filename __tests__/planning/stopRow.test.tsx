import { fireEvent, render, screen } from '@testing-library/react-native';

import { StopRow } from '@/features/planning/components/StopRow';
import type { Stop } from '@/features/planning/types';

const stop: Stop = {
  id: 's1',
  trip_id: 't1',
  day_number: 1,
  position: 0,
  name: 'Kek Lok Si Temple',
  address: null,
  lat: null,
  lng: null,
  planned_time: new Date(2026, 9, 12, 9, 30).toISOString(),
  planned_end: new Date(2026, 9, 12, 11).toISOString(),
  price: 10,
  is_estimate: true,
  is_booked: false,
  is_outdoor: false,
  tip: null,
  status: 'planned',
  arrived_at: null,
  left_at: null,
  actual_cost: null,
  category: 'sight',
  priority: 1,
  note: null,
  place_id: null,
};

describe('StopRow', () => {
  it('opens Edit stop on a day still open', async () => {
    const onPress = jest.fn();
    await render(<StopRow stop={stop} onPress={onPress} />);
    expect(screen.getByText('Edit')).toBeTruthy();
    await fireEvent.press(screen.getByText('Kek Lok Si Temple'));
    expect(onPress).toHaveBeenCalled();
  });

  it('is read-only on a finished day: no Edit', async () => {
    await render(<StopRow stop={stop} />);
    expect(screen.getByText('Kek Lok Si Temple')).toBeTruthy();
    expect(screen.queryByText('Edit')).toBeNull();
  });
});

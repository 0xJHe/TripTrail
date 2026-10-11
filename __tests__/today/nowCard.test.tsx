import { fireEvent, render, screen } from '@testing-library/react-native';

import type { Stop } from '@/features/planning/types';
import { NowCard } from '@/features/today/components/NowCard';

const stop = {
  id: 's1',
  name: 'Kek Lok Si',
  address: 'Air Itam',
  lat: 5.3998,
  lng: 100.2734,
  planned_time: new Date(2026, 9, 12, 14, 30).toISOString(),
  planned_end: new Date(2026, 9, 12, 16).toISOString(),
  arrived_at: new Date(2026, 9, 12, 14, 32).toISOString(),
  left_at: null,
  price: 10,
  is_estimate: true,
  is_booked: false,
  status: 'arrived',
} as unknown as Stop;

describe('NowCard', () => {
  it('on the way: Directions beside Pin spot', async () => {
    const onDirections = jest.fn();
    const onPin = jest.fn();
    await render(<NowCard kind="heading" stop={stop} weather={null} onPin={onPin} onDirections={onDirections} />);
    expect(screen.getByText('On the way to')).toBeTruthy();
    await fireEvent.press(screen.getByLabelText('Directions'));
    expect(onDirections).toHaveBeenCalledTimes(1);
    await fireEvent.press(screen.getByLabelText('Pin spot'));
    expect(onPin).toHaveBeenCalledTimes(1);
  });

  it('at a stop: We\'re done here and Pin spot, no Directions', async () => {
    await render(<NowCard kind="at" stop={stop} weather={null} onDone={jest.fn()} onPin={jest.fn()} leaving={false} />);
    expect(screen.getByText('Now')).toBeTruthy();
    expect(screen.getByLabelText("We're done here")).toBeTruthy();
    expect(screen.getByLabelText('Pin spot')).toBeTruthy();
    expect(screen.queryByLabelText('Directions')).toBeNull();
  });

  it('just left: Pin spot only', async () => {
    await render(<NowCard kind="left" stop={{ ...stop, status: 'done' }} weather={null} onPin={jest.fn()} />);
    expect(screen.getByText('Just left')).toBeTruthy();
    expect(screen.queryByLabelText('Directions')).toBeNull();
  });
});

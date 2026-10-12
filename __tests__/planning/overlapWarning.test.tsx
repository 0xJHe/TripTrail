import { fireEvent, render, screen } from '@testing-library/react-native';

import { OverlapWarning } from '@/features/planning/components/OverlapWarning';

const at = (h: number, m = 0) => new Date(2026, 9, 12, h, m).toISOString();
const temple = {
  id: 's1',
  name: 'Kek Lok Si Temple',
  day_number: 1,
  planned_time: at(10),
  planned_end: at(11, 30),
  is_booked: false,
  status: 'planned' as const,
};

describe('OverlapWarning', () => {
  it('names the stop and shifts on tap', async () => {
    const onShift = jest.fn();
    const moves = [{ id: 's1', planned_time: at(11), planned_end: at(12, 30) }];
    await render(<OverlapWarning overlap={{ ok: false, with: temple, moves, reason: null }} onShift={onShift} saving={false} />);
    expect(screen.getByText('This overlaps with Kek Lok Si Temple (10:00–11:30).')).toBeTruthy();
    await fireEvent.press(screen.getByText('Shift later stops'));
    expect(onShift).toHaveBeenCalled();
  });

  it('has no button when a stop would run past midnight', async () => {
    await render(<OverlapWarning overlap={{ ok: false, with: temple, moves: null, reason: 'midnight' }} onShift={jest.fn()} saving={false} />);
    expect(screen.getByText('Not enough time left today, please pick another time.')).toBeTruthy();
    expect(screen.queryByText('Shift later stops')).toBeNull();
  });
});

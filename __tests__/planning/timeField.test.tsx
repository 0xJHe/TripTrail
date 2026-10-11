import { fireEvent, render, screen } from '@testing-library/react-native';

import { TimeField } from '@/features/planning/components/TimeField';
import { phoneUses24h, timePicker } from '@/features/planning/phoneClock';

jest.mock('@/features/planning/phoneClock', () => ({ timePicker: jest.fn(), phoneUses24h: jest.fn() }));

const open = jest.fn();
const mockPicker = timePicker as jest.Mock;
const mockUses24h = phoneUses24h as jest.Mock;

beforeEach(() => {
  open.mockReset();
  mockPicker.mockReturnValue({ open, dismiss: jest.fn() });
  mockUses24h.mockReturnValue(true);
});

describe('TimeField', () => {
  it('starts empty and opens the phone clock when tapped', async () => {
    const onChange = jest.fn();
    await render(<TimeField prefix="Ends" value="" onChange={onChange} opensAt="10:30" testID="t" />);
    expect(screen.getByText('Pick time')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('t'));
    expect(open).toHaveBeenCalledTimes(1);
    const opts = open.mock.calls[0][0];
    expect(opts.mode).toBe('time');
    // Opens at the hint, but the box stays empty until a time is picked.
    expect([opts.value.getHours(), opts.value.getMinutes()]).toEqual([10, 30]);
    expect(onChange).not.toHaveBeenCalled();
    // The picked time is saved as "HH:MM", the same as before.
    opts.onValueChange({}, new Date(2000, 0, 1, 14, 5));
    expect(onChange).toHaveBeenCalledWith('14:05');
  });

  it('shows the picked time the phone way', async () => {
    mockUses24h.mockReturnValue(false);
    await render(<TimeField prefix="Starts" value="18:05" onChange={jest.fn()} />);
    expect(screen.getByText('6:05 PM')).toBeTruthy();
  });

  it('opens at 09:00 when nothing is picked and there is no hint', async () => {
    await render(<TimeField prefix="Starts" value="" onChange={jest.fn()} testID="t" />);
    await fireEvent.press(screen.getByTestId('t'));
    expect(open.mock.calls[0][0].value.getHours()).toBe(9);
  });

  it('falls back to typing the time without the picker (older build)', async () => {
    mockPicker.mockReturnValue(null);
    const onChange = jest.fn();
    await render(<TimeField prefix="Starts" value="" onChange={onChange} testID="t" />);
    await fireEvent.changeText(screen.getByTestId('t'), '09:30');
    expect(onChange).toHaveBeenCalledWith('09:30');
  });
});

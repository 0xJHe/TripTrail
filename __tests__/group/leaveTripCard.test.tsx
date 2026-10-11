import { fireEvent, render, screen } from '@testing-library/react-native';

import { LeaveTripCard } from '@/features/group/components/LeaveTripCard';

describe('LeaveTripCard', () => {
  it('asks "Leave this trip?" before leaving', async () => {
    const onLeave = jest.fn();
    await render(<LeaveTripCard lastMember={false} leaving={false} error={null} onLeave={onLeave} />);
    await fireEvent.press(screen.getByTestId('leave-trip'));
    expect(screen.getByText('Leave this trip?')).toBeTruthy();
    expect(onLeave).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByTestId('leave-yes'));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it('Cancel goes back to the button', async () => {
    await render(<LeaveTripCard lastMember={false} leaving={false} error={null} onLeave={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('leave-trip'));
    await fireEvent.press(screen.getByTestId('leave-cancel'));
    expect(screen.queryByText('Leave this trip?')).toBeNull();
    expect(screen.getByTestId('leave-trip')).toBeTruthy();
  });

  it('tells the last member the trip will be deleted', async () => {
    await render(<LeaveTripCard lastMember leaving={false} error={null} onLeave={jest.fn()} />);
    await fireEvent.press(screen.getByTestId('leave-trip'));
    expect(screen.getByText("You're the last member. Leaving will delete this trip.")).toBeTruthy();
    expect(screen.getByText('Leave and delete')).toBeTruthy();
  });
});

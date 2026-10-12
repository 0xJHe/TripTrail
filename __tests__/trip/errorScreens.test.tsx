import { fireEvent, render, screen } from '@testing-library/react-native';

import { CrashScreen } from '@/components/ui/CrashScreen';
import { ErrorLine } from '@/features/trip/components/ErrorLine';

describe('CrashScreen (app error boundary)', () => {
  it('says something went wrong and Try again re-renders the screen', async () => {
    const retry = jest.fn(() => Promise.resolve());
    await render(<CrashScreen retry={retry} />);
    expect(screen.getByText('Something went wrong')).toBeTruthy();
    await fireEvent.press(screen.getByTestId('crash-try-again'));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});

describe('ErrorLine', () => {
  it('shows Try again when it can load again, and calls it', async () => {
    const onRetry = jest.fn();
    await render(<ErrorLine message="Couldn't load the plan." onRetry={onRetry} />);
    expect(screen.getByText("Couldn't load the plan.")).toBeTruthy();
    await fireEvent.press(screen.getByTestId('error-try-again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('no Try again for problems that are not about loading', async () => {
    await render(<ErrorLine message="Give the stop a name." />);
    expect(screen.queryByTestId('error-try-again')).toBeNull();
  });
});

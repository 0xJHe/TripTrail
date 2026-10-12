import { useTipsSetting } from '@/features/today/tipsSetting';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('First-timer tips setting', () => {
  it('is on by default and can be turned off and on', () => {
    expect(useTipsSetting.getState().enabled).toBe(true);
    useTipsSetting.getState().setEnabled(false);
    expect(useTipsSetting.getState().enabled).toBe(false);
    useTipsSetting.getState().setEnabled(true);
    expect(useTipsSetting.getState().enabled).toBe(true);
  });
});

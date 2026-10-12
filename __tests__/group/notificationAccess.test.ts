import { PermissionsAndroid } from 'react-native';

import { notificationsNeedAsk, useNotificationAccess } from '@/features/group/notificationAccess';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

describe('notification permission for the sharing notice', () => {
  it('only Android 13+ (API 33) needs asking', () => {
    expect(notificationsNeedAsk('android', 33)).toBe(true);
    expect(notificationsNeedAsk('android', 35)).toBe(true);
    expect(notificationsNeedAsk('android', 32)).toBe(false);
    expect(notificationsNeedAsk('ios', 18)).toBe(false);
  });

  it('a yes or a no is remembered, so the card shows once', async () => {
    const request = jest.spyOn(PermissionsAndroid, 'request').mockResolvedValue(PermissionsAndroid.RESULTS.DENIED);
    await useNotificationAccess.getState().ask();
    expect(request).toHaveBeenCalledWith('android.permission.POST_NOTIFICATIONS');
    expect(useNotificationAccess.getState()).toMatchObject({ permission: 'denied', answered: true });

    useNotificationAccess.setState({ answered: false, permission: 'ask' });
    request.mockResolvedValue(PermissionsAndroid.RESULTS.GRANTED);
    await useNotificationAccess.getState().ask();
    expect(useNotificationAccess.getState()).toMatchObject({ permission: 'granted', answered: true });

    useNotificationAccess.setState({ answered: false });
    useNotificationAccess.getState().decline();
    expect(useNotificationAccess.getState().answered).toBe(true);
  });
});

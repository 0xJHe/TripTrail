import { router } from 'expo-router';
import { View } from 'react-native';

import { NoPlan } from '@/features/today/components/NoPlan';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import type { DayEndState } from '../hooks/useDayEnd';

/**
 * Today tab after Done for today: location off for the night and the day's recap story card
 * (screen 15). Done for today is final, so there is no way to reopen the day.
 */
export function DayClosed({ end, day }: { end: DayEndState; day: number }) {
  const text = end.lastDay
    ? "Your location is off. That was the trip's last day: hope it was a great one!"
    : end.backAt
      ? `Your location is off for the night. It turns back on at ${end.backAt}, 1 hour before tomorrow's first stop.`
      : "Your location is off for the night. It turns back on 1 hour before tomorrow's first stop.";
  return (
    <View style={{ flex: 1 }} testID="day-closed">
      <NoPlan
        icon="moon-outline"
        title={end.lastDay ? 'Day closed' : 'Day closed. See you tomorrow'}
        text={text}
        action={{
          label: 'See your day recap',
          onPress: () => router.push({ pathname: '/recap', params: { day: String(day) } }),
          testID: 'see-day-recap',
        }}
      />
      {end.error ? (
        <View style={{ paddingHorizontal: 32, paddingBottom: 24 }}>
          <ErrorLine message={end.error} />
        </View>
      ) : null}
    </View>
  );
}

import { View } from 'react-native';

import { NoPlan } from '@/features/today/components/NoPlan';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import type { DayEndState } from '../hooks/useDayEnd';

/** Today tab after Done for today: location off for the night, and a way back if it was a mistake. */
export function DayClosed({ end }: { end: DayEndState }) {
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
        action={{ label: end.saving ? 'Reopening…' : 'Reopen today', onPress: end.reopen }}
      />
      {end.error ? (
        <View style={{ paddingHorizontal: 32, paddingBottom: 24 }}>
          <ErrorLine message={end.error} />
        </View>
      ) : null}
    </View>
  );
}

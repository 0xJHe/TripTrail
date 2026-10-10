import { router } from 'expo-router';

import { formatRange } from '@/features/planning/dates';
import { longDate } from '../todayPlan';
import type { TodayView } from '../types';
import { NoPlan } from './NoPlan';

/** Why there is no day to show: plan not built, trip not started / over, or a free day. */
export function NoPlanFor({ view, onPlan }: { view: Extract<TodayView, { kind: 'no-plan' }>; onPlan: () => void }) {
  switch (view.reason) {
    case 'not-built':
      return (
        <NoPlan
          icon="people-outline"
          title="No plan yet"
          text="Today's stops show here once the group has picked a trip and built the day plan."
          action={{ label: 'Go to the trip choice', onPress: onPlan }}
        />
      );
    case 'before':
      return (
        <NoPlan
          icon="airplane-outline"
          title={view.daysToGo === 1 ? 'Your trip starts tomorrow' : `Your trip starts in ${view.daysToGo} days`}
          text={`Day 1 is ${longDate(view.startsOn)}. Your stops will show here on the day, and tick themselves off as you go.`}
        />
      );
    case 'after':
      return (
        <NoPlan
          icon="heart-outline"
          title="That's a wrap"
          text={`This trip ran ${formatRange(view.startsOn, view.endsOn)}. Hope it was a great one!`}
        />
      );
    case 'empty':
      return (
        <NoPlan
          icon="cafe-outline"
          title={`Nothing planned for Day ${view.day}`}
          text="A free day! Add stops on the Plan tab if you'd like the app to follow along."
          action={{ label: 'Open the plan', onPress: () => router.push('/plan') }}
        />
      );
  }
}

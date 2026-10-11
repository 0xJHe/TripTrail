import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { useGatherCheck } from '@/features/group/hooks/useGatherCheck';
import { useShareLocation } from '@/features/group/hooks/useShareLocation';
import { useRecordDayWeather } from '@/features/recap/hooks/useRecordDayWeather';
import { useEarlyCheck } from '@/features/today/hooks/useEarlyCheck';
import { useLateCheck } from '@/features/today/hooks/useLateCheck';
import { useRainCheck } from '@/features/today/hooks/useRainCheck';
import { useVisitTracker } from '@/features/today/hooks/useVisitTracker';
import { colors, fontSize } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

export default function TabsLayout() {
  // Ticks stops off on arrive / leave while the app is open, whichever tab is showing.
  useVisitTracker();
  // Checks whether the group will be late for the next stop (running-late card).
  useLateCheck();
  // Checks for 30+ min to spare when the group leaves a stop (running-early card).
  useEarlyCheck();
  // Checks for rain within the hour at an outdoor stop (rain backup card).
  useRainCheck();
  // Shares this phone's position and battery with the group on a trip day (group map).
  useShareLocation();
  // Ends the meet point / split once everyone is there (group map).
  useGatherCheck();
  // Keeps the day's weather readings (already fetched for Today) for the day recap card.
  useRecordDayWeather();
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.navy },
        headerTintColor: colors.white,
        headerTitleStyle: { fontSize: fontSize.title },
        tabBarActiveTintColor: colors.teal,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: { fontSize: fontSize.small },
        headerRight: () => <SettingsButton />,
      }}>
      <Tabs.Screen name="plan" options={{ title: 'Plan', headerShown: false, tabBarIcon: tabIcon('calendar-outline') }} />
      <Tabs.Screen name="today" options={{ title: 'Today', headerShown: false, tabBarIcon: tabIcon('today') }} />
      <Tabs.Screen name="map" options={{ title: 'Map', headerShown: false, tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="group" options={{ title: 'Group', tabBarIcon: tabIcon('people') }} />
    </Tabs>
  );
}

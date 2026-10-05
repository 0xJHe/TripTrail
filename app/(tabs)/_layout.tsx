import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { colors, fontSize } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(name: IconName) {
  return ({ color, size }: { color: ColorValue; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

export default function TabsLayout() {
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
      <Tabs.Screen name="today" options={{ title: 'Today', tabBarIcon: tabIcon('today') }} />
      <Tabs.Screen name="map" options={{ title: 'Map', tabBarIcon: tabIcon('map') }} />
      <Tabs.Screen name="group" options={{ title: 'Group', tabBarIcon: tabIcon('people') }} />
    </Tabs>
  );
}

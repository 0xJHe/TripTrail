import {
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
  useFonts,
} from '@expo-google-fonts/inter';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { DemoFrame } from '@/features/demo/components/DemoFrame';
import { useAuth, useAuthListener } from '@/features/trip/authStore';
import { colors } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 10_000, retry: 1 } },
});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Inter: Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Inter-ExtraBold': Inter_800ExtraBold,
  });
  useAuthListener();
  const authReady = useAuth((s) => s.ready);
  const ready = (fontsLoaded || !!fontError) && authReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <QueryClientProvider client={queryClient}>
        <StatusBar style="light" />
        <DemoFrame>
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.background },
              animation: 'slide_from_right',
            }}>
            <Stack.Screen name="index" options={{ animation: 'none' }} />
            <Stack.Screen name="intro" options={{ animation: 'fade' }} />
            <Stack.Screen name="(tabs)" />
          </Stack>
        </DemoFrame>
      </QueryClientProvider>
    </GestureHandlerRootView>
  );
}

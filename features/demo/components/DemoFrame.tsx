import type { ReactNode } from 'react';
import { View } from 'react-native';
import { SafeAreaInsetsContext, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useDemo } from '@/lib/demo';
import { DemoBar } from './DemoBar';

/**
 * Wraps the app. In Demo mode the debug bar sits at the top, under the status bar,
 * and the screens below it get a top inset of 0 so they don't leave a second gap.
 */
export function DemoFrame({ children }: { children: ReactNode }) {
  const enabled = useDemo((s) => s.enabled);
  const insets = useSafeAreaInsets();
  // Same tree with the bar on or off, so toggling Demo mode doesn't reset navigation.
  return (
    <View style={{ flex: 1 }}>
      {enabled ? <DemoBar topInset={insets.top} /> : null}
      <SafeAreaInsetsContext.Provider value={enabled ? { ...insets, top: 0 } : insets}>
        <View style={{ flex: 1 }}>{children}</View>
      </SafeAreaInsetsContext.Provider>
    </View>
  );
}

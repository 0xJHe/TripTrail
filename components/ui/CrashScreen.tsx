import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/lib/theme';
import { Button } from './Button';
import { Txt } from './Txt';

interface CrashScreenProps {
  /** Show the screen again (clears the error). */
  retry: () => Promise<void> | void;
}

/**
 * "Something went wrong" + Try again: shown by the app's error boundary instead of closing the
 * whole app when one screen fails. No safe-area or query providers needed (they may be what failed).
 */
export function CrashScreen({ retry }: CrashScreenProps) {
  const [trying, setTrying] = useState(false);

  async function tryAgain() {
    setTrying(true);
    try {
      await retry();
    } finally {
      setTrying(false);
    }
  }

  return (
    <View style={styles.screen} accessibilityRole="alert">
      <Ionicons name="alert-circle" size={48} color={colors.red} />
      <Txt variant="h22" style={styles.center}>
        Something went wrong
      </Txt>
      <Txt variant="b13" color={colors.textMuted} style={styles.center}>
        This screen hit a problem. Your trip is safe. Try again, and if it keeps happening, close and reopen
        TripTrail.
      </Txt>
      <Button label="Try again" onPress={tryAgain} loading={trying} style={styles.button} testID="crash-try-again" />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: colors.background,
  },
  center: { textAlign: 'center' },
  button: { alignSelf: 'stretch', marginTop: 12 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import type { ComponentProps } from 'react';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface NoPlanProps {
  icon: IconName;
  title: string;
  text: string;
  action?: { label: string; onPress: () => void };
}

/** Friendly message when there is no day to show (no trip, trip not started, trip over…). */
export function NoPlan({ icon, title, text, action }: NoPlanProps) {
  return (
    <View style={styles.box} testID="today-empty">
      <Ionicons name={icon} size={40} color={colors.teal} />
      <Txt variant="h17" style={styles.center}>
        {title}
      </Txt>
      <Txt variant="b13" color={colors.textMuted} style={styles.center}>
        {text}
      </Txt>
      {action ? <Button label={action.label} onPress={action.onPress} style={{ alignSelf: 'stretch', marginTop: 8 }} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 8 },
  center: { textAlign: 'center' },
});

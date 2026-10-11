import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

interface AiBusyCardProps {
  /** What Try again makes, e.g. "trip options". */
  what: string;
  /** Without it the screen's own bottom button says "Try again". */
  onTryAgain?: () => void;
}

/** Every AI model was busy for the minute (nothing saved): say so plainly and offer Try again. */
export function AiBusyCard({ what, onTryAgain }: AiBusyCardProps) {
  return (
    <Card style={styles.card}>
      <View style={styles.icon}>
        <Ionicons name="time-outline" size={22} color={colors.amberText} />
      </View>
      <Txt variant="h15">Our AI is busy right now</Txt>
      <Txt variant="b13" color={colors.textMuted}>
        Too many people are planning at once. Wait a few seconds, then try again to make your {what}.
      </Txt>
      {onTryAgain ? <Button label="Try again" onPress={onTryAgain} testID="ai-try-again" /> : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { gap: 8 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF4DF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { LimitNote } from '@/components/ui/LimitNote';
import { Txt } from '@/components/ui/Txt';
import type { AiStop } from '@/lib/ai';
import { colors } from '@/lib/theme';

export const AI_BUSY_TITLE = 'Our AI is busy right now.';
export const AI_BUSY_BODY = 'Please try again in a minute.';
export const AI_LIMIT_TEXT = "Today's free AI limit has been reached. Please try again later.";

interface AiUnavailableCardProps {
  /** Why there is nothing: busy for the minute, or today's free AI limit. */
  stop: AiStop;
  /** Without it the screen's own bottom button says "Try again". */
  onTryAgain?: () => void;
}

/**
 * The AI gave no trip options / day plan (nothing saved): say why calmly, never show samples.
 * busy -> "Our AI is busy right now. Please try again in a minute."; limit -> a limit note
 * (the same grey pause line as the other daily limits). Both with Try again.
 */
export function AiUnavailableCard({ stop, onTryAgain }: AiUnavailableCardProps) {
  const tryAgain = onTryAgain ? <Button label="Try again" onPress={onTryAgain} testID="ai-try-again" /> : null;
  if (stop === 'limit') {
    return (
      <Card style={styles.card} testID="ai-limit">
        <LimitNote text={AI_LIMIT_TEXT} />
        {tryAgain}
      </Card>
    );
  }
  return (
    <Card style={styles.card} testID="ai-busy">
      <View style={styles.icon}>
        <Ionicons name="time-outline" size={22} color={colors.amberText} />
      </View>
      <Txt variant="h15">{AI_BUSY_TITLE}</Txt>
      <Txt variant="b13" color={colors.textMuted}>
        {AI_BUSY_BODY}
      </Txt>
      {tryAgain}
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

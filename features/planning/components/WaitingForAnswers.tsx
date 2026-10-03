import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import type { Member } from '@/features/trip/types';
import { colors } from '@/lib/theme';
import { AnsweredCard } from './AnsweredCard';

interface WaitingForAnswersProps {
  members: Member[];
  answeredIds: Set<string>;
  generating: boolean;
  error: string | null;
  onBuildNow: () => void;
  onEditAnswers: () => void;
}

/** Shown before the trip options exist: who still has to answer, and a way to go ahead anyway. */
export function WaitingForAnswers({
  members,
  answeredIds,
  generating,
  error,
  onBuildNow,
  onEditAnswers,
}: WaitingForAnswersProps) {
  const waitingFor = members.filter((m) => !answeredIds.has(m.id));

  if (generating) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.teal} />
        <Txt variant="h15">Building trip options…</Txt>
        <Txt variant="s11">From everyone's budgets, dates and must-haves</Txt>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Card style={styles.card}>
        <View style={styles.icon}>
          <Ionicons name="hourglass-outline" size={22} color={colors.amberText} />
        </View>
        <Txt variant="h15">Waiting for answers</Txt>
        <Txt variant="b13" color={colors.textMuted}>
          Trip options appear once everyone has answered.{' '}
          {waitingFor.length > 0 ? `Still waiting for ${waitingFor.map((m) => m.display_name).join(', ')}.` : ''}
        </Txt>
      </Card>
      <AnsweredCard members={members} doneIds={answeredIds} />
      {error ? <ErrorLine message={error} /> : null}
      <View style={styles.actions}>
        <Button label="Don't wait, build options now" onPress={onBuildNow} disabled={answeredIds.size === 0} />
        <Button label="Edit my answers" variant="secondary" onPress={onEditAnswers} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
  wrap: { flex: 1, gap: 12 },
  card: { gap: 6 },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFF4DF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  actions: { marginTop: 'auto', gap: 10 },
});

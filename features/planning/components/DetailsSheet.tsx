import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Chip, Chips } from '@/components/ui/Chip';
import { Txt } from '@/components/ui/Txt';
import { colors, formatMoney } from '@/lib/theme';
import type { OptionFit } from '../optionFit';
import type { TripOption } from '../types';
import { datesLine } from './OptionCard';

interface DetailsSheetProps {
  option: TripOption | null;
  fit: OptionFit | undefined;
  onClose: () => void;
}

/** Day-by-day outline of one trip option. */
export function DetailsSheet({ option, fit, onClose }: DetailsSheetProps) {
  const insets = useSafeAreaInsets();
  if (!option || !fit) return null;
  const plan = option.plan_json;
  const dates = datesLine(fit);
  const perDay = Math.round(option.cost_per_person / plan.days);

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close details" />
      <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
        <ScrollView contentContainerStyle={{ gap: 10 }}>
          <View style={styles.between}>
            <Txt variant="h22">{option.name}</Txt>
            <Txt variant="h15" color={colors.tealDark}>
              {formatMoney(option.cost_per_person)}
            </Txt>
          </View>
          <Txt variant="s11">
            {plan.days} days · per person · {formatMoney(perDay, true)} a day
          </Txt>
          <Txt variant="b12" weight="bold" color={dates.color}>
            {dates.text}
          </Txt>
          <Txt variant="lbl" style={{ marginTop: 4 }}>
            Day by day
          </Txt>
          {plan.dayTitles.map((title, i) => (
            <View key={i} style={styles.day}>
              <View style={styles.dot} />
              <Txt variant="b13">
                <Txt variant="b13" weight="bold" color={colors.tealDark}>
                  Day {i + 1}{'  '}
                </Txt>
                {title}
              </Txt>
            </View>
          ))}
          <Txt variant="lbl" style={{ marginTop: 4 }}>
            Good for
          </Txt>
          <Chips>
            {plan.covers.map((c) => (
              <Chip key={c} label={c} size="sm" ghost />
            ))}
          </Chips>
          <Txt variant="s11">Exact stops, times and prices come in the day plan once the group picks a trip.</Txt>
        </ScrollView>
        <Button label="Close" variant="secondary" onPress={onClose} style={{ marginTop: 14 }} />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(20,40,79,0.45)' },
  sheet: {
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 18,
    maxHeight: '80%',
  },
  between: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  day: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  dot: { width: 10, height: 10, borderRadius: 5, borderWidth: 3, borderColor: colors.teal, backgroundColor: colors.white },
});

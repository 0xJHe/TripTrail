import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { colors, currency, formatMoney, shadow } from '@/lib/theme';
import type { SpendCheckState } from '../hooks/useSpends';
import { cleanAmountInput, parseAmount } from '../spend';

interface SpendCheckCardProps {
  check: SpendCheckState;
  /** Say which stop: when the navy block above shows another one (a late / early card is up). */
  named: boolean;
}

/**
 * "About RM 16 spent?" (prototype screen 9): ✓ keeps the estimate, Enter amount types what
 * this person paid. Skip leaves the estimate. Each person answers once per stop.
 */
export function SpendCheckCard({ check, named }: SpendCheckCardProps) {
  const { stop } = check;
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState('');
  const stopId = stop?.id;
  useEffect(() => {
    setTyping(false);
    setText('');
  }, [stopId]);
  if (!stop) return null;

  const busy = check.saving != null;
  const amount = parseAmount(text);
  const hint = named
    ? `At ${stop.name}. Tap ✓ if that's right, or enter what you paid`
    : "Tap ✓ if that's right, or enter what you paid";

  return (
    <View style={styles.card} testID="spend-check">
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Txt variant="h14" style={styles.title} accessibilityRole="header">
            About {formatMoney(Number(stop.price))} spent?
          </Txt>
          <Txt variant="s11" style={{ marginTop: 3 }}>
            {typing ? `What did you pay at ${stop.name}?` : hint}
          </Txt>
        </View>
        <Pressable
          onPress={busy ? undefined : () => check.answer({ kind: 'skip' })}
          hitSlop={10}
          accessibilityRole="button"
          accessibilityLabel="Skip, keep the estimate"
          style={({ pressed }) => pressed && { opacity: 0.6 }}>
          <Txt variant="s11" weight="semibold">
            Skip
          </Txt>
        </Pressable>
      </View>

      {typing ? (
        <View style={styles.row}>
          <Field
            prefix={currency}
            value={text}
            onChangeText={(t) => setText(cleanAmountInput(t))}
            keyboardType="decimal-pad"
            placeholder={String(Math.round(Number(stop.price)))}
            autoFocus
            maxLength={9}
            returnKeyType="done"
            onSubmitEditing={() => amount != null && check.answer({ kind: 'amount', amount })}
            accessibilityLabel={`Amount paid in ${currency}`}
            containerStyle={styles.button}
          />
          <Button
            size="sm"
            label="Save"
            onPress={() => amount != null && check.answer({ kind: 'amount', amount })}
            disabled={amount == null || busy}
            loading={check.saving === 'amount'}
            style={styles.button}
          />
        </View>
      ) : (
        <View style={styles.row}>
          <Pressable
            onPress={busy ? undefined : () => check.answer({ kind: 'confirm' })}
            accessibilityRole="button"
            accessibilityLabel={`Yes, about ${formatMoney(Number(stop.price))}`}
            accessibilityState={{ disabled: busy }}
            testID="spend-confirm"
            style={({ pressed }) => [styles.button, styles.tick, pressed && !busy && { opacity: 0.85 }]}>
            {check.saving === 'confirm' ? (
              <ActivityIndicator color={colors.white} />
            ) : (
              <Ionicons name="checkmark" size={20} color={colors.white} />
            )}
          </Pressable>
          <Button size="sm" variant="secondary" label="Enter amount" onPress={() => setTyping(true)} disabled={busy} style={styles.button} />
        </View>
      )}
      {typing ? (
        <Pressable onPress={() => setTyping(false)} hitSlop={8} accessibilityRole="button" style={{ alignSelf: 'flex-start' }}>
          <Txt variant="s11">Back</Txt>
        </Pressable>
      ) : null}
      {check.note ? <Txt variant="s11">{check.note}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.card, borderRadius: 16, paddingVertical: 13, paddingHorizontal: 14, gap: 11, ...shadow },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  title: { fontSize: 15, lineHeight: 20 },
  row: { flexDirection: 'row', gap: 10 },
  button: { flex: 1 },
  tick: { minHeight: 40, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal },
});

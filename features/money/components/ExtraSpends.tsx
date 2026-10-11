import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { colors, currency, formatMoney } from '@/lib/theme';
import { useExtraSpends } from '../hooks/useSpends';
import { cleanAmountInput, parseAmount } from '../spend';

/**
 * Under the budget bar: "+ Add spend" to log a spend anytime (amount + optional note,
 * e.g. "Grab to hotel") on the selected day, and that day's extra spends with a delete each.
 */
export function ExtraSpends({ tripId, day }: { tripId: string; day: number }) {
  const extras = useExtraSpends(tripId, day);
  const [open, setOpen] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [note, setNote] = useState('');
  const amount = parseAmount(amountText);
  const adding = extras.busy === 'add';

  const close = () => {
    setOpen(false);
    setAmountText('');
    setNote('');
  };
  const save = async () => {
    if (amount == null || amount <= 0 || adding) return;
    if (await extras.add(amount, note)) close();
  };

  return (
    <View style={styles.wrap}>
      {extras.list.map((e) => (
        <View key={e.id} style={styles.item}>
          <Txt variant="s11" style={{ flex: 1 }} numberOfLines={1}>
            {e.note ?? 'Extra spend'}
          </Txt>
          <Txt variant="s11" weight="semibold" color={colors.text}>
            {formatMoney(e.amount)}
          </Txt>
          <Pressable
            onPress={extras.busy ? undefined : () => extras.remove(e.id)}
            hitSlop={10}
            accessibilityRole="button"
            accessibilityLabel={`Delete ${e.note ?? 'extra spend'}, ${formatMoney(e.amount)}`}
            style={({ pressed }) => pressed && { opacity: 0.6 }}>
            {extras.busy === e.id ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              <Ionicons name="trash-outline" size={15} color={colors.textMuted} />
            )}
          </Pressable>
        </View>
      ))}

      {open ? (
        <View style={styles.form}>
          <View style={styles.row}>
            <Field
              prefix={currency}
              value={amountText}
              onChangeText={(t) => setAmountText(cleanAmountInput(t))}
              keyboardType="decimal-pad"
              placeholder="0"
              autoFocus
              maxLength={9}
              accessibilityLabel={`Amount in ${currency}`}
              containerStyle={{ width: 110 }}
            />
            <Field
              value={note}
              onChangeText={setNote}
              placeholder="Note (optional), e.g. Grab to hotel"
              maxLength={80}
              returnKeyType="done"
              onSubmitEditing={save}
              accessibilityLabel="Note"
              containerStyle={{ flex: 1 }}
            />
          </View>
          <View style={styles.row}>
            <Button size="sm" variant="secondary" label="Cancel" onPress={close} disabled={adding} style={{ flex: 1 }} />
            <Button
              size="sm"
              label={`Add to Day ${day}`}
              onPress={save}
              disabled={amount == null || amount <= 0}
              loading={adding}
              style={{ flex: 1 }}
            />
          </View>
        </View>
      ) : (
        <Pressable
          onPress={() => setOpen(true)}
          disabled={!extras.canAdd}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`Add spend to Day ${day}`}
          style={({ pressed }) => [styles.add, pressed && { opacity: 0.7 }]}>
          <Txt variant="s11" weight="bold" color={colors.tealDark}>
            + Add spend
          </Txt>
        </Pressable>
      )}
      {extras.error ? <Txt variant="s11">{extras.error}</Txt> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  form: { gap: 8 },
  row: { flexDirection: 'row', gap: 8 },
  add: {
    alignSelf: 'flex-end',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: colors.tealTint,
  },
});

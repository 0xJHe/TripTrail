import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Chip, Chips } from '@/components/ui/Chip';
import { Field } from '@/components/ui/Field';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { colors } from '@/lib/theme';
import { PlaceNameField } from '../components/PlaceNameField';
import { useStopForm } from '../hooks/useStopForm';
import type { StopKind } from '../stopForm';

const KINDS: { value: StopKind; label: string }[] = [
  { value: 'place', label: 'Place' },
  { value: 'flight', label: 'Flight · booked' },
  { value: 'hotel', label: 'Hotel · booked' },
];

const NAME_HINT: Record<StopKind, string> = {
  place: 'e.g. Kek Lok Si Temple',
  flight: 'e.g. Flight KUL → PEN · AK 6102',
  hotel: 'e.g. Hotel check-in · Muntri Street',
};

/** Edit a stop (name, time, price), delete it, or add a new one. */
export function StopFormScreen() {
  const params = useLocalSearchParams<{ id: string; stopId: string; day?: string }>();
  const { form, set, save, remove, isNew, days, near, missing, saving, error } = useStopForm(
    params.id,
    params.stopId,
    Number(params.day) || 1,
  );

  function confirmDelete() {
    if (!form) return;
    Alert.alert('Delete this stop?', `"${form.name}" will be removed from Day ${form.day} for everyone.`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: remove },
    ]);
  }

  const header = <NavyHeader title={isNew ? 'Add a stop' : 'Edit stop'} onBack={() => router.back()} />;
  if (!form) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          {missing ? <ErrorLine message="This stop was removed." /> : <ActivityIndicator color={colors.teal} />}
        </View>
      </View>
    );
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      {header}
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Txt variant="sec">What is it?</Txt>
        <Chips>
          {KINDS.map((k) => (
            <Chip key={k.value} label={k.label} selected={form.kind === k.value} onPress={() => set({ kind: k.value })} />
          ))}
        </Chips>

        <Txt variant="sec">Name</Txt>
        <PlaceNameField
          tripId={params.id}
          name={form.name}
          place={form.place}
          placeholder={NAME_HINT[form.kind]}
          search={form.kind !== 'flight'}
          near={near}
          onChange={set}
        />

        <Txt variant="sec">Time</Txt>
        <View style={styles.row}>
          <Field
            prefix="Starts"
            value={form.time}
            onChangeText={(time) => set({ time })}
            placeholder="09:30"
            keyboardType="numbers-and-punctuation"
            containerStyle={{ flex: 1 }}
            testID="stop-time"
          />
          <Field
            prefix="Ends"
            value={form.endTime}
            onChangeText={(endTime) => set({ endTime })}
            placeholder="optional"
            keyboardType="numbers-and-punctuation"
            containerStyle={{ flex: 1 }}
          />
        </View>

        <Txt variant="sec">Price per person</Txt>
        <Field
          prefix="RM"
          value={form.price}
          onChangeText={(price) => set({ price })}
          placeholder="0"
          keyboardType="decimal-pad"
          testID="stop-price"
        />
        {form.kind === 'place' ? (
          <Pressable
            onPress={() => set({ estimate: !form.estimate })}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: form.estimate }}
            style={styles.check}>
            <Ionicons name={form.estimate ? 'checkbox' : 'square-outline'} size={22} color={form.estimate ? colors.teal : colors.textMuted} />
            <Txt variant="b13">It's a guess (shown as ~RM)</Txt>
          </Pressable>
        ) : null}

        {days > 1 ? (
          <>
            <Txt variant="sec">Day</Txt>
            <Chips>
              {Array.from({ length: days }, (_, i) => i + 1).map((d) => (
                <Chip key={d} label={`Day ${d}`} selected={form.day === d} onPress={() => set({ day: d })} />
              ))}
            </Chips>
          </>
        ) : null}

        {error ? <ErrorLine message={error} /> : null}

        {!isNew ? (
          <Pressable onPress={confirmDelete} accessibilityRole="button" style={styles.delete} testID="delete-stop">
            <Ionicons name="trash-outline" size={18} color={colors.red} />
            <Txt variant="h14" color={colors.red}>
              Delete stop
            </Txt>
          </Pressable>
        ) : null}
      </ScrollView>
      <BottomBar>
        <Button label={isNew ? 'Add stop' : 'Save'} onPress={save} loading={saving} testID="save-stop" />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 16, gap: 10, paddingBottom: BOTTOM_BAR_SPACE + 24 },
  row: { flexDirection: 'row', gap: 10 },
  check: { flexDirection: 'row', alignItems: 'center', gap: 8, minHeight: 44 },
  delete: {
    marginTop: 16,
    minHeight: 48,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.red,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
});

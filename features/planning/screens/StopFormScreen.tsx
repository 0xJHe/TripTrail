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
import { TimeField } from '../components/TimeField';
import { END_BEFORE_START, endNotAfterStart, type StopKind } from '../stopForm';
import { clockText, parseClock } from '../stops';

const KINDS: { value: StopKind; label: string }[] = [
  { value: 'place', label: 'Place' },
  { value: 'flight', label: 'Flight · booked' },
  { value: 'hotel', label: 'Hotel · booked' },
];

const NAME_HINT: Record<StopKind, string> = {
  place: 'e.g. Night market',
  flight: 'e.g. Flight home',
  hotel: 'e.g. Hotel check-in',
};

/** Where the Ends clock opens: an hour after Starts (the box itself stays empty until picked). */
function hourAfter(time: string): string | undefined {
  const start = parseClock(time);
  return start == null ? undefined : clockText(Math.min(start + 60, 23 * 60 + 59));
}

/** Edit a stop (name, time, price), delete it, or add a new one. */
export function StopFormScreen() {
  const params = useLocalSearchParams<{ id: string; stopId: string; day?: string }>();
  const { form, set, save, remove, isNew, days, near, missing, saving, error, timeError } = useStopForm(
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

  // Under the times: what Add stop / Save found, or an end not after the start as soon as both are in.
  const timeLine = timeError ?? (endNotAfterStart(form) ? END_BEFORE_START : null);

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
          <TimeField
            prefix="Starts"
            value={form.time}
            onChange={(time) => set({ time })}
            containerStyle={{ flex: 1 }}
            testID="stop-time"
          />
          <TimeField
            prefix="Ends"
            value={form.endTime}
            onChange={(endTime) => set({ endTime })}
            opensAt={hourAfter(form.time)}
            containerStyle={{ flex: 1 }}
            testID="stop-end-time"
          />
        </View>
        {timeLine ? <ErrorLine message={timeLine} /> : null}

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

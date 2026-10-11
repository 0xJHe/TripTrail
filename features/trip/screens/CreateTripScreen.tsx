import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Chip, Chips } from '@/components/ui/Chip';
import { Field, SelectField } from '@/components/ui/Field';
import { PickerSheet } from '@/components/ui/PickerSheet';
import { Txt } from '@/components/ui/Txt';
import { Calendar } from '@/features/planning/components/Calendar';
import { formatRange, monthName, todayISO } from '@/features/planning/dates';
import { avatarColors, colors } from '@/lib/theme';
import { useDisplayName } from '../authStore';
import { ErrorLine } from '../components/ErrorLine';
import { HeroHeader } from '../components/HeroHeader';
import { InviteCard } from '../components/InviteCard';
import { LENGTHS, upcomingMonths } from '../constants';
import { useCreateTripForm } from '../hooks/useCreateTripForm';
import { useMembers } from '../hooks/useTrip';
import { useTripRealtime } from '../hooks/useTripRealtime';
import { memberAvatars } from '../members';

export function CreateTripScreen() {
  const myName = useDisplayName();
  const form = useCreateTripForm(myName);
  const queryClient = useQueryClient();
  const [picker, setPicker] = useState<'month' | 'length' | null>(null);
  const members = useMembers(form.tripId ?? undefined);
  useTripRealtime(form.tripId ?? undefined, ['members']);

  const people = members.data?.length
    ? memberAvatars(members.data)
    : [{ key: 'me', name: myName, color: avatarColors[0] }];

  async function create() {
    const saved = await form.save();
    if (!saved) return;
    queryClient.invalidateQueries({ queryKey: ['myTrips'] });
    router.replace(`/trip/${saved.id}/preferences`);
  }

  const { range } = form;
  const monthValue = form.knowsDates && range.start ? monthName(range.start.slice(0, 7)) : monthName(form.month);
  const lengthValue = form.knowsDates
    ? form.fixedDays
      ? `${form.fixedDays} day${form.fixedDays === 1 ? '' : 's'}`
      : '–'
    : form.length.label;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <HeroHeader
        brand
        title="Start a new trip"
        subtitle="Set it up once. Everyone else just answers a few questions."
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Txt variant="sec">Trip name</Txt>
        <Field
          value={form.name}
          onChangeText={form.setName}
          placeholder="e.g. Holiday with the gang"
          maxLength={40}
          style={{ fontSize: 15 }}
          testID="trip-name"
        />

        <Txt variant="sec">Where to?</Txt>
        <Chips>
          <Chip label="Let the group decide" selected={!form.knowsPlace} onPress={() => form.setKnowsPlace(false)} />
          <Chip label="I already know" selected={form.knowsPlace} onPress={() => form.setKnowsPlace(true)} />
        </Chips>
        {form.knowsPlace ? (
          <Field
            value={form.destination}
            onChangeText={form.setDestination}
            placeholder="e.g. Penang"
            prefix="Place"
            maxLength={40}
            style={{ fontSize: 15 }}
          />
        ) : null}

        <Txt variant="sec">Roughly when?</Txt>
        <View style={styles.row}>
          <SelectField
            prefix="Month"
            value={monthValue}
            onPress={() => !form.knowsDates && setPicker('month')}
            style={{ flex: 1 }}
          />
          <SelectField
            prefix="Length"
            value={lengthValue}
            onPress={() => !form.knowsDates && setPicker('length')}
            style={{ flex: 1 }}
          />
        </View>
        <Chips>
          <Chip label="Group picks the dates" selected={!form.knowsDates} onPress={() => form.setKnowsDates(false)} />
          <Chip label="I already know the dates" selected={form.knowsDates} onPress={() => form.setKnowsDates(true)} />
        </Chips>
        {form.knowsDates ? (
          <Calendar
            month={form.calendarMonth}
            onMonthChange={form.setCalendarMonth}
            selected={form.selectedDates}
            onPressDay={form.pressDay}
            minDate={todayISO()}
            hint={range.start && !range.end ? 'Now tap the last day' : 'Tap the first and last day'}
            summary={range.start ? formatRange(range.start, range.end ?? range.start) : undefined}
          />
        ) : null}

        <Txt variant="sec">Invite your group</Txt>
        <InviteCard
          people={people}
          myName={myName}
          joinCode={form.joinCode}
          tripName={form.name}
          beforeShare={async () => (await form.save())?.code ?? null}
        />
        {form.error ? <ErrorLine message={form.error} /> : null}
      </ScrollView>

      <BottomBar>
        <Button label="Create trip" onPress={create} loading={form.saving} testID="create-trip" />
      </BottomBar>

      <PickerSheet
        visible={picker === 'month'}
        title="Which month?"
        options={upcomingMonths()}
        value={form.month}
        onSelect={form.setMonth}
        onClose={() => setPicker(null)}
      />
      <PickerSheet
        visible={picker === 'length'}
        title="How long?"
        options={LENGTHS}
        value={form.length.value}
        onSelect={form.setLength}
        onClose={() => setPicker(null)}
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 12, paddingBottom: BOTTOM_BAR_SPACE },
  row: { flexDirection: 'row', gap: 10 },
});

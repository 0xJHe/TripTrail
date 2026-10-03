import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { useMembers, useMyMember, useTrip } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { memberCountLabel } from '@/features/trip/members';
import { colors, currency } from '@/lib/theme';
import { savePreferences } from '../api';
import { AnsweredCard } from '../components/AnsweredCard';
import { Calendar } from '../components/Calendar';
import { ChipPicker } from '../components/ChipPicker';
import { FOOD_NEEDS, MAX_MUST_HAVES, MUST_HAVES, NO_GOS } from '../constants';
import { formatRange, summarizeDates, todayISO } from '../dates';
import { usePreferences } from '../hooks/usePlanning';
import { usePreferencesForm } from '../hooks/usePreferencesForm';
import { answered } from '../optionFit';

export function PreferencesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const queryClient = useQueryClient();
  const trip = useTrip(id);
  const members = useMembers(id);
  const me = useMyMember(id);
  const prefs = usePreferences(id);
  useTripRealtime(id, ['members', 'preferences', 'trips']);
  const mine = prefs.data?.find((p) => p.member_id === me?.id);
  const form = usePreferencesForm(prefs.isSuccess ? trip.data : undefined, mine, me?.id ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!form.input) return;
    setSaving(true);
    setError(null);
    try {
      await savePreferences(form.input);
      await queryClient.invalidateQueries({ queryKey: ['preferences', id] });
      router.push(`/trip/${id}/options`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Check your internet and try again.');
    } finally {
      setSaving(false);
    }
  }

  const t = trip.data;
  const doneIds = new Set(answered(prefs.data ?? []).map((p) => p.member_id));
  const fixed = t?.dates_fixed && t.start_date && t.end_date ? formatRange(t.start_date, t.end_date) : null;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <NavyHeader
        title="Your preferences"
        subtitle={t ? `${t.name} · ${memberCountLabel(members.data?.length ?? 1)}` : ' '}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />
      {!t || !prefs.isSuccess ? (
        <View style={styles.center}>
          {trip.error || prefs.error ? (
            <ErrorLine message="Couldn't load this trip. Check your internet and try again." />
          ) : (
            <ActivityIndicator color={colors.teal} />
          )}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Txt variant="sec">Daily budget</Txt>
          <Field
            prefix={currency}
            value={form.budget}
            onChangeText={form.setBudget}
            placeholder="150"
            keyboardType="number-pad"
            maxLength={5}
            testID="budget-input"
          />

          <Txt variant="sec">When are you free?</Txt>
          {fixed ? <Txt variant="s11">Trip dates are {fixed}. Untick any day you can't make.</Txt> : null}
          <Calendar
            month={form.month}
            onMonthChange={form.setMonth}
            selected={form.dates}
            onPressDay={form.toggleDate}
            minDate={todayISO()}
            hint="Tap the days you can travel"
            summary={summarizeDates([...form.dates])}
          />

          <Txt variant="sec">Food needs</Txt>
          <ChipPicker items={FOOD_NEEDS} selected={form.food} onToggle={form.toggleFood} />

          <Txt variant="sec">Pick up to {MAX_MUST_HAVES} must-haves</Txt>
          <ChipPicker
            items={MUST_HAVES}
            selected={form.mustHaves}
            onToggle={form.toggleMustHave}
            full={form.mustHaves.length >= MAX_MUST_HAVES}
          />

          <Txt variant="sec">Pick 1 no-go</Txt>
          <ChipPicker items={NO_GOS} selected={form.noGo ? [form.noGo] : []} onToggle={form.toggleNoGo} tone="red" />

          <View style={{ marginTop: 4 }}>
            <AnsweredCard members={members.data ?? []} doneIds={doneIds} />
          </View>
          {error ? <ErrorLine message={error} /> : null}
        </ScrollView>
      )}
      <BottomBar>
        {form.problem && t ? (
          <Txt variant="s11" style={{ textAlign: 'center' }}>
            {form.problem} to continue
          </Txt>
        ) : null}
        <Button
          label="Save my answers"
          onPress={save}
          loading={saving}
          disabled={!form.input}
          testID="save-preferences"
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, gap: 7, paddingBottom: BOTTOM_BAR_SPACE + 20 },
});

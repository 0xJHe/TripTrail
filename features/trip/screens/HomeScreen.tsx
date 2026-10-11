import { router, useFocusEffect } from 'expo-router';
import { useCallback, useMemo } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { todayISO } from '@/features/planning/dates';
import { useNow } from '@/lib/clock';
import { colors } from '@/lib/theme';
import { useDisplayName } from '../authStore';
import { ActionCard } from '../components/ActionCard';
import { ErrorLine } from '../components/ErrorLine';
import { HeroHeader } from '../components/HeroHeader';
import { PastTrips } from '../components/PastTrips';
import { SignOutButton } from '../components/SignOutButton';
import { TripRow } from '../components/TripRow';
import { useMyTrips } from '../hooks/useTrip';
import { splitTrips } from '../pastTrips';
import { tripEntryRoute } from '../routes';
import { useCurrentTrip } from '../store';
import type { Trip } from '../types';

export function HomeScreen() {
  const name = useDisplayName();
  const insets = useSafeAreaInsets();
  const trips = useMyTrips();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);
  const { refetch } = trips;
  // Trips whose last day is over move to "Past trips" (the fake date in Demo mode).
  const today = todayISO(useNow(60_000));
  const sections = useMemo(() => splitTrips(trips.data ?? [], today), [trips.data, today]);

  const open = (trip: Trip) => {
    setCurrentTrip(trip.id);
    router.push(tripEntryRoute(trip));
  };

  useFocusEffect(
    useCallback(() => {
      refetch();
    }, [refetch]),
  );

  return (
    <View style={styles.screen}>
      <HeroHeader
        brand
        title={`Hi ${name || 'there'} 👋`}
        subtitle="Where is the group going next?"
        right={
          <View style={styles.headerButtons}>
            <SettingsButton />
            <SignOutButton />
          </View>
        }
      />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={trips.isRefetching} onRefresh={refetch} tintColor={colors.teal} />}>
        <ActionCard
          icon="add"
          iconBg={colors.teal}
          title="Start a trip"
          text="Set it up once and invite your group"
          onPress={() => router.push('/create-trip')}
          testID="start-trip"
        />
        <ActionCard
          icon="enter-outline"
          iconBg={colors.navy}
          title="Join with a code"
          text="Got a code from a friend? Jump in"
          onPress={() => router.push('/join')}
          testID="join-trip"
        />

        <Txt variant="lbl" style={styles.label}>
          Your trips
        </Txt>
        {trips.isLoading ? <ActivityIndicator color={colors.teal} style={{ marginTop: 8 }} /> : null}
        {trips.error ? <ErrorLine message="Couldn't load your trips. Pull down to try again." /> : null}
        {trips.data?.length === 0 ? (
          <Txt variant="s11">No trips yet. Start one, or join with a code a friend sent you.</Txt>
        ) : null}
        {trips.data && trips.data.length > 0 && sections.current.length === 0 ? (
          <Txt variant="s11">No current trips. Start one, or open a past trip below.</Txt>
        ) : null}
        {sections.current.map((trip) => (
          <TripRow key={trip.id} trip={trip} onPress={() => open(trip)} />
        ))}
        <PastTrips trips={sections.past} onOpen={open} />

        <Pressable
          onPress={() => router.push('/sign-in')}
          accessibilityRole="button"
          hitSlop={8}
          style={styles.rename}>
          <Txt variant="s11">
            Not {name || 'you'}?{' '}
            <Txt variant="s11" weight="bold" color={colors.tealDark}>
              Change name
            </Txt>
          </Txt>
        </Pressable>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, gap: 12 },
  headerButtons: { flexDirection: 'row', alignItems: 'center' },
  label: { marginTop: 10 },
  rename: { alignSelf: 'center', marginTop: 12, padding: 6 },
});

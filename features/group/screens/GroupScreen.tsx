import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Card } from '@/components/ui/Card';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { useLeaveTrip } from '@/features/trip/hooks/useLeaveTrip';
import { useCurrentTrip } from '@/features/trip/store';
import { colors } from '@/lib/theme';
import { GroupInviteCard } from '../components/GroupInviteCard';
import { LeaveTripCard } from '../components/LeaveTripCard';
import { MemberRow } from '../components/MemberRow';
import { groupCountLabel } from '../groupList';
import { useGroupList } from '../hooks/useGroupList';

/**
 * Group tab: who is in the trip with their live status (location, battery, Done for today,
 * preferences answered; never their budget or other answers), the join code with Copy / Share,
 * and Leave trip at the bottom.
 */
export function GroupScreen() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const g = useGroupList(tripId);
  const insets = useSafeAreaInsets();
  const exit = useLeaveTrip(tripId, g.me?.id, g.lastMember);

  if (!tripId || (!g.loading && !g.trip && !g.error)) {
    return (
      <View style={styles.screen}>
        <NavyHeader title="Group" right={<SettingsButton />} />
        <View style={styles.center}>
          <Txt variant="h15">No trip open</Txt>
          <Txt variant="b12" color={colors.textMuted} style={{ textAlign: 'center' }}>
            Open a trip from your trips list to see who's in it.
          </Txt>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <NavyHeader title="Group" subtitle={g.trip ? `${g.trip.name} · ${groupCountLabel(g.rows)}` : undefined} right={<SettingsButton />} />
      <ScrollView
        contentContainerStyle={[styles.body, { paddingBottom: insets.bottom + 24 }]}
        refreshControl={<RefreshControl refreshing={false} onRefresh={g.refetch} tintColor={colors.teal} />}>
        {g.loading ? <ActivityIndicator color={colors.teal} style={{ marginTop: 16 }} /> : null}
        {g.error ? <ErrorLine message="Couldn't load the group. Pull down to try again." /> : null}
        {g.trip ? (
          <>
            <Txt variant="lbl">Members</Txt>
            <Card style={styles.members}>
              {g.rows.map((row, i) => (
                <View key={row.id} style={i > 0 && styles.divider}>
                  <MemberRow row={row} />
                </View>
              ))}
            </Card>
            <GroupInviteCard tripName={g.trip.name} joinCode={g.trip.join_code} decided={g.trip.stage === 'decided'} />
            {g.me ? (
              <View style={styles.leave}>
                <LeaveTripCard lastMember={g.lastMember} leaving={exit.leaving} error={exit.error} onLeave={exit.leave} />
              </View>
            ) : null}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 6 },
  body: { padding: 16, gap: 12 },
  members: { paddingVertical: 4 },
  divider: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  leave: { marginTop: 12 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip, Chips } from '@/components/ui/Chip';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { colors } from '@/lib/theme';
import { SplitPlanCard } from '../components/SplitPlanCard';
import { farText, firstName } from '../groupMap';
import { useSplitPlan } from '../hooks/useSplitPlan';

/**
 * Split & rejoin (prototype screen 12): choose who goes in group B (the far member by
 * default), see both mini-plans and where everyone meets again, then Start split or Cancel.
 */
export function SplitScreen() {
  const s = useSplitPlan();
  const subtitle = s.far[0] ? farText(s.far[0]) : 'Go separate ways, meet again later';
  const close = () => (router.canGoBack() ? router.back() : router.replace('/map'));
  const start = async () => {
    if (await s.start()) close();
  };

  return (
    <View style={styles.screen}>
      <NavyHeader title="Split & rejoin" subtitle={subtitle} onBack={close} />
      {!s.tripId ? (
        <View style={styles.center}>
          <Txt variant="b13">Open a trip first.</Txt>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body}>
            <Txt variant="sec">Who goes in group B?</Txt>
            <Chips>
              {s.people.map((p) => (
                <Chip
                  key={p.id}
                  label={p.isMe ? 'You' : firstName(p.name)}
                  selected={s.groupB.includes(p.id)}
                  onPress={() => s.toggle(p.id)}
                />
              ))}
            </Chips>
            <Txt variant="s11">Everyone else is group A and keeps the plan.</Txt>

            {s.active ? <ErrorLine message="The group is already split. End that split on the Map tab first." /> : null}
            {s.rejoin ? (
              <SplitPlanCard a={s.a} b={s.b} rejoin={s.rejoin} aPlan={s.aPlan} />
            ) : (
              <Card style={styles.none}>
                <Ionicons name="flag-outline" size={18} color={colors.textMuted} />
                <View style={{ flex: 1 }}>
                  <Txt variant="h14">No stops left today to rejoin at</Txt>
                  <Txt variant="s11">Set a meet point on the map instead.</Txt>
                </View>
              </Card>
            )}
            {s.b.length === 0 ? <Txt variant="s11">Pick at least one person for group B.</Txt> : null}
            {s.b.length > 0 && s.a.length === 0 ? <Txt variant="s11">Leave at least one person in group A.</Txt> : null}
            {s.error ? <ErrorLine message={s.error} /> : null}
          </ScrollView>
          <BottomBar>
            <View style={styles.row}>
              <Button label="Start split" onPress={start} disabled={!s.canStart} loading={s.saving} style={styles.half} testID="start-split" />
              <Button label="Cancel" variant="secondary" onPress={close} style={styles.half} />
            </View>
          </BottomBar>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: BOTTOM_BAR_SPACE + 16, gap: 10 },
  none: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  row: { flexDirection: 'row', gap: 10 },
  half: { flex: 1 },
});

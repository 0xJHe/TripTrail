import Ionicons from '@expo/vector-icons/Ionicons';
import { LinearGradient } from 'expo-linear-gradient';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { NoPlan } from '@/features/today/components/NoPlan';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { button, colors, fontFamily, radius } from '@/lib/theme';
import { RecapCard } from '../components/RecapCard';
import { useDayRecap } from '../hooks/useDayRecap';
import { useRecapShare } from '../hooks/useRecapShare';

const GUTTER = 16;
const BUTTONS_H = button.minHeight + 4;
const GAP = 14;

/**
 * Day recap (prototype screen 15): the day's story card (9:16) with "Share your day" (share
 * sheet) and Download (gallery). Opened from "Day closed" on the Today tab and from the Plan tab.
 */
export function DayRecapScreen() {
  const params = useLocalSearchParams<{ day?: string }>();
  const day = Number(params.day) || 1;
  const recap = useDayRecap(day);
  const card = useRef<View>(null);
  const actions = useRecapShare(card);
  const insets = useSafeAreaInsets();
  const screen = useWindowDimensions();
  const [bodyH, setBodyH] = useState(0);
  const back = () => (router.canGoBack() ? router.back() : router.replace('/today'));
  const header = <NavyHeader title={`Day ${day} done`} subtitle="Share your day" onBack={back} />;

  if (recap.loading || !recap.trip) {
    return (
      <View style={styles.screen}>
        {header}
        <View style={styles.center}>
          <ActivityIndicator color={colors.teal} />
        </View>
      </View>
    );
  }
  if (!recap.isDay) {
    return (
      <View style={styles.screen}>
        {header}
        <NoPlan icon="calendar-outline" title="No such day" text={`${recap.trip.name} doesn't have a Day ${day}.`} />
      </View>
    );
  }

  // As big as fits: the full width less a margin, or the height left over the buttons.
  // Room under the buttons for "Saved to your gallery" or an error line, so the card never jumps.
  const notes = 40;
  const fitH = bodyH - BUTTONS_H - GAP * 2 - notes - insets.bottom;
  const cardW = Math.max(160, Math.min(screen.width - 2 * 44, (fitH * 9) / 16));

  return (
    <View style={styles.screen}>
      {header}
      <View style={styles.body} onLayout={(e) => setBodyH(e.nativeEvent.layout.height)}>
        {bodyH > 0 ? (
          <View style={[styles.cardWrap, { borderRadius: 22 * (cardW / 300) }]}>
            <RecapCard ref={card} recap={recap} width={cardW} />
          </View>
        ) : null}
        <View style={styles.row}>
          <Pressable
            onPress={actions.share}
            disabled={!!actions.busy}
            accessibilityRole="button"
            accessibilityLabel="Share your day"
            testID="recap-share"
            style={({ pressed }) => [styles.shareWrap, pressed && { opacity: 0.85 }]}>
            <LinearGradient colors={[colors.teal, colors.navy]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={styles.share}>
              {actions.busy === 'share' ? (
                <ActivityIndicator color={colors.white} />
              ) : (
                <>
                  <Ionicons name="share-outline" size={19} color={colors.white} />
                  <Txt style={styles.shareText} color={colors.white}>
                    Share your day
                  </Txt>
                </>
              )}
            </LinearGradient>
          </Pressable>
          <Pressable
            onPress={actions.download}
            disabled={!!actions.busy}
            accessibilityRole="button"
            accessibilityLabel="Download"
            testID="recap-download"
            style={({ pressed }) => [styles.download, pressed && { opacity: 0.85 }]}>
            {actions.busy === 'save' ? <ActivityIndicator color={colors.teal} /> : <Ionicons name="download-outline" size={22} color={colors.text} />}
          </Pressable>
        </View>
        {actions.saved ? (
          <View style={styles.savedRow}>
            <Ionicons name="checkmark-circle" size={16} color={colors.green} />
            <Txt variant="b12" color={colors.green} weight="semibold">
              Saved to your gallery
            </Txt>
          </View>
        ) : null}
        {actions.error ? (
          <View style={styles.note}>
            <ErrorLine message={actions.error} />
          </View>
        ) : null}
        {recap.error ? (
          <View style={styles.note}>
            <ErrorLine message={recap.error} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, alignItems: 'center', paddingHorizontal: GUTTER, paddingTop: GAP, gap: GAP },
  cardWrap: {
    overflow: 'hidden',
    shadowColor: '#142850',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.35,
    shadowRadius: 24,
    elevation: 10,
    backgroundColor: colors.navy,
  },
  row: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  shareWrap: { flex: 1, borderRadius: radius.button, overflow: 'hidden' },
  share: { minHeight: BUTTONS_H, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  shareText: { fontFamily: fontFamily.bold, fontSize: 15, lineHeight: 20 },
  download: {
    width: 60,
    minHeight: BUTTONS_H,
    borderRadius: radius.button,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: { alignSelf: 'stretch' },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

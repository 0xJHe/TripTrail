import { forwardRef, useImperativeHandle, useRef } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily, radius, shadow } from '@/lib/theme';
import type { OptionFit } from '../optionFit';
import type { TripOption } from '../types';
import { OptionCard } from './OptionCard';

const SWIPE_DISTANCE = 110;
const SWIPE_VELOCITY = 800;

export interface SwipeDeckHandle {
  /** Throw the top card left (pass) or right (like), as if swiped. */
  swipe: (liked: boolean) => void;
}

interface SwipeDeckProps {
  /** Cards still to swipe, top card first. */
  options: TripOption[];
  fits: Map<string, OptionFit>;
  solo: boolean;
  needsHalal: boolean;
  onSwipe: (option: TripOption, liked: boolean) => void;
}

/** Stack of trip cards: drag the top one right to like, left to pass. */
export const SwipeDeck = forwardRef<SwipeDeckHandle, SwipeDeckProps>(function SwipeDeck(
  { options, fits, solo, needsHalal, onSwipe },
  ref,
) {
  const top = useRef<SwipeDeckHandle>(null);
  useImperativeHandle(ref, () => ({ swipe: (liked) => top.current?.swipe(liked) }), []);
  const [first, second, third] = options;
  const card = (o: TripOption) => <OptionCard option={o} fit={fits.get(o.id)!} solo={solo} needsHalal={needsHalal} />;

  return (
    <View style={styles.deck}>
      {third ? <View style={[styles.card, styles.back2]}>{card(third)}</View> : null}
      {second ? <View style={[styles.card, styles.back1]}>{card(second)}</View> : null}
      {first ? (
        <TopCard key={first.id} ref={top} onDone={(liked) => onSwipe(first, liked)}>
          {card(first)}
        </TopCard>
      ) : null}
    </View>
  );
});

const TopCard = forwardRef<SwipeDeckHandle, { children: React.ReactNode; onDone: (liked: boolean) => void }>(
  function TopCard({ children, onDone }, ref) {
    const { width } = useWindowDimensions();
    const x = useSharedValue(0);
    const y = useSharedValue(0);
    const out = width * 1.4;

    const fling = (liked: boolean) => {
      x.value = withTiming(liked ? out : -out, { duration: 260 }, (finished) => {
        if (finished) runOnJS(onDone)(liked);
      });
    };
    useImperativeHandle(ref, () => ({ swipe: fling }));

    const pan = Gesture.Pan()
      .activeOffsetX([-8, 8])
      .onUpdate((e) => {
        x.value = e.translationX;
        y.value = e.translationY * 0.25;
      })
      .onEnd((e) => {
        const go = Math.abs(x.value) > SWIPE_DISTANCE || Math.abs(e.velocityX) > SWIPE_VELOCITY;
        if (go) {
          const liked = (x.value || e.velocityX) > 0;
          x.value = withTiming(liked ? out : -out, { duration: 200 }, (finished) => {
            if (finished) runOnJS(onDone)(liked);
          });
        } else {
          x.value = withSpring(0);
          y.value = withSpring(0);
        }
      });

    const cardStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: x.value }, { translateY: y.value }, { rotate: `${-2.5 + x.value / 22}deg` }],
    }));
    const likeStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [0, SWIPE_DISTANCE], [0, 1], 'clamp') }));
    const passStyle = useAnimatedStyle(() => ({ opacity: interpolate(x.value, [-SWIPE_DISTANCE, 0], [1, 0], 'clamp') }));

    return (
      <GestureDetector gesture={pan}>
        <Animated.View style={[styles.card, styles.front, cardStyle]}>
          {children}
          <Animated.View style={[styles.stamp, styles.like, likeStyle]} pointerEvents="none">
            <Txt style={styles.stampText} color={colors.teal}>
              LIKE
            </Txt>
          </Animated.View>
          <Animated.View style={[styles.stamp, styles.pass, passStyle]} pointerEvents="none">
            <Txt style={styles.stampText} color={colors.red}>
              PASS
            </Txt>
          </Animated.View>
        </Animated.View>
      </GestureDetector>
    );
  },
);

const styles = StyleSheet.create({
  deck: { flex: 1, marginTop: 14 },
  card: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 16,
    bottom: 12,
    borderRadius: radius.card,
    backgroundColor: colors.card,
    ...shadow,
  },
  back2: { left: 22, right: 22, top: 4, bottom: 34, opacity: 0.6, transform: [{ rotate: '4deg' }] },
  back1: { left: 12, right: 12, top: 8, bottom: 26, opacity: 0.85, transform: [{ rotate: '-5deg' }] },
  front: {
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.22,
    shadowRadius: 30,
    elevation: 8,
  },
  stamp: {
    position: 'absolute',
    top: 24,
    borderWidth: 3,
    borderRadius: 10,
    paddingVertical: 4,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  like: { left: 20, borderColor: colors.teal, transform: [{ rotate: '-12deg' }] },
  pass: { right: 20, borderColor: colors.red, transform: [{ rotate: '12deg' }] },
  stampText: { fontFamily: fontFamily.extrabold, fontSize: 24, letterSpacing: 2 },
});

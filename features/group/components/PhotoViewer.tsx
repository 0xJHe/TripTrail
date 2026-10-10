import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { Modal, Pressable, StatusBar, StyleSheet, View } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

import { Txt } from '@/components/ui/Txt';
import { colors } from '@/lib/theme';

const MAX_ZOOM = 4;

interface PhotoViewerProps {
  /** The photo link; null = closed. */
  uri: string | null;
  /** "Line Clear nasi kandar", shown at the top. */
  title: string;
  onClose: () => void;
}

/** A pin's photo full screen: pinch to zoom, drag when zoomed, double tap to zoom in / back out. */
export function PhotoViewer({ uri, title, onClose }: PhotoViewerProps) {
  return (
    <Modal visible={uri != null} transparent={false} animationType="fade" onRequestClose={onClose} statusBarTranslucent>
      {/* A Modal is its own window on Android, so gestures need their own root here. */}
      <GestureHandlerRootView style={styles.screen}>
        <StatusBar barStyle="light-content" />
        {uri ? <ZoomImage key={uri} uri={uri} title={title} /> : null}
        <View style={styles.top}>
          <Txt variant="h14" color={colors.white} numberOfLines={1} style={{ flex: 1 }}>
            {title}
          </Txt>
          <Pressable
            onPress={onClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Close photo"
            testID="photo-close"
            style={styles.close}>
            <Ionicons name="close" size={24} color={colors.white} />
          </Pressable>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

function ZoomImage({ uri, title }: { uri: string; title: string }) {
  const scale = useSharedValue(1);
  const saved = useSharedValue(1);
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const savedX = useSharedValue(0);
  const savedY = useSharedValue(0);

  const reset = () => {
    'worklet';
    scale.value = withTiming(1);
    saved.value = 1;
    x.value = withTiming(0);
    y.value = withTiming(0);
    savedX.value = 0;
    savedY.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = Math.min(MAX_ZOOM, Math.max(1, saved.value * e.scale));
    })
    .onEnd(() => {
      saved.value = scale.value;
      if (scale.value <= 1.01) reset();
    });

  const pan = Gesture.Pan()
    .averageTouches(true)
    .onUpdate((e) => {
      if (saved.value <= 1) return;
      x.value = savedX.value + e.translationX;
      y.value = savedY.value + e.translationY;
    })
    .onEnd(() => {
      savedX.value = x.value;
      savedY.value = y.value;
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (saved.value > 1) {
        reset();
      } else {
        scale.value = withTiming(2.5);
        saved.value = 2.5;
      }
    });

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: x.value }, { translateY: y.value }, { scale: scale.value }],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan, doubleTap)}>
      <Animated.View style={[styles.fill, style]}>
        <Image source={{ uri }} style={styles.fill} contentFit="contain" accessibilityLabel={`Photo of ${title}`} />
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000' },
  fill: { flex: 1 },
  top: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingTop: (StatusBar.currentHeight ?? 24) + 8,
    paddingHorizontal: 16,
    paddingBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  close: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
});

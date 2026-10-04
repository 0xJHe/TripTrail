import { Image } from 'expo-image';
import { useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { fontFamily } from '@/lib/theme';
import type { OptionPlan } from '../types';
import { Scene } from './Scene';

/**
 * The option's Google photo with the photographer credit on it, or the
 * drawing when there's no photo (or it fails to load).
 */
export function OptionPicture({ plan, banner }: { plan: OptionPlan; banner?: boolean }) {
  const [broken, setBroken] = useState(false);
  const photo = !broken ? plan.photo : null;
  return (
    <View style={StyleSheet.absoluteFill}>
      <Scene kind={plan.scene} banner={banner} />
      {photo ? (
        <>
          <Image
            source={{ uri: photo.url }}
            style={StyleSheet.absoluteFill}
            contentFit="cover"
            transition={200}
            onError={() => setBroken(true)}
            accessibilityLabel={plan.landmark ?? undefined}
          />
          {photo.credit ? (
            <Txt
              style={styles.credit}
              numberOfLines={1}
              onPress={photo.creditUrl ? () => Linking.openURL(photo.creditUrl!) : undefined}
              accessibilityRole={photo.creditUrl ? 'link' : 'text'}>
              Photo: {photo.credit}
            </Txt>
          ) : null}
        </>
      ) : plan.photoLimited ? (
        <Txt style={styles.credit}>No photo today (Google limit)</Txt>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  credit: {
    position: 'absolute',
    right: 6,
    bottom: 6,
    maxWidth: '70%',
    fontFamily: fontFamily.medium,
    fontSize: 9,
    lineHeight: 12,
    color: '#FFFFFF',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 4,
    overflow: 'hidden',
  },
});

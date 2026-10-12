import Ionicons from '@expo/vector-icons/Ionicons';
import { StyleSheet, View } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';

/** Amber "Group B" tag on group B's own stops during a split (Plan and Today, group B only). */
export function GroupBTag({ onNavy = false }: { onNavy?: boolean }) {
  return (
    <View style={[styles.tag, onNavy && styles.onNavy]} testID="group-b-tag" accessibilityLabel="Group B only">
      <Ionicons name="git-branch-outline" size={11} color={colors.amberText} />
      <Txt style={styles.text} color={colors.amberText}>
        Group B
      </Txt>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 3,
    backgroundColor: '#FDF3E1',
    borderRadius: 6,
    paddingHorizontal: 6,
    paddingVertical: 1,
  },
  onNavy: { marginTop: 4 },
  text: { fontFamily: fontFamily.bold, fontSize: 10, lineHeight: 14 },
});

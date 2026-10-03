import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { Alert, Platform, Pressable, StyleSheet } from 'react-native';

import { Txt } from '@/components/ui/Txt';
import { colors, fontFamily } from '@/lib/theme';
import { signOut } from '../api';
import { useCurrentTrip } from '../store';

const WARNING =
  "You signed in with just your name, so after signing out you can't get back into your current trips. Someone can invite you again with the join code.";

/** "Sign out" pill for the Home header. Asks first, because anonymous accounts can't sign back in. */
export function SignOutButton() {
  const queryClient = useQueryClient();
  const setCurrentTrip = useCurrentTrip((s) => s.setCurrentTrip);

  async function doSignOut() {
    try {
      await signOut();
    } catch {
      // Signing out locally still works offline; the session is cleared either way.
    }
    setCurrentTrip(null);
    queryClient.clear();
    router.replace('/intro');
  }

  function confirm() {
    if (Platform.OS === 'web') {
      if (window.confirm(`Sign out?\n\n${WARNING}`)) doSignOut();
      return;
    }
    Alert.alert('Sign out?', WARNING, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: doSignOut },
    ]);
  }

  return (
    <Pressable
      onPress={confirm}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Sign out"
      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.75 }]}>
      <Ionicons name="log-out-outline" size={16} color={colors.white} />
      <Txt style={styles.text} color={colors.white}>
        Sign out
      </Txt>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
  },
  text: { fontFamily: fontFamily.semibold, fontSize: 12, lineHeight: 15 },
});

import Ionicons from '@expo/vector-icons/Ionicons';
import { useQueryClient } from '@tanstack/react-query';
import { Redirect, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { avatarColors, colors } from '@/lib/theme';
import { joinTrip } from '../api';
import { useAuth, useDisplayName } from '../authStore';
import { ErrorLine } from '../components/ErrorLine';
import { normalizeJoinCode } from '../joinCode';

export function JoinScreen() {
  const params = useLocalSearchParams<{ code?: string }>();
  const signedIn = useAuth((s) => !!s.session);
  const name = useDisplayName();
  const queryClient = useQueryClient();
  const [input, setInput] = useState(params.code ?? '');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const code = normalizeJoinCode(input);

  if (!signedIn) {
    return <Redirect href={{ pathname: '/sign-in', params: { next: `/join?code=${encodeURIComponent(code)}` } }} />;
  }

  async function submit() {
    if (!code) {
      setError('Enter the join code from your invite.');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      const tripId = await joinTrip(code, name);
      queryClient.invalidateQueries({ queryKey: ['myTrips'] });
      router.replace(`/trip/${tripId}/preferences`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not join. Check your internet and try again.');
      setJoining(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <NavyHeader
        title="Join a trip"
        subtitle="Enter the code your friend sent you"
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/home'))}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Txt variant="sec">Join code</Txt>
        <Field
          value={input}
          onChangeText={(t) => {
            setInput(t);
            setError(null);
          }}
          placeholder="e.g. gang-7k2"
          autoFocus={!params.code}
          autoCapitalize="none"
          autoCorrect={false}
          returnKeyType="go"
          onSubmitEditing={submit}
          mono
          invalid={!!error}
          testID="join-code-input"
        />
        {error ? (
          <ErrorLine message={error} />
        ) : (
          <Txt variant="s11">It's in the invite message. Capitals and spaces don't matter.</Txt>
        )}

        <Card style={styles.info}>
          <View style={styles.tip}>
            <Ionicons name="chatbubble-ellipses-outline" size={18} color={colors.tealDark} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt variant="h14">No code?</Txt>
            <Txt variant="b12" color={colors.textMuted}>
              Ask whoever made the trip to tap Copy or WhatsApp on their invite card.
            </Txt>
          </View>
        </Card>

        <Card style={styles.info}>
          <Avatars people={[{ key: 'me', name, color: avatarColors[0] }]} size={36} />
          <View style={{ flex: 1 }}>
            <Txt variant="s11">You'll join as</Txt>
            <Txt variant="h14">{name}</Txt>
          </View>
        </Card>
      </ScrollView>
      <BottomBar>
        <Button label="Join trip" onPress={submit} loading={joining} disabled={!code} testID="join-submit" />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, gap: 10, paddingBottom: BOTTOM_BAR_SPACE },
  info: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 4 },
  tip: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: colors.tealTint,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

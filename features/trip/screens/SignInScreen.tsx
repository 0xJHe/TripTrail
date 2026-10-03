import { useQueryClient } from '@tanstack/react-query';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { Avatars } from '@/components/ui/Avatars';
import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Field } from '@/components/ui/Field';
import { Txt } from '@/components/ui/Txt';
import { avatarColors, colors } from '@/lib/theme';
import { signInWithName } from '../api';
import { useDisplayName } from '../authStore';
import { ErrorLine } from '../components/ErrorLine';
import { HeroHeader } from '../components/HeroHeader';

export function SignInScreen() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const currentName = useDisplayName();
  const queryClient = useQueryClient();
  const [name, setName] = useState(currentName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = name.trim().replace(/\s+/g, ' ');
  const renaming = !!currentName;

  async function submit() {
    if (trimmed.length < 2) {
      setError('Please enter at least 2 letters.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await signInWithName(trimmed);
      queryClient.invalidateQueries();
      router.replace((next || '/home') as Href);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not sign in. Check your internet and try again.');
      setSaving(false);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <HeroHeader
        title={renaming ? 'Change your name' : 'What should we call you?'}
        subtitle="Your group sees this name. No email or password needed."
        onBack={router.canGoBack() ? () => router.back() : undefined}
      />
      <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
        <Txt variant="sec">Your name</Txt>
        <Field
          value={name}
          onChangeText={(t) => {
            setName(t);
            setError(null);
          }}
          placeholder="e.g. Aisha"
          autoFocus
          autoCapitalize="words"
          autoComplete="name"
          maxLength={24}
          returnKeyType="done"
          onSubmitEditing={submit}
          invalid={!!error}
          style={{ fontSize: 15 }}
          testID="name-input"
        />
        {error ? <ErrorLine message={error} /> : null}

        <Card style={styles.preview}>
          <Avatars people={[{ key: 'me', name: trimmed || '?', color: avatarColors[0], muted: !trimmed }]} size={44} />
          <View style={{ flex: 1 }}>
            <Txt variant="s11">This is how your group sees you</Txt>
            <Txt variant="h15" color={trimmed ? colors.text : colors.textMuted}>
              {trimmed || 'Your name'}
            </Txt>
          </View>
        </Card>
      </ScrollView>
      <BottomBar>
        <Button
          label={renaming ? 'Save name' : 'Continue'}
          onPress={submit}
          loading={saving}
          disabled={!trimmed}
          testID="sign-in-continue"
        />
      </BottomBar>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  body: { padding: 16, paddingTop: 16, gap: 10, paddingBottom: BOTTOM_BAR_SPACE },
  preview: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
});

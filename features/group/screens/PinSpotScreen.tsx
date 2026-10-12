import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { BottomBar, BOTTOM_BAR_SPACE } from '@/components/ui/BottomBar';
import { Button } from '@/components/ui/Button';
import { Field } from '@/components/ui/Field';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { ErrorLine } from '@/features/trip/components/ErrorLine';
import { colors } from '@/lib/theme';
import { PhotoViewer } from '../components/PhotoViewer';
import { KindPicker, PhotoField, PinHere } from '../components/PinFormParts';
import { PinMiniMap } from '../components/PinMiniMap';
import { PinRow } from '../components/PinRow';
import { useDeletePin } from '../hooks/useDeletePin';
import { usePinSpot } from '../hooks/usePinSpot';
import { canDeletePin, DEFAULT_PIN_NAME, dropLabel, pinDistance, pinTitle } from '../pins';

const NAME_HINT = { spot: 'e.g. Cendol stall', vehicle: 'e.g. Car park level 2' } as const;

/** Pin spot (prototype screen 13): pin a spot or the car here, see today's pins, add one to the plan. */
export function PinSpotScreen() {
  const p = usePinSpot();
  const { form } = p;
  const removal = useDeletePin(p.tripId, p.clearDropped);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const photoPin = p.pins.find((pin) => pin.id === photoId) ?? null;
  const place = p.trip?.destination ?? p.trip?.name ?? '';
  const subtitle = [p.nearStop?.name, place].filter(Boolean).join(' · ');

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <NavyHeader title="📍 Pin spot" subtitle={subtitle || undefined} onBack={() => router.back()} />
      {!p.tripId ? (
        <View style={styles.center}>
          <Txt variant="b13">Open a trip first to pin a spot.</Txt>
        </View>
      ) : (
        <>
          <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
            <PinMiniMap here={p.here} label={dropLabel(form.type, form.name)} pins={p.pins} />
            <PinHere here={p.here} near={p.nearStop?.name ?? null} />

            <Txt variant="sec">What is it?</Txt>
            <KindPicker value={form.type} onChange={form.setType} />
            <Field
              prefix="Name"
              value={form.name}
              onChangeText={form.setName}
              placeholder={NAME_HINT[form.type]}
              maxLength={80}
              returnKeyType="done"
              accessibilityLabel={`Name, optional. Saved as ${DEFAULT_PIN_NAME[form.type]} if empty`}
            />
            <PhotoField photo={form.photo} onPick={form.pickPhoto} onRemove={() => form.setPhoto(null)} />

            {p.dropped ? (
              <View style={styles.row} accessibilityRole="alert">
                <Ionicons name="checkmark-circle" size={16} color={colors.green} />
                <Txt variant="b12" weight="semibold" color={colors.green} style={{ flex: 1 }}>
                  Pinned "{p.dropped}". Everyone in the trip can see it.
                </Txt>
              </View>
            ) : null}
            {p.error ? <ErrorLine message={p.error} /> : null}
            {removal.error ? <ErrorLine message={removal.error} /> : null}

            <Txt variant="lbl" style={{ marginTop: 6 }}>
              Pinned so far today
            </Txt>
            {p.pinsLoading ? <ActivityIndicator color={colors.teal} /> : null}
            {!p.pinsLoading && p.pins.length === 0 ? (
              <Txt variant="s11">Nothing pinned yet today. Pin a food stall, a viewpoint or where you parked.</Txt>
            ) : null}
            {p.pins.map((pin) => (
              <PinRow
                key={pin.id}
                pin={pin}
                by={p.memberName(pin.member_id)}
                distance={pinDistance(pin, p.here)}
                onAdd={p.planDay != null ? () => p.addToPlan(pin) : null}
                added={p.inPlan(pin)}
                onPhoto={() => setPhotoId(pin.id)}
                onDelete={canDeletePin(pin, p.meId) ? () => removal.ask(pin) : null}
                deleting={removal.deleting === pin.id}
              />
            ))}
          </ScrollView>
          <BottomBar>
            <Button label="📍 Drop pin here" onPress={p.drop} loading={p.dropping} disabled={!p.canPin} testID="drop-pin" />
          </BottomBar>
          <PhotoViewer
            uri={photoPin?.photoLink ?? null}
            title={photoPin ? pinTitle(photoPin) : ''}
            onClose={() => setPhotoId(null)}
          />
        </>
      )}
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  body: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: BOTTOM_BAR_SPACE + 16, gap: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});

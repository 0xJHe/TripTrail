import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type Region } from 'react-native-maps';

import { Button } from '@/components/ui/Button';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { colors } from '@/lib/theme';
import { BackgroundAskCard } from '../components/BackgroundAskCard';
import { GroupAlertCard } from '../components/GroupAlertCard';
import { FarLine, MemberMarker, PinMarker, StopMarker } from '../components/MapMarkers';
import { PinSheet } from '../components/PinSheet';
import { ZoomControls } from '../components/ZoomControls';
import { useGroupMap } from '../hooks/useGroupMap';
import { pinDistance } from '../pins';

/**
 * Group map (prototype screen 11): everyone's latest position and battery, today's stops,
 * pins from Pin spot, and amber alerts when someone is far from the group or low on battery.
 */
export function GroupMapScreen() {
  const g = useGroupMap();
  const map = useRef<MapView>(null);
  const shown = useRef<Region | null>(null);
  const centred = useRef<string | null>(null);
  const [pinId, setPinId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const place = g.trip?.destination ?? g.trip?.name ?? '';
  const meAt = g.members.find((m) => m.isMe) ?? null;
  const selected = g.pins.find((p) => p.id === pinId) ?? null;
  const farIds = new Set(g.far.map((f) => f.member.id));
  const time = g.time.getTime();

  // Centre on the group when the map first has something to show, and when who is on it changes.
  const { region, regionKey } = g;
  useEffect(() => {
    if (!ready || !region || centred.current === regionKey) return;
    centred.current = regionKey;
    map.current?.animateToRegion(region, 400);
  }, [ready, region, regionKey]);

  const centre = () => {
    if (g.region) map.current?.animateToRegion(g.region, 300);
  };
  const zoom = (dir: 1 | -1) => {
    const r = shown.current ?? g.region;
    if (!r) return;
    const f = dir === 1 ? 0.5 : 2;
    map.current?.animateToRegion({ ...r, latitudeDelta: r.latitudeDelta * f, longitudeDelta: r.longitudeDelta * f }, 250);
  };

  if (!g.tripId) {
    return (
      <Frame subtitle={undefined}>
        <View style={styles.center}>
          <Txt variant="b13" color={colors.textMuted}>
            Open a trip to see your group on the map.
          </Txt>
        </View>
      </Frame>
    );
  }

  return (
    <Frame subtitle={place || undefined}>
      <View style={styles.mapBox}>
        <MapView
          ref={map}
          provider={PROVIDER_GOOGLE}
          style={StyleSheet.absoluteFill}
          initialRegion={g.region ?? undefined}
          onMapReady={() => setReady(true)}
          onRegionChangeComplete={(r) => {
            shown.current = r;
          }}
          onPress={(e) => {
            if (e.nativeEvent.action !== 'marker-press') setPinId(null);
          }}
          toolbarEnabled={false}
          showsCompass={false}
          moveOnMarkerPress={false}
          showsPointsOfInterests={false}>
          {g.dayStops.map((s, i) => (
            <StopMarker key={s.id} stop={s} number={i + 1} />
          ))}
          {g.centre ? g.far.map((f) => <FarLine key={`far-${f.member.id}`} far={f} centre={g.centre!} />) : null}
          {g.pins.map((p) => (
            <PinMarker key={p.id} pin={p} selected={p.id === pinId} onPress={() => setPinId(p.id)} />
          ))}
          {g.members.map((m) => (
            <MemberMarker key={m.id} member={m} far={farIds.has(m.id)} time={time} />
          ))}
        </MapView>
        {g.loading ? <ActivityIndicator style={styles.loading} color={colors.teal} /> : null}
        <ZoomControls onCentre={centre} onZoom={zoom} />
      </View>

      <View style={styles.panel}>
        <BackgroundAskCard />
        {selected ? (
          <PinSheet
            pin={selected}
            by={g.memberName(selected.member_id)}
            distance={pinDistance(selected, meAt)}
            onClose={() => setPinId(null)}
          />
        ) : (
          <GroupAlertCard
            far={g.far}
            low={g.low}
            sharingCount={g.members.length}
            groupSize={g.groupSize}
            notice={g.notice}
            onAllow={g.allowLocation}
          />
        )}
        <Button label="📍 Pin spot" onPress={() => router.push('/pin')} />
      </View>
    </Frame>
  );
}

function Frame({ subtitle, children }: { subtitle: string | undefined; children: ReactNode }) {
  return (
    <View style={styles.screen}>
      <NavyHeader title="Group map" subtitle={subtitle} right={<SettingsButton />} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  mapBox: { flex: 1, backgroundColor: colors.backdrop },
  loading: { position: 'absolute', top: 16, alignSelf: 'center' },
  panel: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 14, gap: 10, backgroundColor: colors.background },
});

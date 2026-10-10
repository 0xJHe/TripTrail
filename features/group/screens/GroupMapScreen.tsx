import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type EdgePadding, type MapStyleElement, type Region } from 'react-native-maps';

import { Button } from '@/components/ui/Button';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { colors } from '@/lib/theme';
import { BackgroundAskCard } from '../components/BackgroundAskCard';
import { GroupAlertCard } from '../components/GroupAlertCard';
import { FarLine, MemberMarker, PinMarker, StopMarker } from '../components/MapMarkers';
import { PinSheet } from '../components/PinSheet';
import { PlacesToggle } from '../components/PlacesToggle';
import { ZoomControls } from '../components/ZoomControls';
import { useGroupMap } from '../hooks/useGroupMap';
import { MIN_DELTA } from '../groupMap';
import { useMapPrefs } from '../mapPrefs';
import { GROUP_MAP_STYLE } from '../mapStyle';
import { pinDistance } from '../pins';

/** Room around the fitted area (dp): labels under the circles, the zoom buttons on the right. */
const FIT_PADDING: EdgePadding = { top: 56, right: 72, bottom: 56, left: 48 };
/** Google's default style (places and businesses shown). */
const NO_STYLE: MapStyleElement[] = [];

/**
 * Group map (prototype screen 11): everyone's latest position and battery, today's stops,
 * pins from Pin spot, and amber alerts when someone is far from the group or low on battery.
 */
export function GroupMapScreen() {
  const g = useGroupMap();
  const map = useRef<MapView>(null);
  const shown = useRef<Region | null>(null);
  const fitted = useRef<string | null>(null);
  const [pinId, setPinId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const showPlaces = useMapPrefs((s) => s.showPlaces);
  const setShowPlaces = useMapPrefs((s) => s.setShowPlaces);
  const place = g.trip?.destination ?? g.trip?.name ?? '';
  const meAt = g.members.find((m) => m.isMe) ?? null;
  const selected = g.pins.find((p) => p.id === pinId) ?? null;
  const farIds = new Set(g.far.map((f) => f.member.id));
  const time = g.time.getTime();

  /** Fit everyone (the far member too) and the next stop on screen, with room for labels and buttons. */
  const fit = () => {
    const pts = g.fitPoints;
    if (!map.current || !g.region || pts.length === 0) return;
    // All in one spot: fitting would zoom right in, so show the minimum area around them.
    const tiny = g.region.latitudeDelta <= MIN_DELTA && g.region.longitudeDelta <= MIN_DELTA;
    if (pts.length === 1 || tiny) map.current.animateToRegion(g.region, 400);
    else map.current.fitToCoordinates(pts.map((p) => ({ latitude: p.lat, longitude: p.lng })), { edgePadding: FIT_PADDING, animated: true });
  };

  // On open, and when someone wanders off / comes back, joins, or the next stop changes.
  const { fitKey } = g;
  const hasRegion = g.region != null;
  const fitRef = useRef(fit);
  fitRef.current = fit;
  useEffect(() => {
    if (!ready || !hasRegion || fitted.current === fitKey) return;
    fitted.current = fitKey;
    fitRef.current();
  }, [ready, hasRegion, fitKey]);

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
          showsPointsOfInterests={false}
          customMapStyle={showPlaces ? NO_STYLE : GROUP_MAP_STYLE}
          userInterfaceStyle="light">
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
        <PlacesToggle on={showPlaces} onChange={setShowPlaces} />
        <ZoomControls onCentre={fit} onZoom={zoom} />
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

import { router } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, View } from 'react-native';
import MapView, { PROVIDER_GOOGLE, type EdgePadding, type Region } from 'react-native-maps';

import { Button } from '@/components/ui/Button';
import { NavyHeader } from '@/components/ui/NavyHeader';
import { Txt } from '@/components/ui/Txt';
import { SettingsButton } from '@/features/demo/components/SettingsButton';
import { colors } from '@/lib/theme';
import { BackgroundAskCard } from '../components/BackgroundAskCard';
import { clockOf } from '@/features/planning/stops';
import { GroupAlertCard } from '../components/GroupAlertCard';
import { FarLine, MeetMarker, MemberMarker, PinMarker, StopMarker } from '../components/MapMarkers';
import { MeetPickCard } from '../components/MeetPickCard';
import { MeetPointCard } from '../components/MeetPointCard';
import { PhotoViewer } from '../components/PhotoViewer';
import { PinSheet } from '../components/PinSheet';
import { SplitBanner } from '../components/SplitBanner';
import { ZoomControls } from '../components/ZoomControls';
import { useDeletePin } from '../hooks/useDeletePin';
import { useGroupMap } from '../hooks/useGroupMap';
import { useMeetPick } from '../hooks/useMeetPick';
import { MIN_DELTA } from '../groupMap';
import { saveErrorText } from '../meetPoint';
import { canDeletePin, pinDistance, pinTitle } from '../pins';

/** Room around the fitted area (dp): labels under the circles, the zoom buttons on the right. */
const FIT_PADDING: EdgePadding = { top: 48, right: 72, bottom: 56, left: 48 };

/**
 * Group map (prototype screen 11): everyone's latest position and battery, today's stops,
 * pins from Pin spot, and amber alerts when someone is far from the group or low on battery.
 * Set meet point (tap the map or pick a stop / pin) and Split & rejoin (screen 12) from the card,
 * only while someone is far from the group; once one is chosen, only its card shows until it ends.
 */
export function GroupMapScreen() {
  const g = useGroupMap();
  const map = useRef<MapView>(null);
  const shown = useRef<Region | null>(null);
  const fitted = useRef<string | null>(null);
  const [pinId, setPinId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [closedMeet, setClosedMeet] = useState<string | null>(null);
  const [clearError, setClearError] = useState<string | null>(null);
  const [photoId, setPhotoId] = useState<string | null>(null);
  const removal = useDeletePin(g.tripId, (p) => setPinId((id) => (id === p.id ? null : id)));
  const pick = useMeetPick(g.dayStops, g.pins, g.gather);
  const { meet, split } = g.gather;
  const showMeet = meet && !(meet.state === 'together' && closedMeet === meet.row.id) ? meet : null;
  // Once the group has chosen a meet point or a split, only its card shows until it ends.
  const chosen = meet?.state === 'active' || split?.state === 'active';
  const place = g.trip?.destination ?? g.trip?.name ?? '';
  const meAt = g.members.find((m) => m.isMe) ?? null;
  const selected = g.pins.find((p) => p.id === pinId) ?? null;
  const photoPin = g.pins.find((p) => p.id === photoId) ?? null;
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
            if (e.nativeEvent.action === 'marker-press') return;
            const { latitude, longitude } = e.nativeEvent.coordinate;
            if (pick.picking) pick.tapMap({ lat: latitude, lng: longitude });
            else setPinId(null);
          }}
          toolbarEnabled={false}
          showsCompass={false}
          moveOnMarkerPress={false}
          userInterfaceStyle="light">
          {g.dayStops.map((s, i) => (
            <StopMarker key={s.id} stop={s} number={i + 1} onPress={pick.picking ? () => pick.pickStop(s) : undefined} />
          ))}
          {g.centre ? g.far.map((f) => <FarLine key={`far-${f.member.id}`} far={f} centre={g.centre!} />) : null}
          {g.pins.map((p) => (
            <PinMarker
              key={p.id}
              pin={p}
              selected={pick.picking ? pick.draft?.key === p.id : p.id === pinId}
              onPress={() => (pick.picking ? pick.pickPin(p) : setPinId(p.id))}
            />
          ))}
          {split?.state === 'active' ? (
            <MeetMarker point={split.row} label={`Rejoin${split.row.rejoin_at ? ` · ${clockOf(split.row.rejoin_at)}` : ''}`} />
          ) : null}
          {pick.picking && pick.draft ? <MeetMarker point={pick.draft} label="Meet here?" draft /> : null}
          {!pick.picking && meet?.state === 'active' ? <MeetMarker point={meet.row} label="Meet point" /> : null}
          {g.members.map((m) => (
            <MemberMarker key={m.id} member={m} far={farIds.has(m.id)} time={time} />
          ))}
        </MapView>
        {g.loading ? <ActivityIndicator style={styles.loading} color={colors.teal} /> : null}
        <ZoomControls onCentre={fit} onZoom={zoom} />
      </View>

      <View style={styles.panel}>
        <ScrollView style={styles.cards} contentContainerStyle={styles.cardsBody} keyboardShouldPersistTaps="handled">
          <BackgroundAskCard />
          {pick.picking ? (
            <MeetPickCard
              draft={pick.draft}
              options={pick.options}
              onPick={pick.pick}
              onConfirm={pick.confirm}
              onCancel={pick.cancel}
              saving={pick.saving}
              error={pick.error}
            />
          ) : selected ? (
            <PinSheet
              pin={selected}
              by={g.memberName(selected.member_id)}
              distance={pinDistance(selected, meAt)}
              onClose={() => setPinId(null)}
              onPhoto={() => setPhotoId(selected.id)}
              onDelete={canDeletePin(selected, g.meId) ? () => removal.ask(selected) : null}
              deleting={removal.deleting === selected.id}
              error={removal.error}
            />
          ) : (
            <>
              {chosen && g.low.length > 0 ? (
                // Low battery still shows during a meet point / split: just those lines, no far warning or buttons.
                <GroupAlertCard
                  far={[]}
                  low={g.low}
                  sharingCount={g.members.length}
                  groupSize={g.groupSize}
                  notice={g.notice}
                  onAllow={g.allowLocation}
                  onMeet={() => {}}
                  onSplit={() => {}}
                />
              ) : null}
              <SplitBanner />
              {showMeet ? (
                <MeetPointCard
                  meet={showMeet}
                  members={g.members}
                  setBy={g.memberName(showMeet.row.set_by)}
                  onClear={() => {
                    setClearError(null);
                    g.gather.end(showMeet.row.id, 'cleared').catch((e) => setClearError(saveErrorText(e, 'clear the meet point')));
                  }}
                  error={clearError}
                  onClose={() => setClosedMeet(showMeet.row.id)}
                />
              ) : null}
              {chosen ? null : (
                <GroupAlertCard
                  far={g.far}
                  low={g.low}
                  sharingCount={g.members.length}
                  groupSize={g.groupSize}
                  notice={g.notice}
                  onAllow={g.allowLocation}
                  onMeet={() => {
                    setPinId(null);
                    pick.start();
                  }}
                  onSplit={() => router.push('/split')}
                />
              )}
            </>
          )}
        </ScrollView>
        {pick.picking ? null : <Button label="📍 Pin spot" onPress={() => router.push('/pin')} />}
      </View>
      <PhotoViewer
        uri={photoPin?.photoLink ?? null}
        title={photoPin ? pinTitle(photoPin) : ''}
        onClose={() => setPhotoId(null)}
      />
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
  cards: { maxHeight: 340, flexGrow: 0, marginHorizontal: -16 },
  cardsBody: { gap: 10, paddingHorizontal: 16, paddingBottom: 2 },
});

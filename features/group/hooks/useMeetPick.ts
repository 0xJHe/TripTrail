import { useMemo, useState } from 'react';

import type { Stop } from '@/features/planning/types';
import type { LatLng } from '@/lib/distance';
import type { MeetSpot } from '../components/MeetPickCard';
import { nameForSpot } from '../meetPoint';
import { pinTitle } from '../pins';
import type { Pin } from '../types';
import type { useMeetPoints } from './useMeetPoints';

/** Set meet point: tap the map (or pick a stop / pin), then confirm; saved for the whole group. */
export function useMeetPick(dayStops: Stop[], pins: Pin[], gather: ReturnType<typeof useMeetPoints>) {
  const [picking, setPicking] = useState(false);
  const [draft, setDraft] = useState<MeetSpot | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = useMemo(
    () => [
      ...dayStops
        .filter((s) => s.lat != null && s.lng != null)
        .map((s) => ({ key: s.id, name: s.name, lat: s.lat!, lng: s.lng! })),
      ...pins.map((p) => ({ key: p.id, name: pinTitle(p), lat: p.lat, lng: p.lng })),
    ],
    [dayStops, pins],
  );

  const start = () => {
    setPicking(true);
    setDraft(null);
    setError(null);
  };
  const cancel = () => {
    setPicking(false);
    setDraft(null);
  };
  /** A tap on the map while picking: the spot, named after a stop or pin it's on. */
  const tapMap = (p: LatLng) => setDraft({ ...p, name: nameForSpot(p, dayStops, pins), key: null });
  const pick = (spot: MeetSpot) => setDraft(spot);
  const pickStop = (s: Stop) => s.lat != null && s.lng != null && setDraft({ lat: s.lat, lng: s.lng, name: s.name, key: s.id });
  const pickPin = (p: Pin) => setDraft({ lat: p.lat, lng: p.lng, name: pinTitle(p), key: p.id });

  const confirm = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      const stopId = dayStops.some((s) => s.id === draft.key) ? draft.key : null;
      await gather.add({ kind: 'meet', name: draft.name, lat: draft.lat, lng: draft.lng, stop_id: stopId, rejoin_at: null, group_b: [] });
      setPicking(false);
      setDraft(null);
    } catch {
      setError("Couldn't save the meet point. Check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  return { picking, draft, options, saving, error, start, cancel, tapMap, pick, pickStop, pickPin, confirm };
}

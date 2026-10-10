import { useMemo, useState } from 'react';

import { useCurrentTrip } from '@/features/trip/store';
import { farMembers } from '../groupMap';
import { groupAPlan, pickRejoin, saveErrorText } from '../meetPoint';
import { useMapMembers } from './useMapMembers';
import { useMeetPoints } from './useMeetPoints';

/**
 * Split & rejoin (prototype screen 12): who goes in group B (the far member(s) by default),
 * where and when everyone meets again (simple rules, free estimate), and Start split.
 */
export function useSplitPlan() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const { day, members, people, me } = useMapMembers(tripId);
  const { trip, dayStops, time } = day;
  const gather = useMeetPoints(tripId, me?.id ?? null);
  const far = useMemo(() => farMembers(members), [members]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Until someone changes it: the far member(s).
  const groupB = picked ?? far.map((f) => f.member.id);
  const toggle = (id: string) => setPicked(groupB.includes(id) ? groupB.filter((x) => x !== id) : [...groupB, id]);
  const b = people.filter((p) => groupB.includes(p.id));
  const a = people.filter((p) => !groupB.includes(p.id));

  const t = time.getTime();
  const bPositions = useMemo(() => members.filter((m) => groupB.includes(m.id)), [members, groupB]);
  const rejoin = useMemo(() => pickRejoin(dayStops, bPositions, t), [dayStops, bPositions, t]);
  const aPlan = rejoin ? groupAPlan(dayStops, rejoin.stop.id) : [];
  const canStart = !!rejoin && b.length > 0 && a.length > 0 && gather.split?.state !== 'active';

  const start = async (): Promise<boolean> => {
    if (!rejoin || !canStart) return false;
    setSaving(true);
    setError(null);
    try {
      await gather.add({
        kind: 'split',
        name: rejoin.stop.name,
        lat: rejoin.stop.lat,
        lng: rejoin.stop.lng,
        stop_id: rejoin.stop.id,
        rejoin_at: new Date(rejoin.at).toISOString(),
        group_b: b.map((p) => ({ id: p.id, name: p.name })),
      });
      return true;
    } catch (e) {
      setError(saveErrorText(e, 'start the split'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { tripId, trip, far, people, groupB, toggle, a, b, rejoin, aPlan, canStart, start, saving, error, active: gather.split?.state === 'active' };
}

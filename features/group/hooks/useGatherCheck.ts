import { useEffect, useRef } from 'react';

import { useCurrentTrip } from '@/features/trip/store';
import { bothGroupsHere, everyoneHere } from '../meetPoint';
import { useMapMembers } from './useMapMembers';
import { useMeetPoints } from './useMeetPoints';

/**
 * Ends the meet point when everyone is within 50 m of it ("Everyone's here"), and the split
 * when both groups are within 50 m of the rejoin point ("Back together"). Runs in the tabs
 * layout, whichever tab is showing; any phone that sees it first ends it for the group.
 */
export function useGatherCheck() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const { members, me } = useMapMembers(tripId);
  const { meet, split, end } = useMeetPoints(tripId, me?.id ?? null);
  const tried = useRef(new Set<string>());
  const endRef = useRef(end);
  endRef.current = end;

  useEffect(() => {
    for (const g of [meet, split]) {
      if (!g || g.state !== 'active') continue;
      const r = g.row;
      const here =
        r.kind === 'split'
          ? bothGroupsHere(members, r, r.group_b.map((m) => m.id))
          : everyoneHere(members, r);
      // ended_at in the key: after a demo clock jump back the same row can end again.
      const key = `${r.id}|${r.ended_at ?? ''}`;
      if (!here || tried.current.has(key)) continue;
      tried.current.add(key);
      endRef.current(r.id, 'together').catch(() => tried.current.delete(key));
    }
  }, [meet, split, members]);
}

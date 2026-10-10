import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { clockOf } from '@/features/planning/stops';
import { useLocationAccess } from '@/features/today/permission';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import type { LatLng } from '@/lib/distance';
import { fetchPins } from '../api';
import { cameraPoints, farMembers, groupCentre, lowBatteryMembers, nextStop, regionAround } from '../groupMap';
import { pinsToday } from '../pins';
import { useMapMembers } from './useMapMembers';
import { useMeetPoints } from './useMeetPoints';
import { pinKeys } from './usePinSpot';

/** What the bottom card says when the map isn't showing the group. */
export type MapNotice =
  | { kind: 'live' }
  | { kind: 'not-trip-day' }
  | { kind: 'later'; at: string; firstStop: string }
  | { kind: 'over' }
  | { kind: 'no-permission'; blocked: boolean };

/** Everything the Group map needs (prototype screen 11): members, alerts, pins, the day's stops, meet point, split. */
export function useGroupMap() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const { day, members: mapMembers, people, me, memberList, demo, location, closures, loading } = useMapMembers(tripId);
  const { trip, allStops, dayStops, window, sharing, time } = day;
  const permission = useLocationAccess((s) => s.permission);
  const allowLocation = useLocationAccess((s) => s.allow);
  const gather = useMeetPoints(tripId, me?.id ?? null);

  const pins = useQuery({ queryKey: pinKeys.pins(tripId ?? ''), queryFn: () => fetchPins(tripId!), enabled: !!tripId });
  useTripRealtime(tripId, ['pins']);

  const far = useMemo(() => farMembers(mapMembers), [mapMembers]);
  const low = useMemo(() => lowBatteryMembers(mapMembers), [mapMembers]);
  const centre = useMemo(() => groupCentre(mapMembers), [mapMembers]);

  // The camera fits every member (the far one too), the next stop and the meet / rejoin
  // point; with nobody on the map, the day's stops (or the trip's). region = the same area,
  // for the first frame.
  const fitStops = dayStops.length > 0 ? dayStops : allStops;
  const meetRow = gather.meet?.state === 'active' ? gather.meet.row : null;
  const splitRow = gather.split?.state === 'active' ? gather.split.row : null;
  const fitPoints: LatLng[] = useMemo(() => {
    const extra = [meetRow, splitRow].filter((r) => r != null).map((r) => ({ lat: r.lat, lng: r.lng }));
    return [...cameraPoints(mapMembers, fitStops), ...(mapMembers.length > 0 ? extra : [])];
  }, [mapMembers, fitStops, meetRow, splitRow]);
  const focus = centre ?? fitPoints[0] ?? null;
  const region = focus ? regionAround(focus, fitPoints) : null;
  // Fit again when who is on the map, who is far away, the next stop or the meet point changes
  // (not on every small move).
  const fitKey = [
    tripId,
    mapMembers.map((m) => m.id).join(','),
    far.map((f) => f.member.id).join(','),
    nextStop(fitStops)?.id ?? '',
    fitPoints.length > 0,
    meetRow?.id ?? '',
    splitRow?.id ?? '',
  ].join('|');

  let notice: MapNotice = { kind: 'live' };
  if (!demo) {
    const first = dayStops[0];
    if (dayStops.length === 0 || !window) notice = { kind: 'not-trip-day' };
    else if (time.getTime() < window.from) notice = { kind: 'later', at: clockOf(new Date(window.from).toISOString()), firstStop: first.name };
    else if (!sharing) notice = { kind: 'over' };
    else if (permission === 'ask' || permission === 'blocked') notice = { kind: 'no-permission', blocked: permission === 'blocked' };
  }

  const memberName = (id: string | null) =>
    id === me?.id ? 'You' : (people.find((p) => p.id === id)?.name ?? memberList.find((m) => m.id === id)?.display_name ?? 'Someone');

  return {
    tripId,
    trip,
    loading,
    time,
    members: mapMembers,
    groupSize: demo && location ? location.members.length : memberList.length,
    far,
    low,
    centre,
    region,
    fitPoints,
    fitKey,
    dayStops,
    pins: pinsToday(pins.data ?? [], time),
    meId: me?.id ?? null,
    memberName,
    notice,
    allowLocation,
    gather,
    /** I closed today (Done for today): the banner with Reopen today. */
    closedDay: closures.mine ? { reopen: closures.reopen, saving: closures.saving, error: closures.error } : null,
  };
}

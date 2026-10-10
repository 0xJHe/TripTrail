import { useQuery } from '@tanstack/react-query';
import * as Battery from 'expo-battery';
import { useMemo } from 'react';

import { clockOf } from '@/features/planning/stops';
import { useLocationAccess } from '@/features/today/permission';
import { useMembers, useMyMember } from '@/features/trip/hooks/useTrip';
import { useTripRealtime } from '@/features/trip/hooks/useTripRealtime';
import { useCurrentTrip } from '@/features/trip/store';
import { useGroupLocation } from '@/lib/location';
import type { LatLng } from '@/lib/distance';
import { fetchPins } from '../api';
import {
  cameraPoints,
  farMembers,
  groupCentre,
  lowBatteryMembers,
  nextStop,
  regionAround,
  type MapMember,
} from '../groupMap';
import { pinsToday } from '../pins';
import { useGroupPositions } from './useGroupPositions';
import { pinKeys } from './usePinSpot';
import { useTripDay } from './useTripDay';

/** What the bottom card says when the map isn't showing the group. */
export type MapNotice =
  | { kind: 'live' }
  | { kind: 'not-trip-day' }
  | { kind: 'later'; at: string; firstStop: string }
  | { kind: 'over' }
  | { kind: 'no-permission'; blocked: boolean };

/** Everything the Group map needs (prototype screen 11): members, alerts, pins, the day's stops. */
export function useGroupMap() {
  const tripId = useCurrentTrip((s) => s.currentTripId) ?? undefined;
  const { trip, allStops, dayStops, window, sharing, time } = useTripDay(tripId);
  const members = useMembers(tripId);
  const me = useMyMember(tripId);
  const location = useGroupLocation();
  const permission = useLocationAccess((s) => s.permission);
  const allowLocation = useLocationAccess((s) => s.allow);
  const level = Battery.useBatteryLevel();
  const demo = location?.source === 'demo';

  const pins = useQuery({ queryKey: pinKeys.pins(tripId ?? ''), queryFn: () => fetchPins(tripId!), enabled: !!tripId });
  useTripRealtime(tripId, ['pins']);

  const memberList = useMemo(() => members.data ?? [], [members.data]);
  const memberIds = useMemo(() => memberList.map((m) => m.id), [memberList]);
  const since = !demo && sharing && window ? new Date(window.from).toISOString() : null;
  const positions = useGroupPositions(tripId, memberIds, since);

  const myBattery = level >= 0 ? Math.round(level * 100) : null;
  const mapMembers: MapMember[] = useMemo(() => {
    if (demo && location) return location.members.map((m) => ({ ...m, seenAt: location.at }));
    if (!sharing) return [];
    const others = (positions.data ?? [])
      .filter((r) => r.member_id !== me?.id)
      .map((r) => ({
        id: r.member_id,
        name: memberList.find((m) => m.id === r.member_id)?.display_name ?? 'Someone',
        isMe: false,
        lat: r.lat,
        lng: r.lng,
        battery: r.battery,
        seenAt: Date.parse(r.recorded_at),
      }));
    // This phone: the live GPS fix, else the last position it saved.
    const mine = positions.data?.find((r) => r.member_id === me?.id);
    const self: MapMember | null =
      me && location?.me
        ? { id: me.id, name: me.display_name, isMe: true, lat: location.me.lat, lng: location.me.lng, battery: myBattery, seenAt: location.at }
        : me && mine
          ? { id: me.id, name: me.display_name, isMe: true, lat: mine.lat, lng: mine.lng, battery: mine.battery, seenAt: Date.parse(mine.recorded_at) }
          : null;
    return self ? [self, ...others] : others;
  }, [demo, location, sharing, positions.data, me, memberList, myBattery]);

  const far = useMemo(() => farMembers(mapMembers), [mapMembers]);
  const low = useMemo(() => lowBatteryMembers(mapMembers), [mapMembers]);
  const centre = useMemo(() => groupCentre(mapMembers), [mapMembers]);

  // The camera fits every member (the far one too) and the next stop; with nobody on the
  // map, the day's stops (or the trip's). region = the same area, for the first frame.
  const fitStops = dayStops.length > 0 ? dayStops : allStops;
  const fitPoints: LatLng[] = useMemo(() => cameraPoints(mapMembers, fitStops), [mapMembers, fitStops]);
  const focus = centre ?? fitPoints[0] ?? null;
  const region = focus ? regionAround(focus, fitPoints) : null;
  // Fit again when who is on the map, who is far away, or the next stop changes (not on every small move).
  const fitKey = [
    tripId,
    mapMembers.map((m) => m.id).join(','),
    far.map((f) => f.member.id).join(','),
    nextStop(fitStops)?.id ?? '',
    fitPoints.length > 0,
  ].join('|');

  let notice: MapNotice = { kind: 'live' };
  if (!demo) {
    const first = dayStops[0];
    if (dayStops.length === 0 || !window) notice = { kind: 'not-trip-day' };
    else if (time.getTime() < window.from) notice = { kind: 'later', at: clockOf(new Date(window.from).toISOString()), firstStop: first.name };
    else if (!sharing) notice = { kind: 'over' };
    else if (permission === 'ask' || permission === 'blocked') notice = { kind: 'no-permission', blocked: permission === 'blocked' };
  }

  const memberName = (id: string) =>
    id === me?.id ? 'You' : (memberList.find((m) => m.id === id)?.display_name ?? 'Someone');

  return {
    tripId,
    trip,
    loading: members.isLoading,
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
    memberName,
    notice,
    allowLocation,
  };
}

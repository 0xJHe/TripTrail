import Constants, { ExecutionEnvironment } from 'expo-constants';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { useEffect, useState } from 'react';
import { Platform } from 'react-native';
import { create } from 'zustand';

import { useNow } from './clock';
import { isDemoMode, useDemo } from './demo';
import { centroid, haversineMeters, offsetMeters, type LatLng } from './distance';

/**
 * Where the group is. Live-trip features must use getGroupLocation() / useGroupLocation(),
 * never expo-location directly: in Demo mode these replay a fake route instead of GPS.
 */

export interface MemberLocation extends LatLng {
  id: string;
  name: string;
  isMe: boolean;
  /** Battery %, null when unknown (real GPS mode doesn't read it yet). */
  battery: number | null;
}

export interface GroupLocation {
  /** Time of the reading (ms). */
  at: number;
  source: 'gps' | 'demo';
  /** This phone's position. */
  me: MemberLocation | null;
  /** Everyone we have a position for (real mode: just this phone, for now). */
  members: MemberLocation[];
  /** Centre of the group. */
  center: LatLng;
  /** Demo only: rain at the group's position within the next 60 min. null = ask rain-check. */
  rainSoon: boolean | null;
}

// ---------- Demo route ----------

export type DemoEventKind = 'start' | 'arrive' | 'leave' | 'travel' | 'late' | 'early' | 'rain' | 'far' | 'rejoin';

export interface DemoEvent {
  at: number;
  kind: DemoEventKind;
  title: string;
  stopId?: string;
  memberId?: string;
}

/** One member's path: offset from the group position (metres) and battery, as keyframes. */
export interface DemoMemberTrack {
  id: string;
  name: string;
  isMe: boolean;
  /** Made up for the demo (the trip has too few members). */
  fake: boolean;
  offsets: { t: number; east: number; north: number }[];
  battery: { t: number; value: number }[];
}

export interface DemoRain {
  /** Rain falls inside this circle between startsAt and endsAt. */
  lat: number;
  lng: number;
  radiusM: number;
  startsAt: number;
  endsAt: number;
}

/** A fake day, built from a trip's Day plan (features/demo/route.ts). */
export interface DemoRoute {
  tripId: string;
  day: number;
  startsAt: number;
  endsAt: number;
  /** Where the group is, as keyframes; positions in between are interpolated. */
  group: { t: number; lat: number; lng: number }[];
  members: DemoMemberTrack[];
  rain: DemoRain[];
  events: DemoEvent[];
  /** Start of the next day's replay, if the trip has one. */
  nextDayStartsAt: number | null;
}

const RAIN_LOOKAHEAD_MS = 60 * 60_000;

/** Linear value at t from keyframes sorted by t (clamped at the ends). */
function lerp<K extends string>(frames: ({ t: number } & Record<K, number>)[], t: number, key: K): number {
  if (t <= frames[0].t) return frames[0][key];
  for (let i = 1; i < frames.length; i++) {
    const a = frames[i - 1];
    const b = frames[i];
    if (t <= b.t) {
      const f = b.t === a.t ? 1 : (t - a.t) / (b.t - a.t);
      return a[key] + (b[key] - a[key]) * f;
    }
  }
  return frames[frames.length - 1][key];
}

/** Rain at `p` some time in [t, t + 60 min]. */
export function rainSoonAt(route: DemoRoute, p: LatLng, t: number): boolean {
  return route.rain.some(
    (r) => r.startsAt <= t + RAIN_LOOKAHEAD_MS && r.endsAt >= t && haversineMeters(p, r) <= r.radiusM,
  );
}

/** Everyone's position at time t on a demo route. */
export function sampleRoute(route: DemoRoute, t: number): GroupLocation {
  const base = { lat: lerp(route.group, t, 'lat'), lng: lerp(route.group, t, 'lng') };
  const members: MemberLocation[] = route.members.map((m) => {
    const p = offsetMeters(base, lerp(m.offsets, t, 'east'), lerp(m.offsets, t, 'north'));
    return { id: m.id, name: m.name, isMe: m.isMe, ...p, battery: Math.round(lerp(m.battery, t, 'value')) };
  });
  const center = centroid(members) ?? base;
  return {
    at: t,
    source: 'demo',
    me: members.find((m) => m.isMe) ?? null,
    members,
    center,
    rainSoon: rainSoonAt(route, center, t),
  };
}

/** Next demo event strictly after t, and the last one at or before t. */
export function eventsAround(route: DemoRoute, t: number): { last: DemoEvent | null; next: DemoEvent | null } {
  let last: DemoEvent | null = null;
  for (const e of route.events) {
    if (e.at > t) return { last, next: e };
    last = e;
  }
  return { last, next: null };
}

/** The demo route being replayed (set by features/demo when Demo mode is on). */
export const useDemoRoute = create<{ route: DemoRoute | null }>(() => ({ route: null }));
export const setDemoRoute = (route: DemoRoute | null) => useDemoRoute.setState({ route });

// ---------- Real GPS (foreground only for now) ----------

function fromGps(pos: Location.LocationObject): GroupLocation {
  const me: MemberLocation = {
    id: 'me',
    name: 'You',
    isMe: true,
    lat: pos.coords.latitude,
    lng: pos.coords.longitude,
    battery: null,
  };
  return { at: pos.timestamp, source: 'gps', me, members: [me], center: { lat: me.lat, lng: me.lng }, rainSoon: null };
}

async function gpsAllowed(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/** granted; ask = not asked yet (or can ask again); blocked = denied for good, only Settings can turn it on. */
export type LocationPermission = 'granted' | 'ask' | 'blocked';

const toPermission = (p: Location.LocationPermissionResponse): LocationPermission =>
  p.status === 'granted' ? 'granted' : p.canAskAgain ? 'ask' : 'blocked';

/** Whether this phone may read GPS, without showing the system prompt. Always granted in Demo mode. */
export async function locationPermission(): Promise<LocationPermission> {
  if (isDemoMode()) return 'granted';
  try {
    return toPermission(await Location.getForegroundPermissionsAsync());
  } catch {
    return 'ask';
  }
}

/** Show the system location prompt (call after explaining why). */
export async function requestLocationPermission(): Promise<LocationPermission> {
  if (isDemoMode()) return 'granted';
  try {
    return toPermission(await Location.requestForegroundPermissionsAsync());
  } catch {
    return 'ask';
  }
}

/**
 * The group's current location, once. Demo mode: the fake route at now().
 * Real mode: this phone's GPS. null if there is no route / no permission / no fix.
 */
export async function getGroupLocation(): Promise<GroupLocation | null> {
  if (isDemoMode()) {
    const route = useDemoRoute.getState().route;
    const { fakeTime } = useDemo.getState();
    return route ? sampleRoute(route, fakeTime ?? route.startsAt) : null;
  }
  try {
    if (!(await gpsAllowed())) return null;
    return fromGps(await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
  } catch {
    return null;
  }
}

/** The group's location as a hook: follows the fake clock in Demo mode, GPS updates otherwise. */
export function useGroupLocation(): GroupLocation | null {
  const demo = useDemo((s) => s.enabled);
  const route = useDemoRoute((s) => s.route);
  const time = useNow();
  const gps = useGpsWatch(!demo);
  if (demo) return route ? sampleRoute(route, time.getTime()) : null;
  return gps;
}

function useGpsWatch(on: boolean): GroupLocation | null {
  const [loc, setLoc] = useState<GroupLocation | null>(null);
  useEffect(() => {
    if (!on) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;
    gpsAllowed()
      .then((ok) =>
        ok
          ? Location.watchPositionAsync(
              { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 10 },
              (pos) => setLoc(fromGps(pos)),
            )
          : null,
      )
      .then((s) => {
        if (cancelled) s?.remove();
        else sub = s;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [on]);
  return on ? loc : null;
}

/** 'demo' while Demo mode is on (positions are the fake route; never share them), else 'gps'. */
export function useLocationSource(): 'demo' | 'gps' {
  return useDemo((s) => s.enabled) ? 'demo' : 'gps';
}

// ---------- Background updates (screen off, Android) ----------

/** Task name for expo-task-manager. */
export const BACKGROUND_TASK = 'triptrail-background-location';

export interface BackgroundFix extends LatLng {
  /** Time of the fix (ms). */
  at: number;
}

let backgroundHandler: ((fix: BackgroundFix) => Promise<void>) | null = null;

/** Background updates need an Android build of the app (a development build or the APK), not Expo Go. */
export function backgroundSupported(): boolean {
  return Platform.OS === 'android' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;
}

/** What to do with each background fix (features/group/backgroundShare.ts registers it at app start). */
export function onBackgroundLocation(handler: (fix: BackgroundFix) => Promise<void>) {
  backgroundHandler = handler;
}

/** Demo mode is saved on the phone; when the app wakes up in the background it may not be loaded yet. */
async function demoModeOnceLoaded(): Promise<boolean> {
  if (!useDemo.persist.hasHydrated()) {
    await new Promise<void>((resolve) => {
      const unsub = useDemo.persist.onFinishHydration(() => {
        unsub();
        resolve();
      });
      if (useDemo.persist.hasHydrated()) {
        unsub();
        resolve();
      }
    });
  }
  return isDemoMode();
}

// Defined at load (the task can wake the app with no screen open). Skipped in Expo Go.
if (backgroundSupported()) {
  TaskManager.defineTask<{ locations?: Location.LocationObject[] }>(BACKGROUND_TASK, async ({ data, error }) => {
    if (error) return;
    const last = data?.locations?.[data.locations.length - 1];
    if (!last || !backgroundHandler) return;
    // Demo mode never shares positions.
    if (await demoModeOnceLoaded()) {
      await stopBackgroundUpdates();
      return;
    }
    await backgroundHandler({ lat: last.coords.latitude, lng: last.coords.longitude, at: last.timestamp });
  });
}

/** "Allow all the time" location, without showing a prompt. 'blocked' where it can't run (Expo Go). */
export async function backgroundLocationPermission(): Promise<LocationPermission> {
  if (!backgroundSupported()) return 'blocked';
  try {
    return toPermission(await Location.getBackgroundPermissionsAsync());
  } catch {
    return 'ask';
  }
}

/** Ask for "Allow all the time" (Android opens the app's location settings). Needs location while in use first. */
export async function requestBackgroundLocationPermission(): Promise<LocationPermission> {
  if (!backgroundSupported()) return 'blocked';
  try {
    const fg = await Location.getForegroundPermissionsAsync();
    if (fg.status !== 'granted') return toPermission(fg);
    return toPermission(await Location.requestBackgroundPermissionsAsync());
  } catch {
    return 'ask';
  }
}

/** Start background updates about every 60 s, with Android's notification. true if running. */
export async function startBackgroundUpdates(notice: { title: string; body: string; color: string }): Promise<boolean> {
  if (!backgroundSupported()) return false;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) return true;
    await Location.startLocationUpdatesAsync(BACKGROUND_TASK, {
      accuracy: Location.Accuracy.Balanced,
      timeInterval: 60_000,
      distanceInterval: 0,
      deferredUpdatesInterval: 60_000,
      pausesUpdatesAutomatically: false,
      foregroundService: {
        notificationTitle: notice.title,
        notificationBody: notice.body,
        notificationColor: notice.color,
        killServiceOnDestroy: false,
      },
    });
    return true;
  } catch {
    return false;
  }
}

export async function stopBackgroundUpdates(): Promise<void> {
  if (!backgroundSupported()) return;
  try {
    if (await Location.hasStartedLocationUpdatesAsync(BACKGROUND_TASK)) await Location.stopLocationUpdatesAsync(BACKGROUND_TASK);
  } catch {
    // not running
  }
}

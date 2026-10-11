import { recapDateLine, recapDays, recapTitle, visitedBy } from '@/features/recap/dayEnd';
import {
  curvePath,
  hoursOutMs,
  hoursText,
  kmText,
  MIN_STEP_M,
  projector,
  smoothTrail,
  stopEmoji,
  trailMeters,
  type Fix,
} from '@/features/recap/trail';
import { haversineMeters, offsetMeters } from '@/lib/distance';

const MIN = 60_000;
const HOME = { lat: 5.4141, lng: 100.3288 };
const T0 = Date.parse('2026-10-12T08:00:00+08:00');

/** Deterministic "random" numbers in [-1, 1], so the tests never flake. */
function noise(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return (s / 2147483648) * 2 - 1;
  };
}

/** A walk east at `kmh`, a fix every 45 s, with GPS jitter of up to `jitterM` metres. */
function walk(meters: number, kmh: number, jitterM: number, seed = 1): Fix[] {
  const rnd = noise(seed);
  const stepM = (kmh * 1000 * 45) / 3600;
  const n = Math.round(meters / stepM);
  return Array.from({ length: n + 1 }, (_, i) => ({
    ...offsetMeters(HOME, i * stepM + rnd() * jitterM, rnd() * jitterM),
    at: T0 + i * 45_000,
  }));
}

/** Standing still for `minutes`, a fix every 45 s, jitter up to `jitterM`. */
function standing(minutes: number, jitterM: number, seed = 7, from = T0): Fix[] {
  const rnd = noise(seed);
  return Array.from({ length: Math.round((minutes * 60) / 45) }, (_, i) => ({
    ...offsetMeters(HOME, rnd() * jitterM, rnd() * jitterM),
    at: from + i * 45_000,
  }));
}

describe('trail distance', () => {
  it('measures a clean straight walk', () => {
    const fixes = walk(2000, 5, 0);
    expect(trailMeters(smoothTrail(fixes))).toBeGreaterThan(1950);
    expect(trailMeters(smoothTrail(fixes))).toBeLessThan(2050);
  });

  it('measures a jittery walk close to the real distance', () => {
    const fixes = walk(3000, 5, 12);
    // The smoothed trail stays within 5% of the real 3 km.
    const m = trailMeters(smoothTrail(fixes));
    expect(m).toBeGreaterThan(2850);
    expect(m).toBeLessThan(3150);
  });

  it('is 0 for an empty or one-point day', () => {
    expect(trailMeters(smoothTrail([]))).toBe(0);
    expect(trailMeters(smoothTrail([{ ...HOME, at: T0 }]))).toBe(0);
  });

  it('sums a leg on top of the next', () => {
    const a = { lat: 0, lng: 0 };
    const b = { lat: 0, lng: 0.01 };
    const c = { lat: 0.01, lng: 0.01 };
    expect(trailMeters([a, b, c])).toBeCloseTo(haversineMeters(a, b) + haversineMeters(b, c), 5);
  });
});

describe('jitter smoothing', () => {
  it('turns two hours standing at a stop into (almost) no distance', () => {
    const fixes = standing(120, 15);
    expect(trailMeters(fixes)).toBeGreaterThan(2000);
    expect(trailMeters(smoothTrail(fixes))).toBeLessThan(MIN_STEP_M * 2);
  });

  it('drops a single GPS spike', () => {
    const fixes = walk(1500, 5, 5);
    const spiked = fixes.map((f, i) => (i === 10 ? { ...f, ...offsetMeters(f, 4000, 3000) } : f));
    const clean = trailMeters(smoothTrail(fixes));
    expect(trailMeters(spiked)).toBeGreaterThan(clean + 8000);
    expect(Math.abs(trailMeters(smoothTrail(spiked)) - clean)).toBeLessThan(60);
  });

  it('drops a spike at the very start', () => {
    const fixes = walk(1500, 5, 0);
    const spiked = [{ ...offsetMeters(fixes[0], 0, 9000), at: fixes[0].at - 45_000 }, ...fixes];
    expect(trailMeters(smoothTrail(spiked))).toBeLessThan(1600);
  });

  it('sorts out-of-order rows and ignores empty positions', () => {
    const fixes = walk(1000, 5, 0);
    const messy = [...fixes].reverse().concat({ lat: 0, lng: 0, at: T0 + 10 * MIN }, { lat: NaN, lng: 1, at: T0 });
    expect(trailMeters(smoothTrail(messy))).toBeCloseTo(trailMeters(smoothTrail(fixes)), 3);
  });

  it('keeps the trail in time order from start to end', () => {
    const trail = smoothTrail(walk(2000, 5, 8));
    for (let i = 1; i < trail.length; i++) expect(trail[i].at).toBeGreaterThan(trail[i - 1].at);
    expect(trail[trail.length - 1].lng).toBeGreaterThan(trail[0].lng);
  });
});

describe('hours out', () => {
  it('is first to last saved position, whatever the order', () => {
    const fixes = [
      { ...HOME, at: T0 + 13 * 60 * MIN },
      { ...HOME, at: T0 },
      { ...HOME, at: T0 + 5 * 60 * MIN },
    ];
    expect(hoursOutMs(fixes)).toBe(13 * 60 * MIN);
  });

  it('is 0 with fewer than two positions', () => {
    expect(hoursOutMs([])).toBe(0);
    expect(hoursOutMs([{ ...HOME, at: T0 }])).toBe(0);
  });

  it('reads as minutes, halves under 10 h, then whole hours', () => {
    expect(hoursText(40 * MIN)).toBe('40m');
    expect(hoursText(60 * MIN)).toBe('1h');
    expect(hoursText(6.4 * 60 * MIN)).toBe('6.5h');
    expect(hoursText(13.2 * 60 * MIN)).toBe('13h');
  });
});

describe('km text', () => {
  it('shows a decimal under 10 km and whole km above', () => {
    expect(kmText(20)).toBe('0');
    expect(kmText(3420)).toBe('3.4');
    expect(kmText(38_400)).toBe('38');
  });
});

describe('drawing', () => {
  const box = { x: 30, y: 140, w: 240, h: 240 };

  it('fits every point inside the box, north up', () => {
    const pts = [HOME, offsetMeters(HOME, 3000, 1000), offsetMeters(HOME, -500, 4000)];
    const project = projector(pts, box);
    for (const p of pts.map(project)) {
      expect(p.x).toBeGreaterThanOrEqual(box.x - 0.01);
      expect(p.x).toBeLessThanOrEqual(box.x + box.w + 0.01);
      expect(p.y).toBeGreaterThanOrEqual(box.y - 0.01);
      expect(p.y).toBeLessThanOrEqual(box.y + box.h + 0.01);
    }
    expect(project(pts[2]).y).toBeLessThan(project(pts[0]).y);
  });

  it('puts a single spot in the middle', () => {
    expect(projector([HOME], box)(HOME)).toEqual({ x: 150, y: 260 });
  });

  it('draws a smooth path through the points', () => {
    expect(curvePath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 20, y: 10 }])).toMatch(/^M0 0 C.* C.* 20 10$/);
    expect(curvePath([])).toBe('');
  });
});

describe('stop emoji', () => {
  it('follows the category, with a few sights told apart by name', () => {
    expect(stopEmoji({ name: 'Hotel Penaga', category: 'hotel' })).toBe('🏨');
    expect(stopEmoji({ name: 'Chulia Street Hawkers', category: 'food' })).toBe('🍜');
    expect(stopEmoji({ name: 'Batu Ferringhi Beach', category: 'beach' })).toBe('🏖️');
    expect(stopEmoji({ name: 'Gurney Plaza', category: 'shopping' })).toBe('🛍️');
    expect(stopEmoji({ name: 'Kek Lok Si Temple', category: 'sight' })).toBe('🛕');
    expect(stopEmoji({ name: 'Penang Hill', category: 'sight' })).toBe('🚡');
    expect(stopEmoji({ name: 'Street art walk', category: 'sight' })).toBe('📸');
    expect(stopEmoji({ name: 'Somewhere', category: null })).toBe('📍');
  });
});

describe('which days have a recap', () => {
  it('days before the open one, and today once done', () => {
    expect(recapDays({ days: 3, openDay: 2, openDayDone: false })).toEqual([1]);
    expect(recapDays({ days: 3, openDay: 2, openDayDone: true })).toEqual([1, 2]);
    expect(recapDays({ days: 3, openDay: 1, openDayDone: false })).toEqual([]);
  });

  it('every day once the trip is over, none before it starts', () => {
    expect(recapDays({ days: 3, openDay: 5, openDayDone: false })).toEqual([1, 2, 3]);
    expect(recapDays({ days: 3, openDay: -4, openDayDone: false })).toEqual([]);
  });

  it('counts a stop as visited only once its arrival time has passed (Demo mode Reset)', () => {
    const arrived = { status: 'done' as const, arrived_at: new Date(T0).toISOString() };
    expect(visitedBy(arrived, T0)).toBe(true);
    expect(visitedBy(arrived, T0 - MIN)).toBe(false);
    expect(visitedBy({ status: 'planned', arrived_at: null }, T0)).toBe(false);
  });
});

describe('one-day trips', () => {
  it('drop "Day 1" from the card and the header', () => {
    expect(recapDateLine(1, 1, 'Wednesday 11 Nov')).toBe('WEDNESDAY 11 NOV');
    expect(recapTitle(1, 1)).toBe('Your day');
  });

  it('keep "Day N" on longer trips', () => {
    expect(recapDateLine(2, 3, 'Thursday 12 Nov')).toBe('DAY 2 · THURSDAY 12 NOV');
    expect(recapTitle(2, 3)).toBe('Day 2 done');
  });
});

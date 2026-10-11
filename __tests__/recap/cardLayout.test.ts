import {
  CARD_H,
  CARD_W,
  cardLayout,
  EDGE,
  MARKER_R,
  nameLines,
  spreadMarkers,
  STATS_TOP,
  titleLines,
  type CardLayout,
  type CardStop,
  type Segment,
} from '@/features/recap/cardLayout';
import { offsetMeters } from '@/lib/distance';

const HOME = { lat: 5.4141, lng: 100.3288 };
const at = (east: number, north: number) => offsetMeters(HOME, east, north);

const stop = (id: string, name: string, east: number, north: number, category: CardStop['category'] = 'sight'): CardStop => ({
  id,
  name,
  category,
  ...at(east, north),
});

/** A trail through the stops in order, a point every ~100 m. */
function trailThrough(stops: CardStop[]) {
  const out = [];
  for (let i = 1; i < stops.length; i++) {
    for (let k = 0; k < 10; k++) {
      const f = k / 10;
      out.push({ lat: stops[i - 1].lat + (stops[i].lat - stops[i - 1].lat) * f, lng: stops[i - 1].lng + (stops[i].lng - stops[i - 1].lng) * f });
    }
  }
  out.push(stops[stops.length - 1]);
  return out;
}

/** Like the screenshots: two far stops and five close together in George Town, long names. */
const CROWDED = [
  stop('a', 'Roti canai at Transfer Road', 0, 0, 'food'),
  stop('b', 'Penang Hill funicular', -6000, -1500),
  stop('c', 'Penang Waterfall Hill Temple', -3500, 2500),
  stop('d', 'Cheong Fatt Tze Blue Mansion', 600, 200),
  stop('e', 'Armenian Street murals', 700, 120),
  stop('f', 'Chulia Street street food', 760, 60, 'food'),
  stop('g', 'Nasi kandar at Line Clear', 680, -60, 'food'),
];

const SPREAD = [
  stop('a', 'Hotel', 0, 0, 'hotel'),
  stop('b', 'Kek Lok Si', 4000, -3000),
  stop('c', 'Batu Ferringhi', 1000, 6000, 'beach'),
];

type Rect = { x: number; y: number; w: number; h: number };
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const dot = (m: { x: number; y: number }): Rect => ({ x: m.x - MARKER_R, y: m.y - MARKER_R, w: 2 * MARKER_R, h: 2 * MARKER_R });
const inside = (p: { x: number; y: number }, r: Rect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;
function segmentHits(s: Segment, r: Rect) {
  for (let k = 0; k <= 50; k++) if (inside({ x: s.x1 + ((s.x2 - s.x1) * k) / 50, y: s.y1 + ((s.y2 - s.y1) * k) / 50 }, r)) return true;
  return false;
}
/** The trail's points every ~2 px. */
function trailPoints(l: CardLayout) {
  const out = [];
  for (let i = 1; i < l.line.length; i++) {
    const a = l.line[i - 1];
    const b = l.line[i];
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 2) || 1;
    for (let k = 0; k <= n; k++) out.push({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
  }
  return out;
}

/** Every rule the user can see: full names, nothing covered, all inside the card. */
function expectClean(l: CardLayout, stops: CardStop[]) {
  expect(l.labels.map((b) => b.lines.join(' '))).toEqual(stops.map((s) => s.name));
  const trail = trailPoints(l);
  for (const b of l.labels) {
    expect(b.x).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.x + b.w).toBeLessThanOrEqual(CARD_W - EDGE + 0.01);
    expect(b.y).toBeGreaterThanOrEqual(l.mapTop - 0.01);
    expect(b.y + b.h).toBeLessThanOrEqual(STATS_TOP);
    for (const o of l.labels) if (o !== b) expect(hit(b, o)).toBe(false);
    for (const m of l.markers) expect(hit(b, dot(m))).toBe(false);
    expect(trail.some((p) => inside(p, b))).toBe(false);
    for (const o of l.labels) if (o.leader && o !== b) expect(segmentHits(o.leader, b)).toBe(false);
  }
  for (const m of l.markers) {
    expect(m.x - MARKER_R).toBeGreaterThanOrEqual(0);
    expect(m.x + MARKER_R).toBeLessThanOrEqual(CARD_W);
    expect(m.y - MARKER_R).toBeGreaterThanOrEqual(l.mapTop);
    expect(m.y + MARKER_R).toBeLessThanOrEqual(STATS_TOP);
  }
  const nums = (l.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  for (let i = 0; i + 1 < nums.length; i += 2) {
    expect(nums[i]).toBeGreaterThanOrEqual(0);
    expect(nums[i]).toBeLessThanOrEqual(CARD_W);
    expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
    expect(nums[i + 1]).toBeLessThanOrEqual(CARD_H);
  }
}

describe('day recap card layout', () => {
  it('names each stop right by its marker when there is room', () => {
    const l = cardLayout(trailThrough(SPREAD), SPREAD, 'Penang');
    expectClean(l, SPREAD);
    expect(l.labels.every((b) => b.leader === null)).toBe(true);
    expect(l.labels[0].fontSize).toBe(9.5);
  });

  it('gives every crowded stop its full name, in free space with a line to its marker', () => {
    const l = cardLayout(trailThrough(CROWDED), CROWDED, 'Tharun trip');
    expectClean(l, CROWDED);
    expect(l.labels.some((b) => b.leader)).toBe(true);
    // Each line starts at its own marker's edge.
    for (const [i, b] of l.labels.entries()) {
      if (!b.leader) continue;
      const m = l.markers[i];
      expect(Math.hypot(b.leader.x1 - m.x, b.leader.y1 - m.y)).toBeCloseTo(MARKER_R, 1);
    }
  });

  it('keeps markers apart, even crowded ones', () => {
    const l = cardLayout(trailThrough(CROWDED), CROWDED);
    for (let i = 0; i < l.markers.length; i++)
      for (let j = i + 1; j < l.markers.length; j++)
        expect(Math.hypot(l.markers[i].x - l.markers[j].x, l.markers[i].y - l.markers[j].y)).toBeGreaterThanOrEqual(MARKER_R * 2 + 4);
  });

  it('fits a crowded day with a two-line trip name and extra stops', () => {
    const more = [...CROWDED, stop('h', 'Kapitan Keling Mosque', 640, 260), stop('i', 'Hin Bus Depot art space', 300, -300)];
    const title = 'Tharun and friends weekend in Penang';
    expect(titleLines(title)).toBe(2);
    expectClean(cardLayout(trailThrough(more), more, title), more);
  });

  it('wraps only very long names, onto two lines, never cutting them', () => {
    expect(nameLines('Cheong Fatt Tze Blue Mansion')).toEqual(['Cheong Fatt Tze Blue Mansion']);
    expect(nameLines('The Very Long Name Of A Heritage Mansion In George Town')).toEqual([
      'The Very Long Name Of A',
      'Heritage Mansion In George Town',
    ]);
    const long = [stop('a', 'The Very Long Name Of A Heritage Mansion In George Town', 0, 0), stop('b', 'Beach', 5000, 5000, 'beach')];
    const l = cardLayout(trailThrough(long), long);
    expect(l.labels[0].lines).toHaveLength(2);
    expectClean(l, long);
  });

  it('fans out stops on the same spot', () => {
    const p = spreadMarkers([{ x: 100, y: 200 }, { x: 100, y: 200 }, { x: 100, y: 200 }], { x: 25, y: 150, w: 250, h: 200 }, 32);
    for (let i = 0; i < p.length; i++)
      for (let j = i + 1; j < p.length; j++) expect(Math.hypot(p[i].x - p[j].x, p[i].y - p[j].y)).toBeGreaterThanOrEqual(31.9);
  });

  it('draws nothing without a trail or stops', () => {
    const l = cardLayout([], []);
    expect(l.path).toBe('');
    expect(l.ends).toBeNull();
    expect(l.markers).toEqual([]);
    expect(l.labels).toEqual([]);
  });
});

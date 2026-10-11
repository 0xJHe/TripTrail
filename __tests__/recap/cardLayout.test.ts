import {
  CARD_H,
  CARD_W,
  cardLayout,
  EDGE,
  LABEL_H,
  LABEL_MAX_W,
  LEGEND_ROW,
  MAP_TOP,
  MARKER_R,
  spreadMarkers,
  STATS_TOP,
  type CardLayout,
  type CardStop,
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

/** Like the screenshot: two far stops and five close together, some with long names. */
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

function insideCard(l: CardLayout) {
  for (const m of l.markers) {
    expect(m.x - MARKER_R).toBeGreaterThanOrEqual(0);
    expect(m.x + MARKER_R).toBeLessThanOrEqual(CARD_W);
    expect(m.y - MARKER_R).toBeGreaterThanOrEqual(MAP_TOP - 10);
    expect(m.y + MARKER_R).toBeLessThanOrEqual(STATS_TOP);
  }
  for (const b of l.labels) {
    expect(b.x - b.w / 2).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.x + b.w / 2).toBeLessThanOrEqual(CARD_W - EDGE + 0.01);
    expect(b.y - LABEL_H / 2).toBeGreaterThanOrEqual(MAP_TOP - 10);
    expect(b.y + LABEL_H / 2).toBeLessThanOrEqual(STATS_TOP);
  }
  for (const item of l.legend) {
    expect(item.x).toBeGreaterThanOrEqual(EDGE);
    expect(item.x + item.w).toBeLessThanOrEqual(CARD_W - EDGE + 0.01);
    expect(item.y + LEGEND_ROW).toBeLessThanOrEqual(STATS_TOP);
  }
  // Every number in the trail's path is inside the card.
  const nums = (l.path.match(/-?\d+(\.\d+)?/g) ?? []).map(Number);
  for (let i = 0; i + 1 < nums.length; i += 2) {
    expect(nums[i]).toBeGreaterThanOrEqual(0);
    expect(nums[i]).toBeLessThanOrEqual(CARD_W);
    expect(nums[i + 1]).toBeGreaterThanOrEqual(0);
    expect(nums[i + 1]).toBeLessThanOrEqual(CARD_H);
  }
}

function minMarkerGap(l: CardLayout) {
  let min = Infinity;
  for (let i = 0; i < l.markers.length; i++)
    for (let j = i + 1; j < l.markers.length; j++)
      min = Math.min(min, Math.hypot(l.markers[i].x - l.markers[j].x, l.markers[i].y - l.markers[j].y));
  return min;
}

describe('day recap card layout', () => {
  it('names each stop beside its marker when there is room', () => {
    const l = cardLayout(trailThrough(SPREAD), SPREAD);
    expect(l.numbered).toBe(false);
    expect(l.labels.map((b) => b.name)).toEqual(['Hotel', 'Kek Lok Si', 'Batu Ferringhi']);
    expect(l.legend).toEqual([]);
    insideCard(l);
  });

  it('never lets pills cover each other or a marker', () => {
    const l = cardLayout(trailThrough(SPREAD), SPREAD);
    const boxes = l.labels.map((b) => ({ x: b.x - b.w / 2, y: b.y - LABEL_H / 2, w: b.w, h: LABEL_H }));
    const hit = (a: (typeof boxes)[0], b: (typeof boxes)[0]) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) expect(hit(boxes[i], boxes[j])).toBe(false);
      for (const m of l.markers) expect(hit(boxes[i], { x: m.x - MARKER_R, y: m.y - MARKER_R, w: 2 * MARKER_R, h: 2 * MARKER_R })).toBe(false);
    }
  });

  it('switches to numbers and a list under the map when stops are crowded', () => {
    const l = cardLayout(trailThrough(CROWDED), CROWDED);
    expect(l.numbered).toBe(true);
    expect(l.labels).toEqual([]);
    expect(l.legend.map((i) => `${i.n} · ${i.name}`)).toEqual(CROWDED.map((s, i) => `${i + 1} · ${s.name}`));
    // The list is under the map, in two columns, clear of the markers.
    const lowest = Math.max(...l.markers.map((m) => m.y + MARKER_R));
    expect(Math.min(...l.legend.map((i) => i.y))).toBeGreaterThan(lowest);
    expect(new Set(l.legend.map((i) => i.x)).size).toBe(2);
    insideCard(l);
  });

  it('keeps markers apart, even crowded ones', () => {
    expect(minMarkerGap(cardLayout(trailThrough(CROWDED), CROWDED))).toBeGreaterThanOrEqual(MARKER_R * 2 + 4);
  });

  it('caps a long name pill (the rest ends in "…") and keeps it in the card', () => {
    const long = [stop('a', 'The Very Long Name Of A Heritage Mansion In George Town', 0, 0), stop('b', 'Beach', 5000, 5000, 'beach')];
    const l = cardLayout(trailThrough(long), long);
    expect(l.numbered).toBe(false);
    expect(l.labels[0].w).toBe(LABEL_MAX_W);
    insideCard(l);
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
  });
});

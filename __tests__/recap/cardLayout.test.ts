import {
  CARD_W,
  cardLayout,
  EDGE,
  LABEL_TOP,
  MARKER_R,
  nameLines,
  tagTexts,
  pointAlong,
  stopDistances,
  STATS_TOP,
  TRAIL_LENGTH,
  type CardLayout,
  type CardStop,
  type Segment,
} from '@/features/recap/cardLayout';

const NAMES = [
  'Roti canai at Transfer Road',
  'Penang Hill funicular',
  'Penang Waterfall Hill Temple',
  'Cheong Fatt Tze Blue Mansion',
  'Armenian Street murals',
  'Chulia Street street food',
  'Nasi kandar at Line Clear',
  'Kapitan Keling Mosque',
  'Hin Bus Depot art space',
  'Gurney Drive hawker centre',
  'Batu Ferringhi night market',
  'Kek Lok Si Temple',
];
const stops = (n: number): CardStop[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, name: NAMES[i % NAMES.length], category: i % 3 === 0 ? 'food' : 'sight' }));

type Rect = { x: number; y: number; w: number; h: number };
const hit = (a: Rect, b: Rect) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (p: { x: number; y: number }, r: Rect) => p.x > r.x && p.x < r.x + r.w && p.y > r.y && p.y < r.y + r.h;

/** Every rule the user can see: full names, nothing covered (pills or tags), all inside the card. */
function expectClean(l: CardLayout, list: CardStop[]) {
  expect(l.labels.map((b) => b.lines.join(' '))).toEqual(list.map((s) => s.name));
  const line = Array.from({ length: 400 }, (_, k) => pointAlong((TRAIL_LENGTH * k) / 399));
  const boxes: (Rect & { leader: Segment | null })[] = [...l.labels, ...l.tags];
  const leaders = [...l.labels, ...l.tags].flatMap((b) => (b.leader ? [b.leader] : []));
  for (const b of boxes) {
    expect(b.x).toBeGreaterThanOrEqual(EDGE - 0.01);
    expect(b.x + b.w).toBeLessThanOrEqual(CARD_W - EDGE + 0.01);
    expect(b.y).toBeGreaterThanOrEqual(LABEL_TOP - 0.01);
    expect(b.y + b.h).toBeLessThanOrEqual(STATS_TOP);
    for (const o of boxes) if (o !== b) expect(hit(b, o)).toBe(false);
    for (const m of l.markers) expect(hit(b, { x: m.x - m.r, y: m.y - m.r, w: 2 * m.r, h: 2 * m.r })).toBe(false);
    expect(line.some((p) => inside(p, b))).toBe(false);
    // No line from another marker runs through it.
    for (const s of leaders) {
      const own = b.leader === s;
      if (!own) for (let k = 1; k < 20; k++) expect(inside({ x: s.x1 + ((s.x2 - s.x1) * k) / 20, y: s.y1 + ((s.y2 - s.y1) * k) / 20 }, b)).toBe(false);
    }
  }
}


describe('stops along the prototype trail', () => {
  it('puts the first stop at the start of the line and the last at its end', () => {
    const l = cardLayout(stops(5));
    expect(l.markers[0]).toMatchObject({ x: 50, y: 395 });
    expect(l.markers[4].x).toBeCloseTo(245, 0);
    expect(l.markers[4].y).toBeCloseTo(340, 0);
  });

  it('spaces stops evenly along the line, in visit order', () => {
    const d = stopDistances(6);
    for (let i = 1; i < d.length; i++) expect(d[i] - d[i - 1]).toBeCloseTo(TRAIL_LENGTH / 5, 5);
    const l = cardLayout(stops(6));
    expect(l.markers.map((m) => m.id)).toEqual(['s0', 's1', 's2', 's3', 's4', 's5']);
  });

  it('puts a single stop in the middle of the line', () => {
    const l = cardLayout(stops(1));
    const mid = pointAlong(TRAIL_LENGTH / 2);
    expect(l.markers[0].x).toBeCloseTo(mid.x, 5);
    expect(l.markers[0].y).toBeCloseTo(mid.y, 5);
    expectClean(l, stops(1));
  });

  it('draws no markers without stops', () => {
    expect(cardLayout([])).toEqual({ markers: [], labels: [], tags: [] });
  });

  it('keeps full-size markers with room, and makes them smaller (never touching) when many share the line', () => {
    expect(cardLayout(stops(5)).markers[0].r).toBe(MARKER_R);
    const many = cardLayout(stops(20)).markers;
    expect(many[0].r).toBeLessThan(MARKER_R);
    for (let i = 1; i < many.length; i++) expect(Math.hypot(many[i].x - many[i - 1].x, many[i].y - many[i - 1].y)).toBeGreaterThan(2 * many[i].r);
  });
});

describe('name pills', () => {
  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12])('%i stops: every full name and the Start / End tags, no overlaps, inside the card', (n) => {
    const l = cardLayout(stops(n));
    expect(l.tags.length).toBe(n === 1 ? 1 : 2);
    expectClean(l, stops(n));
  });

  it("puts short names (like the prototype's) close to their markers, changing sides along the line", () => {
    const short: CardStop[] = ['Muntri Street', 'Penang Hill', 'Kek Lok Si', 'Chulia Street', 'Batu Ferringhi'].map((name, i) => ({
      id: `p${i}`,
      name,
      category: 'sight',
    }));
    const l = cardLayout(short);
    expectClean(l, short);
    const side = (i: number) => {
      const p = pointAlong(stopDistances(5)[i]);
      const b = l.labels[i];
      return Math.sign((b.x + b.w / 2 - p.x) * p.nx + (b.y + b.h / 2 - p.y) * p.ny);
    };
    // Sides change along the line (the first stop sits at the card's edge, so it takes the side with room).
    const sides = [0, 1, 2, 3, 4].map(side);
    expect(sides.filter((x, i) => i > 0 && x !== sides[i - 1]).length).toBeGreaterThanOrEqual(2);
    // Full size, each within a short reach of its marker.
    for (const [i, b] of l.labels.entries()) {
      const m = l.markers[i];
      const gap = Math.hypot(Math.max(b.x - m.x, 0, m.x - b.x - b.w), Math.max(b.y - m.y, 0, m.y - b.y - b.h));
      expect(b.fontSize).toBe(9.5);
      expect(gap).toBeLessThan(45);
    }
  });

  it('wraps only very long names, onto two lines, never cutting them', () => {
    expect(nameLines('Cheong Fatt Tze Blue Mansion')).toEqual(['Cheong Fatt Tze Blue Mansion']);
    expect(nameLines('The Very Long Name Of A Heritage Mansion In George Town')).toEqual([
      'The Very Long Name Of A',
      'Heritage Mansion In George Town',
    ]);
    const long: CardStop[] = [
      { id: 'a', name: 'The Very Long Name Of A Heritage Mansion In George Town', category: 'sight' },
      { id: 'b', name: 'Beach', category: 'beach' },
    ];
    const l = cardLayout(long);
    expect(l.labels[0].lines).toHaveLength(2);
    expectClean(l, long);
  });
});

describe('Start / End tags', () => {
  it('says "Start" at the first stop and "End" at the last, no times', () => {
    expect(tagTexts(5)).toEqual([
      { kind: 'start', text: 'Start', m: 0 },
      { kind: 'end', text: 'End', m: 4 },
    ]);
  });

  it('shows "Start – End" once for a one-stop day, and no tags without stops', () => {
    expect(tagTexts(1)).toEqual([{ kind: 'both', text: 'Start – End', m: 0 }]);
    expect(tagTexts(0)).toEqual([]);
  });

  it('sits each tag near its own stop', () => {
    const l = cardLayout(stops(5));
    const near = (t: CardLayout['tags'][number], m: CardLayout['markers'][number]) =>
      Math.hypot(Math.max(t.x - m.x, 0, m.x - t.x - t.w), Math.max(t.y - m.y, 0, m.y - t.y - t.h));
    expect(near(l.tags[0], l.markers[0])).toBeLessThan(near(l.tags[0], l.markers[4]));
    expect(near(l.tags[1], l.markers[4])).toBeLessThan(near(l.tags[1], l.markers[0]));
  });
});

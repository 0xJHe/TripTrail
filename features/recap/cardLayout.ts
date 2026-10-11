import type { StopCategory } from '@/lib/ai';
import type { LatLng } from '@/lib/distance';
import { curvePath, projector, simplify, stopEmoji, type Box, type XY } from './trail';

/**
 * Where everything goes on the day recap card (screen 15), on a 300-wide 9:16 canvas: the trail
 * and markers fitted inside the card with padding, markers kept apart, and every stop's full
 * name in a pill. A pill sits by its marker when there is room; around a cluster it moves into
 * free space (beside, above or below, on a shared row grid so they stack neatly) with a thin
 * line to its marker. Pills never cover each other, a marker, a line or the trail, and stay
 * inside the card. If they can't all fit, the markers get a narrower area (room at the sides)
 * and the font gets a little smaller. Names over 32 characters wrap onto two lines.
 */

export const CARD_W = 300;
export const CARD_H = (CARD_W * 16) / 9;
export const MARKER_R = 13;
/** Pills keep this far from the card's left / right edges. */
export const EDGE = 10;
/** Top of the map area under a one-line / two-line trip name. */
const MAP_TOP_1 = 86;
const MAP_TOP_2 = 118;
/** Top of the stats row. */
export const STATS_TOP = 410;
/** Names longer than this wrap onto two lines. */
export const WRAP_AT = 32;
/** Space between two markers' edges (wider when a crowded cluster needs room for its lines). */
const MARKER_GAP = 6;
const WIDE_GAP = 16;
/** Space between a pill and anything else. */
const PAD = 3;
const PILL_PAD_X = 6;
const PILL_PAD_Y = 2.5;
const FONTS = [9.5, 9, 8.5, 8];

export interface CardStop extends LatLng {
  id: string;
  name: string;
  category: StopCategory | null;
}

export interface CardMarker extends XY {
  id: string;
  name: string;
  emoji: string;
  /** Where the stop really is, when the marker was moved off it to keep markers apart. */
  spot: XY | null;
}

export interface Segment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** A name pill: top-left, size, its lines and font, and the line to its marker (null when right by it). */
export interface CardLabel {
  id: string;
  name: string;
  lines: string[];
  x: number;
  y: number;
  w: number;
  h: number;
  fontSize: number;
  lineHeight: number;
  leader: Segment | null;
}

export interface CardLayout {
  /** Top of the map area (under the trip name). */
  mapTop: number;
  /** Where the trail and the markers are fitted. */
  mapBox: Box;
  path: string;
  /** The trail's points on the card (the path is a smooth curve through them). */
  line: XY[];
  /** Start and end of the drawn line (for its colour gradient); null without a line. */
  ends: { from: XY; to: XY } | null;
  markers: CardMarker[];
  labels: CardLabel[];
}

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const hits = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

/** Name as one line, or two (split at the space nearest the middle) when over 32 characters. */
export function nameLines(name: string): string[] {
  const n = name.trim();
  if (n.length <= WRAP_AT) return [n];
  const mid = n.length / 2;
  let best = -1;
  for (let i = 0; i < n.length; i++) if (n[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [n] : [n.slice(0, best), n.slice(best + 1)];
}

/** Rough text width for Inter Bold (a little generous, so the name never gets cut). */
const textWidth = (s: string, font: number) => s.length * font * 0.6;

/** Pill size for a name at a font size. */
export function pillSize(name: string, font: number) {
  const lines = nameLines(name);
  const lineHeight = Math.round(font * 1.3 * 10) / 10;
  return {
    lines,
    lineHeight,
    w: Math.max(...lines.map((l) => textWidth(l, font))) + PILL_PAD_X * 2,
    h: lines.length * lineHeight + PILL_PAD_Y * 2,
  };
}

/** Pushes markers apart until no two are closer than `gap`, keeping them in the box. Same-spot markers fan out in a fixed direction. */
export function spreadMarkers<T extends XY>(points: T[], box: Box, gap: number): T[] {
  const p = points.map((q) => ({ ...q }));
  const keepIn = (q: XY) => {
    q.x = clamp(q.x, box.x, box.x + box.w);
    q.y = clamp(q.y, box.y, box.y + box.h);
  };
  for (let round = 0; round < 80; round++) {
    let moved = false;
    for (let i = 0; i < p.length; i++) {
      for (let j = i + 1; j < p.length; j++) {
        let dx = p[j].x - p[i].x;
        let dy = p[j].y - p[i].y;
        let d = Math.hypot(dx, dy);
        if (d >= gap - 0.01) continue;
        if (d < 0.01) {
          const a = (j * 2.4) % (2 * Math.PI);
          dx = Math.cos(a);
          dy = Math.sin(a);
          d = 1;
        }
        const push = (gap - d) / 2 + 0.05;
        p[i].x -= (dx / d) * push;
        p[i].y -= (dy / d) * push;
        p[j].x += (dx / d) * push;
        p[j].y += (dy / d) * push;
        keepIn(p[i]);
        keepIn(p[j]);
        moved = true;
      }
    }
    if (!moved) break;
  }
  return p;
}

const CELL = 2;
const COLS = Math.ceil(CARD_W / CELL) + 2;
const ROWS = Math.ceil(CARD_H / CELL) + 2;

/**
 * Which 2 px cells of the card the trail passes through, with running totals (a summed-area
 * table) so checking a whole pill takes a few steps.
 */
export class TrailGrid {
  private sum = new Int32Array((COLS + 1) * (ROWS + 1));
  constructor(line: XY[]) {
    const on = new Uint8Array(COLS * ROWS);
    const mark = (p: XY) => {
      const cx = clamp(Math.floor(p.x / CELL), 0, COLS - 1);
      const cy = clamp(Math.floor(p.y / CELL), 0, ROWS - 1);
      on[cy * COLS + cx] = 1;
    };
    if (line.length) mark(line[0]);
    for (let i = 1; i < line.length; i++) {
      const a = line[i - 1];
      const b = line[i];
      const n = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y)));
      for (let k = 1; k <= n; k++) mark({ x: a.x + ((b.x - a.x) * k) / n, y: a.y + ((b.y - a.y) * k) / n });
    }
    const W1 = COLS + 1;
    for (let y = 0; y < ROWS; y++)
      for (let x = 0; x < COLS; x++)
        this.sum[(y + 1) * W1 + x + 1] = on[y * COLS + x] + this.sum[y * W1 + x + 1] + this.sum[(y + 1) * W1 + x] - this.sum[y * W1 + x];
  }
  /** The trail passes through the rectangle (grown by pad). */
  hits(r: Rect, pad = 0): boolean {
    const W1 = COLS + 1;
    const x0 = clamp(Math.floor((r.x - pad) / CELL), 0, COLS);
    const y0 = clamp(Math.floor((r.y - pad) / CELL), 0, ROWS);
    const x1 = clamp(Math.ceil((r.x + r.w + pad) / CELL), 0, COLS);
    const y1 = clamp(Math.ceil((r.y + r.h + pad) / CELL), 0, ROWS);
    return this.sum[y1 * W1 + x1] - this.sum[y0 * W1 + x1] - this.sum[y1 * W1 + x0] + this.sum[y0 * W1 + x0] > 0;
  }
}

const cross = (o: XY, a: XY, b: XY) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
function segmentsCross(s: Segment, t: Segment): boolean {
  const a = { x: s.x1, y: s.y1 };
  const b = { x: s.x2, y: s.y2 };
  const c = { x: t.x1, y: t.y1 };
  const d = { x: t.x2, y: t.y2 };
  return cross(a, b, c) * cross(a, b, d) < 0 && cross(c, d, a) * cross(c, d, b) < 0;
}
/** The segment passes through the (padded) rectangle's inside (Liang–Barsky clipping). */
function segmentHitsRect(s: Segment, r: Rect, pad = 0): boolean {
  const dx = s.x2 - s.x1;
  const dy = s.y2 - s.y1;
  let t0 = 0;
  let t1 = 1;
  const edges: [number, number][] = [
    [-dx, s.x1 - (r.x - pad)],
    [dx, r.x + r.w + pad - s.x1],
    [-dy, s.y1 - (r.y - pad)],
    [dy, r.y + r.h + pad - s.y1],
  ];
  for (const [p, q] of edges) {
    if (p === 0) {
      if (q <= 0) return false;
    } else {
      const t = q / p;
      if (p < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 >= t1) return false;
    }
  }
  return true;
}

/** Line from the marker's edge to the nearest point of the pill; null when the pill is right by the marker. */
function leaderTo(m: XY, r: Rect): Segment | null {
  const nx = clamp(m.x, r.x, r.x + r.w);
  const ny = clamp(m.y, r.y, r.y + r.h);
  const d = Math.hypot(nx - m.x, ny - m.y);
  if (d <= MARKER_R + 6) return null;
  return { x1: m.x + ((nx - m.x) / d) * MARKER_R, y1: m.y + ((ny - m.y) / d) * MARKER_R, x2: nx, y2: ny };
}

interface Rules {
  font: number;
  avoidTrail: boolean;
  avoidCrossing: boolean;
}

/** Most spots kept per pill, nearest first (after the fixed obstacles are ruled out). */
const MAX_SPOTS = 40;
/** Placement attempts before giving up on these rules (keeps the card instant). */
const BUDGET = 4000;

interface Spot {
  r: Rect;
  leader: Segment | null;
  score: number;
}

/** Every place a marker's pill could go, nearest first, without covering a marker, the trail or a moved-marker line. */
function spotsFor(m: CardMarker, i: number, markers: CardMarker[], dots: Rect[], fixedLines: Segment[], trail: TrailGrid, area: Rect, rules: Rules) {
  const size = pillSize(m.name, rules.font);
  const row = size.h + PAD;
  const near = MARKER_R + 4;
  const seen = new Set<number>();
  const out: Spot[] = [];
  const add = (x: number, y: number, extra = 0) => {
    const r = { x: clamp(x, area.x, area.x + area.w - size.w), y: clamp(y, area.y, area.y + area.h - size.h), w: size.w, h: size.h };
    const k = Math.round(r.x) * 1000 + Math.round(r.y);
    if (seen.has(k)) return;
    seen.add(k);
    if (dots.some((d) => hits(r, d, PAD))) return;
    if (fixedLines.some((s) => segmentHitsRect(s, r, PAD))) return;
    if (rules.avoidTrail && trail.hits(r, PAD)) return;
    const leader = leaderTo(m, r);
    if (leader && dots.some((d, k2) => k2 !== i && segmentHitsRect(leader, d))) return;
    const nx = clamp(m.x, r.x, r.x + r.w);
    const ny = clamp(m.y, r.y, r.y + r.h);
    out.push({ r, leader, score: Math.hypot(nx - m.x, ny - m.y) + extra });
  };
  // Right by the marker: above, below, right, left.
  add(m.x - size.w / 2, m.y - near - size.h);
  add(m.x - size.w / 2, m.y + near);
  add(m.x + near, m.y - size.h / 2);
  add(m.x - near - size.w, m.y - size.h / 2);
  // Further out: beside the marker on a shared row grid (so a cluster's pills stack neatly), or above / below.
  for (let k = 0; k <= 6; k++) {
    for (let j = -9; j <= 9; j++) {
      const y = area.y + Math.round((m.y - size.h / 2 - area.y) / row + j) * row;
      add(m.x + near + k * 16, y, 2);
      add(m.x - near - size.w - k * 16, y, 2);
    }
  }
  for (let k = 1; k <= 6; k++) {
    for (const dx of [-0.5, -0.25, 0, 0.25, 0.5]) {
      add(m.x - size.w / 2 + dx * size.w, m.y - near - size.h - k * row, 2);
      add(m.x - size.w / 2 + dx * size.w, m.y + near + k * row, 2);
    }
  }
  return { size, spots: out.sort((a, b) => a.score - b.score).slice(0, MAX_SPOTS) };
}

/** Every spot of every pill for one marker area and font, and which pairs of spots clash. */
interface SpotTable {
  options: ReturnType<typeof spotsFor>[];
  /** Flat list: owner marker and spot. */
  all: { m: number; s: Spot }[];
  /**
   * How spot k clashes with every other spot (worked out the first time it's asked, as the search
   * only tries a few): 1 = they overlap or a line runs through a pill; 2 = only their lines cross.
   */
  row: (k: number) => Uint8Array;
}

function spotTable(markers: CardMarker[], trail: TrailGrid, area: Rect, rules: Rules): SpotTable {
  const dots: Rect[] = markers.map((m) => ({ x: m.x - MARKER_R, y: m.y - MARKER_R, w: MARKER_R * 2, h: MARKER_R * 2 }));
  // Lines from moved markers to their real spots.
  const fixedLines: Segment[] = markers.flatMap((m) => (m.spot ? [{ x1: m.spot.x, y1: m.spot.y, x2: m.x, y2: m.y }] : []));
  // Crowded markers first: if one has nowhere to go, stop (no need for the rest or the clash table).
  const crowd = (m: CardMarker) => markers.filter((o) => o !== m && Math.hypot(o.x - m.x, o.y - m.y) < 70).length;
  const order = markers.map((m, i) => ({ i, c: crowd(m) })).sort((a, b) => b.c - a.c || a.i - b.i);
  const options: ReturnType<typeof spotsFor>[] = new Array(markers.length);
  for (const { i } of order) {
    options[i] = spotsFor(markers[i], i, markers, dots, fixedLines, trail, area, rules);
    if (options[i].spots.length === 0) return { options: [options[i]], all: [], row: () => new Uint8Array(0) };
  }
  const all = options.flatMap((o, m) => o.spots.map((s) => ({ m, s })));
  const n = all.length;
  const rows = new Map<number, Uint8Array>();
  const clashOf = (p: Spot, q: Spot) => {
    if (hits(p.r, q.r, PAD) || (p.leader && segmentHitsRect(p.leader, q.r, PAD)) || (q.leader && segmentHitsRect(q.leader, p.r, PAD))) return 1;
    return p.leader && q.leader && segmentsCross(p.leader, q.leader) ? 2 : 0;
  };
  const row = (k: number) => {
    let r = rows.get(k);
    if (!r) {
      r = new Uint8Array(n);
      for (let j = 0; j < n; j++) if (all[j].m !== all[k].m) r[j] = clashOf(all[k].s, all[j].s);
      rows.set(k, r);
    }
    return r;
  };
  return { options, all, row };
}

/**
 * Picks one spot per pill so that no two clash, or returns null. The pill with the fewest free
 * spots goes next; when one has none left, earlier pills try their next spot (a bounded search
 * over the clash table, so it stays instant).
 */
function placeLabels(markers: CardMarker[], table: SpotTable, rules: Rules): CardLabel[] | null {
  const { options, all, row } = table;
  if (options.some((o) => o.spots.length === 0)) return null;
  const n = all.length;
  const limit = rules.avoidCrossing ? 2 : 1;
  const blocked = new Int16Array(n);
  const chosen = new Int32Array(markers.length).fill(-1);
  const byMarker = markers.map((_, m) => all.map((x, k) => (x.m === m ? k : -1)).filter((k) => k >= 0));
  let steps = 0;
  const mark = (k: number, d: number) => {
    const r = row(k);
    for (let j = 0; j < n; j++) if (r[j] !== 0 && r[j] <= limit) blocked[j] += d;
  };
  const search = (left: number[]): boolean => {
    if (left.length === 0) return true;
    let next = -1;
    let free: number[] = [];
    for (const m of left) {
      const f = byMarker[m].filter((k) => blocked[k] === 0);
      if (f.length === 0) return false;
      if (next < 0 || f.length < free.length) {
        next = m;
        free = f;
      }
    }
    const rest = left.filter((m) => m !== next);
    for (const k of free) {
      if (++steps > BUDGET) return false;
      chosen[next] = k;
      mark(k, 1);
      if (search(rest)) return true;
      mark(k, -1);
    }
    chosen[next] = -1;
    return false;
  };
  if (!search(markers.map((_, i) => i))) return null;

  return markers.map((m, i) => {
    const s = all[chosen[i]].s;
    const size = options[i].size;
    return { id: m.id, name: m.name, lines: size.lines, ...s.r, fontSize: rules.font, lineHeight: size.lineHeight, leader: s.leader };
  });
}

function drawIn(trail: LatLng[], stops: CardStop[], box: Box, gap: number) {
  const project = projector([...trail, ...stops], box);
  const line = simplify(trail.map(project), 1.2);
  const spots = stops.map((s) => project(s));
  const markers = spreadMarkers(
    stops.map((s, i) => ({ ...spots[i], id: s.id, name: s.name, emoji: stopEmoji(s), spot: null as XY | null })),
    box,
    MARKER_R * 2 + gap,
  ).map((m, i) => (Math.hypot(m.x - spots[i].x, m.y - spots[i].y) > MARKER_R ? { ...m, spot: spots[i] } : m));
  const ends = line.length >= 2 ? { from: line[0], to: line[line.length - 1] } : null;
  return { line, path: line.length >= 2 ? curvePath(line) : '', ends, markers };
}

/** Lines the trip name takes on the card (30 px extra-bold, 260 px wide). */
export const titleLines = (title: string) => (textWidth(title, 30) * 0.92 > CARD_W - 40 ? 2 : 1);

/** The whole card layout for a trail and the stops visited, in visit order. */
export function cardLayout(trail: LatLng[], stops: CardStop[], title = ''): CardLayout {
  const mapTop = titleLines(title) === 2 ? MAP_TOP_2 : MAP_TOP_1;
  const area: Rect = { x: EDGE, y: mapTop, w: CARD_W - 2 * EDGE, h: STATS_TOP - 6 - mapTop };
  const top = mapTop + 24;
  const bottom = STATS_TOP - 26;
  // Markers fill the map, or leave room at the sides for the pills of a crowded day; a cluster
  // can spread a little wider so the lines from its middle markers can get out.
  const full: Box = { x: 38, y: top, w: CARD_W - 76, h: bottom - top };
  const narrow: Box = { x: 80, y: top + 10, w: CARD_W - 160, h: bottom - top - 20 };
  const narrower: Box = { x: 105, y: top + 20, w: CARD_W - 210, h: bottom - top - 40 };
  const variants: { box: Box; gap: number }[] = [
    { box: full, gap: MARKER_GAP },
    { box: full, gap: WIDE_GAP },
    { box: narrow, gap: MARKER_GAP },
    { box: narrow, gap: WIDE_GAP },
    { box: narrower, gap: WIDE_GAP },
  ];
  const tries: [number, Rules][] = [];
  for (const avoidCrossing of [true, false])
    for (const font of FONTS) for (let v = 0; v < variants.length; v++) tries.push([v, { font, avoidTrail: true, avoidCrossing }]);
  for (const font of FONTS) for (let v = 0; v < variants.length; v++) tries.push([v, { font, avoidTrail: false, avoidCrossing: false }]);

  const drawn = new Map<number, ReturnType<typeof drawIn> & { grid: TrailGrid; tables: Map<string, SpotTable> }>();
  const draw = (v: number) => {
    let d = drawn.get(v);
    if (!d) {
      const base = drawIn(trail, stops, variants[v].box, variants[v].gap);
      d = { ...base, grid: new TrailGrid(base.line), tables: new Map() };
      drawn.set(v, d);
    }
    return d;
  };
  for (const [v, rules] of tries) {
    const d = draw(v);
    // The same spots and clashes serve every try with this font (only the line-crossing rule differs).
    const key = `${rules.font}:${rules.avoidTrail}`;
    const table = d.tables.get(key) ?? spotTable(d.markers, d.grid, area, rules);
    d.tables.set(key, table);
    const labels = placeLabels(d.markers, table, rules);
    if (labels) return { mapTop, mapBox: variants[v].box, path: d.path, line: d.line, ends: d.ends, markers: d.markers, labels };
  }
  // Nothing fits cleanly (a very crowded day): markers only.
  const d = draw(variants.length - 1);
  return { mapTop, mapBox: variants[variants.length - 1].box, path: d.path, line: d.line, ends: d.ends, markers: d.markers, labels: [] };
}

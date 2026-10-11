import type { StopCategory } from '@/lib/ai';
import { stopEmoji } from './trail';

/**
 * Where everything goes on the day recap card (screen 15), on a 300-wide 9:16 canvas. The trail
 * is always the prototype's line (same shape, every trip); the day's visited stops sit along it
 * in visit order, evenly spaced, the first at its start and the last at its end. Each stop's
 * full name goes in a pill on alternating sides of the line, and small Start / End tags sit by
 * the first and last stop; pills and tags never cover each other, a marker or the line, and
 * stay inside the card (smaller font only if they can't all fit).
 */

export const CARD_W = 300;
export const CARD_H = (CARD_W * 16) / 9;

export interface XY {
  x: number;
  y: number;
}

/** Prototype screen 15's trail, in card coordinates (the card is the prototype's 300 wide). */
export const TRAIL_PATH = 'M50 395 C 65 330, 80 260, 120 220 S 190 250, 195 300 S 230 372, 245 340';
/** The same path as plain cubic Béziers (each "S" with its first control point reflected). */
const SEGMENTS: [XY, XY, XY, XY][] = [
  [{ x: 50, y: 395 }, { x: 65, y: 330 }, { x: 80, y: 260 }, { x: 120, y: 220 }],
  [{ x: 120, y: 220 }, { x: 160, y: 180 }, { x: 190, y: 250 }, { x: 195, y: 300 }],
  [{ x: 195, y: 300 }, { x: 200, y: 350 }, { x: 230, y: 372 }, { x: 245, y: 340 }],
];
/** Left and right ends of the line, for its left-to-right mint → gold gradient (as the prototype). */
export const TRAIL_X = { from: 50, to: 245 };

/** Marker radius when there's room; smaller when many stops share the line. */
export const MARKER_R = 13;
const MIN_MARKER_R = 8;
/** Pills keep this far from the card's left / right edges. */
export const EDGE = 10;
/** Top of the area pills may use (under the date and a two-line trip name). */
export const LABEL_TOP = 112;
/** Top of the stats row. */
export const STATS_TOP = 410;
/** Names longer than this wrap onto two lines. */
export const WRAP_AT = 32;
/** On a crowded day (when one-line pills can't all fit), names longer than this wrap too. */
export const CROWDED_WRAP_AT = 16;
/** Space between a pill and anything else. */
const PAD = 3;
/** The line is 6 px wide; pills keep clear of its edges too. */
const LINE_CLEAR = 3 + PAD;
const PILL_PAD_X = 6;
const PILL_PAD_Y = 2.5;
/**
 * Pill styles tried in turn until every pill fits: one line at 9.5 → 8 px, then (crowded days)
 * two lines from 16 characters at 9 → 7 px, then smaller still.
 */
const STYLES: { font: number; wrapAt: number }[] = [
  ...[9.5, 9, 8.5, 8].map((font) => ({ font, wrapAt: WRAP_AT })),
  ...[9, 8.5, 8, 7.5, 7].map((font) => ({ font, wrapAt: CROWDED_WRAP_AT })),
  ...[6.5, 6].map((font) => ({ font, wrapAt: CROWDED_WRAP_AT })),
];
/** Pills taking more than this share of the label area can't all fit around the line: skip that style. */
const MAX_FILL = 0.4;
/** Placement attempts before giving up on a font (keeps the card instant). */
const BUDGET = 1500;
/** First, quicker look at every style (most that fit are found within this). */
const QUICK_BUDGET = 150;
/** Spots kept per pill, nearest first: by its marker, and elsewhere in free space. */
const NEAR_SPOTS = 30;
const FAR_SPOTS = 40;

export interface CardStop {
  id: string;
  name: string;
  category: StopCategory | null;
}

export interface CardMarker extends XY {
  id: string;
  name: string;
  emoji: string;
  r: number;
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
  markers: CardMarker[];
  labels: CardLabel[];
  tags: CardTag[];
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

// ---------- The line ----------

const bez = (s: [XY, XY, XY, XY], t: number): XY => {
  const u = 1 - t;
  const [a, b, c, d] = s;
  return {
    x: u * u * u * a.x + 3 * u * u * t * b.x + 3 * u * t * t * c.x + t * t * t * d.x,
    y: u * u * u * a.y + 3 * u * u * t * b.y + 3 * u * t * t * c.y + t * t * t * d.y,
  };
};

/** The line as dense points with the distance along it. */
const POINTS: (XY & { d: number })[] = (() => {
  const out: (XY & { d: number })[] = [];
  let d = 0;
  for (const s of SEGMENTS) {
    for (let k = out.length ? 1 : 0; k <= 200; k++) {
      const p = bez(s, k / 200);
      if (out.length) d += Math.hypot(p.x - out[out.length - 1].x, p.y - out[out.length - 1].y);
      out.push({ ...p, d });
    }
  }
  return out;
})();
export const TRAIL_LENGTH = POINTS[POINTS.length - 1].d;

/** The point `d` px along the line, and the unit normal there (pointing left of the way the line runs). */
export function pointAlong(d: number): XY & { nx: number; ny: number } {
  const dist = clamp(d, 0, TRAIL_LENGTH);
  let i = POINTS.findIndex((p) => p.d >= dist);
  if (i <= 0) i = 1;
  const a = POINTS[i - 1];
  const b = POINTS[i];
  const f = b.d === a.d ? 0 : (dist - a.d) / (b.d - a.d);
  const len = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f, nx: (b.y - a.y) / len, ny: -(b.x - a.x) / len };
}

/** Distance along the line of each of n stops: evenly spaced, first at the start, last at the end (one stop: the middle). */
export function stopDistances(n: number): number[] {
  if (n <= 0) return [];
  if (n === 1) return [TRAIL_LENGTH / 2];
  return Array.from({ length: n }, (_, i) => (TRAIL_LENGTH * i) / (n - 1));
}

// ---------- Pills ----------

/** Name as one line, or two (split at the space nearest the middle) when longer than wrapAt (32). */
export function nameLines(name: string, wrapAt = WRAP_AT): string[] {
  const n = name.trim();
  if (n.length <= wrapAt) return [n];
  const mid = n.length / 2;
  let best = -1;
  for (let i = 0; i < n.length; i++) if (n[i] === ' ' && (best < 0 || Math.abs(i - mid) < Math.abs(best - mid))) best = i;
  return best < 0 ? [n] : [n.slice(0, best), n.slice(best + 1)];
}

/** Rough text width for Inter Bold (a little generous, so the name never gets cut). */
const textWidth = (s: string, font: number) => s.length * font * 0.6;

/** Pill size for a name at a font size. */
export function pillSize(name: string, font: number, wrapAt = WRAP_AT) {
  const lines = nameLines(name, wrapAt);
  const lineHeight = Math.round(font * 1.3 * 10) / 10;
  return {
    lines,
    lineHeight,
    w: Math.max(...lines.map((l) => textWidth(l, font))) + PILL_PAD_X * 2,
    h: lines.length * lineHeight + PILL_PAD_Y * 2,
  };
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
function leaderTo(m: CardMarker, r: Rect): Segment | null {
  const nx = clamp(m.x, r.x, r.x + r.w);
  const ny = clamp(m.y, r.y, r.y + r.h);
  const d = Math.hypot(nx - m.x, ny - m.y);
  if (d <= m.r + 8) return null;
  return { x1: m.x + ((nx - m.x) / d) * m.r, y1: m.y + ((ny - m.y) / d) * m.r, x2: nx, y2: ny };
}

/**
 * Which 2 px cells of the card the line covers (grown by LINE_CLEAR), with running totals (a
 * summed-area table): "does this pill touch the line?" is then four lookups. Built once.
 */
const CELL = 2;
const COLS = Math.ceil(CARD_W / CELL) + 1;
const ROWS = Math.ceil(CARD_H / CELL) + 1;
const ON_LINE = new Uint8Array(COLS * ROWS);
const LINE_SUM = new Int32Array((COLS + 1) * (ROWS + 1));
(() => {
  const grow = Math.ceil(LINE_CLEAR / CELL);
  for (const p of POINTS) {
    const cx = Math.floor(p.x / CELL);
    const cy = Math.floor(p.y / CELL);
    for (let dx = -grow; dx <= grow; dx++)
      for (let dy = -grow; dy <= grow; dy++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x >= 0 && y >= 0 && x < COLS && y < ROWS) ON_LINE[y * COLS + x] = 1;
      }
  }
  const W1 = COLS + 1;
  for (let y = 0; y < ROWS; y++)
    for (let x = 0; x < COLS; x++)
      LINE_SUM[(y + 1) * W1 + x + 1] = ON_LINE[y * COLS + x] + LINE_SUM[y * W1 + x + 1] + LINE_SUM[(y + 1) * W1 + x] - LINE_SUM[y * W1 + x];
})();

/** The pill touches the line (or comes within LINE_CLEAR of it). */
function touchesLine(r: Rect): boolean {
  const W1 = COLS + 1;
  const x0 = clamp(Math.floor(r.x / CELL), 0, COLS);
  const y0 = clamp(Math.floor(r.y / CELL), 0, ROWS);
  const x1 = clamp(Math.ceil((r.x + r.w) / CELL), 0, COLS);
  const y1 = clamp(Math.ceil((r.y + r.h) / CELL), 0, ROWS);
  return LINE_SUM[y1 * W1 + x1] - LINE_SUM[y0 * W1 + x1] - LINE_SUM[y1 * W1 + x0] + LINE_SUM[y0 * W1 + x0] > 0;
}

/** A leader line runs over the trail (allowed, but busier). */
function crossesTrail(s: Segment): boolean {
  const len = Math.hypot(s.x2 - s.x1, s.y2 - s.y1);
  const n = Math.max(1, Math.ceil(len / 3));
  for (let k = 0; k <= n; k++) {
    const x = Math.floor((s.x1 + ((s.x2 - s.x1) * k) / n) / CELL);
    const y = Math.floor((s.y1 + ((s.y2 - s.y1) * k) / n) / CELL);
    if (x >= 0 && y >= 0 && x < COLS && y < ROWS && ON_LINE[y * COLS + x]) return true;
  }
  return false;
}


interface Spot {
  r: Rect;
  leader: Segment | null;
  /** The pill and its line together (a quick first test for clashes). */
  box: Rect;
}

function envelope(r: Rect, l: Segment | null): Rect {
  if (!l) return r;
  const x = Math.min(r.x, l.x1, l.x2);
  const y = Math.min(r.y, l.y1, l.y2);
  return { x, y, w: Math.max(r.x + r.w, l.x1, l.x2) - x, h: Math.max(r.y + r.h, l.y1, l.y2) - y };
}

const AREA: Rect = { x: EDGE, y: LABEL_TOP, w: CARD_W - 2 * EDGE, h: STATS_TOP - 4 - LABEL_TOP };

/** Something to place by a marker: a stop's name pill or a Start / End tag. */
interface Item {
  /** The marker it belongs to. */
  m: number;
  w: number;
  h: number;
  /** Preferred side of the line (1 = the normal's side, -1 = the other). */
  own: number;
}

/**
 * Places for an item, best first: straight out from the line on its own side, a little further
 * out or slid along the line, then the other side; then anywhere else that's free (e.g. above
 * the arch or inside the loop) with a line to the marker. None covers a marker or the line, and
 * all are inside the card.
 */
function spotsFor(item: Item, markers: CardMarker[], normals: XY[]): Spot[] {
  const m = markers[item.m];
  const size = item;
  const dots: Rect[] = markers.map((o) => ({ x: o.x - o.r, y: o.y - o.r, w: o.r * 2, h: o.r * 2 }));
  const n = normals[item.m];
  const tx = -n.y;
  const ty = n.x;
  const own = item.own;
  const near: (Spot & { score: number })[] = [];
  const far: (Spot & { score: number })[] = [];
  let out = near;
  const seen = new Set<number>();
  const add = (cx: number, cy: number, extra: number) => {
    const r = {
      x: clamp(cx - size.w / 2, AREA.x, AREA.x + AREA.w - size.w),
      y: clamp(cy - size.h / 2, AREA.y, AREA.y + AREA.h - size.h),
      w: size.w,
      h: size.h,
    };
    const key = Math.round(r.x) * 1000 + Math.round(r.y);
    if (seen.has(key)) return;
    seen.add(key);
    if (touchesLine(r)) return;
    if (dots.some((d) => hits(r, d, PAD))) return;
    const leader = leaderTo(m, r);
    if (leader && dots.some((d, k) => k !== item.m && segmentHitsRect(leader, d))) return;
    const nx = clamp(m.x, r.x, r.x + r.w);
    const ny = clamp(m.y, r.y, r.y + r.h);
    // A line to the pill that crosses the trail is allowed, but looks busier.
    const overTrail = leader && crossesTrail(leader) ? 40 : 0;
    out.push({ r, leader, box: envelope(r, leader), score: Math.hypot(nx - m.x, ny - m.y) + extra + overTrail });
  };
  for (const side of [own, -own]) {
    const sx = n.x * side;
    const sy = n.y * side;
    // How far the pill's centre sits from its edge facing the marker, along this direction.
    const reach = (Math.abs(sx) * size.w) / 2 + (Math.abs(sy) * size.h) / 2;
    for (let away = 0; away <= 60; away += 6) {
      for (const slide of [0, -10, 10, -22, 22, -36, 36]) {
        add(
          m.x + sx * (m.r + 5 + away + reach) + tx * slide,
          m.y + sy * (m.r + 5 + away + reach) + ty * slide,
          Math.abs(slide) * 0.3 + (side === own ? 0 : 25),
        );
      }
    }
  }
  out = far;
  const row = size.h + PAD;
  for (let y = AREA.y; y + size.h <= AREA.y + AREA.h; y += row) {
    for (let x = AREA.x; x + size.w <= AREA.x + AREA.w + 0.01; x += 14) add(x + size.w / 2, y + size.h / 2, 30);
    add(AREA.x + AREA.w - size.w / 2, y + size.h / 2, 30);
  }
  const best = (list: typeof near, k: number) => list.sort((a, b) => a.score - b.score).slice(0, k);
  return [...best(near, NEAR_SPOTS), ...best(far, FAR_SPOTS)].sort((a, b) => a.score - b.score);
}

/** 1 = the two spots overlap or a line runs through a pill; 2 = only their lines cross. */
function clashOf(p: Spot, q: Spot): number {
  if (!hits(p.box, q.box, PAD)) return 0;
  if (hits(p.r, q.r, PAD) || (p.leader && segmentHitsRect(p.leader, q.r, PAD)) || (q.leader && segmentHitsRect(q.leader, p.r, PAD))) return 1;
  return p.leader && q.leader && segmentsCross(p.leader, q.leader) ? 2 : 0;
}

/**
 * One spot per item so that none clash, or null. The item with the fewest free spots goes next;
 * when one has none left, earlier items try their next spot (bounded, so it stays instant).
 */
function place(options: Spot[][], avoidCrossing: boolean, budget: number): Spot[] | null {
  if (options.some((o) => o.length === 0)) return null;
  const all = options.flatMap((o, m) => o.map((s) => ({ m, s })));
  const n = all.length;
  const rows = new Map<number, Uint8Array>();
  const row = (k: number) => {
    let r = rows.get(k);
    if (!r) {
      r = new Uint8Array(n);
      for (let j = 0; j < n; j++) if (all[j].m !== all[k].m) r[j] = clashOf(all[k].s, all[j].s);
      rows.set(k, r);
    }
    return r;
  };
  const limit = avoidCrossing ? 2 : 1;
  const blocked = new Int16Array(n);
  const chosen = new Int32Array(options.length).fill(-1);
  const byItem = options.map((_, m) => all.map((x, k) => (x.m === m ? k : -1)).filter((k) => k >= 0));
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
      const f = byItem[m].filter((k) => blocked[k] === 0);
      if (f.length === 0) return false;
      if (next < 0 || f.length < free.length) {
        next = m;
        free = f;
      }
    }
    const rest = left.filter((m) => m !== next);
    for (const k of free) {
      if (++steps > budget) return false;
      chosen[next] = k;
      mark(k, 1);
      if (search(rest)) return true;
      mark(k, -1);
    }
    chosen[next] = -1;
    return false;
  };
  if (!search(options.map((_, i) => i))) return null;
  return options.map((_, i) => all[chosen[i]].s);
}

// ---------- Start / End tags ----------

export const TAG_FONT = 8;
/** Room for the dot / flag before the words. */
export const TAG_ICON_W = 10;
export const TAG_LINE_H = 10.4;
const TAG_PAD_Y = 2.5;

export type TagKind = 'start' | 'end' | 'both';

/** A small tag by the first / last marker: "Start", "End" (one stop: "Start – End"). */
export interface CardTag {
  kind: TagKind;
  text: string;
  x: number;
  y: number;
  w: number;
  h: number;
  leader: Segment | null;
}

/** The tags: "Start" at the first stop and "End" at the last, or one "Start – End" for a one-stop day. */
export function tagTexts(stops: number): { kind: TagKind; text: string; m: number }[] {
  if (stops <= 0) return [];
  if (stops === 1) return [{ kind: 'both', text: 'Start – End', m: 0 }];
  return [
    { kind: 'start', text: 'Start', m: 0 },
    { kind: 'end', text: 'End', m: stops - 1 },
  ];
}

export const tagSize = (text: string) => ({ w: textWidth(text, TAG_FONT) + PILL_PAD_X * 2 + TAG_ICON_W, h: TAG_LINE_H + TAG_PAD_Y * 2 });

/**
 * Markers along the prototype's line for the stops visited (in visit order), a name pill each,
 * and Start / End tags at the first and last stop.
 */
export function cardLayout(stops: CardStop[]): CardLayout {
  const n = stops.length;
  const spacing = n > 1 ? TRAIL_LENGTH / (n - 1) : TRAIL_LENGTH;
  const r = clamp(Math.floor(spacing / 2 - 3), MIN_MARKER_R, MARKER_R);
  const at = stopDistances(n).map(pointAlong);
  const markers: CardMarker[] = stops.map((s, i) => ({ id: s.id, name: s.name, emoji: stopEmoji(s), r, x: at[i].x, y: at[i].y }));
  const normals = at.map((p) => ({ x: p.nx, y: p.ny }));
  // Names alternate sides of the line; a stop's tag prefers the side its name doesn't.
  const side = (i: number) => (i % 2 === 0 ? 1 : -1);
  const tags = tagTexts(n).map((t) => ({ ...t, ...tagSize(t.text) }));
  const tagSpots = tags.map((t) => spotsFor({ m: t.m, w: t.w, h: t.h, own: -side(t.m) }, markers, normals));
  const tagArea = tags.reduce((sum, t) => sum + (t.w + PAD) * (t.h + PAD), 0);

  const fits = ({ font, wrapAt }: (typeof STYLES)[number]) =>
    stops.reduce((sum, s) => {
      const p = pillSize(s.name, font, wrapAt);
      return sum + (p.w + PAD) * (p.h + PAD);
    }, tagArea) <=
    MAX_FILL * AREA.w * AREA.h;
  const sizes = new Map<(typeof STYLES)[number], ReturnType<typeof pillSize>[]>();
  const spots = new Map<(typeof STYLES)[number], Spot[][]>();
  for (const avoidCrossing of [true, false]) {
    for (const budget of [QUICK_BUDGET, BUDGET]) {
      for (const style of STYLES) {
        if (!fits(style)) continue;
        // The same spots serve every pass with this style.
        let options = spots.get(style);
        if (!options) {
          const pills = stops.map((s) => pillSize(s.name, style.font, style.wrapAt));
          sizes.set(style, pills);
          options = [...pills.map((p, i) => spotsFor({ m: i, w: p.w, h: p.h, own: side(i) }, markers, normals)), ...tagSpots];
          spots.set(style, options);
        }
        const chosen = place(options, avoidCrossing, budget);
        if (!chosen) continue;
        const pills = sizes.get(style)!;
        return {
          markers,
          labels: markers.map((m, i) => ({
            id: m.id,
            name: m.name,
            lines: pills[i].lines,
            ...chosen[i].r,
            fontSize: style.font,
            lineHeight: pills[i].lineHeight,
            leader: chosen[i].leader,
          })),
          tags: tags.map((t, k) => ({ kind: t.kind, text: t.text, ...chosen[n + k].r, leader: chosen[n + k].leader })),
        };
      }
    }
  }
  // A day too crowded for any of that: markers without names, and the tags if they fit.
  const tagsOnly = place(tagSpots, false, BUDGET);
  return {
    markers,
    labels: [],
    tags: tagsOnly ? tags.map((t, k) => ({ kind: t.kind, text: t.text, ...tagsOnly[k].r, leader: tagsOnly[k].leader })) : [],
  };
}

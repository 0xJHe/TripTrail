import type { StopCategory } from '@/lib/ai';
import type { LatLng } from '@/lib/distance';
import { curvePath, projector, simplify, stopEmoji, type Box, type XY } from './trail';

/**
 * Where everything goes on the day recap card (screen 15), on a 300-wide 9:16 canvas: the trail
 * and markers fitted inside the card with padding, markers kept apart, and a name pill by each
 * marker. When the pills can't all fit without covering each other (or a marker), the markers
 * get a small number instead and the names are listed under the map ("1 · Roti canai").
 * Nothing (line, marker, pill, list) goes past the card's edges.
 */

export const CARD_W = 300;
export const CARD_H = (CARD_W * 16) / 9;
export const MARKER_R = 13;
/** Pills and the list keep this far from the card's left / right edges. */
export const EDGE = 12;
/** Top of the map area: under the date and the trip name. */
export const MAP_TOP = 118;
/** Top of the stats row. */
export const STATS_TOP = 412;
export const LABEL_H = 16;
/** Longest pill; longer names end in "…". */
export const LABEL_MAX_W = 132;
/** Space between two markers' edges. */
const MARKER_GAP = 6;
/** Space between a pill and anything else. */
const LABEL_PAD = 3;
export const LEGEND_ROW = 13;
const LEGEND_GAP = 10;

export interface CardStop extends LatLng {
  id: string;
  name: string;
  category: StopCategory | null;
}

export interface CardMarker extends XY {
  id: string;
  name: string;
  emoji: string;
  /** 1, 2, 3… in visit order. */
  n: number;
  /** Where the stop really is, when the marker was moved off it to keep markers apart. */
  spot: XY | null;
}

/** A name pill: centre, width. */
export interface CardLabel extends XY {
  id: string;
  name: string;
  w: number;
}

/** One line of the list under the map (numbered mode): top-left, width. */
export interface LegendItem extends XY {
  n: number;
  name: string;
  w: number;
}

export interface CardLayout {
  /** Where the trail and the markers are fitted. */
  mapBox: Box;
  path: string;
  /** Start and end of the drawn line (for its colour gradient); null without a line. */
  ends: { from: XY; to: XY } | null;
  markers: CardMarker[];
  /** Name pills; empty in numbered mode. */
  labels: CardLabel[];
  /** True: numbers in the markers and the names listed under the map. */
  numbered: boolean;
  legend: LegendItem[];
}

/** Rough pill width for a name (9.5 px bold Inter), at most LABEL_MAX_W. */
export const labelWidth = (name: string) => Math.min(LABEL_MAX_W, 14 + name.length * 5.4);

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const overlaps = (a: Rect, b: Rect, pad = 0) =>
  a.x < b.x + b.w + pad && b.x < a.x + a.w + pad && a.y < b.y + b.h + pad && b.y < a.y + a.h + pad;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * Pushes markers apart until no two are closer than `gap` (centre to centre), keeping them in
 * the box. Markers on the same spot are fanned out in a fixed direction, so it never flickers.
 */
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

/** A pill beside each marker (above, below, right, left: the first that fits), or null if one doesn't fit. */
function placeLabels(markers: CardMarker[]): CardLabel[] | null {
  const dots: Rect[] = markers.map((m) => ({ x: m.x - MARKER_R, y: m.y - MARKER_R, w: MARKER_R * 2, h: MARKER_R * 2 }));
  const placed: Rect[] = [];
  const labels: CardLabel[] = [];
  for (const m of markers) {
    const w = labelWidth(m.name);
    const off = MARKER_R + 4;
    const spots: XY[] = [
      { x: m.x, y: m.y - off - LABEL_H / 2 },
      { x: m.x, y: m.y + off + LABEL_H / 2 },
      { x: m.x + off + w / 2, y: m.y },
      { x: m.x - off - w / 2, y: m.y },
    ];
    const fit = spots
      .map((s) => ({
        x: clamp(s.x, EDGE + w / 2, CARD_W - EDGE - w / 2),
        y: clamp(s.y, MAP_TOP - 8 + LABEL_H / 2, STATS_TOP - 6 - LABEL_H / 2),
      }))
      .find((c) => {
        const r = { x: c.x - w / 2, y: c.y - LABEL_H / 2, w, h: LABEL_H };
        return !dots.some((d) => overlaps(r, d, LABEL_PAD)) && !placed.some((p) => overlaps(r, p, LABEL_PAD));
      });
    if (!fit) return null;
    placed.push({ x: fit.x - w / 2, y: fit.y - LABEL_H / 2, w, h: LABEL_H });
    labels.push({ ...fit, id: m.id, name: m.name, w });
  }
  return labels;
}

/** Columns for the list under the map. */
const legendColumns = (n: number) => (n <= 3 ? 1 : n <= 10 ? 2 : 3);

function drawIn(trail: LatLng[], stops: CardStop[], box: Box, gap: number) {
  const project = projector([...trail, ...stops], box);
  const line = simplify(trail.map(project), 1.2);
  const spots = stops.map((s) => project(s));
  const markers = spreadMarkers(
    stops.map((s, i) => ({ ...spots[i], id: s.id, name: s.name, emoji: stopEmoji(s), n: i + 1, spot: null as XY | null })),
    box,
    gap,
  ).map((m, i) => (Math.hypot(m.x - spots[i].x, m.y - spots[i].y) > MARKER_R ? { ...m, spot: spots[i] } : m));
  const ends = line.length >= 2 ? { from: line[0], to: line[line.length - 1] } : null;
  return { path: line.length >= 2 ? curvePath(line) : '', ends, markers };
}

/** The whole card layout for a trail and the stops visited, in visit order. */
export function cardLayout(trail: LatLng[], stops: CardStop[]): CardLayout {
  // Markers' centres stay a marker away from the card's edges, so the circles are inside.
  const side = EDGE + MARKER_R;
  const full: Box = { x: side, y: MAP_TOP + 26, w: CARD_W - 2 * side, h: STATS_TOP - 30 - (MAP_TOP + 26) };
  const labelled = drawIn(trail, stops, full, MARKER_R * 2 + MARKER_GAP);
  const labels = placeLabels(labelled.markers);
  if (labels) return { mapBox: full, ...labelled, labels, numbered: false, legend: [] };

  // Numbered: the list takes the bottom of the map area.
  const cols = legendColumns(stops.length);
  const rows = Math.ceil(stops.length / cols);
  const legendTop = STATS_TOP - 14 - rows * LEGEND_ROW;
  const box: Box = { x: side, y: MAP_TOP + MARKER_R + 4, w: CARD_W - 2 * side, h: legendTop - 10 - MARKER_R - (MAP_TOP + MARKER_R + 4) };
  const numbered = drawIn(trail, stops, box, MARKER_R * 2 + MARKER_GAP + 2);
  const colW = (CARD_W - 2 * EDGE - (cols - 1) * LEGEND_GAP) / cols;
  const legend = stops.map((s, i) => ({
    n: i + 1,
    name: s.name,
    x: EDGE + (i % cols) * (colW + LEGEND_GAP),
    y: legendTop + Math.floor(i / cols) * LEGEND_ROW,
    w: colW,
  }));
  return { mapBox: box, ...numbered, labels: [], numbered: true, legend };
}

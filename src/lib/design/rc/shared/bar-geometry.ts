/**
 * Shared bar-layout geometry — code-agnostic.
 *
 * Single source of truth for where every bar sits in the cross-section (mm,
 * x from the left face, y = depth from the top fibre). Used by BOTH the SVG
 * preview and the strain-compatibility flexure solver, so the drawing and the
 * math can never disagree.
 *
 * Layering: bars overflow a single layer per the fit limit into a second layer
 * at LAYER_CLEAR_MM clear (hard-coded 50 mm — above the 25 mm code minimum,
 * chosen for 135° seismic-hook clearance and vibrator access). Layer-2 bars are
 * vertically aligned with layer-1 bars. Maximum 2 layers; beyond that the
 * arrangement does not fit.
 *
 * The single-layer fit uses the clear-spacing minimum (`minClearSpacing`), which
 * is itself a code rule (ACI/SNI 25.2.1) but kept here because it defines the
 * physical layout the previews draw. The pass/fail *verdicts* live in the
 * per-code strategy (codes/<code>/beam.ts).
 */

import { barArea, barDia } from "./rebar"
import type { RebarArrangement } from "../types"

/** Hard-coded clear spacing between bar layers, mm (≥ 25 mm of 25.2.2). */
export const LAYER_CLEAR_MM = 50
/** Assumed nominal maximum aggregate size, mm (25.4 = 1 in). Feeds the 25.2.1
 *  (4/3)·d_agg clear-spacing term. Not a tracked input — see the preview note. */
export const AGG_SIZE_MM = 25.4

/** Minimum clear spacing between bars in a layer (25.2.1): greatest of 25 mm,
 *  db, and (4/3)·d_agg. */
export function minClearSpacing(db: number): number {
  return Math.max(25, db, (4 / 3) * AGG_SIZE_MM)
}

/** Max bars that fit in a single layer of width b (25.2.1 clear spacing). */
export function maxBarsPerLayer(b: number, cover: number, dbStirrup: number, db: number): number {
  const sMin = minClearSpacing(db)
  const bwClear = b - 2 * cover - 2 * dbStirrup
  return Math.max(1, Math.floor((bwClear + sMin) / (db + sMin)))
}

/** Max bars on one face across the 2-layer cap (the buildable upper bound). */
export function maxBarsTwoLayers(b: number, cover: number, dbStirrup: number, db: number): number {
  return 2 * maxBarsPerLayer(b, cover, dbStirrup, db)
}

export interface LayoutBar {
  /** Centre x from the left face, mm */
  x: number
  /** Centre depth from the top fibre, mm */
  y: number
  db: number
  area: number
  role: "top" | "bottom" | "side"
  layer: 1 | 2
}

export interface FaceGroup {
  count: number
  db: number
  /** Bars in layer 1 (at the face) / layer 2 (50 mm clear inward). */
  n1: number
  n2: number
  /** Layer centre depths from the top fibre, mm. */
  y1: number
  y2: number | null
  /** Max bars that fit in one layer per 25.2.1. */
  nMax: number
  /** Actual clear spacing between layer-1 bars, mm (null when n1 < 2). */
  clearSpacing: number | null
  /** Centre-to-centre spacing of layer-1 bars, mm (null when n1 < 2). */
  centerSpacing: number | null
  /** Area-weighted centroid depth of the group from the top fibre, mm. */
  centroid: number
  /** Depth of the extreme layer (layer 1, nearest the face), mm from top. */
  extreme: number
  /** Total steel area, mm². */
  area: number
  overflow: boolean
  fits: boolean
}

export interface BarLayout {
  bars: LayoutBar[]
  top: FaceGroup
  bottom: FaceGroup
  side: { count: number; db: number; ys: number[]; spacing: number | null }
  /** Both faces fit within 2 layers. */
  fits: boolean
}

/** Evenly distribute n values across [from, to] inclusive (centred when n = 1). */
function spread(n: number, from: number, to: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [(from + to) / 2]
  const step = (to - from) / (n - 1)
  return Array.from({ length: n }, (_, i) => from + i * step)
}

/** Pick n positions from xs, symmetric and vertically aligned (25.2.2). */
function pickAligned(xs: number[], n: number): number[] {
  if (n <= 0) return []
  if (n >= xs.length) return xs.slice()
  if (n === 1) return [xs[Math.floor((xs.length - 1) / 2)]]
  const idxs = new Set<number>()
  for (let i = 0; i < n; i++) idxs.add(Math.round((i * (xs.length - 1)) / (n - 1)))
  let k = 0
  while (idxs.size < n && k < xs.length) idxs.add(k++)
  return [...idxs].sort((a, b) => a - b).map((i) => xs[i])
}

function buildFace(
  face: "top" | "bottom",
  b: number,
  h: number,
  cover: number,
  dbS: number,
  count: number,
  db: number,
  areaPerBar: number,
): { group: FaceGroup; bars: LayoutBar[] } {
  const bwClear = b - 2 * cover - 2 * dbS // width inside the stirrup legs
  const nMax = maxBarsPerLayer(b, cover, dbS, db)
  // Layer split: fill layer 1 to nMax, overflow to layer 2. A lone bar in the
  // second layer is impractical (a single centred bar), so when the overflow is
  // exactly one bar we pull a second one down from layer 1 — the 2nd layer then
  // carries two bars at the outer (left/right) positions.
  let n1: number
  let n2: number
  if (count <= nMax) {
    n1 = count
    n2 = 0
  } else {
    n2 = count - nMax
    if (n2 === 1 && nMax >= 3) n2 = 2
    n1 = count - n2
  }
  const fits = n2 <= nMax

  const inset = cover + dbS + db / 2 // face → bar centre
  const yFace = face === "top" ? inset : h - inset
  const dir = face === "top" ? 1 : -1 // inward
  const y2 = n2 > 0 ? yFace + dir * (db + LAYER_CLEAR_MM) : null

  const xs1 = spread(n1, inset, b - inset)
  // Place ALL n2 bars so geometry and group.area always agree. When the layer
  // fits (n2 ≤ n1) the bars stay vertically aligned with layer 1 (25.2.2);
  // beyond that (the unbuildable, fits = false case) they spread evenly so no
  // bar is dropped from the layout.
  const xs2 =
    y2 !== null ? (n2 <= xs1.length ? pickAligned(xs1, n2) : spread(n2, inset, b - inset)) : []

  const bars: LayoutBar[] = [
    ...xs1.map<LayoutBar>((x) => ({ x, y: yFace, db, area: areaPerBar, role: face, layer: 1 })),
    ...xs2.map<LayoutBar>((x) => ({ x, y: y2!, db, area: areaPerBar, role: face, layer: 2 })),
  ]

  const clearSpacing = n1 >= 2 ? (bwClear - n1 * db) / (n1 - 1) : null
  const centerSpacing = n1 >= 2 ? (b - 2 * inset) / (n1 - 1) : null
  const nTot = n1 + n2
  const centroid = nTot > 0 ? (n1 * yFace + n2 * (y2 ?? yFace)) / nTot : yFace

  return {
    group: {
      count, db, n1, n2, y1: yFace, y2, nMax,
      clearSpacing, centerSpacing,
      centroid, extreme: yFace,
      area: count * areaPerBar,
      overflow: n2 > 0,
      fits,
    },
    bars,
  }
}

export function buildBarLayout(
  b: number,
  h: number,
  cover: number,
  arr: RebarArrangement,
): BarLayout {
  const dbS = barDia(arr.stirrup.size)
  const dbTop = barDia(arr.top.size)
  const dbBot = barDia(arr.bottom.size)
  const dbSide = barDia(arr.side.size)

  const top = buildFace("top", b, h, cover, dbS, arr.top.count, dbTop, barArea(arr.top.size))
  const bottom = buildFace("bottom", b, h, cover, dbS, arr.bottom.count, dbBot, barArea(arr.bottom.size))

  // Side (skin) bars: evenly distributed on each face BETWEEN the innermost
  // top row and the innermost bottom row — interior division points only, so
  // n side bars split the clear height into n+1 equal gaps.
  const yTopIn = Math.max(top.group.y1, top.group.y2 ?? -Infinity)
  const yBotIn = Math.min(bottom.group.y1, bottom.group.y2 ?? Infinity)
  const nSide = Math.max(0, arr.side.count)
  const sideYs = spread(nSide + 2, yTopIn, yBotIn).slice(1, -1)
  const sideInset = cover + dbS + dbSide / 2
  const sideBars: LayoutBar[] = sideYs.flatMap<LayoutBar>((y) => [
    { x: sideInset, y, db: dbSide, area: barArea(arr.side.size), role: "side", layer: 1 },
    { x: b - sideInset, y, db: dbSide, area: barArea(arr.side.size), role: "side", layer: 1 },
  ])
  const sideSpacing = nSide > 0 ? (yBotIn - yTopIn) / (nSide + 1) : null

  return {
    bars: [...top.bars, ...bottom.bars, ...sideBars],
    top: top.group,
    bottom: bottom.group,
    side: { count: nSide, db: dbSide, ys: sideYs, spacing: sideSpacing },
    fits: top.group.fits && bottom.group.fits,
  }
}

/**
 * Max side (skin) bars per face so their vertical clear spacing stays ≥ the
 * 25.2.1 minimum. Side bars occupy the clear height between the innermost top
 * and bottom rows; n bars there make n+1 equal gaps. Independent of the current
 * side count (built with side = 0 to locate the rows).
 */
export function maxSideBars(b: number, h: number, cover: number, arr: RebarArrangement): number {
  const layout = buildBarLayout(b, h, cover, { ...arr, side: { ...arr.side, count: 0 } })
  const yTopIn = Math.max(layout.top.y1, layout.top.y2 ?? -Infinity)
  const yBotIn = Math.min(layout.bottom.y1, layout.bottom.y2 ?? Infinity)
  const span = yBotIn - yTopIn
  const dbSide = barDia(arr.side.size)
  const pitchMin = dbSide + minClearSpacing(dbSide) // centre-to-centre minimum
  return Math.max(0, Math.floor(span / pitchMin) - 1)
}

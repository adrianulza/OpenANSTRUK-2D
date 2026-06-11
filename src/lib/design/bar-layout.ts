/**
 * Shared bar-layout geometry + ACI 318-14 detailing checks.
 *
 * Single source of truth for where every bar sits in the cross-section (mm,
 * x from the left face, y = depth from the top fibre). Used by BOTH the SVG
 * preview and the strain-compatibility flexure solver, so the drawing and the
 * math can never disagree.
 *
 * Layering: bars overflow a single layer per the 25.2.1 fit limit into a
 * second layer at LAYER_CLEAR_MM clear (hard-coded 50 mm — above the 25 mm
 * code minimum of 25.2.2, chosen for 135° seismic-hook clearance and vibrator
 * access). Layer-2 bars are vertically aligned with layer-1 bars (25.2.2).
 * Maximum 2 layers; beyond that the arrangement does not fit.
 */

import { barArea, barDia } from "./rebar"
import {
  avMinPerS,
  avSProvided,
  generalSpacingMax,
  imfEndZoneSpacingMax,
  smfEndZoneSpacingMax,
} from "./shear"
import type { FrameType, RebarArrangement } from "./types"

/** Hard-coded clear spacing between bar layers, mm (≥ 25 mm of 25.2.2). */
export const LAYER_CLEAR_MM = 50
/** Minimum clear spacing between bars in a layer (25.2.1): max(25, db). */
export function minClearSpacing(db: number): number {
  return Math.max(25, db)
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
  const xs2 = y2 !== null ? pickAligned(xs1, Math.min(n2, nMax)) : []

  const bars: LayoutBar[] = [
    ...xs1.map<LayoutBar>((x) => ({ x, y: yFace, db, area: areaPerBar, role: face, layer: 1 })),
    ...xs2.map<LayoutBar>((x) => ({ x, y: y2!, db, area: areaPerBar, role: face, layer: 2 })),
  ]

  const clearSpacing = n1 >= 2 ? (bwClear - n1 * db) / (n1 - 1) : null
  const centerSpacing = n1 >= 2 ? (b - 2 * inset) / (n1 - 1) : null
  const nTot = n1 + Math.min(n2, nMax)
  const centroid = nTot > 0 ? (n1 * yFace + (nTot - n1) * (y2 ?? yFace)) / nTot : yFace

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

// ── ACI 318-14 detailing checks ───────────────────────────────────────────────

export interface ArrangementCheck {
  status: "pass" | "warn" | "fail"
  text: string
  clause: string
}

/** Max centre spacing of flexural tension bars (24.3.2), fs = ⅔·fy (24.3.2.1). */
export function maxCrackSpacing(fy: number, ccToBar: number): number {
  const fs = (2 / 3) * fy
  const r = 280 / fs
  return Math.min(380 * r - 2.5 * ccToBar, 300 * r)
}

export function checkArrangement(
  b: number,
  h: number,
  cover: number,
  arr: RebarArrangement,
  opts: { fy: number; frameType: FrameType },
): ArrangementCheck[] {
  const layout = buildBarLayout(b, h, cover, arr)
  const dbS = barDia(arr.stirrup.size)
  const checks: ArrangementCheck[] = []
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

  for (const [label, g] of [["Top", layout.top], ["Bottom", layout.bottom]] as const) {
    if (!g.fits) {
      checks.push({
        status: "fail",
        text: `${label} bars do not fit in b = ${f(b)} mm, even in 2 layers`,
        clause: "25.2.1",
      })
      continue
    }
    if (g.overflow) {
      checks.push({
        status: "warn",
        text: `${label} bars exceed single-layer fit — arranged in 2 layers @ ${LAYER_CLEAR_MM} mm clear`,
        clause: "25.2.1",
      })
    }
    if (g.clearSpacing !== null) {
      const sMin = minClearSpacing(g.db)
      checks.push({
        status: g.clearSpacing >= sMin - 1e-9 ? "pass" : "fail",
        text: `${label} clear spacing ${f(g.clearSpacing)} mm ≥ ${f(sMin)} mm`,
        clause: "25.2.1",
      })
    }
    if (g.centerSpacing !== null) {
      const sMax = maxCrackSpacing(opts.fy, cover + dbS)
      checks.push({
        status: g.centerSpacing <= sMax + 1e-9 ? "pass" : "fail",
        text: `${label} bar spacing ${f(g.centerSpacing)} mm ≤ ${f(sMax)} mm (crack control)`,
        clause: "24.3.2",
      })
    }
  }

  // Minimum cover — cast-in-place beam, not exposed to weather/ground (assumed).
  checks.push({
    status: cover >= 40 ? "pass" : "warn",
    text: `Clear cover ${f(cover)} mm ${cover >= 40 ? "≥" : "<"} 40 mm`,
    clause: "20.6.1.3.1",
  })

  // SMF beams: at least 2 continuous bars top and bottom.
  if (opts.frameType === "SMF") {
    const ok = arr.top.count >= 2 && arr.bottom.count >= 2
    checks.push({
      status: ok ? "pass" : "fail",
      text: ok ? "≥ 2 continuous bars top and bottom" : "SMF requires ≥ 2 bars top and bottom",
      clause: "18.6.3.1",
    })
  }

  // Skin reinforcement: required where h > 900 mm; spacing per 24.3.2.
  if (h > 900) {
    if (layout.side.count === 0) {
      checks.push({
        status: "fail",
        text: "h > 900 mm — skin (side) reinforcement required on both faces",
        clause: "9.7.2.3",
      })
    } else {
      const sMax = maxCrackSpacing(opts.fy, cover + dbS)
      const s = layout.side.spacing ?? 0
      checks.push({
        status: s <= sMax + 1e-9 ? "pass" : "fail",
        text: `Skin bar spacing ${f(s)} mm ≤ ${f(sMax)} mm`,
        clause: "9.7.2.3 / 24.3.2",
      })
    }
  } else if (layout.side.count > 0) {
    checks.push({
      status: "pass",
      text: "Side bars optional for h ≤ 900 mm (included in capacity)",
      clause: "9.7.2.3",
    })
  }

  return checks
}

// ── Transverse (stirrup / hoop) detailing checks ──────────────────────────────

export interface TransverseChecks {
  checks: ArrangementCheck[]
  /** Trailing advisory notes (placement along the span isn't modelled). */
  notes: string[]
}

/**
 * Live ACI 318-14 detailing checks for the user-defined stirrup/hoop in the
 * given zone (Support = member-end hinge region, Midspan = elsewhere). All are
 * geometry-only (demand-independent) so they update without a solver run:
 *
 * - Max spacing per frame type + zone (9.7.6.2.2 / 18.4.2.5 / 18.6.4.4/6).
 *   The general (OMF) cap additionally tightens to min(d/4, 300) when Vs is high
 *   — that branch is demand-dependent, so it is only noted here and enforced at
 *   Run.
 * - Minimum web steel Av/s ≥ Av,min/s (9.6.3.3).
 * - SMF lateral support hx ≤ 350 mm (18.6.4.2).
 * - Stirrup bar ≥ D10 (25.7.1, practice).
 */
export function checkTransverse(
  b: number,
  h: number,
  cover: number,
  arr: RebarArrangement,
  zone: "support" | "midspan",
  opts: { frameType: FrameType; fyt: number; fc: number; legs: number },
): TransverseChecks {
  const { frameType, fyt, fc, legs } = opts
  const isEnd = zone === "support"
  const layout = buildBarLayout(b, h, cover, arr)
  const d = layout.bottom.centroid // depth to bottom tension steel (22.5)
  const dbS = barDia(arr.stirrup.size)
  const dbLong = Math.max(barDia(arr.top.size), barDia(arr.bottom.size))
  const s = arr.stirrup.spacing
  const checks: ArrangementCheck[] = []
  const notes: string[] = []
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))

  // 1) Maximum spacing — governing rule for frame type + zone.
  let sMax: number
  let clause: string
  if (frameType === "SMF") {
    sMax = isEnd ? smfEndZoneSpacingMax(d, dbLong) : d / 2
    clause = isEnd ? "18.6.4.4" : "18.6.4.6"
  } else if (frameType === "IMF") {
    sMax = isEnd ? imfEndZoneSpacingMax(d, dbLong, dbS) : d / 2
    clause = isEnd ? "18.4.2.5" : "18.4.2.6"
  } else {
    sMax = generalSpacingMax(d, false)
    clause = "9.7.6.2.2"
  }
  checks.push({
    status: s <= sMax + 1e-9 ? "pass" : "fail",
    text: `Stirrup spacing ${f(s)} mm ≤ ${f(sMax)} mm${
      frameType === "OMF" ? " (→ min(d/4, 300) when Vs is high)" : ""
    }`,
    clause,
  })

  // 2) Minimum web steel (9.6.3.3), where stirrups are required.
  const avMin = avMinPerS(fc, fyt, b) * 1000 // mm²/m
  const avProv = avSProvided(legs, arr.stirrup.size, s)
  checks.push({
    status: avProv >= avMin - 1e-6 ? "pass" : "fail",
    text: `Aᵥ/s ${f(avProv)} ≥ Aᵥ,min/s ${f(avMin)} mm²/m`,
    clause: "9.6.3.3",
  })

  // 3) SMF lateral support of longitudinal bars (18.6.4.2): hx ≤ 350 mm.
  if (frameType === "SMF") {
    const supported = Math.max(2, legs) // corner + crosstie legs
    const hx = (b - 2 * cover - 2 * dbS) / (supported - 1)
    checks.push({
      status: hx <= 350 + 1e-9 ? "pass" : "fail",
      text: `Laterally-supported bar spacing hₓ ${f(hx)} mm ≤ 350 mm`,
      clause: "18.6.4.2",
    })
  }

  // 4) Practical minimum hoop bar size.
  if (dbS < 9.9) {
    checks.push({
      status: "warn",
      text: `Stirrup ${arr.stirrup.size} below D10 — use ≥ D10`,
      clause: "25.7.1",
    })
  }

  // Placement notes (not modelled along the span).
  if (frameType !== "OMF" && isEnd) {
    notes.push(
      `First hoop ≤ 50 mm from the support face; provide hoops over 2h (${
        frameType === "SMF" ? "18.6.4.1" : "18.4.2.4"
      }).`,
    )
  }
  notes.push("d taken to the bottom tension-steel centroid (22.5).")

  return { checks, notes }
}

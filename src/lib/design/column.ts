/**
 * RC rectangular-column axial-flexure (P–M) interaction — ACI 318-14 /
 * SNI 2847:2019, §5.4.4.1 (book Contoh 5-C).
 *
 * Pure domain module (no React). All internal mechanics in N, mm, MPa; the
 * public P–M points cross the boundary in **kN** (axial) and **kN·m** (moment).
 *
 * Sign convention matches the solver and the book: **tension positive,
 * compression negative**. Internally the section mechanic is computed
 * compression-positive (concrete + bars push together) and negated at the
 * boundary, so `Pn < 0` is net compression — the same sign the DSM solver's
 * axial `N` uses.
 *
 * The strain-compatibility mechanic is identical to `phiMnBars` in flexure.ts
 * (same εcu, fs clamp, displaced-concrete correction, φ ramp); the only
 * generalisation is that the net axial is no longer forced to zero — sweeping
 * the neutral-axis depth `c` traces the whole interaction curve. flexure.ts is
 * deliberately left untouched (its required-mode + Whitney paths are
 * byte-stable validation anchors).
 */

import { beta1, EPS_CU, EPS_T_MIN } from "./flexure"
import type { DesignCriteria } from "./types"

/** A reinforcing bar reduced to (depth from the compression fibre, area). */
export interface ColumnBar {
  /** Depth from the extreme COMPRESSION fibre, mm. */
  d: number
  /** Bar area, mm². */
  area: number
}

/** One point on the interaction curve, in boundary units (kN, kN·m). */
export interface PMPoint {
  /** Nominal axial, kN (tension +, compression −). */
  Pn: number
  /** Nominal moment, kN·m (signed: + on the posSide, − on the negSide). */
  Mn: number
  /** φ·Pn, kN (capped at −φPn,max on the compression side). */
  phiPn: number
  /** φ·Mn, kN·m. */
  phiMn: number
  /** Strength-reduction factor used at this point. */
  phi: number
  /** Net tensile strain at the extreme tension bar (∞ ⇒ no tension bar). */
  epsT: number
  /** Neutral-axis depth, mm. */
  c: number
}

export interface AxialCapacities {
  /** Pure axial compression Po (kN, magnitude). */
  Po: number
  phiPo: number
  /** Nominal cap Pn,max = 0.80·Po (tied), kN magnitude. */
  PnMax: number
  /** φ·Pn,max = 0.80·φPo, kN magnitude (the flat cap on the compression side). */
  phiPnMax: number
  /** Pure axial tension Pnt = fy·Ast (kN, magnitude). */
  Pnt: number
  phiPnt: number
}

export interface ColumnInteractionCurve {
  /** +M edge (compression at the "top" face), ordered tension → compression. */
  posSide: PMPoint[]
  /** −M edge (compression at the "bottom" face), ordered tension → compression. */
  negSide: PMPoint[]
  /** Closed φ-space polygon (M, P) used for the radial D/C check + the chart. */
  phiPolygon: { M: number; P: number }[]
  /** Closed nominal-space polygon (M, P) for the chart. */
  nominalPolygon: { M: number; P: number }[]
  /** Named book points A–E (+M side for B/C/D). */
  named: { A: PMPoint; B: PMPoint; C: PMPoint; D: PMPoint; E: PMPoint }
  caps: AxialCapacities
  /** Total longitudinal steel, mm². */
  Ast: number
}

// ── Axial endpoints (closed form) ─────────────────────────────────────────────

/** Tied-column axial cap factor Pn,max = 0.80·Po (22.4.2.1 / 25.7.2). Spiral
 *  (0.85) is deferred to the shear/SRPMK pass. */
export const PN_MAX_FACTOR_TIED = 0.8

export function axialCapacities(
  Ast: number,
  Ag: number,
  fc: number,
  cr: DesignCriteria,
): AxialCapacities {
  const fy = cr.fy
  const Po = (0.85 * fc * (Ag - Ast) + fy * Ast) / 1e3 // kN
  const phiPo = cr.phiCompression * Po
  const PnMax = PN_MAX_FACTOR_TIED * Po
  const phiPnMax = PN_MAX_FACTOR_TIED * phiPo
  const Pnt = (fy * Ast) / 1e3 // kN (tension)
  const phiPnt = cr.phiTension * Pnt
  return { Po, phiPo, PnMax, phiPnMax, Pnt, phiPnt }
}

// ── Section forces at a trial neutral-axis depth c ────────────────────────────

interface SectionForces {
  /** Net axial, N, compression positive. */
  axialCompPos: number
  /** Moment about the geometric centroid, N·mm (magnitude, compression at top). */
  Mn_Nmm: number
  /** Net tensile strain at the extreme tension bar. */
  epsT: number
  c: number
  a: number
}

/**
 * Concrete + bar resultants at neutral-axis depth `c`, taken about the section's
 * geometric centroid (h/2). Bars carry the displaced-concrete correction inside
 * the stress block. εcu = 0.003 (22.2.2.1); a = β₁·c capped at h.
 */
function sectionForcesAtC(
  bars: ColumnBar[],
  b: number,
  h: number,
  fc: number,
  cr: DesignCriteria,
  c: number,
): SectionForces {
  const { Es, fy } = cr
  const b1 = beta1(fc)
  const a = Math.min(b1 * c, h)
  const Cc = 0.85 * fc * b * a // N, compression +
  let axial = Cc
  let moment = Cc * (h / 2 - a / 2) // N·mm

  const active = bars.filter((p) => p.area > 0)
  const dt = active.length > 0 ? Math.max(...active.map((p) => p.d)) : 0

  for (const p of active) {
    const eps = c > 0 ? EPS_CU * ((c - p.d) / c) : -1 // compression +
    const fs = Math.max(-fy, Math.min(fy, Es * eps))
    const displaced = fs > 0 && p.d <= a ? 0.85 * fc : 0
    const F = p.area * (fs - displaced) // N, compression +
    axial += F
    moment += F * (h / 2 - p.d)
  }

  const epsT = c > 0 ? EPS_CU * ((dt - c) / c) : Infinity
  return { axialCompPos: axial, Mn_Nmm: moment, epsT, c, a }
}

/** φ ramp 0.65 → 0.9 over εty → 0.005 (21.2.2). */
function phiFor(epsT: number, cr: DesignCriteria): number {
  const epsTy = cr.fy / cr.Es
  const t = (epsT - epsTy) / (EPS_T_MIN - epsTy)
  return Math.min(
    cr.phiTension,
    Math.max(cr.phiCompression, cr.phiCompression + (cr.phiTension - cr.phiCompression) * t),
  )
}

/** Build a boundary-unit PMPoint at depth `c` for one bending sign. `sign` = +1
 *  for the posSide (+M), −1 for the negSide (−M). φPn is clamped to the
 *  compression cap −φPnMax. */
function pointAtC(
  bars: ColumnBar[],
  b: number,
  h: number,
  fc: number,
  cr: DesignCriteria,
  c: number,
  sign: 1 | -1,
  caps: AxialCapacities,
): PMPoint {
  const f = sectionForcesAtC(bars, b, h, fc, cr, c)
  const Pn = -f.axialCompPos / 1e3 // kN, tension +
  const Mn = sign * Math.max(0, f.Mn_Nmm) / 1e6 // kN·m, signed
  const phi = phiFor(f.epsT, cr)
  // Cap the compression side (Pn < 0) at the nominal / reduced ceilings.
  const PnCapped = Math.max(Pn, -caps.PnMax)
  const phiPn = Math.max(phi * Pn, -caps.phiPnMax)
  return { Pn: PnCapped, Mn, phiPn, phiMn: phi * Mn, phi, epsT: f.epsT, c }
}

// ── Curve assembly ─────────────────────────────────────────────────────────────

/** Geometric-ish c sampling, denser near small c (where the curve bends most). */
function sampleCs(dt: number, h: number, fc: number, n: number): number[] {
  const cMin = Math.max(0.02 * dt, 1)
  const cMax = (1.05 * h) / beta1(fc) // a = β₁·c ≈ h → essentially pure compression
  const out: number[] = []
  for (let i = 0; i <= n; i++) {
    const u = i / n
    // sqrt easing → more points at the low-c (tension-controlled) end
    const c = cMin + (cMax - cMin) * (u * u)
    out.push(c)
  }
  return out
}

/** Pure-moment depth (Pn = 0) by bisection on net axial — the beam solve. */
function pureMomentC(bars: ColumnBar[], b: number, h: number, fc: number, cr: DesignCriteria): number {
  const axial = (c: number) => sectionForcesAtC(bars, b, h, fc, cr, c).axialCompPos
  let lo = 1e-3
  let hi = h
  // axial(lo) < 0 (all tension), axial(hi) > 0 (concrete dominates) → root between.
  if (axial(hi) < 0) return hi
  if (axial(lo) > 0) return lo
  for (let i = 0; i < 80; i++) {
    const mid = 0.5 * (lo + hi)
    if (axial(mid) >= 0) hi = mid
    else lo = mid
  }
  return 0.5 * (lo + hi)
}

/**
 * Full P–M interaction curve for an explicit bar layout. Bars are given as
 * depths from the TOP fibre; the posSide measures from the top (compression at
 * top, +M) and the negSide mirrors to the bottom (−M). For a symmetric layout
 * the two sides are mirror images; for nx ≠ ny (or top ≠ bottom) they differ.
 */
export function buildInteractionCurve(
  barsTop: ColumnBar[], // d = depth from TOP fibre
  b: number,
  h: number,
  fc: number,
  cr: DesignCriteria,
): ColumnInteractionCurve {
  const Ast = barsTop.reduce((s, p) => s + p.area, 0)
  const Ag = b * h
  const caps = axialCapacities(Ast, Ag, fc, cr)

  const posBars = barsTop // compression at top → depth = d
  const negBars = barsTop.map((p) => ({ d: h - p.d, area: p.area })) // compression at bottom

  const dtPos = posBars.length ? Math.max(...posBars.map((p) => p.d)) : h
  const cs = sampleCs(dtPos, h, fc, 60)

  const posSide = cs.map((c) => pointAtC(posBars, b, h, fc, cr, c, 1, caps))
  const negSide = cs.map((c) => pointAtC(negBars, b, h, fc, cr, c, -1, caps))

  // Endpoints E (pure tension) and A (pure compression, capped) — shared.
  const E: PMPoint = {
    Pn: caps.Pnt, Mn: 0, phiPn: caps.phiPnt, phiMn: 0,
    phi: cr.phiTension, epsT: Infinity, c: 0,
  }
  const A: PMPoint = {
    Pn: -caps.PnMax, Mn: 0, phiPn: -caps.phiPnMax, phiMn: 0,
    phi: cr.phiCompression, epsT: -Infinity, c: Infinity,
  }

  // Named book points (B/C/D on the +M side, per the symmetric example).
  const epsY = cr.fy / cr.Es
  const cB = (EPS_CU / (epsY + EPS_CU)) * dtPos // balanced (εs = εy)
  const cC = (EPS_CU / (EPS_T_MIN + EPS_CU)) * dtPos // tension-control (εt = 0.005)
  const cD = pureMomentC(posBars, b, h, fc, cr) // pure moment (Pn = 0)
  const named = {
    A,
    B: pointAtC(posBars, b, h, fc, cr, cB, 1, caps),
    C: pointAtC(posBars, b, h, fc, cr, cC, 1, caps),
    D: pointAtC(posBars, b, h, fc, cr, cD, 1, caps),
    E,
  }

  // Closed polygons: E → posSide(asc) → A → reverse(negSide) → E.
  const phiPolygon = [
    { M: E.phiMn, P: E.phiPn },
    ...posSide.map((p) => ({ M: p.phiMn, P: p.phiPn })),
    { M: A.phiMn, P: A.phiPn },
    ...[...negSide].reverse().map((p) => ({ M: p.phiMn, P: p.phiPn })),
  ]
  const nominalPolygon = [
    { M: E.Mn, P: E.Pn },
    ...posSide.map((p) => ({ M: p.Mn, P: p.Pn })),
    { M: A.Mn, P: A.Pn },
    ...[...negSide].reverse().map((p) => ({ M: p.Mn, P: p.Pn })),
  ]

  return { posSide, negSide, phiPolygon, nominalPolygon, named, caps, Ast }
}

// ── Radial demand/capacity ratio ──────────────────────────────────────────────

export interface InteractionDC {
  /** Radial D/C = |demand| / |capacity on the same ray|. */
  dc: number
  /** Capacity point on the ray, φ-space (kN·m, kN). */
  capM: number
  capP: number
}

/**
 * Radial D/C of a demand point (Mu, Pu) against the closed φ-polygon. The origin
 * (0,0) lies inside the interaction surface, so the ray O→demand crosses the
 * boundary exactly once; the capacity is that crossing. D/C = 1/s where the
 * boundary is at s·(Mu, Pu). Inside ⇒ D/C < 1.
 *
 * Pu, Mu are in the SAME convention as the curve: tension-positive axial, signed
 * moment (kN, kN·m).
 */
export function interactionDC(
  curve: ColumnInteractionCurve,
  Pu: number,
  Mu: number,
): InteractionDC {
  const poly = curve.phiPolygon
  const dM = Mu
  const dP = Pu
  if (Math.abs(dM) < 1e-12 && Math.abs(dP) < 1e-12) {
    return { dc: 0, capM: 0, capP: 0 }
  }

  let sBest = Infinity
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]
    const bb = poly[(i + 1) % poly.length]
    const eM = bb.M - a.M
    const eP = bb.P - a.P
    // a + u·e = s·d  →  solve [e  −d]·[u s]ᵀ = −a
    const det = eM * -dP - -dM * eP
    if (Math.abs(det) < 1e-12) continue
    const u = (-a.M * -dP - -dM * -a.P) / det
    const s = (eM * -a.P - -a.M * eP) / det
    if (u >= -1e-9 && u <= 1 + 1e-9 && s > 1e-9 && s < sBest) sBest = s
  }
  if (!Number.isFinite(sBest) || sBest <= 0) {
    return { dc: Infinity, capM: 0, capP: 0 }
  }
  return { dc: 1 / sBest, capM: sBest * dM, capP: sBest * dP }
}

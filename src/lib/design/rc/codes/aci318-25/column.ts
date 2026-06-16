/**
 * RC rectangular-column axial-flexure (P–M) interaction + detailing — ACI 318-25
 * / SNI 2847:2019, §5.4.4.1 (book Contoh 5-C).
 *
 * The "math" half of this code's column design. All internal mechanics in
 * N, mm, MPa; the public P–M points cross the boundary in **kN** (axial) and
 * **kN·m** (moment).
 *
 * Sign convention matches the solver and the book: **tension positive,
 * compression negative**. Internally the section mechanic is computed
 * compression-positive (concrete + bars push together) and negated at the
 * boundary, so `Pn < 0` is net compression — the same sign the DSM solver's
 * axial `N` uses.
 *
 * The strain-compatibility mechanic is identical to `phiMnBars` in beam.ts
 * (same εcu, fs clamp, displaced-concrete correction, φ ramp); the only
 * generalisation is that the net axial is no longer forced to zero — sweeping
 * the neutral-axis depth `c` traces the whole interaction curve.
 */

import { barDia } from "../../shared/rebar"
import { buildColumnBarLayout } from "../../shared/column-grid"
import type { ColumnBar, ArrangementCheck } from "../../shared/types"
import type { FrameType } from "../../../core/types"
import type { ColumnArrangement } from "../../types"
import type { RcCriteria } from "../../criteria"
import {
  beta1,
  EPS_CU,
  RHO_G_MIN,
  RHO_G_MAX,
  minColumnClearSpacing,
  epsTC,
} from "./rules"

export type { ColumnBar }

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

/** Key identifying a spColumn-style interaction control point. */
export type ColumnPointKey =
  | "maxComp"
  | "allowComp"
  | "fs0"
  | "fs05"
  | "balanced"
  | "tensionControl"
  | "pureBending"
  | "maxTension"

/** A named control point on the curve (the vertices spColumn tabulates). */
export interface NamedColumnPoint {
  key: ColumnPointKey
  /** Short chart tag (e.g. "fs=0"). */
  label: string
  /** Longer table note. */
  note: string
  pt: PMPoint
}

export interface ColumnInteractionCurve {
  /** Ordered spColumn-style control points, +M side, compression → tension. */
  controlPoints: NamedColumnPoint[]
  /** Closed φ-space polygon (M, P) used for the radial D/C check + the chart. */
  phiPolygon: { M: number; P: number }[]
  /** Closed nominal-space polygon (M, P) for the chart. */
  nominalPolygon: { M: number; P: number }[]
  /** Named book points A–E (+M side for B/C/D) — kept for validation anchors. */
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
  cr: RcCriteria,
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
  cr: RcCriteria,
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

/** φ ramp 0.65 → 0.9 over εty → εty+0.003 (21.2.2 / Table 21.2.2, 318-25). */
function phiFor(epsT: number, cr: RcCriteria): number {
  const epsTy = cr.fy / cr.Es
  const t = (epsT - epsTy) / (epsTC(cr) - epsTy)
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
  cr: RcCriteria,
  c: number,
  sign: 1 | -1,
  caps: AxialCapacities,
): PMPoint {
  const f = sectionForcesAtC(bars, b, h, fc, cr, c)
  const Pn = -f.axialCompPos / 1e3 // kN, tension +
  const Mn = sign * Math.max(0, f.Mn_Nmm) / 1e6 // kN·m, signed
  const phi = phiFor(f.epsT, cr)
  // Nominal Pn left uncapped (the dash-dot rises to a pointed Po apex); only the
  // φ design value carries the 0.80 compression cap (22.4.2.1 / 25.7.2).
  const phiPn = Math.max(phi * Pn, -caps.phiPnMax)
  return { Pn, Mn, phiPn, phiMn: phi * Mn, phi, epsT: f.epsT, c }
}

/**
 * Neutral-axis depth `c` at which the **uncapped** φPn first reaches the −φPn,max
 * cap — the "Allowable comp." control point where the flat top meets the curve.
 * Bisects between c = dt (below cap) and a = h (above cap). φ is constant (0.65)
 * through this compression-controlled range, so φPn is monotone in c.
 */
function capCrossC(
  bars: ColumnBar[],
  b: number,
  h: number,
  fc: number,
  cr: RcCriteria,
  caps: AxialCapacities,
): number {
  const phiPnAt = (c: number) => {
    const f = sectionForcesAtC(bars, b, h, fc, cr, c)
    return phiFor(f.epsT, cr) * (-f.axialCompPos / 1e3) // kN, < 0 in compression
  }
  const active = bars.filter((p) => p.area > 0)
  let lo = active.length ? Math.max(...active.map((p) => p.d)) : h // c = dt
  let hi = (1.05 * h) / beta1(fc) // a ≈ h → near pure compression
  if (phiPnAt(hi) > -caps.phiPnMax) return hi // never reaches the cap
  for (let i = 0; i < 60; i++) {
    const mid = 0.5 * (lo + hi)
    if (phiPnAt(mid) <= -caps.phiPnMax) hi = mid
    else lo = mid
  }
  return 0.5 * (lo + hi)
}

/** Build the six interior control points (cap → pure bending) for one bend sign. */
function sideControlPoints(
  bars: ColumnBar[],
  b: number,
  h: number,
  fc: number,
  cr: RcCriteria,
  sign: 1 | -1,
  caps: AxialCapacities,
): {
  allowComp: PMPoint
  fs0: PMPoint
  fs05: PMPoint
  balanced: PMPoint
  tensionControl: PMPoint
  pureBending: PMPoint
} {
  const active = bars.filter((p) => p.area > 0)
  const dt = active.length ? Math.max(...active.map((p) => p.d)) : h
  const epsY = cr.fy / cr.Es
  const cFs0 = dt // fs = 0 at the extreme tension bar
  const cFs05 = (EPS_CU * dt) / (EPS_CU + 0.5 * epsY)
  const cBal = (EPS_CU * dt) / (EPS_CU + epsY) // εs = εy
  const cTC = (EPS_CU * dt) / (EPS_CU + epsTC(cr)) // εt = εty+0.003 (318-25)
  const cPure = pureMomentC(bars, b, h, fc, cr)
  const cAllow = capCrossC(bars, b, h, fc, cr, caps)
  const at = (c: number) => pointAtC(bars, b, h, fc, cr, c, sign, caps)
  return {
    allowComp: at(cAllow),
    fs0: at(cFs0),
    fs05: at(cFs05),
    balanced: at(cBal),
    tensionControl: at(cTC),
    pureBending: at(cPure),
  }
}

// ── Curve assembly ─────────────────────────────────────────────────────────────

/** Pure-moment depth (Pn = 0) by bisection on net axial — the beam solve. */
function pureMomentC(bars: ColumnBar[], b: number, h: number, fc: number, cr: RcCriteria): number {
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
 * P–M interaction curve for an explicit bar layout, built spColumn-style as a
 * piecewise-linear polygon through named control points rather than a dense
 * sweep. The +M side measures compression from the top fibre; the −M side
 * mirrors to the bottom. For a symmetric layout the two sides are mirror images;
 * for nx ≠ ny (or top ≠ bottom) they differ.
 *
 * Vertices, compression → tension: max-compression apex (Po, nominal only),
 * allowable-compression cap (0.80φPo), fs = 0, fs = 0.5fy, balanced, tension
 * control, pure bending, max tension. The φ design loop is flat-topped at the
 * cap; the nominal loop rises to a pointed Po apex (the dash-dot).
 */
export function buildInteractionCurve(
  barsTop: ColumnBar[], // d = depth from TOP fibre
  b: number,
  h: number,
  fc: number,
  cr: RcCriteria,
): ColumnInteractionCurve {
  const Ast = barsTop.reduce((s, p) => s + p.area, 0)
  const Ag = b * h
  const caps = axialCapacities(Ast, Ag, fc, cr)

  const posBars = barsTop // compression at top → depth = d
  const negBars = barsTop.map((p) => ({ d: h - p.d, area: p.area })) // compression at bottom

  const pos = sideControlPoints(posBars, b, h, fc, cr, 1, caps)
  const neg = sideControlPoints(negBars, b, h, fc, cr, -1, caps)

  // Shared endpoints (M = 0). maxComp is the uncapped squash apex (nominal Po);
  // maxTension is pure tension fy·Ast.
  const maxComp: PMPoint = {
    Pn: -caps.Po, Mn: 0, phiPn: -caps.phiPnMax, phiMn: 0,
    phi: cr.phiCompression, epsT: -Infinity, c: Infinity,
  }
  const maxTension: PMPoint = {
    Pn: caps.Pnt, Mn: 0, phiPn: caps.phiPnt, phiMn: 0,
    phi: cr.phiTension, epsT: Infinity, c: 0,
  }

  // spColumn control points (+M side), compression → tension.
  const controlPoints: NamedColumnPoint[] = [
    { key: "maxComp", label: "Pₒ", note: "pure compression", pt: maxComp },
    { key: "allowComp", label: "Pₙ,ₘₐₓ", note: "design compression (φPn,max)", pt: pos.allowComp },
    { key: "fs0", label: "fₛ=0", note: "tension bar at zero strain (c = dₜ)", pt: pos.fs0 },
    { key: "fs05", label: "fₛ=0.5fy", note: "tension bar at half yield strength", pt: pos.fs05 },
    { key: "balanced", label: "εy", note: "balanced condition (εₜ = εy, φ = 0.65)", pt: pos.balanced },
    { key: "tensionControl", label: "εₜ", note: "tension-controlled (εₜ = 0.005, φ = 0.90)", pt: pos.tensionControl },
    { key: "pureBending", label: "Mₒ", note: "pure bending (P = 0)", pt: pos.pureBending },
    { key: "maxTension", label: "Pₙₜ,ₘₐₓ", note: "design tension (φfy·Ast)", pt: maxTension },
  ]

  // φ loop: flat-topped at the cap. allowComp.phiPn = −φPn,max on both sides, so
  // the edge neg.allowComp → pos.allowComp is the horizontal cap.
  const phiInner = [
    pos.allowComp, pos.fs0, pos.fs05, pos.balanced, pos.tensionControl, pos.pureBending,
    maxTension,
    neg.pureBending, neg.tensionControl, neg.balanced, neg.fs05, neg.fs0, neg.allowComp,
  ]
  const phiPolygon = phiInner.map((p) => ({ M: p.phiMn, P: p.phiPn }))

  // Nominal loop: pointed apex at Pₒ (no cap), through the same interior points.
  const nomInner = [
    maxComp, pos.fs0, pos.fs05, pos.balanced, pos.tensionControl, pos.pureBending,
    maxTension,
    neg.pureBending, neg.tensionControl, neg.balanced, neg.fs05, neg.fs0,
  ]
  const nominalPolygon = nomInner.map((p) => ({ M: p.Mn, P: p.Pn }))

  // Named book points A–E kept for validation/back-compat (A = cap apex at M=0).
  const A: PMPoint = {
    Pn: -caps.PnMax, Mn: 0, phiPn: -caps.phiPnMax, phiMn: 0,
    phi: cr.phiCompression, epsT: -Infinity, c: Infinity,
  }
  const named = {
    A,
    B: pos.balanced,
    C: pos.tensionControl,
    D: pos.pureBending,
    E: maxTension,
  }

  return { controlPoints, phiPolygon, nominalPolygon, named, caps, Ast }
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

// ── Detailing checks ───────────────────────────────────────────────────────────

export { RHO_G_MIN, RHO_G_MAX, minColumnClearSpacing }

export function checkColumnArrangement(
  b: number,
  h: number,
  cover: number,
  arr: ColumnArrangement,
  opts: { frameType: FrameType },
): ArrangementCheck[] {
  const layout = buildColumnBarLayout(b, h, cover, arr)
  const checks: ArrangementCheck[] = []
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  const nx = Math.max(2, Math.round(arr.nx))
  const ny = Math.max(2, Math.round(arr.ny))
  const db = barDia(arr.size)

  // ρg within limits.
  const Ag = b * h
  const rho = Ag > 0 ? layout.Ast / Ag : 0
  if (rho < RHO_G_MIN) {
    checks.push({
      status: "fail",
      text: `ρg = ${(rho * 100).toFixed(2)}% < 1.0% minimum`,
      clause: "10.6.1.1",
    })
  } else if (rho > RHO_G_MAX) {
    checks.push({
      status: "fail",
      text: `ρg = ${(rho * 100).toFixed(2)}% > 8.0% maximum`,
      clause: "10.6.1.1",
    })
  } else {
    const smfHigh = opts.frameType === "SMF" && rho > 0.06
    checks.push({
      status: smfHigh ? "warn" : "pass",
      text: smfHigh
        ? `ρg = ${(rho * 100).toFixed(2)}% — SMF prefers ≤ 6% (18.7.4.1)`
        : `ρg = ${(rho * 100).toFixed(2)}% within 1–8%`,
      clause: "10.6.1.1",
    })
  }

  // Minimum bar count (rectangular ties → ≥ 4).
  const ok4 = nx >= 2 && ny >= 2
  checks.push({
    status: ok4 ? "pass" : "fail",
    text: ok4 ? `${layout.bars.length} bars (≥ 4)` : "≥ 4 bars required for tied columns",
    clause: "25.7.2.1",
  })

  // Clear spacing on the densest (top/bottom) row.
  if (nx >= 2 && layout.rowSpacing !== null) {
    const clear = layout.rowSpacing - db
    const sMin = minColumnClearSpacing(db)
    checks.push({
      status: clear >= sMin - 1e-9 ? "pass" : "fail",
      text: `Row bar clear spacing ${f(clear)} mm ≥ ${f(sMin)} mm`,
      clause: "25.2.3",
    })
  }

  // Minimum cover.
  checks.push({
    status: cover >= 40 ? "pass" : "warn",
    text: `Clear cover ${f(cover)} mm ${cover >= 40 ? "≥" : "<"} 40 mm`,
    clause: "20.6.1.3.1",
  })

  return checks
}

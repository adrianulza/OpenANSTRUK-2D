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

import { barArea, barDia } from "../../shared/rebar"
import { buildColumnBarLayout } from "../../shared/column-grid"
import type { ColumnBar, ArrangementCheck } from "../../shared/types"
import type { FrameType } from "../../../core/types"
import type { ColumnArrangement } from "../../types"
import type { RcCriteria } from "../../criteria"
import {
  beta1,
  EPS_CU,
  EPS_T_MIN,
  RHO_G_MIN,
  RHO_G_MAX,
  minColumnClearSpacing,
  sqrtFc,
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

/** Axial cap factor Pn,max/Po: tied 0.80, spiral 0.85 (22.4.2.1 / 25.7.2). */
export const PN_MAX_FACTOR_TIED = 0.8
export const PN_MAX_FACTOR_SPIRAL = 0.85
/** Compression-controlled φ for a spiral column (21.2.2). */
export const SPIRAL_PHI_COMP = 0.75

export function axialCapacities(
  Ast: number,
  Ag: number,
  fc: number,
  cr: RcCriteria,
  spiral = false,
): AxialCapacities {
  const fy = cr.fy
  const factor = spiral ? PN_MAX_FACTOR_SPIRAL : PN_MAX_FACTOR_TIED
  const Po = (0.85 * fc * (Ag - Ast) + fy * Ast) / 1e3 // kN
  const phiPo = cr.phiCompression * Po
  const PnMax = factor * Po
  const phiPnMax = factor * phiPo
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
  fyOver: number = cr.fy,
): SectionForces {
  const { Es } = cr
  const fy = fyOver
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
function phiFor(epsT: number, cr: RcCriteria): number {
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
  const cTC = (EPS_CU * dt) / (EPS_CU + EPS_T_MIN) // εt = 0.005
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
  spiral = false,
): ColumnInteractionCurve {
  // Spiral columns raise the compression-controlled φ to 0.75 (edition-stable).
  const crc: RcCriteria = spiral ? { ...cr, phiCompression: SPIRAL_PHI_COMP } : cr
  const Ast = barsTop.reduce((s, p) => s + p.area, 0)
  const Ag = b * h
  const caps = axialCapacities(Ast, Ag, fc, crc, spiral)

  const posBars = barsTop // compression at top → depth = d
  const negBars = barsTop.map((p) => ({ d: h - p.d, area: p.area })) // compression at bottom

  const pos = sideControlPoints(posBars, b, h, fc, crc, 1, caps)
  const neg = sideControlPoints(negBars, b, h, fc, crc, -1, caps)

  // Shared endpoints (M = 0). maxComp is the uncapped squash apex (nominal Po);
  // maxTension is pure tension fy·Ast.
  const maxComp: PMPoint = {
    Pn: -caps.Po, Mn: 0, phiPn: -caps.phiPnMax, phiMn: 0,
    phi: crc.phiCompression, epsT: -Infinity, c: Infinity,
  }
  const maxTension: PMPoint = {
    Pn: caps.Pnt, Mn: 0, phiPn: caps.phiPnt, phiMn: 0,
    phi: crc.phiTension, epsT: Infinity, c: 0,
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
    phi: crc.phiCompression, epsT: -Infinity, c: Infinity,
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

// ── Capacity-design shear (Ve from Mn/Mpr) ────────────────────────────────────

/**
 * Column flexural strength developed at the acting factored axial `Pu`
 * (tension-positive). Bisects `c` so `Pn(c) = Pu`, then returns |Mn| there with
 * `fyOver = fyFactor·fy` (1.0 → Mn for SRPMM, 1.25 → Mpr for SRPMK). kN·m.
 */
export function columnFlexuralStrengthAtP(
  barsTop: ColumnBar[],
  b: number,
  h: number,
  fc: number,
  cr: RcCriteria,
  Pu: number, // kN, tension +
  fyFactor = 1,
): number {
  const fyOver = fyFactor * cr.fy
  const hiC = (1.05 * h) / beta1(fc)
  const solveSide = (bars: ColumnBar[]): number => {
    const PnAt = (c: number) => -sectionForcesAtC(bars, b, h, fc, cr, c, fyOver).axialCompPos / 1e3
    let lo = 1e-3
    let hi = hiC
    const target = Math.min(PnAt(lo), Math.max(PnAt(hi), Pu))
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi)
      if (PnAt(mid) <= target) hi = mid
      else lo = mid
    }
    const c = 0.5 * (lo + hi)
    return Math.max(0, sectionForcesAtC(bars, b, h, fc, cr, c, fyOver).Mn_Nmm) / 1e6
  }
  const negBars = barsTop.map((p) => ({ d: h - p.d, area: p.area }))
  return Math.max(solveSide(barsTop), solveSide(negBars))
}

/**
 * Column one-way concrete shear Vc (kN) — `0.17·(1 + Nu/(14·Ag))·λ·√f'c·bw·d`
 * (22.5.6.1). SNI 2847:2019 (≡ ACI 318-14) applies NO size-effect factor — the
 * `hasMinTies` flag is ignored (λs ≡ 1), the lone column-shear code delta vs ACI
 * 318-25. `NuComp` is the factored axial compression (kN, ≥ 0 in compression).
 */
export function columnShearVc(
  lambda: number,
  fc: number,
  bw: number,
  d: number,
  NuComp: number, // kN, compression +
  Ag: number, // mm²
  _hasMinTies = true,
): number {
  void _hasMinTies // SNI: no size effect (λs ≡ 1)
  const axial = Math.max(0, 1 + (NuComp * 1e3) / (14 * Ag))
  return (0.17 * axial * lambda * sqrtFc(fc) * bw * d) / 1e3
}

// ── Slenderness (non-sway moment magnification, in-plane) ─────────────────────

export interface SlendernessResult {
  delta: number
  slenderness: number
  magnified: boolean
}

/**
 * Braced (non-sway) moment magnifier δns per 6.6.4 (in-plane, k = 1.0).
 * Edition-stable — identical to the ACI 318-25 module. See that module for the
 * clause notes.
 */
export function slendernessMagnifier(
  PuComp: number,
  M1: number,
  M2: number,
  lu: number,
  Ec: number,
  Ig: number,
  Ag: number,
): SlendernessResult {
  const k = 1.0
  const r = Math.sqrt(Ig / Ag)
  const luMm = lu * 1000
  const slenderness = r > 0 ? (k * luMm) / r : 0
  const ratio = M2 !== 0 ? M1 / M2 : 0
  const limit = Math.min(40, 34 - 12 * ratio)
  if (PuComp <= 0 || slenderness <= limit) {
    return { delta: 1, slenderness, magnified: false }
  }
  const EI = 0.4 * Ec * Ig
  const Pc = (Math.PI * Math.PI * EI) / (k * luMm) ** 2 / 1e3
  const Cm = Math.max(0.4, 0.6 - 0.4 * ratio)
  const denom = 1 - PuComp / (0.75 * Pc)
  const delta = denom > 0 ? Math.max(1, Cm / denom) : 99
  return { delta, slenderness, magnified: true }
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

// ── Transverse confinement (Ch. 18 / Ch. 25) ──────────────────────────────────

/** Spacing pass/fail (checked, s > 0) or required-info row. */
function spacingRow(label: string, s: number, sMax: number, clause: string): ArrangementCheck {
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(0))
  if (s <= 0) {
    return { status: "pass", text: `${label} ≤ ${f(sMax)} mm (provide a tie to verify)`, clause }
  }
  return {
    status: s <= sMax + 1e-9 ? "pass" : "fail",
    text: `${label} ${f(s)} mm ${s <= sMax ? "≤" : ">"} ${f(sMax)} mm`,
    clause,
  }
}

/**
 * Transverse-reinforcement detailing per frame type. SNI 2847:2019 (≡ ACI 318-14):
 *  - SRPMB: tie spacing ≤ min(16·db,long, 48·db,tie, least dim) (25.7.2.3).
 *  - SRPMM: hoop spacing over lo ≤ min(8·db,long, 24·db,tie, b/2, 300) (18.4.3.2).
 *  - SRPMK: lo (18.7.5.1), hx ≤ 350 (18.7.5.2), so (18.7.5.3), and the rectilinear
 *    `Ash/(s·bc)` from the **two-equation** table (18.7.5.4) — NO kf/kn third
 *    equation (that is the ACI 318-25 addition).
 */
export function columnConfinement(
  b: number,
  h: number,
  cover: number,
  arr: ColumnArrangement,
  fc: number,
  cr: RcCriteria,
  frameType: FrameType,
  PuComp: number,
  lu: number,
  legs: number,
): ArrangementCheck[] {
  void PuComp // SNI: two-equation Ash does not use the axial term
  const checks: ArrangementCheck[] = []
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(0))
  const dbLong = barDia(arr.size)
  const dbTie = barDia(arr.tie.size)
  const s = arr.tie.spacing
  const leastDim = Math.min(b, h)

  if (frameType === "OMF") {
    checks.push(spacingRow("Tie spacing", s, Math.min(16 * dbLong, 48 * dbTie, leastDim), "25.7.2.3"))
    return checks
  }

  const lo = Math.max(Math.max(b, h), (lu * 1000) / 6, 450)
  checks.push({
    status: "pass",
    text: `Confinement length lo = ${f(lo)} mm from each end`,
    clause: frameType === "SMF" ? "18.7.5.1" : "18.4.3.2",
  })

  if (frameType === "IMF") {
    checks.push(
      spacingRow("Hoop spacing over lo", s, Math.min(8 * dbLong, 24 * dbTie, leastDim / 2, 300), "18.4.3.2"),
    )
    return checks
  }

  // SRPMK — full confinement.
  if (arr.confinement === "spiral") {
    const Ach = (b - 2 * cover) * (h - 2 * cover)
    const Ag = b * h
    const rhoSReq = Math.max(0.45 * (Ag / Ach - 1) * (fc / cr.fyt), 0.12 * (fc / cr.fyt))
    checks.push({
      status: "pass",
      text: `Spiral ρs ≥ ${(rhoSReq * 100).toFixed(2)}% (volumetric)`,
      clause: "18.7.5.4 / 25.7.3.3",
    })
    return checks
  }
  const layout = buildColumnBarLayout(b, h, cover, arr)
  const hx = layout.rowSpacing ?? leastDim
  checks.push({
    status: hx <= 350 ? "pass" : "fail",
    text: `hx = ${f(hx)} mm ${hx <= 350 ? "≤" : ">"} 350 mm`,
    clause: "18.7.5.2",
  })

  const so0 = Math.min(150, Math.max(100, 100 + (350 - hx) / 3))
  checks.push(spacingRow("Hoop spacing over lo (so)", s, Math.min(leastDim / 4, 6 * dbLong, so0), "18.7.5.3"))

  // Ash/(s·bc) — rectilinear. SNI/318-14: max of TWO equations only.
  const Ag = b * h
  const Ach = (b - 2 * cover) * (h - 2 * cover)
  const bcMax = Math.max(b - 2 * cover, h - 2 * cover)
  const fyt = cr.fyt
  const ratio = Math.max(0.3 * (Ag / Ach - 1) * (fc / fyt), 0.09 * (fc / fyt))
  const AshSReq = ratio * bcMax // mm²/mm
  if (s <= 0) {
    checks.push({
      status: "pass",
      text: `Required Ash/s = ${(AshSReq * 1000).toFixed(0)} mm²/m (2-eq, Tabel 5-20)`,
      clause: "18.7.5.4",
    })
  } else {
    const AshSprov = (legs * barArea(arr.tie.size)) / s
    checks.push({
      status: AshSprov >= AshSReq - 1e-9 ? "pass" : "fail",
      text: `Ash/s ${(AshSprov * 1000).toFixed(0)} ${AshSprov >= AshSReq ? "≥" : "<"} ${(AshSReq * 1000).toFixed(0)} mm²/m`,
      clause: "18.7.5.4",
    })
  }
  return checks
}

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
import type { RebarSize } from "../../shared/rebar"
import {
  vMaxLimit,
  avSProvided,
  avMinPerS,
  phiVnProvided,
  generalSpacingMax,
  imfEndZoneSpacingMax,
  smfEndZoneSpacingMax,
} from "./beam"
import { buildColumnBarLayout } from "../../shared/column-grid"
import type { ColumnBar, ArrangementCheck, ColumnGeom } from "../../shared/types"
import { geomH, geomAg, geomLeastDim, geomAch, geomShear } from "../../shared/types"
import type { FrameType } from "../../../core/types"
import { isCircle, type ColumnArrangement } from "../../types"
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
 * Concrete compression resultant Cc (N) and its centroid arm above the section
 * centroid (mm) for a stress-block depth `a` from the compression fibre.
 *  - rect:   Cc = 0.85·fc·b·a;  arm = h/2 − a/2.
 *  - circle: the compression zone is a circular SEGMENT of depth `a` (closed
 *    form): R = D/2, m = R − a, area A = R²·acos(m/R) − m·√(R²−m²), first moment
 *    about centre Q = ⅔·(R²−m²)^{3/2}, arm = Q/A. Cc = 0.85·fc·A.
 */
function concreteBlock(g: ColumnGeom, a: number, fc: number): { Cc: number; arm: number } {
  if (g.kind === "circle") {
    const R = g.D / 2
    const aa = Math.min(Math.max(a, 0), g.D)
    const m = R - aa
    const root = Math.max(0, R * R - m * m)
    const A = R * R * Math.acos(Math.min(1, Math.max(-1, m / R))) - m * Math.sqrt(root)
    const Q = (2 / 3) * root ** 1.5
    const arm = A > 1e-9 ? Q / A : 0
    return { Cc: 0.85 * fc * A, arm }
  }
  return { Cc: 0.85 * fc * g.b * a, arm: g.h / 2 - a / 2 }
}

/**
 * Concrete + bar resultants at neutral-axis depth `c`, taken about the section's
 * geometric centroid (geomH/2). Bars carry the displaced-concrete correction
 * inside the stress block. εcu = 0.003 (22.2.2.1); a = β₁·c capped at the depth.
 * The bar loop is shape-agnostic (depth-from-top); only the concrete block differs.
 */
function sectionForcesAtC(
  bars: ColumnBar[],
  geom: ColumnGeom,
  fc: number,
  cr: RcCriteria,
  c: number,
  fyOver: number = cr.fy,
): SectionForces {
  const { Es } = cr
  const fy = fyOver
  const h = geomH(geom)
  const b1 = beta1(fc)
  const a = Math.min(b1 * c, h)
  const { Cc, arm } = concreteBlock(geom, a, fc)
  let axial = Cc // N, compression +
  let moment = Cc * arm // N·mm

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
  geom: ColumnGeom,
  fc: number,
  cr: RcCriteria,
  c: number,
  sign: 1 | -1,
  caps: AxialCapacities,
): PMPoint {
  const f = sectionForcesAtC(bars, geom, fc, cr, c)
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
  geom: ColumnGeom,
  fc: number,
  cr: RcCriteria,
  caps: AxialCapacities,
): number {
  const h = geomH(geom)
  const phiPnAt = (c: number) => {
    const f = sectionForcesAtC(bars, geom, fc, cr, c)
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
  geom: ColumnGeom,
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
  const dt = active.length ? Math.max(...active.map((p) => p.d)) : geomH(geom)
  const epsY = cr.fy / cr.Es
  const cFs0 = dt // fs = 0 at the extreme tension bar
  const cFs05 = (EPS_CU * dt) / (EPS_CU + 0.5 * epsY)
  const cBal = (EPS_CU * dt) / (EPS_CU + epsY) // εs = εy
  const cTC = (EPS_CU * dt) / (EPS_CU + EPS_T_MIN) // εt = 0.005
  const cPure = pureMomentC(bars, geom, fc, cr)
  const cAllow = capCrossC(bars, geom, fc, cr, caps)
  const at = (c: number) => pointAtC(bars, geom, fc, cr, c, sign, caps)
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
function pureMomentC(bars: ColumnBar[], geom: ColumnGeom, fc: number, cr: RcCriteria): number {
  const axial = (c: number) => sectionForcesAtC(bars, geom, fc, cr, c).axialCompPos
  let lo = 1e-3
  let hi = geomH(geom)
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
  geom: ColumnGeom,
  fc: number,
  cr: RcCriteria,
  spiral = false,
): ColumnInteractionCurve {
  // Spiral columns raise the compression-controlled φ to 0.75 (edition-stable).
  const crc: RcCriteria = spiral ? { ...cr, phiCompression: SPIRAL_PHI_COMP } : cr
  const Ast = barsTop.reduce((s, p) => s + p.area, 0)
  const Ag = geomAg(geom)
  const h = geomH(geom)
  const caps = axialCapacities(Ast, Ag, fc, crc, spiral)

  const posBars = barsTop // compression at top → depth = d
  const negBars = barsTop.map((p) => ({ d: h - p.d, area: p.area })) // compression at bottom

  const pos = sideControlPoints(posBars, geom, fc, crc, 1, caps)
  const neg = sideControlPoints(negBars, geom, fc, crc, -1, caps)

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
  geom: ColumnGeom,
  fc: number,
  cr: RcCriteria,
  Pu: number, // kN, tension +
  fyFactor = 1,
): number {
  const fyOver = fyFactor * cr.fy
  const h = geomH(geom)
  const hiC = (1.05 * h) / beta1(fc)
  const solveSide = (bars: ColumnBar[]): number => {
    const PnAt = (c: number) => -sectionForcesAtC(bars, geom, fc, cr, c, fyOver).axialCompPos / 1e3
    let lo = 1e-3
    let hi = hiC
    const target = Math.min(PnAt(lo), Math.max(PnAt(hi), Pu))
    for (let i = 0; i < 80; i++) {
      const mid = 0.5 * (lo + hi)
      if (PnAt(mid) <= target) hi = mid
      else lo = mid
    }
    const c = 0.5 * (lo + hi)
    return Math.max(0, sectionForcesAtC(bars, geom, fc, cr, c, fyOver).Mn_Nmm) / 1e6
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

/** Demand-free column shear capacity track. */
export interface ColumnShearCapacity {
  Vc: number // kN — nominal concrete shear (Nu = 0 baseline)
  Vs: number // kN — nominal steel shear from the provided tie
  phiVc: number // kN — conservative Nu = 0 (no axial benefit, no hinge zeroing)
  phiVn: number // kN — φ(Vc + Vs) from the provided tie
  phiVmax: number // kN — cross-section ceiling
  avS: number // mm²/m — provided Av/s
  avSMin: number // mm²/m — minimum shear reinforcement floor
  spacing: number // mm — provided tie spacing
  spacingMax: number // mm — governing hoop/tie cap for the frame type
  spacingPass: boolean
  avSPass: boolean // provided Av/s ≥ Av,min/s
  d: number // mm — effective depth used
}

/**
 * Column shear **capacity** track, computed from section + tie arrangement +
 * criteria alone — no structural demands, so it can render live in the Advanced
 * Report before Run Design (the φVn capacity analogue of the P–M curve).
 *
 * Conservative no-axial baseline: Nu = 0, so Vc carries no axial enhancement and
 * no SMF hinge-zone zeroing (18.7.6.2.1) — both are demand-driven and overlaid
 * only after a run. Spacing cap uses the demand-free (Vs ≤ threshold) limit.
 */
export function columnShearCapacity(
  bars: ColumnBar[],
  geom: ColumnGeom,
  fc: number,
  cr: RcCriteria,
  tie: { size: RebarSize; spacing: number },
  dbLong: number,
): ColumnShearCapacity {
  const Ag = geomAg(geom)
  const dMaxBar = bars.length > 0 ? Math.max(...bars.map((p) => p.d)) : geomH(geom) - 65
  const { bw, d } = geomShear(geom, dMaxBar)
  const dbHoop = barDia(tie.size)
  const Vc = columnShearVc(cr.lambda, fc, bw, d, 0, Ag, true)
  const phiVc = cr.phiShear * Vc
  const phiVmax = cr.phiShear * vMaxLimit(Vc, fc, bw, d)
  const avS = avSProvided(cr.stirrupLegs, tie.size, tie.spacing)
  const avSMin = avMinPerS(fc, cr.fyt, bw) * 1000 // mm²/m
  const phiVn = phiVnProvided(Vc, avS, cr.fyt, d, cr)
  const Vs = phiVn / cr.phiShear - Vc // nominal steel shear, kN
  const spacingMax =
    cr.frameType === "SMF"
      ? smfEndZoneSpacingMax(d, dbLong)
      : cr.frameType === "IMF"
        ? imfEndZoneSpacingMax(d, dbLong, dbHoop)
        : generalSpacingMax(d, false)
  const spacingPass = tie.spacing > 0 ? tie.spacing <= spacingMax + 1e-9 : true
  const avSPass = avS >= avSMin - 1e-6
  return {
    Vc, Vs, phiVc, phiVn, phiVmax, avS, avSMin,
    spacing: tie.spacing, spacingMax, spacingPass, avSPass, d,
  }
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
  geom: ColumnGeom,
  cover: number,
  arr: ColumnArrangement,
  opts: { frameType: FrameType },
): ArrangementCheck[] {
  const layout = buildColumnBarLayout(geom, cover, arr)
  const checks: ArrangementCheck[] = []
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1))
  const circle = isCircle(arr)
  const nBars = layout.bars.length
  const db = barDia(arr.size)

  // ρg within limits.
  const Ag = geomAg(geom)
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

  // Minimum bar count: circular spiral ≥ 6 (10.7.3.1), tied (rect or circular) ≥ 4.
  const spiral = arr.confinement === "spiral"
  const minBars = circle && spiral ? 6 : 4
  const okMin = nBars >= minBars
  checks.push({
    status: okMin ? "pass" : "fail",
    text: okMin
      ? `${nBars} bars (≥ ${minBars})`
      : `≥ ${minBars} bars required (${circle && spiral ? "circular spiral" : "tied"})`,
    clause: circle && spiral ? "10.7.3.1" : "25.7.2.1",
  })

  // Clear spacing between adjacent bars (rect: densest row; circle: ring chord).
  if (layout.rowSpacing !== null) {
    const clear = layout.rowSpacing - db
    const sMin = minColumnClearSpacing(db)
    checks.push({
      status: clear >= sMin - 1e-9 ? "pass" : "fail",
      text: `${circle ? "Ring" : "Row"} bar clear spacing ${f(clear)} mm ≥ ${f(sMin)} mm`,
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
  geom: ColumnGeom,
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
  const leastDim = geomLeastDim(geom)
  const circleSpiral = isCircle(arr) && arr.confinement === "spiral"

  // Spiral confinement (circular only): volumetric ρs governs in place of the
  // rectilinear Ash table.
  const spiralChecks = (): void => {
    const Ag = geomAg(geom)
    const Ach = geomAch(geom, cover)
    const rhoSReq = Math.max(0.45 * (Ag / Ach - 1) * (fc / cr.fyt), 0.12 * (fc / cr.fyt))
    checks.push({
      status: "pass",
      text: `Spiral ρs ≥ ${(rhoSReq * 100).toFixed(2)}% (volumetric)`,
      clause: "18.7.5.4 / 25.7.3.3",
    })
    if (s > 0) {
      checks.push({
        status: s >= 25 - 1e-9 && s <= 75 + 1e-9 ? "pass" : "fail",
        text: `Spiral pitch ${f(s)} mm (25–75 mm)`,
        clause: "25.7.3.1",
      })
    }
  }

  if (frameType === "OMF") {
    if (circleSpiral) spiralChecks()
    else checks.push(spacingRow("Tie spacing", s, Math.min(16 * dbLong, 48 * dbTie, leastDim), "25.7.2.3"))
    return checks
  }

  const lo = Math.max(geomH(geom), (lu * 1000) / 6, 450)
  checks.push({
    status: "pass",
    text: `Confinement length lo = ${f(lo)} mm from each end`,
    clause: frameType === "SMF" ? "18.7.5.1" : "18.4.3.2",
  })

  if (circleSpiral) {
    spiralChecks()
    return checks
  }

  if (frameType === "IMF") {
    checks.push(
      spacingRow("Hoop spacing over lo", s, Math.min(8 * dbLong, 24 * dbTie, leastDim / 2, 300), "18.4.3.2"),
    )
    return checks
  }

  // SRPMK — full confinement (rectangular ties or circular hoops).
  const layout = buildColumnBarLayout(geom, cover, arr)
  const hx = layout.rowSpacing ?? leastDim
  checks.push({
    status: hx <= 350 ? "pass" : "fail",
    text: `hx = ${f(hx)} mm ${hx <= 350 ? "≤" : ">"} 350 mm`,
    clause: "18.7.5.2",
  })

  const so0 = Math.min(150, Math.max(100, 100 + (350 - hx) / 3))
  checks.push(spacingRow("Hoop spacing over lo (so)", s, Math.min(leastDim / 4, 6 * dbLong, so0), "18.7.5.3"))

  // Ash/(s·bc) — rectilinear. SNI/318-14: max of TWO equations only.
  const Ag = geomAg(geom)
  const Ach = geomAch(geom, cover)
  const bcMax = leastDim - 2 * cover // core dimension to the tie centreline
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

/**
 * Confinement expressed as tie legs — the number a detailer actually acts on.
 *
 * `Ash/s ≥ ratio·bc` (18.7.5.4) fixes an AREA per unit length; the legs follow
 * from the tie bar chosen and its spacing. Reporting the area alone leaves the
 * reader to do that division, and the division is where "this is not buildable"
 * shows up: 18.7.5.2 supports every corner bar and alternate bars with a hoop
 * corner or crosstie, so a leg needs a longitudinal bar to hold. Demand more
 * legs than the grid has bars and the requirement cannot be detailed at this bar
 * count — a DETAILING failure (add bars, or grow the section), not a strength
 * one, which is why it never touches the D/C.
 *
 * SNI/318-14 two-equation Ash; the ACI module's three-equation form makes this
 * its own copy rather than a shared helper. Rectilinear ties only — a spiral is
 * volumetric (ρs) and has no leg count.
 */
export function requiredConfinementLegs(
  geom: ColumnGeom,
  cover: number,
  arr: ColumnArrangement,
  fc: number,
  cr: RcCriteria,
  legsProvided: number,
): { required: number; provided: number; max: number; buildable: boolean } | undefined {
  if (isCircle(arr)) return undefined
  const s = arr.tie.spacing
  const aTie = barArea(arr.tie.size)
  if (s <= 0 || aTie <= 0) return undefined

  const Ag = geomAg(geom)
  const Ach = geomAch(geom, cover)
  const bcMax = geomLeastDim(geom) - 2 * cover
  const ratio = Math.max(0.3 * (Ag / Ach - 1) * (fc / cr.fyt), 0.09 * (fc / cr.fyt))
  const AshReq = ratio * bcMax * s // mm² of tie steel crossing one spacing
  const required = Math.max(2, Math.ceil(AshReq / aTie - 1e-9))

  // Legs the longitudinal grid can engage across the confined direction.
  const max = Math.max(2, Math.min(arr.nx, arr.ny))
  return { required, provided: legsProvided, max, buildable: required <= max }
}

/**
 * ρ at the tension-controlled limit — the most steel a beam section may carry
 * and still be ductile. `c/d = εcu/(εcu + εt)` with SNI's fixed εt = 0.005
 * (the ACI module ramps it with fy, which is exactly why this is duplicated).
 */
export function rhoTensionControlled(fc: number, cr: RcCriteria): number {
  const cOverD = EPS_CU / (EPS_CU + EPS_T_MIN)
  return (0.85 * beta1(fc) * (fc / cr.fy)) * cOverD
}

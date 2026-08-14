/**
 * AISC 360-16 Chapter E — axial compression.
 *
 * Covers E3 (flexural buckling), E4 (torsional and flexural-torsional buckling)
 * and E7 (members with slender elements, via the effective area Ae).
 *
 * Both principal axes are checked even though OpenAnstruk only bends about
 * axis 3 — weak-axis flexural buckling is an independent limit state and
 * usually the one that governs.
 *
 * E4 enters as `Fe = min(Fe_flexural, Fe_torsional)`, so it can only ever LOWER
 * a capacity. It is skipped entirely for closed sections (box, pipe) and solid
 * shapes, per AISC E4's own scope and CSI §3.5.2.1.2.1.
 *
 * Units: mm, MPa, N internally; kN at the boundary.
 */

import { classifyAxial, kc, type SteelGeom } from "./rules"

/**
 * AISC E4 inputs. Absent ⇒ E4 is skipped rather than guessed, matching how the
 * flexure path treats a missing J/rts/ho.
 *
 * The axes labelled 33/22 here are whichever pair E4 is being evaluated in:
 * the GEOMETRIC axes for an I-shape or tee, but the PRINCIPAL axes for a single
 * angle (33 ↔ major w, 22 ↔ minor z), per CSI §3.5.2 "For angle sections, the
 * principal moment of inertia and radii of gyration are used for computing Fe."
 */
export interface E4Input {
  /** St. Venant torsional constant, mm⁴. */
  J: number
  /** Warping constant, mm⁶. */
  Cw: number
  /** Shear modulus, MPa. */
  G: number
  /** Torsional effective length Kz·Lz, mm. */
  KLz: number
  /** Shear-centre offset from the centroid, in the 33/22 axes. mm */
  x0: number
  y0: number
  /** Second moments about the 33/22 axes, mm⁴. */
  I33: number
  I22: number
  /** Radii of gyration about the 33/22 axes, mm. */
  r33: number
  r22: number
  /**
   * Effective length used for BOTH Fe33 and Fe22 inside E4. For an angle this
   * is `max(K33·L33, K22·L22)` (CSI §3.5.2); for other shapes the caller passes
   * the per-axis value it already uses for E3.
   */
  KL33: number
  KL22: number
}

export interface CompressionInput {
  g: SteelGeom
  /** Gross area, mm². */
  Ag: number
  /** Radii of gyration, mm. */
  r33: number
  r22: number
  Fy: number
  E: number
  /** Effective lengths KL, mm — already multiplied by K. */
  KL33: number
  KL22: number
  /** AISC E4 data. Omitted ⇒ flexural buckling only. */
  e4?: E4Input
}

export interface CompressionResult {
  /** Nominal compressive strength, kN. */
  Pn: number
  /** Critical stress, MPa. */
  Fcr: number
  /** Elastic buckling stress, MPa — the governing one of E3-4 and E4. */
  Fe: number
  /** Effective area used (= Ag unless slender elements reduce it), mm². */
  Ae: number
  /** Governing slenderness KL/r and which axis produced it. */
  slenderness: number
  governingAxis: "33" | "22"
  /** True when any element is slender and E7 was applied. */
  slender: boolean
  /** KL/r > 200 advisory (AISC E2 user note — not a hard limit in 360-16). */
  slendernessWarning: boolean
  /** Round HSS past D/t = 0.45E/Fy — outside E7.2, must not be designed. */
  tooSlender: boolean
  /** Pure torsional buckling stress Fez (E4-7), MPa. Undefined when E4 is skipped. */
  Fez?: number
  /** Elastic torsional / flexural-torsional buckling stress from E4, MPa. */
  FeTorsional?: number
  /** Which limit state produced `Fe`. */
  governingMode: "flexural" | "flexural-torsional"
}

// ── AISC E4 — torsional and flexural-torsional buckling ─────────────────────

export interface E4Result {
  /** Pure torsional buckling stress (E4-7). */
  Fez: number
  /** Elastic buckling stress from the applicable E4 equation. */
  Fe: number
  /** Which E4 equation was used, for the report. */
  equation: "E4-2" | "E4-3" | "E4-4"
}

/**
 * Elastic torsional / flexural-torsional buckling stress.
 *
 *   r̄0² = x0² + y0² + (I22 + I33)/Ag                            (E4-9)
 *   H   = 1 − (x0² + y0²)/r̄0²                                    (E4-8)
 *   Fez = [π²·E·Cw/(Kz·Lz)² + G·J] / (Ag·r̄0²)                    (E4-7)
 *
 * then, by symmetry class:
 *
 *   doubly symmetric (I-shape)  Fe = [π²ECw/(KzLz)² + GJ]/(I22+I33)      (E4-2)
 *   singly symmetric            Fe = ((Fea+Fez)/2H)·[1 − √(1 − 4·Fea·Fez·H/(Fea+Fez)²)]
 *                                                                        (E4-3)
 *   unsymmetric                 Fe = lowest root of the cubic             (E4-4)
 *
 * **Which Fe goes into E4-3 follows from WHERE the shear centre sits**, not from
 * the shape's name. E4-4 factors as
 *
 *   (Fe−Fe33)(Fe−Fe22)(Fe−Fez) − Fe²(Fe−Fe22)(x0/r̄0)² − Fe²(Fe−Fe33)(y0/r̄0)² = 0
 *
 * so when `x0 = 0` the `(Fe−Fe22)` factor survives and the quadratic is in
 * `Fe33`; when `y0 = 0` it is in `Fe22`. A TEE is symmetric about axis 2-2, so
 * its shear-centre offset is `y0` and E4-3 takes **Fe22**. An EQUAL-LEG ANGLE is
 * symmetric about its MAJOR principal axis, so its offset is `x0` (= w0) and
 * E4-3 takes **Fe33**.
 *
 * > CSI's manual mis-prints the tee case (§3.5.2.1.2.2.3): the numerator reads
 * > `(Fe22 + Fez)` but the radicand denominator reads `(Fe33 + Fez)²`. Those
 * > cannot both be right — the two come from the same quadratic. AISC E4-3 uses
 * > the axis of symmetry throughout, so the denominator is `(Fe22 + Fez)²`, and
 * > that is what is implemented. Whether SAP2000 the SOFTWARE reproduces its own
 * > manual's typo is a question for the bridge, recorded in DESIGN_STEEL.md §S14.
 *
 * ## The two branches report different things — deliberately
 *
 * E4-3 returns ONLY the coupled flexural-torsional root. The decoupled factor
 * it divides out, `(Fe−Fe33)` or `(Fe−Fe22)`, is a pure FLEXURAL mode, and AISC
 * covers that through E3 instead. E4-4 has no such factorisation — for a truly
 * unsymmetric section all three modes couple — so it returns the lowest root of
 * all three, which may well BE a near-flexural one.
 *
 * The two conventions meet because `compressionStrength` takes
 * `Fe = min(Fe_flexural, Fe_E4)`: whichever branch runs, the flexural mode is
 * accounted for exactly once. Verified as an invariant (Pn continuity as an
 * offset → 0) in validation/steel_angle_tee_clauses.mts rather than assumed.
 * Anything that changes which radius of gyration E3 uses must re-check it.
 */
export function e4Buckling(kind: SteelGeom["kind"], Ag: number, E: number, inp: E4Input): E4Result | undefined {
  const { J, Cw, G, KLz, x0, y0, I33, I22, r33, r22, KL33, KL22 } = inp
  if (!(Ag > 0 && KLz > 0)) return undefined
  if (!(J >= 0 && Cw >= 0)) return undefined

  const warp = Cw > 0 ? (Math.PI ** 2 * E * Cw) / KLz ** 2 : 0

  // E4-2 — doubly symmetric: the shear centre coincides with the centroid, so
  // torsion decouples from both bending modes and this is pure torsional
  // buckling. No flexural-torsional interaction to solve for.
  if (kind === "iwf") {
    if (!(I22 + I33 > 0)) return undefined
    const Fe = (warp + G * J) / (I22 + I33)
    return { Fez: Fe, Fe, equation: "E4-2" }
  }

  const r0sq = x0 ** 2 + y0 ** 2 + (I22 + I33) / Ag // E4-9
  if (!(r0sq > 0)) return undefined
  const H = 1 - (x0 ** 2 + y0 ** 2) / r0sq // E4-8
  const Fez = (warp + G * J) / (Ag * r0sq) // E4-7

  const Fe33 = r33 > 0 && KL33 > 0 ? (Math.PI ** 2 * E) / (KL33 / r33) ** 2 : Infinity // E4-5
  const Fe22 = r22 > 0 && KL22 > 0 ? (Math.PI ** 2 * E) / (KL22 / r22) ** 2 : Infinity // E4-6

  // Singly symmetric: one offset vanishes and the cubic factors exactly.
  const TOL = 1e-9
  const symAboutAxis2 = Math.abs(x0) <= TOL * Math.sqrt(r0sq)
  const symAboutAxis3 = Math.abs(y0) <= TOL * Math.sqrt(r0sq)
  if ((symAboutAxis2 || symAboutAxis3) && H > 0) {
    const Fea = symAboutAxis2 ? Fe22 : Fe33
    if (!Number.isFinite(Fea)) return { Fez, Fe: Fez, equation: "E4-3" }
    const sum = Fea + Fez
    const disc = Math.max(0, 1 - (4 * Fea * Fez * H) / sum ** 2)
    return { Fez, Fe: (sum / (2 * H)) * (1 - Math.sqrt(disc)), equation: "E4-3" }
  }

  // Unsymmetric (unequal-leg angle) — E4-4. Bisect for the LOWEST root.
  //
  // The bracket is guaranteed, not assumed: at Fe = 0 the cubic is
  // −Fe33·Fe22·Fez < 0, and at Fe = min(Fe33, Fe22, Fez) one factor vanishes
  // while the two subtracted terms each carry a non-positive factor, so the
  // value is ≥ 0. A sign change therefore always exists in between.
  const cubic = (Fe: number) =>
    (Fe - Fe33) * (Fe - Fe22) * (Fe - Fez) -
    Fe ** 2 * (Fe - Fe22) * (x0 ** 2 / r0sq) -
    Fe ** 2 * (Fe - Fe33) * (y0 ** 2 / r0sq)

  let lo = 0
  let hi = Math.min(Fe33, Fe22, Fez)
  if (!Number.isFinite(hi) || hi <= 0) return { Fez, Fe: Fez, equation: "E4-4" }
  for (let i = 0; i < 200; i++) {
    const mid = 0.5 * (lo + hi)
    if (cubic(mid) < 0) lo = mid
    else hi = mid
  }
  return { Fez, Fe: 0.5 * (lo + hi), equation: "E4-4" }
}

/**
 * AISC E7.1 — effective width of a slender element, for every shape EXCEPT
 * round HSS (E7.2 covers those). 360-16 applies one effective-width rule to
 * stiffened and unstiffened elements alike; the Qs/Qa split of 360-10 is gone.
 * Only the c1 coefficient distinguishes element types.
 *
 *   Fel = (c2·λr/λ)²·Fy                                     (E7-5)
 *   be  = b·(1 − c1·√(Fel/Fcr))·√(Fel/Fcr) ≤ b              (E7-3)
 *
 * applied only when λ > λr·√(Fy/Fcr); otherwise be = b.
 * c1 comes from Table E7.1 (see the constants below); c2 = (1−√(1−4c1))/(2c1).
 */
export function effectiveWidth(
  b: number, lambda: number, lambdaR: number,
  Fy: number, Fcr: number, c1: number,
): number {
  if (!(Fcr > 0)) return b
  if (lambda <= lambdaR * Math.sqrt(Fy / Fcr)) return b
  const c2 = (1 - Math.sqrt(1 - 4 * c1)) / (2 * c1)
  const Fel = (c2 * lambdaR / lambda) ** 2 * Fy
  const ratio = Math.sqrt(Fel / Fcr)
  return Math.min(b, b * (1 - c1 * ratio) * ratio)
}

// AISC Table E7.1 — effective width imperfection adjustment factors. THREE
// cases, reproduced verbatim as CSI Table 3-3 (SFD-AISC-360-16, p. 3-32):
//
//   (a) stiffened elements except walls of square and rectangular HSS  0.18
//   (b) wall of square and rectangular HSS                             0.20
//   (c) all other elements                                             0.22
//
// So a built-up I-shape WEB is case (a) = 0.18 — the code value, not a
// deviation. Example 0002's c1 = 0.18 / c2 = 1.31 is simply Table E7.1 row (a).
// An I-shape flange OUTSTAND is case (c) = 0.22. A box/RHS wall is case (b).
const C1_STIFFENED = 0.18 // (a) I-shape webs
const C1_HSS_WALL = 0.20 // (b) square/rectangular HSS + box walls
const C1_UNSTIFFENED = 0.22 // (c) flange outstands, everything else

/** Flexural buckling stress Fcr from Fe (AISC E3-2 / E3-3). */
export function fcrFlexural(Fy: number, Fe: number): number {
  if (!(Fe > 0)) return 0
  // The E3 threshold is equivalently KL/r ≤ 4.71√(E/Fy)  <=>  Fy/Fe ≤ 2.25.
  return Fy / Fe <= 2.25
    ? Math.pow(0.658, Fy / Fe) * Fy // E3-2, inelastic
    : 0.877 * Fe // E3-3, elastic
}

export function compressionStrength(inp: CompressionInput): CompressionResult {
  const { g, Ag, r33, r22, Fy, E, KL33, KL22 } = inp

  // Governing flexural-buckling slenderness: worst of the two axes.
  const s33 = r33 > 0 ? KL33 / r33 : Infinity
  const s22 = r22 > 0 ? KL22 / r22 : Infinity
  const slenderness = Math.max(s33, s22)
  const governingAxis: "33" | "22" = s22 >= s33 ? "22" : "33"

  const FeFlex = (Math.PI ** 2 * E) / slenderness ** 2 // E3-4

  // E4 — torsional / flexural-torsional buckling. Ignored for closed sections
  // (box, pipe) and solid shapes per AISC E4 scope / CSI §3.5.2.1.2.1: a closed
  // section's torsional stiffness is high enough that the mode cannot govern.
  const e4 =
    inp.e4 && g.kind !== "rhs" && g.kind !== "chs"
      ? e4Buckling(g.kind, Ag, E, inp.e4)
      : undefined
  const FeTorsional = e4?.Fe
  // min() — E4 is an additional limit state, never a replacement, so it can only
  // reduce the capacity.
  const Fe =
    FeTorsional !== undefined && FeTorsional > 0 ? Math.min(FeFlex, FeTorsional) : FeFlex
  const governingMode: "flexural" | "flexural-torsional" =
    Fe < FeFlex ? "flexural-torsional" : "flexural"
  const Fcr = fcrFlexural(Fy, Fe)

  // E7: reduce the area for slender elements. Note Fcr itself is computed on
  // the GROSS section first, then used to size the effective widths - this is
  // the order CSI's Example 0002 follows and it matches AISC E7.
  const axial = classifyAxial(g, Fy, E)
  const slender = axial.cls === "slender"
  let tooSlender = false
  let Ae = Ag
  if (slender && Fcr > 0) {
    let lost = 0
    for (const el of axial.elements) {
      if (el.cls !== "slender") continue
      if (g.kind === "iwf" && el.name === "web") {
        const be = effectiveWidth(g.hw, el.lambda, el.lambdaR, Fy, Fcr, C1_STIFFENED)
        lost += (g.hw - be) * g.tw
      } else if (g.kind === "iwf" && el.name === "flange") {
        // Two outstands, each of width b/2 and thickness tf.
        const bOut = g.b / 2
        const be = effectiveWidth(bOut, el.lambda, el.lambdaR, Fy, Fcr, C1_UNSTIFFENED)
        lost += 2 * (bOut - be) * g.tf
      } else if (g.kind === "rhs") {
        const w = el.name === "flange" ? g.b : g.hw
        const t = el.name === "flange" ? g.tf : g.tw
        const be = effectiveWidth(w, el.lambda, el.lambdaR, Fy, Fcr, C1_HSS_WALL)
        lost += 2 * (w - be) * t // two walls of each orientation
      } else if (g.kind === "tee" && el.name === "flange") {
        // Two flange outstands of width b/2 — same as an I-shape.
        const bOut = g.b / 2
        const be = effectiveWidth(bOut, el.lambda, el.lambdaR, Fy, Fcr, C1_UNSTIFFENED)
        lost += 2 * (bOut - be) * g.tf
      } else if (g.kind === "tee" && el.name === "stem") {
        // ONE stem, free along its lower edge, so it is an unstiffened element
        // (Table E7.1 row (c)) and not row (a) as an I-shape web would be.
        // E7.1's "for tees this is d" — the width is the full nominal depth.
        const be = effectiveWidth(g.hw, el.lambda, el.lambdaR, Fy, Fcr, C1_UNSTIFFENED)
        lost += (g.hw - be) * g.tw
      } else if (g.kind === "angle") {
        // Each leg is a single unstiffened outstand at its full width.
        const w = el.name === "leg-b" ? g.b : g.hw
        const t = el.name === "leg-b" ? g.tf : g.tw
        const be = effectiveWidth(w, el.lambda, el.lambdaR, Fy, Fcr, C1_UNSTIFFENED)
        lost += (w - be) * t
      }
      // Round HSS is not an effective-WIDTH case - E7.2 reduces Ae directly.
    }
    if (g.kind === "chs") {
      // AISC E7-7 / CSI 3.5.2.2.3.2 — round HSS, three branches:
      //   D/t ≤ 0.11E/Fy               : Ae = Ag                (no reduction)
      //   0.11E/Fy < D/t < 0.45E/Fy    : Ae = [0.038E/(Fy·D/t) + 2/3]·Ag
      //   D/t ≥ 0.45E/Fy               : Ae = 0  — "too slender and it is not
      //                                  designed" (CSI 3.5.2.2.3.2)
      // The third branch is a REJECTION, not a capacity: `tooSlender` is raised
      // so the strategy layer refuses the member instead of reporting Pn = 0,
      // which would read as a solved-but-failing section.
      // `>=` closes the gap left by the printed branches: E7-6's middle case is
      // written for 0.11E/Fy < D/t < 0.45E/Fy and the third for D/t > 0.45E/Fy,
      // so the limit value itself falls between them. Treat it as out of scope.
      const Dt = (g.D ?? g.h) / g.tf
      if (Dt >= 0.45 * (E / Fy)) {
        tooSlender = true
        Ae = 0
      } else {
        Ae = Math.min(Ag, ((0.038 * E) / (Fy * Dt) + 2 / 3) * Ag)
      }
    } else {
      Ae = Math.max(0, Ag - lost)
    }
  }

  const Pn = (Fcr * Ae) / 1000 // N -> kN

  return {
    Pn, Fcr, Fe, Ae, slenderness, governingAxis, slender, tooSlender,
    slendernessWarning: slenderness > 200,
    Fez: e4?.Fez, FeTorsional, governingMode,
  }
}

/** AISC D2 — axial tension yielding on the gross section. Pn = Fy·Ag (kN).
 *  Rupture on the net section (D2-2) needs a connection model, which does not
 *  exist here; Ae is therefore always Ag and only yielding is checked. */
export function tensionStrength(Ag: number, Fy: number): number {
  return (Fy * Ag) / 1000
}

/** Re-exported so callers do not need to reach into rules.ts for this. */
export { kc }

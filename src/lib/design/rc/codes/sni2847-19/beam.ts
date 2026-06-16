/**
 * RC rectangular-beam flexure + shear + detailing — SNI 2847:2019 (≡ ACI 318-14).
 *
 * The "math" half of this code's beam design: Whitney required-As, per-bar
 * strain-compatibility capacity, shear capacity/spacing, and the live detailing
 * checks. Geometry (where bars sit) comes from shared/; this module applies the
 * code's clause formulas to it.
 *
 * 318-14 baseline vs the ACI 318-25 sibling: fixed tension-controlled limit
 * EPS_T_MIN = 0.005 (no εty+0.003) and no one-way-shear size effect (`vc` ignores
 * `hasMinShearReinf`). Frame-type detailing (OMF/IMF/SMF) is edition-stable, so it
 * matches the 318-25 copy exactly.
 *
 * All internal math in N, mm, MPa; moments cross the boundary in kN·m, forces in kN.
 */

import { barArea, barDia, type RebarSize } from "../../shared/rebar"
import {
  buildBarLayout,
  minClearSpacing,
  LAYER_CLEAR_MM,
  type BarLayout,
} from "../../shared/bar-geometry"
import type { ArrangementCheck, TransverseChecks } from "../../shared/types"
import type { FrameType } from "../../../core/types"
import type { RcCriteria } from "../../criteria"
import type { RebarArrangement } from "../../types"
import { beta1, EPS_CU, EPS_T_MIN, asMin, maxCrackSpacing, sqrtFc } from "./rules"

// ── Flexure ──────────────────────────────────────────────────────────────────

export interface FlexureGeometry {
  /** Section width, mm */
  b: number
  /** Effective depth to tension steel, mm */
  d: number
  /** Distance from compression fibre to compression-steel centroid, mm */
  dPrimeC: number
  /** Concrete strength f'c, MPa */
  fc: number
}

export interface RequiredAsResult {
  /** Total required tension steel, mm² (incl. As,min floor) */
  As: number
  /** Required compression steel, mm² (doubly-reinforced path only) */
  AsPrime: number
  doublyReinforced: boolean
  /** False when the section cannot carry Mu even doubly-reinforced. */
  adequate: boolean
}

/**
 * Required As for a single design moment Mu (kN·m, magnitude).
 * Singly-reinforced when a ≤ a_max (Pers. 5-7), otherwise the doubly path
 * (Pers. 5-8 … 5-13). Result floored at As,min.
 */
export function requiredAs(
  Mu_kNm: number,
  g: FlexureGeometry,
  cr: RcCriteria,
): RequiredAsResult {
  const { b, d, dPrimeC, fc } = g
  const { fy, Es } = cr
  const phi = cr.phiTension
  const Mu = Math.abs(Mu_kNm) * 1e6 // N·mm
  const floor = asMin(fc, fy, b, d)

  if (Mu <= 0) {
    return { As: floor, AsPrime: 0, doublyReinforced: false, adequate: true }
  }

  const cMax = (EPS_CU / (EPS_CU + EPS_T_MIN)) * d // Pers. 5-5
  const aMax = beta1(fc) * cMax // Pers. 5-4

  const disc = d * d - (2 * Mu) / (phi * 0.85 * fc * b)
  if (disc >= 0) {
    const a = d - Math.sqrt(disc) // Pers. 5-3
    if (a <= aMax) {
      const As = Mu / (phi * fy * (d - a / 2)) // Pers. 5-7
      return { As: Math.max(As, floor), AsPrime: 0, doublyReinforced: false, adequate: true }
    }
  }

  // Doubly-reinforced (a > a_max, or discriminant failed): concrete block held
  // at a_max, remainder carried by the As'/As2 couple. (Pers. 5-8 … 5-13)
  const Cc = 0.85 * fc * b * aMax // Pers. 5-12
  const Muc = phi * Cc * (d - aMax / 2)
  const Mus = Mu - Muc // > 0 by construction here
  const As1 = Muc / (fy * (d - aMax / 2) * phi) // Pers. 5-10
  const As2 = Mus / (fy * (d - dPrimeC) * phi)
  const fsPrime = Math.min(fy, Es * EPS_CU * ((cMax - dPrimeC) / cMax)) // Pers. 5-13

  if (fsPrime - 0.85 * fc <= 0 || d - dPrimeC <= 0) {
    // Compression steel cannot develop net force — section inadequate.
    return { As: Math.max(As1 + As2, floor), AsPrime: 0, doublyReinforced: true, adequate: false }
  }

  const AsPrime = Mus / ((fsPrime - 0.85 * fc) * (d - dPrimeC) * phi) // Pers. 5-11
  return {
    As: Math.max(As1 + As2, floor),
    AsPrime,
    doublyReinforced: true,
    adequate: true,
  }
}

export interface PhiMnResult {
  /** Nominal moment, kN·m */
  Mn: number
  /** φ·Mn, kN·m */
  phiMn: number
  /** Neutral-axis depth, mm */
  c: number
  /** Net tensile strain at extreme tension steel */
  epsT: number
  /** Strength-reduction factor after the 21.2.2 ramp */
  phi: number
}

/**
 * Moment capacity of a section with provided steel, by strain compatibility.
 *
 * - `As` = tension steel (mm²), `AsPrime` = compression steel (mm²).
 * - `fyOverride` substitutes the steel stress ceiling (1.25·fy → Mpr per 18.6.5;
 *   use `.Mn` from the result, i.e. φ = 1, for capacity-design shear).
 * - φ ramps from phiCompression to phiTension over εty → 0.005 (21.2.2); the
 *   ramp always uses the *actual* fy for εty, independent of fyOverride.
 * - Compression steel force uses (f's − 0.85f'c) to net out displaced concrete.
 *   For Mpr the caller passes AsPrime = 0 (book/SAP convention — tension steel only).
 */
export function phiMnProvided(
  As: number,
  AsPrime: number,
  g: FlexureGeometry,
  cr: RcCriteria,
  fyOverride?: number,
): PhiMnResult {
  const { b, d, dPrimeC, fc } = g
  const { Es } = cr
  const fyEff = fyOverride ?? cr.fy

  if (As <= 0) {
    return { Mn: 0, phiMn: 0, c: 0, epsT: Infinity, phi: cr.phiTension }
  }

  const b1 = beta1(fc)
  const hCap = d + dPrimeC // generous cap for the stress-block depth

  // Net axial imbalance C(c) − T(c); monotonically increasing in c.
  const balance = (c: number): number => {
    const a = Math.min(b1 * c, hCap)
    const Cc = 0.85 * fc * b * a
    const fs = Math.max(-fyEff, Math.min(fyEff, Es * EPS_CU * ((d - c) / c)))
    let Cs = 0
    if (AsPrime > 0) {
      const fsP = Math.max(-fyEff, Math.min(fyEff, Es * EPS_CU * ((c - dPrimeC) / c)))
      Cs = AsPrime * (fsP - (fsP > 0 ? 0.85 * fc : 0))
    }
    return Cc + Cs - As * fs
  }

  // Bisection for c ∈ (0, hCap]; balance(0+) < 0 (no concrete force), balance(hCap) > 0.
  let lo = 1e-6
  let hi = hCap
  if (balance(hi) < 0) {
    // Pathological (huge As, tiny section) — steel never balances; treat as c = hi.
    lo = hi
  }
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi)
    if (balance(mid) >= 0) hi = mid
    else lo = mid
  }
  const c = 0.5 * (lo + hi)

  const a = Math.min(b1 * c, hCap)
  const Cc = 0.85 * fc * b * a
  let Cs = 0
  if (AsPrime > 0) {
    const fsP = Math.max(-fyEff, Math.min(fyEff, Es * EPS_CU * ((c - dPrimeC) / c)))
    Cs = AsPrime * (fsP - (fsP > 0 ? 0.85 * fc : 0))
  }
  // Moments about the tension steel.
  const Mn_Nmm = Cc * (d - a / 2) + Cs * (d - dPrimeC)
  const epsT = EPS_CU * ((d - c) / c)

  const epsTy = cr.fy / Es
  const t = (epsT - epsTy) / (EPS_T_MIN - epsTy)
  const phi = Math.min(
    cr.phiTension,
    Math.max(cr.phiCompression, cr.phiCompression + (cr.phiTension - cr.phiCompression) * t),
  )

  const Mn = Mn_Nmm / 1e6
  return { Mn, phiMn: phi * Mn, c, epsT, phi }
}

export interface BarPoint {
  /** Depth from the extreme COMPRESSION fibre, mm. */
  d: number
  /** Bar area, mm². */
  area: number
}

/**
 * Moment capacity by full strain compatibility over an explicit bar list
 * (top + bottom + side bars — 9.7.2.3 permits counting skin reinforcement
 * when a strain-compatibility analysis is performed).
 *
 * - Each bar: εs = εcu·(c − dᵢ)/c (compression +), fs = clamp(Es·εs, ±fyEff).
 * - Bars inside the stress block get the displaced-concrete correction
 *   (fs − 0.85·f'c).
 * - εt for the φ ramp is taken at the EXTREME tension bar (21.2.2); the ramp
 *   always uses the actual fy for εty, independent of fyOverride.
 * - `fyOverride = 1.25·fy` + `.Mn` (φ = 1) gives Mpr for capacity-design shear.
 */
export function phiMnBars(
  bars: BarPoint[],
  b: number,
  h: number,
  fc: number,
  cr: RcCriteria,
  fyOverride?: number,
): PhiMnResult {
  const { Es } = cr
  const fyEff = fyOverride ?? cr.fy
  const active = bars.filter((p) => p.area > 0 && p.d > 0)
  if (active.length === 0) {
    return { Mn: 0, phiMn: 0, c: 0, epsT: Infinity, phi: cr.phiTension }
  }
  const b1 = beta1(fc)
  const dt = Math.max(...active.map((p) => p.d)) // extreme tension bar

  // Signed bar force (N, compression +) at neutral-axis depth c.
  const barForce = (p: BarPoint, c: number, a: number): number => {
    const fs = Math.max(-fyEff, Math.min(fyEff, Es * EPS_CU * ((c - p.d) / c)))
    const displaced = fs > 0 && p.d <= a ? 0.85 * fc : 0
    return p.area * (fs - displaced)
  }

  // Net axial: Cc + Σ barForce; monotonically increasing in c.
  const balance = (c: number): number => {
    const a = Math.min(b1 * c, h)
    let net = 0.85 * fc * b * a
    for (const p of active) net += barForce(p, c, a)
    return net
  }

  let lo = 1e-6
  let hi = h
  if (balance(hi) < 0) lo = hi // pathological: huge As — treat as c = h
  for (let i = 0; i < 100; i++) {
    const mid = 0.5 * (lo + hi)
    if (balance(mid) >= 0) hi = mid
    else lo = mid
  }
  const c = 0.5 * (lo + hi)
  const a = Math.min(b1 * c, h)

  // ΣF = 0, so moments about the compression fibre give Mn directly:
  // compression forces at small depths, tension (negative) at large depths.
  let Mn_Nmm = -(0.85 * fc * b * a) * (a / 2)
  for (const p of active) Mn_Nmm -= barForce(p, c, a) * p.d

  const epsT = EPS_CU * ((dt - c) / c)
  const epsTy = cr.fy / Es
  const t = (epsT - epsTy) / (EPS_T_MIN - epsTy)
  const phi = Math.min(
    cr.phiTension,
    Math.max(cr.phiCompression, cr.phiCompression + (cr.phiTension - cr.phiCompression) * t),
  )
  const Mn = Math.max(0, Mn_Nmm) / 1e6
  return { Mn, phiMn: phi * Mn, c, epsT, phi }
}

// ── Shear ────────────────────────────────────────────────────────────────────

/**
 * Concrete shear capacity Vc = 0.17·λ·√f'c·bw·d (22.5.5.1). kN
 *
 * `hasMinShearReinf` and `rhoW` are accepted to match the ACI 318-25 module's
 * signature but are IGNORED here — ACI 318-14 / SNI 2847:2019 has no size-effect
 * factor (λs ≡ 1) and no ρw-based formula (c).
 */
export function vc(
  lambda: number,
  fc: number,
  bw: number,
  d: number,
  _hasMinShearReinf = true,
  _rhoW = 0,
): number {
  void _hasMinShearReinf
  void _rhoW
  return (0.17 * lambda * sqrtFc(fc) * bw * d) / 1e3
}

/** Cross-section ceiling Vc + 0.66√f'c·bw·d (22.5.1.2). kN */
export function vMaxLimit(vcVal: number, fc: number, bw: number, d: number): number {
  return vcVal + (0.66 * sqrtFc(fc) * bw * d) / 1e3
}

/** Minimum stirrups Av,min/s = max(0.062√f'c, 0.35)·bw/fyt (9.6.3.4). mm²/mm */
export function avMinPerS(fc: number, fyt: number, bw: number): number {
  return (Math.max(0.062 * sqrtFc(fc), 0.35) * bw) / fyt
}

/**
 * Required Av/s for the design shear (R22.5.10.5):
 * (Vu − φVc)/(φ·fyt·d), floored at Av,min/s. Returns mm²/m.
 */
export function avSRequired(
  Vdesign: number, // kN
  phiVc: number, // kN
  fyt: number,
  d: number,
  cr: RcCriteria,
  fc: number,
  bw: number,
): number {
  const demand = Math.max(0, (Vdesign - phiVc) * 1e3) / (cr.phiShear * fyt * d) // mm²/mm
  return Math.max(demand, avMinPerS(fc, fyt, bw)) * 1000
}

/**
 * Suggest a stirrup spacing for a required Av/s (mm²/m): spacing rounded DOWN
 * to 25 mm steps, capped by `sCap` (e.g. SMF end-zone limit) and clamped ≥ 25.
 */
export function suggestStirrup(
  avS_per_m: number,
  legs: number,
  size: RebarSize,
  sCap?: number,
): { size: RebarSize; legs: number; spacing: number } {
  const Av = legs * barArea(size) // mm²
  let s = avS_per_m > 0 ? (Av / avS_per_m) * 1000 : sCap ?? 600
  if (sCap !== undefined) s = Math.min(s, sCap)
  s = Math.max(25, Math.floor(s / 25) * 25)
  return { size, legs, spacing: s }
}

/** SMF hoop spacing limit in end (hinge) zones (18.6.4.4): min(d/4, 6db, 150). mm */
export function smfEndZoneSpacingMax(d: number, dbMain: number): number {
  return Math.min(d / 4, 6 * dbMain, 150)
}

/** IMF hoop spacing limit in end (hinge) zones (18.4.2.5):
 *  min(d/4, 8·db,long, 24·db,hoop, 300). mm */
export function imfEndZoneSpacingMax(d: number, dbLong: number, dbHoop: number): number {
  return Math.min(d / 4, 8 * dbLong, 24 * dbHoop, 300)
}

/** Vs threshold of 9.7.6.2.2: 0.33·√f'c·bw·d. Above it, the general max spacing
 *  halves (d/2→d/4, 600→300). Also the practical upper bound on Vs design. kN */
export function vsSpacingThreshold(fc: number, bw: number, d: number): number {
  return (0.33 * sqrtFc(fc) * bw * d) / 1e3
}

/** General stirrup spacing cap (9.7.6.2.2): min(d/2, 600), tightening to
 *  min(d/4, 300) when Vs exceeds 0.33√f'c·bw·d. mm */
export function generalSpacingMax(d: number, highVs = false): number {
  return highVs ? Math.min(d / 4, 300) : Math.min(d / 2, 600)
}

/** Provided Av/s from an arrangement, mm²/m. */
export function avSProvided(legs: number, size: RebarSize, spacing: number): number {
  if (spacing <= 0) return 0
  return ((legs * barArea(size)) / spacing) * 1000
}

/** φVn for provided stirrups: φ(Vc + Av/s·fyt·d). Inputs kN / mm²/m / MPa / mm → kN. */
export function phiVnProvided(
  vcVal: number, // kN (already zeroed for SMF end zones by caller)
  avS_per_m: number,
  fyt: number,
  d: number,
  cr: RcCriteria,
): number {
  const Vs = ((avS_per_m / 1000) * fyt * d) / 1e3 // kN
  return cr.phiShear * (vcVal + Vs)
}

// ── Detailing checks (longitudinal) ───────────────────────────────────────────

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
        text: `${label} bar min. (clear) spacing ${f(g.clearSpacing)} mm ≥ ${f(sMin)} mm`,
        clause: "25.2.1",
      })
    }
    if (g.centerSpacing !== null) {
      const sMax = maxCrackSpacing(opts.fy, cover + dbS)
      checks.push({
        status: g.centerSpacing <= sMax + 1e-9 ? "pass" : "fail",
        text: `${label} bar max. (c/c) spacing ${f(g.centerSpacing)} mm ≤ ${f(sMax)} mm`,
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

  // SMF beams: at least 2 continuous bars top and bottom, and ρ ≤ 0.025 each face.
  if (opts.frameType === "SMF") {
    const ok = arr.top.count >= 2 && arr.bottom.count >= 2
    checks.push({
      status: ok ? "pass" : "fail",
      text: ok ? "≥ 2 continuous bars top and bottom" : "SMF requires ≥ 2 bars top and bottom",
      clause: "18.6.3.1",
    })
    // ρ = As/(bw·d) per face ≤ 0.025 (18.6.3.1). Bottom uses d to the bottom group,
    // top uses d to the top group (measured from the opposite fibre).
    const dBot = layout.bottom.centroid
    const dTop = h - layout.top.centroid
    const rhoBot = dBot > 0 ? (arr.bottom.count * barArea(arr.bottom.size)) / (b * dBot) : 0
    const rhoTop = dTop > 0 ? (arr.top.count * barArea(arr.top.size)) / (b * dTop) : 0
    const rhoMax = Math.max(rhoBot, rhoTop)
    checks.push({
      status: rhoMax <= 0.025 + 1e-9 ? "pass" : "fail",
      text: `ρ = ${(rhoMax * 100).toFixed(2)}% ${rhoMax <= 0.025 ? "≤" : ">"} 2.5% maximum`,
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

// ── Detailing checks (dimensional) ────────────────────────────────────────────

/**
 * SMF beam dimensional limits (18.6.2.1): clear span Lₙ ≥ 4d and web width
 * bw ≥ min(0.3h, 250 mm). Returns [] for OMF/IMF (no dimensional gate). Lₙ is
 * the node-to-node length (no column-face offset — documented limitation), in mm.
 */
export function checkBeamDimensions(
  b: number,
  h: number,
  d: number,
  Ln: number,
  frameType: FrameType,
): ArrangementCheck[] {
  if (frameType !== "SMF") return []
  const f = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(0))
  const bwMin = Math.min(0.3 * h, 250)
  return [
    {
      status: Ln >= 4 * d - 1e-6 ? "pass" : "fail",
      text: `Clear span Lₙ ${f(Ln)} mm ${Ln >= 4 * d ? "≥" : "<"} 4d = ${f(4 * d)} mm`,
      clause: "18.6.2.1",
    },
    {
      status: b >= bwMin - 1e-9 ? "pass" : "fail",
      text: `Web width bw ${f(b)} mm ${b >= bwMin ? "≥" : "<"} min(0.3h, 250) = ${f(bwMin)} mm`,
      clause: "18.6.2.1",
    },
  ]
}

// ── Detailing checks (transverse) ─────────────────────────────────────────────

/**
 * Live detailing checks for the user-defined stirrup/hoop in the given zone
 * (Support = member-end hinge region, Midspan = elsewhere). All are geometry-only
 * (demand-independent) so they update without a solver run:
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
  // 18.6.4.4(b) / 18.4.2.5(b): 6db / 8db of the SMALLEST primary flexural bar.
  const dbLong = Math.min(barDia(arr.top.size), barDia(arr.bottom.size))
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
    text: `Stirrup spacing ${f(s)} mm ≤ ${f(sMax)} mm`,
    clause,
  })

  // 2) Minimum web steel (9.6.3.3), where stirrups are required.
  const avMin = avMinPerS(fc, fyt, b) * 1000 // mm²/m
  const avProv = avSProvided(legs, arr.stirrup.size, s)
  checks.push({
    status: avProv >= avMin - 1e-6 ? "pass" : "fail",
    text: `Aᵥ/s = ${f(avProv)} mm²/m ≥ Aᵥ,min/s = ${f(avMin)} mm²/m`,
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

  // Confined hoop region — the end zone is modelled as 2h from the face, which
  // is exactly the IMF/SMF confinement length (18.6.4.1 / 18.4.2.4).
  if (frameType !== "OMF" && isEnd) {
    checks.push({
      status: "pass",
      text: "Confined hoop region = 2h from face (modelled as the support zone)",
      clause: frameType === "SMF" ? "18.6.4.1" : "18.4.2.4",
    })
    // First-hoop position isn't modelled along the span — advisory only.
    notes.push(`First hoop ≤ 50 mm from the support face (${frameType === "SMF" ? "18.6.4.1" : "18.4.2.4"}).`)
  }

  return { checks, notes }
}

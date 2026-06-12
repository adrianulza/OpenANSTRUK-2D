/**
 * RC rectangular-beam flexural design / check — ACI 318-14 / SNI 2847:2019.
 *
 * Whitney equivalent stress block. All internal math in N, mm, MPa; moments
 * cross the boundary in kN·m (×1e6 to N·mm). Formulas follow the validation
 * reference (book §5.4.2.1, Pers. 5-3 … 5-13).
 */

import type { DesignCriteria } from "./types"

export const EPS_CU = 0.003 // concrete crushing strain (22.2.2.1)
export const EPS_T_MIN = 0.005 // tension-controlled limit strain for beams (9.3.3.1 / 21.2.2)

/** Stress-block factor β₁ (22.2.2.4.3): 0.85 − 0.05(f'c−28)/7, clamped [0.65, 0.85]. */
export function beta1(fc: number): number {
  const b = 0.85 - (0.05 * (fc - 28)) / 7
  return Math.min(0.85, Math.max(0.65, b))
}

/** Minimum flexural steel (9.6.1.2): max(0.25√f'c, 1.4)/fy · bw·d. mm² */
export function asMin(fc: number, fy: number, bw: number, d: number): number {
  return (Math.max(0.25 * Math.sqrt(fc), 1.4) / fy) * bw * d
}

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

// ── Required steel (design mode) ─────────────────────────────────────────────

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
  cr: DesignCriteria,
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

// ── Capacity of provided steel (check mode, Mn/Mpr) ──────────────────────────

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
  cr: DesignCriteria,
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

// ── Per-bar strain compatibility (checked mode) ──────────────────────────────

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
  cr: DesignCriteria,
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

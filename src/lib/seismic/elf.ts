/**
 * Base shear and its vertical distribution — ASCE 7-16 §12.8.1 and §12.8.3.
 *
 * Pure: no React, no three, no model.
 *
 * This module is unit-agnostic. `W` and `h` enter only through ratios, so a
 * caller may work in kN and metres or kips and feet and get the same Cvx. Only
 * `period.ts` cares about units, because Ct does.
 */

/** Which clause produced the Cs actually used. Reported, because it explains the number. */
export type CsGoverning = "12.8-2" | "12.8-3" | "12.8-4" | "12.8-5" | "12.8-6"

export interface SeismicCoefficientInput {
  SDS: number
  SD1: number
  /** Mapped 1-second acceleration. Only §12.8-6 reads it. */
  S1: number
  /** Long-period transition period, seconds. */
  TL: number
  /** The design period, seconds — from `governingPeriod`. */
  T: number
  /** Response modification coefficient, Table 12.2-1. */
  R: number
  /** Importance factor, Table 1.5-2. */
  Ie: number
}

export interface SeismicCoefficient {
  /** The value to use. */
  Cs: number
  /** Which clause set it. */
  governing: CsGoverning
  /** Eq. 12.8-2 — SDS/(R/Ie). The short-period cap. */
  CsEq2: number
  /** Eq. 12.8-3 — SD1/(T(R/Ie)). Binds for T <= TL. */
  CsEq3: number
  /** Eq. 12.8-4 — SD1·TL/(T²(R/Ie)). Binds beyond TL. */
  CsEq4: number
  /** Eq. 12.8-5 — max(0.044·SDS·Ie, 0.01). The floor. */
  CsMin: number
  /** Eq. 12.8-6 — 0.5·S1/(R/Ie). Present only where S1 >= 0.6. */
  CsNearFault?: number
}

/**
 * The seismic response coefficient, §12.8.1.1.
 *
 * Read as one sentence: Cs is SDS/(R/Ie), reduced for long periods by 12.8-3 or
 * 12.8-4, then raised to a floor by 12.8-5 and — near a major fault — 12.8-6.
 *
 * ⚠ 12.8-5 is a FLOOR, not another cap, and it catches out anyone who assumes
 * the smallest of the equations wins. On a tall building the 1/T branch can fall
 * well below 0.044·SDS·Ie, and the floor is then the answer.
 *
 * ⚠ The 12.8-5 floor changed between editions. ASCE 7-02 had a flat 0.01; the
 * `0.044·SDS·Ie` form arrived at 7-05 Supplement 2. `validation/suites/smoke_seismic_elf.mts`
 * §1 reproduces a 7-02 example, and it only reproduces because the floor does
 * not bind there — do not read that anchor as evidence the floors are identical
 * across editions.
 */
export function seismicCoefficient(input: SeismicCoefficientInput): SeismicCoefficient {
  const { SDS, SD1, S1, TL, T, R, Ie } = input
  const RoverI = R / Ie

  const CsEq2 = SDS / RoverI
  const CsEq3 = T > 0 ? SD1 / (T * RoverI) : Infinity
  const CsEq4 = T > 0 ? (SD1 * TL) / (T * T * RoverI) : Infinity
  const CsMin = Math.max(0.044 * SDS * Ie, 0.01)
  const CsNearFault = S1 >= 0.6 ? (0.5 * S1) / RoverI : undefined

  // The long-period cap: which of 12.8-3 / 12.8-4 applies depends on TL alone.
  const longCap = T <= TL ? CsEq3 : CsEq4
  const longClause: CsGoverning = T <= TL ? "12.8-3" : "12.8-4"

  let Cs = CsEq2
  let governing: CsGoverning = "12.8-2"
  if (longCap < Cs) {
    Cs = longCap
    governing = longClause
  }
  if (CsMin > Cs) {
    Cs = CsMin
    governing = "12.8-5"
  }
  if (CsNearFault !== undefined && CsNearFault > Cs) {
    Cs = CsNearFault
    governing = "12.8-6"
  }

  return { Cs, governing, CsEq2, CsEq3, CsEq4, CsMin, CsNearFault }
}

/**
 * The distribution exponent k, §12.8.3.
 *
 * 1 at T <= 0.5 s, 2 at T >= 2.5 s, linear in T between. ⚠ Linear — NOT the
 * rounded-to-the-nearest-tenth convention some references use. A published
 * example pins this: at T = 0.5204 s its k is 1.0102, which is
 * 1 + (0.5204 − 0.5)/2 exactly and would be 1.0 under any rounding rule.
 */
export function kExponent(T: number): number {
  if (T <= 0.5) return 1
  if (T >= 2.5) return 2
  return 1 + (T - 0.5) / 2
}

export interface StoreyInput {
  id: string
  /** Height of this level above the base. Any consistent unit. */
  h: number
  /** Effective seismic weight assigned to this level. Any consistent unit. */
  W: number
}

export interface StoreyForce extends StoreyInput {
  /** W·h^k — the numerator of Cvx. */
  whk: number
  /** Vertical distribution factor, Eq. 12.8-12. Sums to 1 across the structure. */
  Cvx: number
  /** Lateral force at this level, Eq. 12.8-11. */
  Fx: number
  /** Storey shear — the sum of Fx at and above this level, Eq. 12.8-13. */
  Vx: number
  /**
   * Overturning moment at the BOTTOM of the storey below this level, Eq. 12.8-14.
   *
   * "Bottom of the storey" is the next level down, or the base for the lowest
   * level — so the lowest level's Mx is the full sum(Fx·h) about the base, which
   * is the quantity a foundation designer wants.
   */
  Mx: number
}

/**
 * Vertical distribution of the base shear, §12.8.3.
 *
 * Returned in the SAME ORDER the storeys were given, so a caller's table does
 * not reshuffle; the internal work sorts by height and the result does not
 * depend on input order.
 *
 * ⚠ A zero denominator is reachable — every storey at h = 0, or every W = 0 —
 * and it must not produce NaN. All forces come back as 0 in that case, which is
 * the honest answer: there is nothing to distribute to.
 */
export function verticalDistribution(storeys: StoreyInput[], V: number, k: number): StoreyForce[] {
  if (storeys.length === 0) return []

  const whk = storeys.map((s) => (s.h > 0 ? s.W * Math.pow(s.h, k) : 0))
  const denom = whk.reduce((a, b) => a + b, 0)

  const base: (StoreyForce & { _i: number })[] = storeys.map((s, i) => {
    const Cvx = denom > 0 ? whk[i] / denom : 0
    return { ...s, whk: whk[i], Cvx, Fx: Cvx * V, Vx: 0, Mx: 0, _i: i }
  })

  // Storey shear accumulates from the top down; the overturning moment at the
  // bottom of each storey uses the lever arm to the level BELOW it.
  const byHeight = [...base].sort((a, b) => b.h - a.h)
  let shear = 0
  for (let i = 0; i < byHeight.length; i++) {
    const s = byHeight[i]
    shear += s.Fx
    s.Vx = shear
    const below = i + 1 < byHeight.length ? byHeight[i + 1].h : 0
    let m = 0
    for (let j = 0; j <= i; j++) m += byHeight[j].Fx * (byHeight[j].h - below)
    s.Mx = m
  }

  return base
    .sort((a, b) => a._i - b._i)
    .map(({ _i, ...rest }) => rest)
}

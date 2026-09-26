/**
 * The ASCE 7-16 design response spectrum — §11.4.4 to §11.4.6.
 *
 * Pure: no React, no three, no model.
 *
 * Strictly the equivalent lateral force procedure reads only SDS and SD1, so the
 * curve is not needed to compute a base shear. It is here because the curve is
 * what makes those two numbers legible: it shows which branch the structure's
 * period lands on, and therefore which of the five Cs equations will govern,
 * before the user has computed anything.
 */

export interface DesignAccelerationInput {
  Ss: number
  S1: number
  Fa: number
  Fv: number
}

export interface DesignAccelerations {
  /** Fa·Ss — MCE_R, short period (§11.4.3). */
  SMS: number
  /** Fv·S1 — MCE_R, 1-second period (§11.4.3). */
  SM1: number
  /** ⅔·SMS — design, short period (§11.4.4). */
  SDS: number
  /** ⅔·SM1 — design, 1-second period (§11.4.4). */
  SD1: number
}

/**
 * Site-modified, then design, accelerations.
 *
 * The ⅔ is not a safety factor — it is the ratio between the risk-targeted
 * maximum considered earthquake and the design earthquake, fixed by §11.4.4.
 */
export function designAccelerations({ Ss, S1, Fa, Fv }: DesignAccelerationInput): DesignAccelerations {
  const SMS = Fa * Ss
  const SM1 = Fv * S1
  return { SMS, SM1, SDS: (2 / 3) * SMS, SD1: (2 / 3) * SM1 }
}

export interface SpectrumInput {
  SDS: number
  SD1: number
  /** Long-period transition period, seconds — Figures 22-14 to 22-17. */
  TL: number
}

export interface SpectrumCorners {
  /** 0.2·Ts — where the ascending branch reaches the plateau. */
  T0: number
  /** SD1/SDS — where the plateau gives way to the constant-velocity branch. */
  Ts: number
}

/**
 * The two corner periods.
 *
 * ⚠ SDS = 0 is reachable from a legitimately near-zero-seismicity site, and Ts
 * would then be infinite. Both corners collapse to 0 instead, which sends
 * `spectralAcceleration` down the descending branch everywhere — correct,
 * because SD1 is zero too, so the whole spectrum is zero.
 */
export function spectrumCorners({ SDS, SD1 }: Pick<SpectrumInput, "SDS" | "SD1">): SpectrumCorners {
  if (SDS <= 0) return { T0: 0, Ts: 0 }
  const Ts = SD1 / SDS
  return { T0: 0.2 * Ts, Ts }
}

/**
 * Design spectral response acceleration at one period, §11.4.6.
 *
 *   T < T0         Sa = SDS(0.4 + 0.6·T/T0)   ascending
 *   T0 ≤ T ≤ Ts    Sa = SDS                   constant acceleration
 *   Ts < T ≤ TL    Sa = SD1/T                 constant velocity
 *   T > TL         Sa = SD1·TL/T²             constant displacement
 *
 * The branches meet exactly at every corner. That is asserted in the suite
 * rather than assumed: a discontinuity there is the classic transcription
 * error, and it shows up in use as a base shear that jumps when a section
 * changes by a millimetre.
 */
export function spectralAcceleration(T: number, { SDS, SD1, TL }: SpectrumInput): number {
  const { T0, Ts } = spectrumCorners({ SDS, SD1 })
  if (T <= 0) return 0.4 * SDS
  if (T < T0) return SDS * (0.4 + (0.6 * T) / T0)
  if (T <= Ts) return SDS
  if (T <= TL) return SD1 / T
  return (SD1 * TL) / (T * T)
}

export interface SpectrumPoint {
  T: number
  Sa: number
}

/**
 * The curve as plottable points.
 *
 * The three corner periods are inserted EXACTLY rather than left to wherever a
 * uniform sample happens to land. A chart that misses T0 by a hundredth of a
 * second draws the ascending branch as a curve when it is a straight line, and
 * rounds off the one feature a reader is looking for.
 */
export function spectrumCurve(input: SpectrumInput, samples = 120): SpectrumPoint[] {
  const { T0, Ts } = spectrumCorners(input)
  const Tmax = Math.max(4, 1.5 * input.TL, 2 * Ts)

  const ts = new Set<number>([0, T0, Ts, input.TL, Tmax])
  for (let i = 0; i <= samples; i++) ts.add((i / samples) * Tmax)

  return [...ts]
    .filter((T) => Number.isFinite(T) && T >= 0 && T <= Tmax)
    .sort((a, b) => a - b)
    .map((T) => ({ T, Sa: spectralAcceleration(T, input) }))
}

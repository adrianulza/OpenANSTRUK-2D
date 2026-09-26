/**
 * The fundamental period — ASCE 7-16 §12.8.2, Tables 12.8-1 and 12.8-2.
 *
 * Pure: no React, no three, no model.
 *
 * ⚠ Ct IS UNIT-DEPENDENT AND THIS MODULE IS METRIC. Table 12.8-2 prints two sets
 * of coefficients: 0.028 / 0.016 / 0.03 / 0.02 for hn in FEET, and the values
 * below for hn in METRES. Feeding metres to the imperial set understates Ta by
 * roughly 2.4x, which flips which Cs equation governs and therefore changes the
 * base shear — a wrong answer that looks entirely plausible. Every `hn` here is
 * METRES.
 *
 * ⚠ THE TWO SETS ARE NOT EXACT CONVERSIONS OF EACH OTHER. The code rounds both:
 * the exact SI equivalent of 0.016 ft is 0.0465529…, and ASCE prints 0.0466. So
 * a calculation done in feet with the imperial set differs systematically from
 * one done in metres with the SI set by a few hundredths of a percent in Ta.
 * That is the code's own rounding, and NOT something to "fix" by switching to
 * converted constants; doing so would stop matching the published SI table.
 *
 * `taFrom` is exported separately so a caller with its own (Ct, x) — a published
 * example in imperial units, say — can use the same ladder without the metric
 * table. `validation/suites/smoke_seismic_elf.mts` §1 does exactly that.
 */

export type StructuralSystem =
  | "steel-moment"
  | "concrete-moment"
  | "steel-braced-eccentric"
  | "steel-braced-buckling-restrained"
  | "other"

/**
 * Table 12.8-2, SI. `x` is dimensionless; `Ct` assumes hn in METRES. The
 * imperial (hn in feet) Ct of each row is noted beside it.
 */
export const SYSTEM_CT: Record<StructuralSystem, { Ct: number; x: number }> = {
  // Imperial: Ct = 0.028, x = 0.8
  "steel-moment": { Ct: 0.0724, x: 0.8 },
  // Imperial: Ct = 0.016, x = 0.9
  "concrete-moment": { Ct: 0.0466, x: 0.9 },
  // Imperial: Ct = 0.03, x = 0.75
  "steel-braced-eccentric": { Ct: 0.0731, x: 0.75 },
  // Same row as the EBF in Table 12.8-2.
  "steel-braced-buckling-restrained": { Ct: 0.0731, x: 0.75 },
  // Imperial: Ct = 0.02, x = 0.75
  other: { Ct: 0.0488, x: 0.75 },
}

export const SYSTEM_LABELS: Record<StructuralSystem, string> = {
  "steel-moment": "Steel moment-resisting frame",
  "concrete-moment": "Concrete moment-resisting frame",
  "steel-braced-eccentric": "Steel eccentrically braced frame",
  "steel-braced-buckling-restrained": "Buckling-restrained braced frame",
  other: "All other structural systems",
}

/** Eq. 12.8-7, with the coefficients supplied rather than looked up. */
export function taFrom(Ct: number, x: number, hn: number): number {
  if (!(hn > 0)) return 0
  return Ct * Math.pow(hn, x)
}

export interface ApproximatePeriod {
  Ct: number
  x: number
  /** Seconds. */
  Ta: number
}

/** Eq. 12.8-7 for a named system. `hn` is the height above the base, in METRES. */
export function approximatePeriod(hn: number, system: StructuralSystem): ApproximatePeriod {
  const { Ct, x } = SYSTEM_CT[system]
  return { Ct, x, Ta: taFrom(Ct, x, hn) }
}

/**
 * Table 12.8-1 — the coefficient for the upper limit on the calculated period.
 *
 * Decreasing in SD1: where shaking is strong the code trusts a computed period
 * less, because a longer period means a smaller force. Clamped at both ends.
 */
export function cuFactor(SD1: number): number {
  if (SD1 >= 0.4) return 1.4
  if (SD1 >= 0.3) return 1.4
  if (SD1 >= 0.2) return 1.5
  if (SD1 >= 0.15) return 1.6
  return 1.7
}

/** How the design period was arrived at, so the UI can say. */
export type PeriodSource = "approximate" | "computed" | "cu-limit" | "user"

/**
 * The three ways to fix the period.
 */
export type PeriodMode = "approximate" | "computed" | "user"

export interface GoverningPeriodInput {
  Ta: number
  Cu: number
  mode: PeriodMode
  /** An eigenvalue period from an analysis, when `mode` is "computed". */
  computedT?: number
  /** A period the user asserts, when `mode` is "user". */
  userT?: number
}

export interface GoverningPeriod {
  T: number
  source: PeriodSource
  /** Cu·Ta — the §12.8.2 ceiling on a computed period. */
  upperLimit: number
}

/**
 * The period the base shear is computed from.
 *
 * §12.8.2 permits a computed period but caps it at Cu·Ta. The cap is the whole
 * point of the clause, so when it binds the engine says so rather than quietly
 * returning a different number than the analysis produced.
 *
 * ⚠ "user" mode is NOT capped. A user who types a period is overriding the
 * clause deliberately, and silently applying Cu·Ta would make the field lie
 * about what it does. The UI is responsible for saying the cap is not applied.
 */
export function governingPeriod(input: GoverningPeriodInput): GoverningPeriod {
  const upperLimit = input.Cu * input.Ta

  if (input.mode === "user") {
    const T = input.userT
    if (T !== undefined && Number.isFinite(T) && T > 0) {
      return { T, source: "user", upperLimit }
    }
    return { T: input.Ta, source: "approximate", upperLimit }
  }

  if (input.mode === "computed") {
    const T = input.computedT
    // No computed period yet — before the first solve, say. Fall back rather
    // than returning NaN and poisoning every number downstream.
    if (T === undefined || !Number.isFinite(T) || T <= 0) {
      return { T: input.Ta, source: "approximate", upperLimit }
    }
    if (T > upperLimit) return { T: upperLimit, source: "cu-limit", upperLimit }
    return { T, source: "computed", upperLimit }
  }

  return { T: input.Ta, source: "approximate", upperLimit }
}

/**
 * The earthquake load-case definition — the 2D subset of OpenANSTRUK-3D's
 * `SeismicDefinition`.
 *
 * Pure: no React, no model.
 *
 * What the 2D port drops, and why:
 *  - **Direction.** A plane frame shakes along its own plane, so the earthquake
 *    always acts along global X. There is no Y case to choose.
 *  - **Accidental eccentricity / torsion (§12.8.4.2–3).** Both are plan
 *    quantities — a shift of the centre of mass across a floor — and a plane
 *    frame has no plan.
 *  - **Time-history components in Y and Z.** The ground motion shakes along
 *    global X only.
 *
 * ⚠ ABSENT MEANS "MANUAL". A Seismic case without a `seismic` block behaves as
 * it always has: its loads are the ones the user placed. Every document and
 * template written before this feature therefore analyses exactly as before.
 */

import type { SeismicCode, SiteClass } from "./site"
import type { PeriodMode, StructuralSystem } from "./period"
import type { RiskCategory } from "./sdc"
import type { GroundMotionUnit } from "./ground-motion"

/**
 * Static equivalent (ELF, §12.8), modal response spectrum (MRS, §12.9.1), or
 * linear time history (LTH): direct integration under a ground-motion record.
 */
export type SeismicAnalysisKind = "elf" | "mrs" | "lth"

export const SEISMIC_ANALYSIS_LABELS: Record<SeismicAnalysisKind, string> = {
  elf: "Static equivalent (ELF)",
  mrs: "Response spectrum (MRS)",
  lth: "Linear time history (LTH)",
}

/**
 * The time-history block, read when `analysis` is "lth".
 *
 * ⚠ R, Cd, Ie AND THE DESIGN SPECTRUM ARE NOT APPLIED — the record × scale is
 * the input, as in a linear direct-integration time-history case. One component,
 * along global X.
 */
export interface SeismicLthSettings {
  /** Resolved against the built-in records, then the imported ones. */
  recordId: string
  /** Pure multiplier on the record. */
  scale: number
  /** What the record's numbers ARE. Absent = the record's own unit. */
  unit?: GroundMotionUnit
  /** ζ for the Rayleigh fit at mode 1 and the 90 % X-mass mode (`rayleighFitModes`). */
  dampingRatio: number
  /** Integration step, s. Absent = the record's own Δt. */
  dt?: number
  /** Newmark γ, default 1/2. */
  gamma?: number
  /** Newmark β, default 1/4 (average acceleration). */
  beta?: number
}

/** The LTH block with defaults: El Centro NS at 1.0, ζ = 5 %. */
export function lthSettingsOf(def: { lth?: SeismicLthSettings }): SeismicLthSettings {
  const raw = def.lth
  if (!raw) return { recordId: "elcentro-ns", scale: 1, dampingRatio: 0.05 }
  const positive = (v: unknown): v is number =>
    typeof v === "number" && Number.isFinite(v) && v > 0
  return {
    recordId: raw.recordId || "elcentro-ns",
    scale: Number.isFinite(raw.scale) ? raw.scale : 1,
    ...(raw.unit === "g" || raw.unit === "m/s2" ? { unit: raw.unit } : {}),
    // Zero damping is a value (an undamped run), not a missing field.
    dampingRatio:
      Number.isFinite(raw.dampingRatio) && raw.dampingRatio >= 0 ? raw.dampingRatio : 0.05,
    ...(positive(raw.dt) ? { dt: raw.dt } : {}),
    ...(positive(raw.gamma) ? { gamma: raw.gamma } : {}),
    ...(positive(raw.beta) ? { beta: raw.beta } : {}),
  }
}

export interface SeismicDefinition {
  analysis: SeismicAnalysisKind
  code: SeismicCode
  Ss: number
  S1: number
  /** Long-period transition period, seconds. */
  TL: number
  siteClass: SiteClass
  riskCategory: RiskCategory
  /** Response modification coefficient, Table 12.2-1. */
  R: number
  /** Overstrength factor. Carried for the load combinations, not for Cs. */
  omega0: number
  /** Deflection amplification factor. */
  Cd: number
  /** Importance factor. Table 1.5-2 gives it from the risk category. */
  Ie: number
  system: StructuralSystem
  periodMode: PeriodMode
  /** Used when `periodMode` is "user". */
  userT?: number
  /**
   * Modal damping ratio ζ for the CQC correlation coefficients. MRS only.
   * At ζ = 0 CQC reduces exactly to SRSS.
   */
  damping: number
  /**
   * A site coefficient the user supplies where the active code refuses to
   * publish one. Ignored wherever the code DOES publish a number (see
   * `siteCoefficients`).
   */
  FaOverride?: number
  FvOverride?: number
  /** Time-history settings; absent reads as `lthSettingsOf`'s defaults. */
  lth?: SeismicLthSettings
}

export function defaultSeismicDefinition(): SeismicDefinition {
  return {
    analysis: "elf",
    code: "SNI1726-2019",
    Ss: 1.0,
    S1: 0.4,
    TL: 8,
    siteClass: "D",
    riskCategory: "II",
    R: 8,
    omega0: 3,
    Cd: 5.5,
    Ie: 1,
    system: "concrete-moment",
    periodMode: "computed",
    damping: 0.05,
  }
}

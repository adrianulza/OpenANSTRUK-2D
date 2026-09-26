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
 *  - **Time history.** Out of scope for this release.
 *
 * ⚠ ABSENT MEANS "MANUAL". A Seismic case without a `seismic` block behaves as
 * it always has: its loads are the ones the user placed. Every document and
 * template written before this feature therefore analyses exactly as before.
 */

import type { SeismicCode, SiteClass } from "./site"
import type { PeriodMode, StructuralSystem } from "./period"
import type { RiskCategory } from "./sdc"

/** Static equivalent (ELF, §12.8) or modal response spectrum (MRS, §12.9.1). */
export type SeismicAnalysisKind = "elf" | "mrs"

export const SEISMIC_ANALYSIS_LABELS: Record<SeismicAnalysisKind, string> = {
  elf: "Static equivalent (ELF)",
  mrs: "Response spectrum (MRS)",
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
   * Whether the frame has an irregularity Table 12.6-1 cares about (a soft or
   * weak storey, say). Not derivable from the model — a judgement, so asked.
   */
  irregular?: boolean
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

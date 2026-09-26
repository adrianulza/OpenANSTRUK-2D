/**
 * Seismic Design Category, and whether the ELF procedure may be used at all.
 * ASCE 7-16 §11.6 (Tables 11.6-1, 11.6-2) and §12.6 (Table 12.6-1).
 *
 * Pure: no React, no three, no model.
 *
 * The SDC is not an output of the analysis — it is a gate on what analysis is
 * permitted, what detailing applies, and what height limits bind. Computing the
 * base shear without reporting it answers a question the code asks second.
 */

export type SDC = "A" | "B" | "C" | "D" | "E" | "F"

export type RiskCategory = "I" | "II" | "III" | "IV"

export const RISK_CATEGORIES: readonly RiskCategory[] = ["I", "II", "III", "IV"]

export const RISK_CATEGORY_LABELS: Record<RiskCategory, string> = {
  I: "I — Low hazard to human life",
  II: "II — Ordinary buildings",
  III: "III — Substantial hazard",
  IV: "IV — Essential facilities",
}

/** Table 1.5-2 — the importance factor that goes with a risk category. */
export const IMPORTANCE_FACTOR: Record<RiskCategory, number> = {
  I: 1.0,
  II: 1.0,
  III: 1.25,
  IV: 1.5,
}

/** Table 11.6-1 — SDC from SDS. */
function sdcFromSDS(SDS: number, risk: RiskCategory): SDC {
  const severe = risk === "IV"
  if (SDS < 0.167) return "A"
  if (SDS < 0.33) return severe ? "C" : "B"
  if (SDS < 0.5) return severe ? "D" : "C"
  return "D"
}

/** Table 11.6-2 — SDC from SD1. */
function sdcFromSD1(SD1: number, risk: RiskCategory): SDC {
  const severe = risk === "IV"
  if (SD1 < 0.067) return "A"
  if (SD1 < 0.133) return severe ? "C" : "B"
  if (SD1 < 0.2) return severe ? "D" : "C"
  return "D"
}

const ORDER: SDC[] = ["A", "B", "C", "D", "E", "F"]

function worse(a: SDC, b: SDC): SDC {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b
}

export interface SDCInput {
  SDS: number
  SD1: number
  /** Mapped 1-second acceleration — the §11.6 near-fault override reads it. */
  S1: number
  riskCategory: RiskCategory
}

export interface SDCResult {
  sdc: SDC
  /** Table 11.6-1's answer on its own. */
  fromSDS: SDC
  /** Table 11.6-2's answer on its own. */
  fromSD1: SDC
  /** Which rule produced `sdc`. */
  source: "SDS" | "SD1" | "S1-override"
}

/**
 * The Seismic Design Category, §11.6.
 *
 * Both tables are consulted and the MORE SEVERE answer governs — a structure can
 * be Category B on short-period shaking and D on long-period, and the code takes
 * D. Both are reported, because "why is this D?" is the first question a user
 * asks.
 *
 * ⚠ Where S1 >= 0.75 the tables do not apply at all: §11.6 assigns E (or F for
 * Risk Category IV) outright. That override is a cliff, not a trend — 0.74 and
 * 0.75 give D and E — so it is checked before the tables, not blended with them.
 *
 * ⚠ NOT IMPLEMENTED: the §11.6 exception permitting SDC to be determined from
 * Table 11.6-1 alone when four conditions on the approximate period hold. Not
 * applying it is conservative — it can only make the category more severe.
 */
export function seismicDesignCategory({ SDS, SD1, S1, riskCategory }: SDCInput): SDCResult {
  const fromSDS = sdcFromSDS(SDS, riskCategory)
  const fromSD1 = sdcFromSD1(SD1, riskCategory)

  if (S1 >= 0.75) {
    return { sdc: riskCategory === "IV" ? "F" : "E", fromSDS, fromSD1, source: "S1-override" }
  }

  const sdc = worse(fromSDS, fromSD1)
  return { sdc, fromSDS, fromSD1, source: sdc === fromSDS ? "SDS" : "SD1" }
}

export interface ElfPermittedInput {
  sdc: SDC
  /** The design period, seconds. */
  T: number
  /** The spectrum's constant-acceleration corner, SD1/SDS. */
  Ts: number
  /**
   * Whether the structure has a horizontal or vertical irregularity of the kind
   * Table 12.6-1 names.
   *
   * ⚠ THIS CANNOT BE DERIVED FROM THE MODEL and the engine does not try. Torsional,
   * re-entrant-corner, diaphragm-discontinuity, out-of-plane-offset,
   * non-parallel-system, soft-storey, weight and geometric irregularities are
   * judgements about the structural system, not measurements of a stiffness
   * matrix. The caller supplies it, and the UI must say that it is an assumption.
   */
  irregular: boolean
}

export interface ElfPermittedResult {
  permitted: boolean
  /** Always populated — the reason it is allowed, or the reason it is not. */
  reason: string
  /** True whenever the verdict rests on the caller's irregularity declaration. */
  assumesRegularity: boolean
}

/**
 * Whether the equivalent lateral force procedure is permitted, Table 12.6-1.
 *
 * Permitted outright for SDC A, B and C. For D, E and F it is permitted for
 * structures shorter than 3.5·Ts in period, and for regular structures without
 * the listed irregularities.
 *
 * ⚠ Simplified deliberately. Table 12.6-1 also permits ELF for light-frame
 * construction and for Risk Category I/II buildings up to two storeys, and it
 * distinguishes horizontal irregularities 1a/1b/5 from vertical 1a/1b/2/3.
 * Refusing in those cases is CONSERVATIVE — it sends the user to a modal
 * analysis they are always allowed to run — so the simplification cannot make
 * the tool say yes where the code says no.
 */
export function elfPermitted({ sdc, T, Ts, irregular }: ElfPermittedInput): ElfPermittedResult {
  if (sdc === "A" || sdc === "B" || sdc === "C") {
    return {
      permitted: true,
      reason: `Permitted without restriction in Seismic Design Category ${sdc} (Table 12.6-1).`,
      assumesRegularity: false,
    }
  }

  const limit = 3.5 * Ts
  if (T >= limit) {
    return {
      permitted: false,
      reason: `T = ${T.toFixed(3)} s reaches 3.5·Ts = ${limit.toFixed(3)} s, so Table 12.6-1 `
        + `requires a modal response spectrum analysis in Category ${sdc}.`,
      assumesRegularity: false,
    }
  }
  if (irregular) {
    return {
      permitted: false,
      reason: `Table 12.6-1 does not permit the equivalent lateral force procedure for an `
        + `irregular structure in Category ${sdc}.`,
      assumesRegularity: false,
    }
  }
  return {
    permitted: true,
    reason: `Permitted: T = ${T.toFixed(3)} s is below 3.5·Ts = ${limit.toFixed(3)} s, assuming no `
      + `horizontal or vertical irregularity — which the code does not let this tool decide.`,
    assumesRegularity: true,
  }
}

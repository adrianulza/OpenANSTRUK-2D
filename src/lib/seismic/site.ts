/**
 * Site coefficients — ASCE 7-16 Tables 11.4-1/11.4-2 and SNI 1726:2019 Tabel 6/7.
 *
 * Pure: no React, no three, no model.
 *
 * The site class is the one input a user cannot derive from the structure, and
 * the one the whole ladder is most sensitive to: Fv at Site E is 2.8× Site C, so
 * a mis-set class moves the base shear further than any other single field.
 *
 * ⚠ THE TWO CODES CARRY THE SAME NUMBERS. SNI 1726:2019 adopts ASCE 7-16's site
 * tables verbatim — every published cell agrees, and `smoke_seismic_code` §1/§2
 * assert that rather than assuming it. What differs is which cells the code is
 * willing to ANSWER:
 *
 *   ASCE 7-16 replaced several high-intensity entries with "See Section
 *   11.4.8" — a requirement for a ground motion hazard analysis rather than a
 *   value. SNI kept the numbers and requires a site-specific procedure for SF
 *   alone.
 *
 * So the code axis is a REFUSAL POLICY, not a second set of arithmetic. That is
 * also why the user-supplied override exists: a coefficient can be typed in
 * exactly where the active code declines to publish one.
 *
 * ⚠ At the refused cells this module returns the last tabulated value AND names
 * them in `siteSpecific`, for two reasons: §11.4.8's own exception permits
 * proceeding once the requirement is known, and returning NaN would poison
 * every number downstream silently. A caller that ignores the flag is reporting
 * a value the code does not authorise — `siteSpecificNote` exists so the UI has
 * a sentence to show.
 *
 * ⚠ One numeric divergence follows from that fallback, and it is not a
 * disagreement between the codes: at Fa Site E, Ss ≥ 1.0, ASCE has no number at
 * all, so we hold 1.3 while SNI publishes 1.1 / 0.9 / 0.8. Do not "reconcile"
 * them — the ASCE column is a documented stand-in and every existing anchor was
 * measured against it.
 */

export type SiteClass = "A" | "B" | "C" | "D" | "E" | "F"

export const SITE_CLASSES: readonly SiteClass[] = ["A", "B", "C", "D", "E", "F"]

/**
 * Which edition the coefficients are read under.
 *
 * ⚠ Only these two. SNI 1726:2019 is an adoption of ASCE 7-16, so a third entry
 * is a real research task, not a string.
 */
export type SeismicCode = "ASCE7-16" | "SNI1726-2019"

export const SEISMIC_CODES: readonly SeismicCode[] = ["ASCE7-16", "SNI1726-2019"]

export const SEISMIC_CODE_LABELS: Record<SeismicCode, string> = {
  "ASCE7-16": "ASCE 7-16",
  "SNI1726-2019": "SNI 1726:2019",
}

/** The table number each code gives these tables — printed as a clause callout. */
export const SITE_TABLE_REF: Record<SeismicCode, { Fa: string; Fv: string }> = {
  "ASCE7-16": { Fa: "11.4-1", Fv: "11.4-2" },
  "SNI1726-2019": { Fa: "6", Fv: "7" },
}

/** Soil description, without the class letter — each code spells that its own way. */
export const SITE_CLASS_LABELS: Record<SiteClass, string> = {
  A: "Hard rock",
  B: "Rock",
  C: "Very dense soil / soft rock",
  D: "Stiff soil",
  E: "Soft clay soil",
  F: "Requires site response analysis",
}

/** `D` under ASCE 7-16, `SD` under SNI — the same class, named as its code names it. */
export function siteClassCode(code: SeismicCode, cls: SiteClass): string {
  return code === "SNI1726-2019" ? `S${cls}` : cls
}

export function siteClassLabel(code: SeismicCode, cls: SiteClass): string {
  return `${siteClassCode(code, cls)} — ${SITE_CLASS_LABELS[cls]}`
}

/** Which coefficient the active code demands a site-specific study for. */
export type SiteSpecificFlag = "Fa" | "Fv"

export interface SiteCoefficients {
  Fa: number
  Fv: number
  /** Empty when the tables answer outright. Non-empty is a requirement, not a hint. */
  siteSpecific: SiteSpecificFlag[]
  /** Coefficients taken from the user rather than the table. Always a subset of `siteSpecific`. */
  overridden: SiteSpecificFlag[]
}

export interface SiteOptions {
  /** Defaults to ASCE 7-16 — the only code this module spoke before the axis existed. */
  code?: SeismicCode
  /** Used only where the active code refuses to publish Fa. */
  FaOverride?: number
  /** Used only where the active code refuses to publish Fv. */
  FvOverride?: number
}

/** Table column headers. Values between them interpolate; outside them clamp. */
const SS_ANCHORS = [0.25, 0.5, 0.75, 1.0, 1.25, 1.5]
const S1_ANCHORS = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6]

type TabulatedClass = Exclude<SiteClass, "F">

/** Fa rows both codes publish identically. */
const FA_SHARED = {
  A: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  B: [0.9, 0.9, 0.9, 0.9, 0.9, 0.9],
  C: [1.3, 1.3, 1.2, 1.2, 1.2, 1.2],
  D: [1.6, 1.4, 1.2, 1.1, 1.0, 1.0],
} as const

/** ⚠ The last three cells read "See Section 11.4.8". Held at the last real value. */
const FA_E_ASCE = [2.4, 1.7, 1.3, 1.3, 1.3, 1.3]
/**
 * SNI Tabel 6 publishes what ASCE withholds.
 *
 * ⚠ @unverified beyond a secondary source: transcribed from a journal paper
 * reproducing Tabel 6, not from the standard itself. The first three cells
 * agree with ASCE, which is the check available; the last three are the only
 * numbers in this module with no independent corroboration.
 */
const FA_E_SNI = [2.4, 1.7, 1.3, 1.1, 0.9, 0.8]

/**
 * Fv — IDENTICAL in both codes at every class and anchor.
 *
 * ⚠ ASCE marks D at S1 ≥ 0.2 and E at S1 ≥ 0.1 "See Section 11.4.8"; the values
 * kept here are the last edition that tabulated them, and they turn out to be
 * exactly what SNI Tabel 7 publishes. One table, two refusal policies.
 */
const FV_SHARED: Record<TabulatedClass, number[]> = {
  A: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  B: [0.8, 0.8, 0.8, 0.8, 0.8, 0.8],
  C: [1.5, 1.5, 1.5, 1.5, 1.5, 1.4],
  D: [2.4, 2.2, 2.0, 1.9, 1.8, 1.7],
  E: [4.2, 3.3, 2.8, 2.4, 2.2, 2.0],
}

function faTable(code: SeismicCode): Record<TabulatedClass, number[]> {
  return {
    A: [...FA_SHARED.A],
    B: [...FA_SHARED.B],
    C: [...FA_SHARED.C],
    D: [...FA_SHARED.D],
    E: [...(code === "SNI1726-2019" ? FA_E_SNI : FA_E_ASCE)],
  }
}

/**
 * Linear interpolation across a table row, CLAMPED at both ends.
 *
 * Clamping rather than extrapolating is deliberate: the tables stop where the
 * data stops, and a linear run-out below Ss = 0.25 would keep raising Fa past
 * any intensity the code ever measured.
 */
function interpolate(anchors: number[], values: number[], x: number): number {
  if (!Number.isFinite(x) || x <= anchors[0]) return values[0]
  const last = anchors.length - 1
  if (x >= anchors[last]) return values[last]
  for (let i = 0; i < last; i++) {
    const a = anchors[i]
    const b = anchors[i + 1]
    if (x <= b) {
      const t = (x - a) / (b - a)
      return values[i] + t * (values[i + 1] - values[i])
    }
  }
  return values[last]
}

/**
 * Which coefficients the active code declines to publish here.
 *
 * ⚠ SNI refuses for SF AND NOTHING ELSE — Tabel 6 and Tabel 7 print `SS`
 * against SF alone and real numbers against every other row. Giving SNI ASCE's
 * policy would make the code selector cosmetic, which is the one way this
 * feature can be wrong and still look right.
 */
function refusals(
  code: SeismicCode,
  siteClass: SiteClass,
  Ss: number,
  S1: number,
): SiteSpecificFlag[] {
  // §20.3.1 / SNI Tabel 6 note (a) — no row of its own in either code.
  if (siteClass === "F") return ["Fa", "Fv"]
  if (code === "SNI1726-2019") return []

  const out: SiteSpecificFlag[] = []
  if (siteClass === "E" && Ss >= 1.0) out.push("Fa")
  if ((siteClass === "D" && S1 >= 0.2) || (siteClass === "E" && S1 >= 0.1)) out.push("Fv")
  return out
}

/** A user-supplied coefficient, or null when it may not be used. */
function override(
  flags: SiteSpecificFlag[],
  which: SiteSpecificFlag,
  value: number | undefined,
): number | null {
  // ⚠ Only where the code refuses. A stale override left on a definition must
  // not outrank a table that has since started answering — say, after the site
  // class moves from D to C.
  if (!flags.includes(which)) return null
  if (value === undefined || !Number.isFinite(value) || value <= 0) return null
  return value
}

/**
 * Fa and Fv for a site class and the mapped accelerations.
 *
 * Site Class F has no tabulated row at all — both codes require a site-specific
 * study. Site E's values are returned so the rest of the ladder can run, and
 * BOTH coefficients are flagged.
 *
 * ⚠ The code arrives in an OPTIONS OBJECT, not as a fourth positional argument
 * and certainly not as a first. `smoke_seismic_elf` is a 509-assertion anchor
 * making ~15 three-argument calls, and an unqualified call must keep meaning
 * ASCE 7-16 — which is also the right migration for a document saved before
 * this module knew about codes.
 */
export function siteCoefficients(
  siteClass: SiteClass,
  Ss: number,
  S1: number,
  opts: SiteOptions = {},
): SiteCoefficients {
  const code = opts.code ?? "ASCE7-16"
  const row: TabulatedClass = siteClass === "F" ? "E" : siteClass
  let Fa = interpolate(SS_ANCHORS, faTable(code)[row], Ss)
  let Fv = interpolate(S1_ANCHORS, FV_SHARED[row], S1)

  const siteSpecific = refusals(code, siteClass, Ss, S1)
  const overridden: SiteSpecificFlag[] = []

  const fa = override(siteSpecific, "Fa", opts.FaOverride)
  if (fa !== null) {
    Fa = fa
    overridden.push("Fa")
  }
  const fv = override(siteSpecific, "Fv", opts.FvOverride)
  if (fv !== null) {
    Fv = fv
    overridden.push("Fv")
  }

  return { Fa, Fv, siteSpecific, overridden }
}

/** A sentence naming the requirement, or null when the tables answer outright. */
export function siteSpecificNote(
  r: SiteCoefficients,
  siteClass: SiteClass,
  code: SeismicCode = "ASCE7-16",
): string | null {
  if (r.siteSpecific.length === 0) return null

  if (siteClass === "F") {
    // ⚠ SNI's sentence cites the TABLE MARKER, not a clause number. The marker
    // is what the sources reproduce; a pasal number would be invented.
    return code === "SNI1726-2019"
      ? "SNI 1726:2019 marks Site Class SF as SS — situs spesifik — in Tabel 6 and Tabel 7, "
        + "so it requires a site-specific ground motion procedure. The values shown are "
        + "Site Class SE and are not a code-compliant substitute."
      : "Site Class F requires a site response analysis (§20.3.1). The values shown are "
        + "Site Class E and are not a code-compliant substitute."
  }

  const which = r.siteSpecific.join(" and ")
  const supplied = r.overridden.length > 0
    ? ` ${r.overridden.join(" and ")} is the value you supplied.`
    : ""
  return `§11.4.8 requires a ground motion hazard analysis for ${which} `
    + `at Site Class ${siteClass} and this intensity.${supplied}`
}

// ── The table itself, for the clause callout ─────────────────────────────────

/** One cell: a number the code publishes, or a refusal it prints instead. */
export type SiteTableCell = number | "refused"

export interface SiteTableRow {
  cls: SiteClass
  cells: SiteTableCell[]
}

export interface SiteTableView {
  /** "ASCE 7-16 · Table 11.4-2 — Fv" */
  title: string
  /** The column headers, in order. */
  anchors: number[]
  rows: SiteTableRow[]
  /** What a refused cell prints — "§11.4.8" or "SS". */
  refusalLabel: string
  /** Site F's sentence, which no cell can carry. */
  footnote: string
}

/**
 * The whole table as data, so the popover renders and derives nothing.
 *
 * ⚠ A cell is `"refused"` exactly where `siteCoefficients` flags that
 * coefficient — both go through `refusals`. Deriving the marks in the component
 * instead would let the table show a number the engine declines to use, and
 * `smoke_seismic_code` §5 sweeps every cell of both tables in both codes to
 * pin it.
 */
export function siteTable(code: SeismicCode, which: SiteSpecificFlag): SiteTableView {
  const anchors = which === "Fa" ? [...SS_ANCHORS] : [...S1_ANCHORS]
  const table = which === "Fa" ? faTable(code) : FV_SHARED
  const ref = SITE_TABLE_REF[code][which]
  const isSNI = code === "SNI1726-2019"

  const rows: SiteTableRow[] = SITE_CLASSES.map((cls) => {
    const row: TabulatedClass = cls === "F" ? "E" : cls
    const cells = anchors.map((a, i): SiteTableCell => {
      const flags = which === "Fa"
        ? refusals(code, cls, a, 0)
        : refusals(code, cls, 0, a)
      return flags.includes(which) ? "refused" : table[row][i]
    })
    return { cls, cells }
  })

  return {
    title: `${SEISMIC_CODE_LABELS[code]} · ${isSNI ? "Tabel" : "Table"} ${ref} — ${which}`,
    anchors,
    rows,
    refusalLabel: isSNI ? "SS" : "§11.4.8",
    footnote: isSNI
      ? "SS — situs spesifik: a site-specific ground motion procedure is required."
      : "§11.4.8 — a ground motion hazard analysis is required for these cells.",
  }
}

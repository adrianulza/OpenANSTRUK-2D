// Type-only, so this stays a compile-time reference and creates no runtime
// cycle (model.ts imports LoadCaseId from here).
import type { StructureModel } from "./model"

export type LoadCaseId = string
export type LoadComboId = string

export type LoadCaseKind = "Dead" | "Live" | "Roof Live" | "Wind" | "Seismic" | "Rain" | "Snow"

export const LOAD_CASE_KINDS: LoadCaseKind[] = [
  "Dead",
  "Live",
  "Roof Live",
  "Wind",
  "Seismic",
  "Rain",
  "Snow",
]

export type CodePreset =
  | "ASCE7-22"
  | "AS-NZS1170-2002"
  | "BSL-AIJ-ASD"
  | "EN1990-2002"
  | "GB50068-2018"
  | "SNI 1726:2019"

export const CODE_PRESETS: { id: CodePreset; label: string }[] = [
  { id: "ASCE7-22", label: "ASCE 7-22 LRFD (USA)" },
  { id: "AS-NZS1170-2002", label: "AS/NZS 1170.0:2002 (Australia/NZ)" },
  { id: "BSL-AIJ-ASD", label: "BSL/AIJ ASD (Japan)" },
  { id: "EN1990-2002", label: "EN 1990:2002+A1 (Europe)" },
  { id: "GB50068-2018", label: "GB 50068-2018 (China)" },
  { id: "SNI 1726:2019", label: "SNI 1726:2019 (Indonesia)" },
]

export interface LoadCase {
  id: LoadCaseId
  name: string
  kind: LoadCaseKind
  /**
   * Whether this case contributes to analysis.
   *  - For regular cases: false = case is muted (its loads are skipped by the solver
   *    and the case is hidden from the analyze-view dropdown).
   *  - For the locked Selfweight case (v1.0.4+): false = no body force is added
   *    (default); true = solveCase("selfweight") synthesizes γ·A loads per member.
   */
  enabled: boolean
  locked?: boolean
}

export interface LoadComboTerm {
  factor: number
  caseId: LoadCaseId
}

export interface LoadCombination {
  id: LoadComboId
  name: string
  terms: LoadComboTerm[]
  source: "preset" | "custom"
  presetCode?: CodePreset
  enabled: boolean
}

export function DEFAULT_LOAD_CASES(): Record<LoadCaseId, LoadCase> {
  return {
    selfweight: {
      id: "selfweight",
      name: "Selfweight",
      kind: "Dead",
      locked: true,
      enabled: true,
    },
    // Default placement target — acts as SIDL when Selfweight is off.
    dead: {
      id: "dead",
      name: "Dead",
      kind: "Dead",
      enabled: true,
    },
  }
}

// Default combination present on a fresh document: 1.0·Selfweight + 1.0·Dead.
// Explicit Selfweight term (rather than relying on kind-matching) so the
// expression reads as the user expects in the combination list.
export function DEFAULT_COMBINATIONS(): Record<LoadComboId, LoadCombination> {
  const id = "cmb-default"
  return {
    [id]: {
      id,
      name: "1.0·SW + 1.0·D",
      terms: [
        { factor: 1, caseId: "selfweight" },
        { factor: 1, caseId: "dead" },
      ],
      source: "custom",
      enabled: true,
    },
  }
}

/**
 * A load referencing a case that is not in the case set contributes NOTHING to
 * analysis. `solveCase` slices by `load.loadCaseId === caseId` over the cases
 * that exist, so an unmatched load is never assembled — while still drawing on
 * the canvas, since the default view filter shows every load. Visible input,
 * silently absent from the results.
 *
 * That happens because the saved file carries `model` alone: load cases live in
 * App state and are not serialized. Within one session the case set survives a
 * file load, so the references resolve by luck; open the same file in a fresh
 * session and every custom case is gone.
 *
 * Two kinds of orphan, and they deserve different answers:
 *
 *  - **No case id at all** — a file predating load cases, when there was exactly
 *    one implicit case. Adopting those loads into the default case is safe,
 *    because that is precisely what they meant.
 *
 *  - **An id naming a case the file did not carry.** The original `kind` is
 *    unknowable, and guessing it is worse than not analysing: calling a Live
 *    case Dead applies 1.2 where the code wants 1.6 and returns a plausible
 *    wrong number. So the case is recreated **disabled**, under a name that
 *    says what it is. The loads stay out of the results — as they already were
 *    — but the reason is now on screen and one click from being fixed.
 *
 * Pure: returns new objects and never mutates its arguments.
 */
export interface LoadCaseReconciliation {
  /** Input model, or a copy with adopted loads rewritten to `fallbackId`. */
  model: StructureModel
  cases: Record<LoadCaseId, LoadCase>
  /** Ids referenced by loads but missing from `cases` — recreated, disabled. */
  recovered: LoadCaseId[]
  /** How many loads carried no case id and were adopted into `fallbackId`. */
  adopted: number
}

export function reconcileLoadCases(
  model: StructureModel,
  cases: Record<LoadCaseId, LoadCase>,
  fallbackId: LoadCaseId = "dead",
): LoadCaseReconciliation {
  const nextCases = { ...cases }
  const recovered: LoadCaseId[] = []
  const loads = { ...model.loads }
  let adopted = 0
  let rewrote = false

  for (const [id, load] of Object.entries(model.loads)) {
    let caseId = load.loadCaseId
    if (!caseId) {
      caseId = fallbackId
      loads[id] = { ...load, loadCaseId: caseId }
      adopted += 1
      rewrote = true
    }
    // Falls through for an adopted load too, so a missing fallback case is
    // itself recovered rather than silently re-orphaning everything.
    if (nextCases[caseId] || recovered.includes(caseId)) continue
    recovered.push(caseId)
    nextCases[caseId] = {
      id: caseId,
      name: `Recovered (${caseId})`,
      kind: "Dead",
      enabled: false,
    }
  }

  return {
    model: rewrote ? { ...model, loads } : model,
    cases: nextCases,
    recovered,
    adopted,
  }
}

let loadCaseSeq = 0
let loadComboSeq = 0

export function newLoadCaseId(): LoadCaseId {
  loadCaseSeq += 1
  return `lc${loadCaseSeq}`
}

export function newLoadComboId(): LoadComboId {
  loadComboSeq += 1
  return `cmb${loadComboSeq}`
}

const KIND_SHORT: Record<LoadCaseKind, string> = {
  Dead: "D",
  Live: "L",
  "Roof Live": "Lr",
  Wind: "W",
  Seismic: "E",
  Rain: "R",
  Snow: "S",
}

export function caseShortLabel(kind: LoadCaseKind): string {
  return KIND_SHORT[kind]
}

// Conventional engineering priority — used by the canvas coincidence renderer
// to pick which load's arrow geometry is drawn when multiple cases share the
// same node/member (e.g., Dead + Live point loads on one node → Dead wins the
// arrow direction, label reads `[D, L]`). Lower index = higher priority.
const KIND_PRIORITY: LoadCaseKind[] = [
  "Dead",
  "Live",
  "Roof Live",
  "Wind",
  "Seismic",
  "Snow",
  "Rain",
]

export function kindPriorityIndex(kind: LoadCaseKind): number {
  const i = KIND_PRIORITY.indexOf(kind)
  return i < 0 ? KIND_PRIORITY.length : i
}

export function compareKindPriority(a: LoadCaseKind, b: LoadCaseKind): number {
  return kindPriorityIndex(a) - kindPriorityIndex(b)
}

function formatFactor(n: number): string {
  if (Number.isInteger(n)) return n.toFixed(1)
  return Number(n.toFixed(3)).toString()
}

// Short label used inside combo expressions: "SW" for Selfweight, otherwise the
// kind abbreviation (D, L, Lr, W, E, R). Keeps expressions compact and aligned
// with the abbreviation pill shown in the Load Case tool.
function caseExpressionLabel(c: LoadCase): string {
  if (c.id === "selfweight") return "SW"
  return caseShortLabel(c.kind)
}

// Render terms as "1.2·D + 1.6·L − 1.0·W".
export function formatComboExpression(
  combo: LoadCombination,
  cases: Record<LoadCaseId, LoadCase>
): string {
  if (combo.terms.length === 0) return "(empty)"
  const parts: string[] = []
  combo.terms.forEach((term, i) => {
    const c = cases[term.caseId]
    const label = c ? caseExpressionLabel(c) : term.caseId
    const abs = Math.abs(term.factor)
    if (i === 0) {
      const sign = term.factor < 0 ? "−" : ""
      parts.push(`${sign}${formatFactor(abs)}·${label}`)
    } else {
      const sign = term.factor < 0 ? "−" : "+"
      parts.push(`${sign} ${formatFactor(abs)}·${label}`)
    }
  })
  return parts.join(" ")
}

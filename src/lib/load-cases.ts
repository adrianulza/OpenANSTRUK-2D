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
      enabled: false,
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

export type LoadCaseId = string
export type LoadComboId = string

export type LoadCaseKind = "Dead" | "Live" | "Roof Live" | "Wind" | "Seismic" | "Rain"

export const LOAD_CASE_KINDS: LoadCaseKind[] = [
  "Dead",
  "Live",
  "Roof Live",
  "Wind",
  "Seismic",
  "Rain",
]

export type CodePreset = "ASCE7-16" | "SNI1726-2019" | "ASCE7-22"

export const CODE_PRESETS: { id: CodePreset; label: string }[] = [
  { id: "SNI1726-2019", label: "SNI 1726-2019" },
  { id: "ASCE7-22", label: "ASCE 7-22 LRFD" },
]

export interface LoadCase {
  id: LoadCaseId
  name: string
  kind: LoadCaseKind
  color: string
  locked?: boolean
  includeSelfWeight?: boolean
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

// Palette for new cases — cycles after the seeded defaults.
export const CASE_COLOR_PALETTE = [
  "#6b7280", // gray (Selfweight)
  "#ef4444", // red (Dead)
  "#3b82f6", // blue (Live)
  "#f59e0b", // amber
  "#10b981", // emerald
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
]

export function DEFAULT_LOAD_CASES(): Record<LoadCaseId, LoadCase> {
  return {
    selfweight: {
      id: "selfweight",
      name: "Selfweight",
      kind: "Dead",
      color: CASE_COLOR_PALETTE[0],
      locked: true,
      includeSelfWeight: false,
    },
    dead: {
      id: "dead",
      name: "Dead",
      kind: "Dead",
      color: CASE_COLOR_PALETTE[1],
    },
    live: {
      id: "live",
      name: "Live",
      kind: "Live",
      color: CASE_COLOR_PALETTE[2],
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

export function nextPaletteColor(existing: number): string {
  return CASE_COLOR_PALETTE[existing % CASE_COLOR_PALETTE.length]
}

const KIND_SHORT: Record<LoadCaseKind, string> = {
  Dead: "D",
  Live: "L",
  "Roof Live": "Lr",
  Wind: "W",
  Seismic: "E",
  Rain: "R",
}

export function caseShortLabel(kind: LoadCaseKind): string {
  return KIND_SHORT[kind]
}

function formatFactor(n: number): string {
  if (Number.isInteger(n)) return n.toFixed(1)
  return Number(n.toFixed(3)).toString()
}

// Render terms as "1.2·Dead + 1.6·Live − 1.0·Wind".
export function formatComboExpression(
  combo: LoadCombination,
  cases: Record<LoadCaseId, LoadCase>
): string {
  if (combo.terms.length === 0) return "(empty)"
  const parts: string[] = []
  combo.terms.forEach((term, i) => {
    const c = cases[term.caseId]
    const label = c ? c.name : term.caseId
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

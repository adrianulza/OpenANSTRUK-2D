import {
  type LoadCase,
  type LoadCaseId,
  type LoadCaseKind,
  type LoadCombination,
  type LoadComboTerm,
  type CodePreset,
  newLoadComboId,
} from "./load-cases"

interface PresetCombo {
  name: string
  terms: { factor: number; kind: LoadCaseKind }[]
  // If true, generate a second combo with the wind/seismic term negated.
  permuteWindSign?: boolean
  permuteSeismicSign?: boolean
}

// ASCE 7-16 § 2.3.2 basic LRFD strength combinations.
// Snow (S) is intentionally omitted (tracks SNI 1726-2019 and project scope).
const ASCE_7_16: PresetCombo[] = [
  { name: "1.4D", terms: [{ factor: 1.4, kind: "Dead" }] },
  {
    name: "1.2D + 1.6L + 0.5Lr",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.6, kind: "Live" },
      { factor: 0.5, kind: "Roof Live" },
    ],
  },
  {
    name: "1.2D + 1.6Lr + L",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.6, kind: "Roof Live" },
      { factor: 1.0, kind: "Live" },
    ],
  },
  {
    name: "1.2D + 1.6Lr + 0.5W",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.6, kind: "Roof Live" },
      { factor: 0.5, kind: "Wind" },
    ],
    permuteWindSign: true,
  },
  {
    name: "1.2D + 1.0W + L + 0.5Lr",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.0, kind: "Wind" },
      { factor: 1.0, kind: "Live" },
      { factor: 0.5, kind: "Roof Live" },
    ],
    permuteWindSign: true,
  },
  {
    name: "1.2D + 1.0E + L",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.0, kind: "Seismic" },
      { factor: 1.0, kind: "Live" },
    ],
    permuteSeismicSign: true,
  },
  {
    name: "0.9D + 1.0W",
    terms: [
      { factor: 0.9, kind: "Dead" },
      { factor: 1.0, kind: "Wind" },
    ],
    permuteWindSign: true,
  },
  {
    name: "0.9D + 1.0E",
    terms: [
      { factor: 0.9, kind: "Dead" },
      { factor: 1.0, kind: "Seismic" },
    ],
    permuteSeismicSign: true,
  },
]

// SNI 1726-2019 — essentially the same LRFD set, no snow.
const SNI_1726_2019: PresetCombo[] = ASCE_7_16

// ASCE 7-22 — same § 2.3.2 LRFD strength combos for this scope.
const ASCE_7_22: PresetCombo[] = ASCE_7_16

const PRESET_DEFS: Record<CodePreset, PresetCombo[]> = {
  "ASCE7-16": ASCE_7_16,
  "SNI1726-2019": SNI_1726_2019,
  "ASCE7-22": ASCE_7_22,
}

// Distinct case kinds referenced by this preset's combinations.
export function requiredKindsForPreset(preset: CodePreset): LoadCaseKind[] {
  const defs = PRESET_DEFS[preset]
  const seen = new Set<LoadCaseKind>()
  for (const def of defs) {
    for (const t of def.terms) seen.add(t.kind)
  }
  return Array.from(seen)
}

// Count of combinations the preset will produce given the available cases
// (accounts for ±W / ±E permutations only when the case actually exists).
export function expectedComboCount(
  preset: CodePreset,
  cases: Record<LoadCaseId, LoadCase>
): number {
  const defs = PRESET_DEFS[preset]
  const hasWind = Object.values(cases).some((c) => c.kind === "Wind")
  const hasSeismic = Object.values(cases).some((c) => c.kind === "Seismic")
  let n = 0
  for (const def of defs) {
    // Skip combos whose required kinds aren't all present.
    const ok = def.terms.every((t) =>
      Object.values(cases).some((c) => c.kind === t.kind)
    )
    if (!ok) continue
    n += 1
    if (def.permuteWindSign && hasWind) n += 1
    if (def.permuteSeismicSign && hasSeismic) n += 1
  }
  return n
}

function findCasesByKind(
  cases: Record<LoadCaseId, LoadCase>,
  kind: LoadCaseKind
): LoadCaseId[] {
  return Object.values(cases)
    .filter((c) => c.kind === kind)
    .map((c) => c.id)
}

// Render a name string with sign substitution: replace the first W/E with ±.
function flippedName(name: string, which: "wind" | "seismic"): string {
  const token = which === "wind" ? "W" : "E"
  // Pattern: "+ <factor>X" → "− <factor>X"; only flip the first occurrence
  // of "+ 1.0W"/"+ 0.5W"/"+ 1.0E" style.
  const re = new RegExp(`\\+ (\\d*\\.?\\d+)${token}`)
  return name.replace(re, `− $1${token}`)
}

function buildTerms(
  combo: PresetCombo,
  cases: Record<LoadCaseId, LoadCase>,
  signFlip?: { which: "wind" | "seismic" }
): LoadComboTerm[] | null {
  const terms: LoadComboTerm[] = []
  for (const t of combo.terms) {
    const ids = findCasesByKind(cases, t.kind)
    if (ids.length === 0) {
      // No case of this kind exists — skip the entire combo.
      return null
    }
    // For each matching case of this kind, contribute a term.
    // Most projects will have one case per kind; if multiple, we sum them.
    for (const id of ids) {
      let factor = t.factor
      if (signFlip) {
        const flipThis =
          (signFlip.which === "wind" && t.kind === "Wind") ||
          (signFlip.which === "seismic" && t.kind === "Seismic")
        if (flipThis) factor = -factor
      }
      terms.push({ factor, caseId: id })
    }
  }
  return terms
}

export function generateCodeCombinations(
  preset: CodePreset,
  cases: Record<LoadCaseId, LoadCase>
): LoadCombination[] {
  const defs = PRESET_DEFS[preset]
  const result: LoadCombination[] = []
  for (const def of defs) {
    const baseTerms = buildTerms(def, cases)
    if (!baseTerms) continue
    result.push({
      id: newLoadComboId(),
      name: def.name,
      terms: baseTerms,
      source: "preset",
      presetCode: preset,
      enabled: true,
    })
    if (def.permuteWindSign && findCasesByKind(cases, "Wind").length > 0) {
      const terms = buildTerms(def, cases, { which: "wind" })
      if (terms) {
        result.push({
          id: newLoadComboId(),
          name: flippedName(def.name, "wind"),
          terms,
          source: "preset",
          presetCode: preset,
          enabled: true,
        })
      }
    }
    if (def.permuteSeismicSign && findCasesByKind(cases, "Seismic").length > 0) {
      const terms = buildTerms(def, cases, { which: "seismic" })
      if (terms) {
        result.push({
          id: newLoadComboId(),
          name: flippedName(def.name, "seismic"),
          terms,
          source: "preset",
          presetCode: preset,
          enabled: true,
        })
      }
    }
  }
  return result
}

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

// ASCE 7-22 § 2.3.2 basic LRFD strength combinations. SNI 1726-2019 uses the same set.
// Snow (S) is intentionally omitted (tracks SNI 1726-2019 and project scope).
const ASCE_7_22: PresetCombo[] = [
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
const SNI_1726_2019: PresetCombo[] = ASCE_7_22

// EN 1990:2002+A1, Eq. 6.10 (simple set). Each variable action becomes its own
// "leading" combo. ψ₀ secondary terms are intentionally omitted per project
// scope — engineers wanting the full 6.10a/b refined set or ψ₀ combinations
// can build them manually. Seismic uses EN 1998-1 § 3.2.4 with γ_G = γ_E = 1.0
// (representative-value ψ₂ on Q also omitted).
const EN_1990_2002: PresetCombo[] = [
  { name: "1.35G", terms: [{ factor: 1.35, kind: "Dead" }] },
  {
    name: "1.35G + 1.5L",
    terms: [
      { factor: 1.35, kind: "Dead" },
      { factor: 1.5, kind: "Live" },
    ],
  },
  {
    name: "1.35G + 1.5W",
    terms: [
      { factor: 1.35, kind: "Dead" },
      { factor: 1.5, kind: "Wind" },
    ],
    permuteWindSign: true,
  },
  {
    name: "1.35G + 1.5S",
    terms: [
      { factor: 1.35, kind: "Dead" },
      { factor: 1.5, kind: "Snow" },
    ],
  },
  {
    name: "1.0G + 1.0E",
    terms: [
      { factor: 1.0, kind: "Dead" },
      { factor: 1.0, kind: "Seismic" },
    ],
    permuteSeismicSign: true,
  },
]

// GB 50068-2018 (post-2018 reform: γ_G = 1.3 unfavourable, γ_Q = 1.5). Seismic
// per GB 50011 carries γ_E = 1.4 plus the distinctive 0.5·L representative-value
// term (the variable load is reduced because it's unlikely to be at full value
// during an earthquake). 1.0G ± 1.4E is the seismic-uplift case (γ_G favourable).
const GB_50068_2018: PresetCombo[] = [
  {
    name: "1.3G + 1.5L",
    terms: [
      { factor: 1.3, kind: "Dead" },
      { factor: 1.5, kind: "Live" },
    ],
  },
  {
    name: "1.3G + 1.5W",
    terms: [
      { factor: 1.3, kind: "Dead" },
      { factor: 1.5, kind: "Wind" },
    ],
    permuteWindSign: true,
  },
  {
    name: "1.3G + 1.5S",
    terms: [
      { factor: 1.3, kind: "Dead" },
      { factor: 1.5, kind: "Snow" },
    ],
  },
  {
    name: "1.3G + 1.4E + 0.5L",
    terms: [
      { factor: 1.3, kind: "Dead" },
      { factor: 1.4, kind: "Seismic" },
      { factor: 0.5, kind: "Live" },
    ],
    permuteSeismicSign: true,
  },
  {
    name: "1.0G + 1.4E",
    terms: [
      { factor: 1.0, kind: "Dead" },
      { factor: 1.4, kind: "Seismic" },
    ],
    permuteSeismicSign: true,
  },
]

// AS/NZS 1170.0:2002 § 4.2.2. Permanent factor 1.2 (unfavourable) / 0.9 (uplift
// favourable). Wind action W_u is already ULS, so the combo factor is 1.0.
// Snow likewise. Seismic is checked against earthquake action E_u with γ = 1.0.
const AS_NZS_1170_0: PresetCombo[] = [
  { name: "1.35G", terms: [{ factor: 1.35, kind: "Dead" }] },
  {
    name: "1.2G + 1.5L",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.5, kind: "Live" },
    ],
  },
  {
    name: "1.2G + 1.0W",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.0, kind: "Wind" },
    ],
    permuteWindSign: true,
  },
  {
    name: "1.2G + 1.0S",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.0, kind: "Snow" },
    ],
  },
  {
    name: "1.2G + 1.0E",
    terms: [
      { factor: 1.2, kind: "Dead" },
      { factor: 1.0, kind: "Seismic" },
    ],
    permuteSeismicSign: true,
  },
  {
    name: "0.9G + 1.0W",
    terms: [
      { factor: 0.9, kind: "Dead" },
      { factor: 1.0, kind: "Wind" },
    ],
    permuteWindSign: true,
  },
  {
    name: "0.9G + 1.0E",
    terms: [
      { factor: 0.9, kind: "Dead" },
      { factor: 1.0, kind: "Seismic" },
    ],
    permuteSeismicSign: true,
  },
]

// Japan — Building Standard Law + AIJ Recommendations. This is allowable
// stress design, NOT LRFD: all factors are 1.0 and material-side reductions
// (σ_allow) handle safety. Long-term (常時) covers sustained loads; short-term
// (短期) covers transient actions (wind, snow, seismic). Listed here as a
// learning aid so students can envelope the simultaneous-action set; the
// preset label "BSL/AIJ (ASD)" flags the design philosophy in the UI.
const BSL_AIJ_ASD: PresetCombo[] = [
  {
    name: "1.0G + 1.0L  (long-term)",
    terms: [
      { factor: 1.0, kind: "Dead" },
      { factor: 1.0, kind: "Live" },
    ],
  },
  {
    name: "1.0G + 1.0L + 1.0S  (short-term, snow)",
    terms: [
      { factor: 1.0, kind: "Dead" },
      { factor: 1.0, kind: "Live" },
      { factor: 1.0, kind: "Snow" },
    ],
  },
  {
    name: "1.0G + 1.0L + 1.0W  (short-term, wind)",
    terms: [
      { factor: 1.0, kind: "Dead" },
      { factor: 1.0, kind: "Live" },
      { factor: 1.0, kind: "Wind" },
    ],
    permuteWindSign: true,
  },
  {
    name: "1.0G + 1.0L + 1.0E  (short-term, seismic)",
    terms: [
      { factor: 1.0, kind: "Dead" },
      { factor: 1.0, kind: "Live" },
      { factor: 1.0, kind: "Seismic" },
    ],
    permuteSeismicSign: true,
  },
]

const PRESET_DEFS: Record<CodePreset, PresetCombo[]> = {
  "AS-NZS1170-2002": AS_NZS_1170_0,
  "ASCE7-22": ASCE_7_22,
  "BSL-AIJ-ASD": BSL_AIJ_ASD,
  "EN1990-2002": EN_1990_2002,
  "GB50068-2018": GB_50068_2018,
  "SNI 1726:2019": SNI_1726_2019,
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

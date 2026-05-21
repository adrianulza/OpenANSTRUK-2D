/**
 * Case- and combo-aware analysis orchestration.
 *
 * The solver (`./solver.ts`) is theory: it takes a StructureModel and produces one
 * AnalysisResult. This file is orchestration: it slices loads by case, calls the
 * solver once per enabled case, then linearly combines the results into combinations
 * and envelopes. Linear superposition is exact for the small-deformation linear-
 * elastic system this app models, so combinations and envelopes never re-solve.
 *
 * Selfweight: today the Selfweight case returns a zero result. When real body-force
 * computation lands, only `solveCase` changes.
 */

import { analyze, type AnalysisResult } from "./solver"
import type { StructureModel } from "./model"
import type {
  LoadCase,
  LoadCaseId,
  LoadCombination,
  LoadComboId,
} from "./load-cases"
import type { AnalyzeViewMode } from "@/components/analyze-view-selector"

export type { AnalysisResult } from "./solver"

export interface EnvelopeAnalysisResult extends AnalysisResult {
  /**
   * Per-scalar governing combinations. Populated by `envelopeResults`. Optional so
   * consumers that don't need governance info can ignore it.
   */
  governingCombos?: {
    reactions: Record<string, { Rx: LoadComboId; Ry: LoadComboId; Mz: LoadComboId }>
    nodeDisplacements: Record<string, { u: LoadComboId; v: LoadComboId; theta: LoadComboId }>
    memberEndForces: Record<string, {
      N1: LoadComboId; V1: LoadComboId; M1: LoadComboId
      N2: LoadComboId; V2: LoadComboId; M2: LoadComboId
      q1: LoadComboId; q2: LoadComboId
    }>
  }
}

// ── Zero result helpers ──────────────────────────────────────────────────────

/**
 * Build an AnalysisResult with all-zero entries matching the model's topology.
 * Used as the Selfweight placeholder and as the additive identity for combinations.
 */
export function zeroResult(model: StructureModel): AnalysisResult {
  const nodeDisplacements: AnalysisResult["nodeDisplacements"] = {}
  const memberEndForces: AnalysisResult["memberEndForces"] = {}
  const reactions: AnalysisResult["reactions"] = {}

  for (const id of Object.keys(model.nodes)) {
    nodeDisplacements[id] = { u: 0, v: 0, theta: 0 }
  }
  for (const id of Object.keys(model.members)) {
    memberEndForces[id] = {
      N1: 0, V1: 0, M1: 0,
      N2: 0, V2: 0, M2: 0,
      q1: 0, q2: 0,
    }
  }
  for (const id of Object.keys(model.supports)) {
    reactions[id] = { Rx: 0, Ry: 0, Mz: 0 }
  }
  return { ok: true, nodeDisplacements, memberEndForces, reactions }
}

// ── Per-case solve ───────────────────────────────────────────────────────────

/**
 * Solve a single load case. Builds a shallow copy of the model with only this
 * case's loads, then delegates to `analyze()`. Selfweight returns a zero result
 * (placeholder until real body-force computation lands).
 *
 * Returns `null` if the solver fails for this case — other cases are unaffected.
 */
export function solveCase(
  model: StructureModel,
  caseId: LoadCaseId,
): AnalysisResult | null {
  if (caseId === "selfweight") {
    // Placeholder: real body force computation deferred.
    return zeroResult(model)
  }

  const filteredLoads: StructureModel["loads"] = {}
  for (const [id, load] of Object.entries(model.loads)) {
    if (load.loadCaseId === caseId) filteredLoads[id] = load
  }

  const slice: StructureModel = { ...model, loads: filteredLoads }
  const r = analyze(slice)
  return r.ok ? r : null
}

/**
 * Solve every enabled case. Disabled cases are omitted from the result map.
 * Failed cases get `null` entries (per-case isolation).
 */
export function solveAllCases(
  model: StructureModel,
  loadCases: Record<LoadCaseId, LoadCase>,
): Record<LoadCaseId, AnalysisResult | null> {
  const results: Record<LoadCaseId, AnalysisResult | null> = {}
  for (const [id, c] of Object.entries(loadCases)) {
    if (!c.enabled) continue
    results[id] = solveCase(model, id)
  }
  return results
}

// ── Combination ──────────────────────────────────────────────────────────────

/**
 * Linearly combine case results per a combination's terms.
 *
 * AnalysisResult fields (displacements, reactions, member end-forces) all
 * superpose linearly in linear-elastic small-deformation analysis, so this is
 * exact, not approximate.
 *
 * Returns `null` if any referenced case is missing/failed.
 */
export function combineResults(
  caseResults: Record<LoadCaseId, AnalysisResult | null>,
  combo: LoadCombination,
): AnalysisResult | null {
  if (combo.terms.length === 0) return null

  // Topology comes from the first available case result. All case results from
  // the same model share the same node/member/support keys.
  const first = combo.terms
    .map((t) => caseResults[t.caseId])
    .find((r): r is AnalysisResult => r != null)
  if (!first) return null

  const out: AnalysisResult = {
    ok: true,
    nodeDisplacements: {},
    memberEndForces: {},
    reactions: {},
  }
  for (const id of Object.keys(first.nodeDisplacements)) {
    out.nodeDisplacements[id] = { u: 0, v: 0, theta: 0 }
  }
  for (const id of Object.keys(first.memberEndForces)) {
    out.memberEndForces[id] = {
      N1: 0, V1: 0, M1: 0,
      N2: 0, V2: 0, M2: 0,
      q1: 0, q2: 0,
    }
  }
  for (const id of Object.keys(first.reactions)) {
    out.reactions[id] = { Rx: 0, Ry: 0, Mz: 0 }
  }

  for (const term of combo.terms) {
    const r = caseResults[term.caseId]
    if (!r) return null
    const k = term.factor

    for (const id of Object.keys(out.nodeDisplacements)) {
      const d = r.nodeDisplacements[id]
      if (!d) continue
      out.nodeDisplacements[id].u     += k * d.u
      out.nodeDisplacements[id].v     += k * d.v
      out.nodeDisplacements[id].theta += k * d.theta
    }
    for (const id of Object.keys(out.memberEndForces)) {
      const f = r.memberEndForces[id]
      if (!f) continue
      out.memberEndForces[id].N1 += k * f.N1
      out.memberEndForces[id].V1 += k * f.V1
      out.memberEndForces[id].M1 += k * f.M1
      out.memberEndForces[id].N2 += k * f.N2
      out.memberEndForces[id].V2 += k * f.V2
      out.memberEndForces[id].M2 += k * f.M2
      out.memberEndForces[id].q1 += k * f.q1
      out.memberEndForces[id].q2 += k * f.q2
    }
    for (const id of Object.keys(out.reactions)) {
      const re = r.reactions[id]
      if (!re) continue
      out.reactions[id].Rx += k * re.Rx
      out.reactions[id].Ry += k * re.Ry
      out.reactions[id].Mz += k * re.Mz
    }
  }

  return out
}

// ── Envelope ─────────────────────────────────────────────────────────────────

/**
 * Per-scalar max/min absolute-extreme across the included combinations.
 *
 * The envelope is built scalar-by-scalar: at each location (e.g., M1 of member 3,
 * Ry of support n2), the value with the largest magnitude across selected combos
 * wins. The governing combo for each scalar is recorded in `governingCombos`.
 *
 * This is the most useful single-value envelope for design ("worst case at this
 * point"). For diagrams, this means each end-force is independently the worst
 * across combos — that may come from different combos at different members, which
 * is exactly what design envelopes show.
 */
export function envelopeResults(
  comboResults: Record<LoadComboId, AnalysisResult | null>,
  envelopeComboIds: LoadComboId[],
): EnvelopeAnalysisResult | null {
  const included = envelopeComboIds
    .map((id) => [id, comboResults[id]] as const)
    .filter((p): p is readonly [LoadComboId, AnalysisResult] => p[1] != null)

  if (included.length === 0) return null

  const [firstId, first] = included[0]
  const out: EnvelopeAnalysisResult = {
    ok: true,
    nodeDisplacements: {},
    memberEndForces: {},
    reactions: {},
    governingCombos: {
      nodeDisplacements: {},
      memberEndForces: {},
      reactions: {},
    },
  }

  // Seed with the first included combo's values.
  for (const [id, d] of Object.entries(first.nodeDisplacements)) {
    out.nodeDisplacements[id] = { ...d }
    out.governingCombos!.nodeDisplacements[id] = { u: firstId, v: firstId, theta: firstId }
  }
  for (const [id, f] of Object.entries(first.memberEndForces)) {
    out.memberEndForces[id] = { ...f }
    out.governingCombos!.memberEndForces[id] = {
      N1: firstId, V1: firstId, M1: firstId,
      N2: firstId, V2: firstId, M2: firstId,
      q1: firstId, q2: firstId,
    }
  }
  for (const [id, re] of Object.entries(first.reactions)) {
    out.reactions[id] = { ...re }
    out.governingCombos!.reactions[id] = { Rx: firstId, Ry: firstId, Mz: firstId }
  }

  // For each remaining combo, replace any scalar whose magnitude is larger.
  const better = (
    target: Record<string, number>,
    governing: Record<string, LoadComboId>,
    candidate: Record<string, number>,
    candidateId: LoadComboId,
  ) => {
    for (const k of Object.keys(target)) {
      if (Math.abs(candidate[k]) > Math.abs(target[k])) {
        target[k] = candidate[k]
        governing[k] = candidateId
      }
    }
  }

  for (let i = 1; i < included.length; i++) {
    const [cid, r] = included[i]
    for (const id of Object.keys(out.nodeDisplacements)) {
      const c = r.nodeDisplacements[id]
      if (!c) continue
      better(
        out.nodeDisplacements[id] as unknown as Record<string, number>,
        out.governingCombos!.nodeDisplacements[id] as unknown as Record<string, LoadComboId>,
        c as unknown as Record<string, number>,
        cid,
      )
    }
    for (const id of Object.keys(out.memberEndForces)) {
      const c = r.memberEndForces[id]
      if (!c) continue
      better(
        out.memberEndForces[id] as unknown as Record<string, number>,
        out.governingCombos!.memberEndForces[id] as unknown as Record<string, LoadComboId>,
        c as unknown as Record<string, number>,
        cid,
      )
    }
    for (const id of Object.keys(out.reactions)) {
      const c = r.reactions[id]
      if (!c) continue
      better(
        out.reactions[id] as unknown as Record<string, number>,
        out.governingCombos!.reactions[id] as unknown as Record<string, LoadComboId>,
        c as unknown as Record<string, number>,
        cid,
      )
    }
  }

  return out
}

// ── Displayed-result selection ───────────────────────────────────────────────

/**
 * Pick which AnalysisResult the analyze view should render based on mode +
 * selections. Returns `null` if the requested selection has no result available
 * (e.g., envelope mode with no combos selected).
 */
export function pickDisplayedResult(
  mode: AnalyzeViewMode,
  caseResults: Record<LoadCaseId, AnalysisResult | null>,
  comboResults: Record<LoadComboId, AnalysisResult | null>,
  envelopeResult: AnalysisResult | null,
  selectedCaseId: LoadCaseId,
  selectedCombinationId: LoadComboId | null,
): AnalysisResult | null {
  switch (mode) {
    case "case":
      return caseResults[selectedCaseId] ?? null
    case "combination":
      return selectedCombinationId ? comboResults[selectedCombinationId] ?? null : null
    case "envelope":
      return envelopeResult
  }
}

/**
 * Design-run orchestrator. Solves all load cases itself (the Analyze tab's memo
 * is empty unless that tab is active), combines per enabled combination, builds
 * each member's demand context, then dispatches to the material strategy
 * (RC or Steel) keyed by the section's materialClass.
 *
 * A mixed concrete + steel model is designed in one run: each member uses the
 * criteria block matching its material. The orchestrator stays material-agnostic
 * (solve → combine → envelope → dispatch); all engineering lives in the
 * per-material strategies (`../rc/strategy.ts`, `../steel/strategy.ts`).
 */

import type { StructureModel, MemberId, SectionId } from "@/lib/model"
import type { LoadCase, LoadCaseId, LoadCombination, LoadComboId } from "@/lib/load-cases"
import { combineResults, solveAllCases } from "@/lib/analysis-pipeline"
import type { MemberEndForces } from "@/lib/solver"
import { buildGravityCombo, envelopeMemberDemands, type MemberZoneDemands } from "./demands"
import { isSectionDesignable, materialOf } from "./designability"
import type { DesignCriteria } from "./criteria"
import { asRcInput, asSteelInput, defaultSectionDesignInput, type SectionDesignInputs } from "./section-input"
import type { DesignRunResult, MemberDesignResult } from "./types"
import { designMemberRc } from "../rc/strategy"
import { designMemberSteel } from "../steel/strategy"

export interface DesignRunInput {
  model: StructureModel
  loadCases: Record<LoadCaseId, LoadCase>
  combinations: Record<LoadComboId, LoadCombination>
  criteria: DesignCriteria
  inputs: SectionDesignInputs
  shearDeformation: boolean
}

function memberLength(model: StructureModel, memberId: MemberId): number {
  const m = model.members[memberId]
  const a = model.nodes[m.a]
  const b = model.nodes[m.b]
  return Math.hypot(b.x - a.x, b.y - a.y)
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function runDesign(input: DesignRunInput): DesignRunResult {
  const { model, loadCases, combinations, criteria, inputs } = input
  const issues: string[] = []
  const members: Record<MemberId, MemberDesignResult> = {}

  const enabledCombos = Object.values(combinations).filter((c) => c.enabled !== false)
  if (enabledCombos.length === 0) {
    return {
      ok: false,
      issues: ["No enabled load combinations — define combinations in the Load tab first."],
      members: {},
    }
  }

  // Solve every enabled case once, then combine.
  const caseResults = solveAllCases(model, loadCases, {
    shearDeformation: input.shearDeformation,
  })
  for (const [id, r] of Object.entries(caseResults)) {
    if (!r.ok) issues.push(`Load case "${loadCases[id]?.name ?? id}" failed to solve: ${r.reason}`)
  }

  const perCombo: Record<LoadComboId, Record<MemberId, MemberEndForces>> = {}
  for (const combo of enabledCombos) {
    const r = combineResults(caseResults, combo)
    if (!r) {
      issues.push(`Combination "${combo.name}" skipped — none of its load cases produced results.`)
      continue
    }
    perCombo[combo.id] = r.memberEndForces
  }
  if (Object.keys(perCombo).length === 0) {
    return { ok: false, issues: [...issues, "No combination produced results — design aborted."], members: {} }
  }

  // Internal gravity combo for Vg (IMF/SMF capacity-design shear). Only RC uses
  // it today; built once when the RC frame type requires it.
  let gravityEf: Record<MemberId, MemberEndForces> | null = null
  if (criteria.rc.frameType !== "OMF") {
    const gr = combineResults(caseResults, buildGravityCombo(loadCases))
    if (gr) gravityEf = gr.memberEndForces
    else issues.push("Gravity combo (1.2D + 1.0L) unavailable — Ve computed without Vg.")
  }

  for (const m of Object.values(model.members)) {
    const sec = model.sections[m.section]
    if (!isSectionDesignable(sec)) {
      members[m.id] = { memberId: m.id, status: "not-designable" }
      continue
    }
    const L = memberLength(model, m.id)
    if (!(L > 0)) {
      members[m.id] = { memberId: m.id, status: "not-designable" }
      continue
    }
    const dims = sec!.shape!.dims
    const hMm = dims.h ?? dims.d ?? 0 // zone length 2h; steel uses section depth

    // Per-member, per-combo end forces → envelope per zone.
    const efByCombo: Record<LoadComboId, MemberEndForces> = {}
    for (const [comboId, all] of Object.entries(perCombo)) {
      const ef = all[m.id]
      if (ef) efByCombo[comboId] = ef
    }
    if (Object.keys(efByCombo).length === 0) {
      members[m.id] = { memberId: m.id, status: "no-result" }
      continue
    }
    const raw: MemberZoneDemands = envelopeMemberDemands(efByCombo, L, hMm)
    const Pu = raw.PuMaxCompression

    const na = model.nodes[m.a]
    const nb = model.nodes[m.b]
    const isVertical = Math.abs(nb.y - na.y) > Math.abs(nb.x - na.x)

    const di = inputs[m.section as SectionId] ?? defaultSectionDesignInput(m.section, sec)

    if (materialOf(sec) === "steel") {
      members[m.id] = designMemberSteel({
        memberId: m.id,
        L,
        di: asSteelInput(di, m.section),
        cr: criteria.steel,
        efByCombo,
        raw,
        Pu,
        isVertical,
      })
      continue
    }

    // RC path
    members[m.id] = designMemberRc({
      memberId: m.id,
      b: dims.b,
      h: hMm,
      fc: sec!.strength!.fc!,
      L,
      di: asRcInput(di, m.section),
      cr: criteria.rc,
      efByCombo,
      gravityEf: gravityEf?.[m.id] ?? null,
      raw,
      Pu,
      isVertical,
    })
  }

  const anyDesigned = Object.values(members).some((r) => r.status === "designed")
  if (!anyDesigned) {
    issues.push("No designable members found — RC design requires concrete rectangular sections.")
  }

  return { ok: true, issues, members }
}

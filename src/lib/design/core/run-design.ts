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
import type { DesignRunResult, JointCheckResult, MemberDesignResult } from "./types"
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

/**
 * SMF/SRPMK strong-column-weak-beam joint check (18.7.3.2). At every joint where
 * both columns and beams frame in, ΣMnc (column nominal flexural strengths at
 * their design axial) must be ≥ 6/5·ΣMnb (beam nominal flexural strengths). Uses
 * the section nominal capacities stored on each member result (`column.Mn`,
 * `beamMn`). Mutates failing columns' `scwbPass`. Empty for OMF/IMF.
 */
function checkStrongColumnWeakBeam(
  model: StructureModel,
  members: Record<MemberId, MemberDesignResult>,
  frameType: string,
): JointCheckResult[] {
  if (frameType !== "SMF") return []
  // Node → member ids framing in.
  const adj: Record<string, MemberId[]> = {}
  for (const m of Object.values(model.members)) {
    ;(adj[m.a] ??= []).push(m.id)
    ;(adj[m.b] ??= []).push(m.id)
  }
  const joints: JointCheckResult[] = []
  for (const [nodeId, ids] of Object.entries(adj)) {
    const columnIds = ids.filter((id) => members[id]?.kind === "column")
    const beamIds = ids.filter((id) => members[id]?.kind === "beam")
    if (columnIds.length === 0 || beamIds.length === 0) continue
    const sumMnc = columnIds.reduce((s, id) => s + (members[id].column?.Mn ?? 0), 0)
    const sumMnb = beamIds.reduce((s, id) => s + (members[id].beamMn ?? 0), 0)
    const pass = sumMnc >= 1.2 * sumMnb
    const ratio = sumMnb > 0 ? sumMnc / (1.2 * sumMnb) : Infinity
    joints.push({ nodeId, sumMnc, sumMnb, ratio, pass, columnIds })
    if (!pass) {
      for (const id of columnIds) {
        if (members[id].column) {
          members[id].column!.scwbPass = false
          members[id].worstFlexureDC = Infinity // force red on the canvas (SCWB governs)
        }
      }
    }
  }
  return joints
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
    const rcShape = sec!.shape!.kind === "circle" ? "circle" : "rect"
    members[m.id] = designMemberRc({
      memberId: m.id,
      b: dims.b ?? hMm, // undefined for a circle → fall back to D (column-only)
      h: hMm,
      shape: rcShape,
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
    issues.push("No designable members found — RC design requires concrete rectangular or circular sections.")
  }

  // Surface column shear / confinement failures as issues (never silent, even if
  // the user never opens the Advanced Report deck).
  for (const [id, r] of Object.entries(members)) {
    const col = r.column
    if (r.kind !== "column" || !col) continue
    if (col.shear && !col.shear.crossSectionOk) {
      issues.push(`Column ${id}: shear demand ${col.shear.Vdesign.toFixed(0)} kN exceeds the cross-section limit φVmax ${col.shear.phiVmax.toFixed(0)} kN (22.5.1.2).`)
    } else if (col.shear && col.shear.dc !== undefined && col.shear.dc > 1) {
      issues.push(`Column ${id}: shear D/C ${col.shear.dc.toFixed(2)} > 1 — increase ties (18.7.6 / 22.5).`)
    }
    if (col.confinement?.some((c) => c.status === "fail")) {
      issues.push(`Column ${id}: transverse confinement detailing fails (18.7.5 / 25.7.2) — see the Advanced Report.`)
    }
  }

  // SMF strong-column-weak-beam joint check (post-pass; needs all members designed).
  const joints = checkStrongColumnWeakBeam(model, members, criteria.rc.frameType)
  for (const j of joints) {
    if (!j.pass) {
      issues.push(
        `Strong-column-weak-beam at node ${j.nodeId}: ΣMnc ${j.sumMnc.toFixed(0)} < 1.2·ΣMnb ${(1.2 * j.sumMnb).toFixed(0)} kN·m (18.7.3.2).`,
      )
    }
  }

  return { ok: true, issues, members, joints }
}

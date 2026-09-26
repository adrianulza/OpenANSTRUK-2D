/**
 * Orchestration of the dynamic side: mass → modal → earthquake cases.
 *
 * `prepareSeismic` runs once per model/case-set change and hands the static
 * pipeline (`analysis-pipeline.ts`) what it needs: the generated ELF loads per
 * case, the combined MRS result per case, and the modal solution itself for
 * the Analyze tab.
 *
 * ⚠ THE MODAL PASS RUNS WHEN ANYTHING NEEDS IT, not only when its checkbox is
 * ticked. A response-spectrum case, or an ELF case on the "Auto" period, cannot
 * be answered without the eigen solution; making the user tick a second box to
 * get a number the first box already asked for would be a trap. The Modal
 * case's checkbox decides only whether the modes are offered on the Analyze tab.
 */

import type { StructureModel } from "../model"
import type { AnalyzeOptions } from "../solver"
import { MODAL_CASE_ID, type LoadCase, type LoadCaseId } from "../load-cases"
import { resolveMassSource, type MassSource } from "./mass-source"
import { buildMassReport, type MassReport } from "./mass"
import { dominantModeX, runModalAnalysis, type ModalSolution } from "./modal"
import { runElf, runMrs, type ElfRun, type MrsRun } from "./run"
import type { SeismicDefinition } from "./definition"

export interface SeismicCaseRun {
  caseId: LoadCaseId
  def: SeismicDefinition
  elf?: ElfRun
  mrs?: MrsRun
  /** Why the case could not be solved; the static pipeline reports it as a failure. */
  error?: string
  /** Warnings worth showing next to the result. */
  issues: string[]
}

export interface SeismicContext {
  massSource: MassSource
  mass: MassReport | null
  modal: ModalSolution | null
  runs: Record<LoadCaseId, SeismicCaseRun>
}

/** The document's mass source, reconciled with the current case list. */
export function massSourceOf(loadCases: Record<LoadCaseId, LoadCase>): MassSource {
  return resolveMassSource(loadCases[MODAL_CASE_ID]?.modal, loadCases)
}

export function needsSeismicContext(loadCases: Record<LoadCaseId, LoadCase>): boolean {
  return Object.values(loadCases).some(
    (c) => (c.kind === "Modal" && c.enabled) || (c.kind === "Seismic" && c.enabled && !!c.seismic),
  )
}

export function prepareSeismic(
  model: StructureModel,
  loadCases: Record<LoadCaseId, LoadCase>,
  opts?: AnalyzeOptions,
): SeismicContext {
  const massSource = massSourceOf(loadCases)
  const modalCase = loadCases[MODAL_CASE_ID]
  const seismicCases = Object.values(loadCases).filter(
    (c) => c.kind === "Seismic" && c.enabled && c.seismic,
  )
  const needModal =
    !!modalCase?.enabled ||
    seismicCases.some((c) => c.seismic!.analysis === "mrs" || c.seismic!.periodMode === "computed")

  if (!needModal && seismicCases.length === 0) {
    return { massSource, mass: null, modal: null, runs: {} }
  }

  const mass = buildMassReport(model, loadCases, massSource)
  const modal = needModal ? runModalAnalysis(model, mass, opts) : null
  const modalOk = modal && modal.ok ? modal : null

  const common: string[] = []
  if (mass.clamped.length > 0) {
    common.push(
      `${mass.clamped.length} node${mass.clamped.length === 1 ? "" : "s"} carried a net upward mass-source load and were given zero mass.`,
    )
  }

  const runs: Record<LoadCaseId, SeismicCaseRun> = {}
  for (const c of seismicCases) {
    const def = c.seismic!
    const issues = [...common]
    const run: SeismicCaseRun = { caseId: c.id, def, issues }
    runs[c.id] = run

    if (mass.W <= 0) {
      run.error = "Seismic weight W = 0 — no mass-source case carries load. Check the Vibration analysis mass source."
      continue
    }
    if (def.analysis === "mrs") {
      if (!modalOk) {
        run.error = `Response spectrum needs the modal solution: ${modal && !modal.ok ? modal.reason : "unavailable"}`
        continue
      }
      run.mrs = runMrs(model, def, mass, modalOk)
      if (Object.values(model.loads).some((l) => l.loadCaseId === c.id)) {
        issues.push("Loads placed in this case are ignored — a response-spectrum case is generated entirely from the spectrum.")
      }
      const ladder = run.mrs.elf.ladder
      if (ladder.siteNote) issues.push(ladder.siteNote)
      continue
    }

    const computedT = modalOk ? dominantModeX(modalOk).T : undefined
    if (def.periodMode === "computed" && computedT === undefined) {
      issues.push(
        `Auto period unavailable (${modal && !modal.ok ? modal.reason : "no modal solution"}) — the empirical Ta is used instead.`,
      )
    }
    run.elf = runElf(model, def, mass, computedT)
    const ladder = run.elf.ladder
    if (ladder.siteNote) issues.push(ladder.siteNote)
    if (!ladder.elfPermitted) issues.push(ladder.elfReason)
  }

  return { massSource, mass, modal, runs }
}

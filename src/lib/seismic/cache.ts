/**
 * Memoisation of the expensive dynamic steps, keyed on what they depend on.
 *
 * The modal solution depends on the geometry, sections, supports, the nodal
 * mass and the shear-deformation switch — not on loads, case names, case
 * checkboxes or combinations. Keying on exactly those lets every other edit
 * (renaming a case, toggling a non-mass case, editing a combination) reuse the
 * eigen solution and the per-case ELF / MRS / time-history runs instead of
 * recomputing them.
 *
 * Module-level, so each realm (main thread, analysis worker) keeps its own.
 * Bounded: one modal solution, a handful of case runs.
 */

import type { StructureModel } from "../model"
import type { AnalyzeOptions } from "../solver"
import type { MassReport } from "./mass"
import { runModalAnalysis, type ModalSolution } from "./modal"

/** Everything the modal solution depends on, as one string. */
export function modalKey(model: StructureModel, mass: MassReport, opts?: AnalyzeOptions): string {
  return JSON.stringify([
    model.nodes,
    model.members,
    model.supports,
    model.sections,
    mass.nodeWeight,
    !!opts?.shearDeformation,
  ])
}

let lastModal: { key: string; value: ModalSolution } | null = null

export function cachedModal(
  model: StructureModel,
  mass: MassReport,
  opts?: AnalyzeOptions,
): { key: string; value: ModalSolution } {
  const key = modalKey(model, mass, opts)
  if (lastModal?.key !== key) lastModal = { key, value: runModalAnalysis(model, mass, opts) }
  return lastModal
}

const RUN_CACHE_SIZE = 16
const runCache = new Map<string, unknown>()

/**
 * A per-case run, reused while its key holds. The key must name everything
 * the run reads: the modal key (geometry, mass) plus the case definition and
 * any record.
 */
export function cachedRun<T>(key: string, compute: () => T): T {
  if (runCache.has(key)) {
    const v = runCache.get(key) as T
    // Refresh recency.
    runCache.delete(key)
    runCache.set(key, v)
    return v
  }
  const v = compute()
  runCache.set(key, v)
  if (runCache.size > RUN_CACHE_SIZE) runCache.delete(runCache.keys().next().value as string)
  return v
}

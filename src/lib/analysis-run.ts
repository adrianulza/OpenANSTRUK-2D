/**
 * One complete analysis — the dynamic side (mass, modes, earthquake cases)
 * and every static case — as a pure function of its inputs.
 *
 * Pure and structured-clone friendly in both directions, so it runs unchanged
 * in the analysis Web Worker (`analysis.worker.ts`), on the main thread as a
 * fallback, and in the Node verification scripts.
 */

import type { StructureModel } from "./model"
import type { LoadCase, LoadCaseId } from "./load-cases"
import type { AnalyzeOptions, SolverResult } from "./solver"
import type { GroundMotionRecord } from "./seismic/ground-motion"
import { needsSeismicContext, prepareSeismic, type SeismicContext } from "./seismic/solve"
import { solveAllCases } from "./analysis-pipeline"

export interface AnalysisInput {
  model: StructureModel
  loadCases: Record<LoadCaseId, LoadCase>
  opts: AnalyzeOptions
  groundMotions: GroundMotionRecord[]
}

export interface AnalysisOutput {
  seismicCtx: SeismicContext | null
  caseResults: Record<LoadCaseId, SolverResult>
}

export function runAnalysis(input: AnalysisInput): AnalysisOutput {
  const { model, loadCases, opts, groundMotions } = input
  const seismicCtx = needsSeismicContext(loadCases)
    ? prepareSeismic(model, loadCases, opts, groundMotions)
    : null
  return { seismicCtx, caseResults: solveAllCases(model, loadCases, opts, seismicCtx) }
}

/// <reference lib="webworker" />
/**
 * The analysis Web Worker: runs `runAnalysis` off the main thread so a large
 * model never freezes the page. One request at a time; each reply carries the
 * request id it answers, and the main thread ignores stale ones.
 *
 * The seismic caches (`seismic/cache.ts`) live in this worker's realm, so a
 * re-run that changes neither geometry nor mass reuses the eigen solution and
 * the per-case runs.
 */

import { runAnalysis, type AnalysisInput } from "./analysis-run"

declare const self: DedicatedWorkerGlobalScope

self.onmessage = (e: MessageEvent<{ id: number; input: AnalysisInput }>) => {
  const { id, input } = e.data
  try {
    self.postMessage({ id, ok: true, output: runAnalysis(input) })
  } catch (err) {
    self.postMessage({ id, ok: false, error: err instanceof Error ? err.message : String(err) })
  }
}

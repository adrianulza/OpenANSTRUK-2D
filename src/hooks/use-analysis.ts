import { useEffect, useRef, useState } from "react"
import { runAnalysis, type AnalysisInput, type AnalysisOutput } from "@/lib/analysis-run"

/**
 * Runs the analysis in a Web Worker and hands back the result for `input`.
 *
 * - Posts only while `enabled` (the Analyze / Design tabs), and only when
 *   `input` is a new object: leaving a results tab and coming back with
 *   nothing edited does not re-run, and neither does switching between the
 *   two results tabs.
 * - `output` is `null` until the run for the CURRENT input arrives. A result
 *   for an older input is never shown against a newer model, so nothing can
 *   look up a deleted member.
 * - `pending` is true while a run is in flight (the status bar shows it).
 * - If a Worker cannot be created (an old browser, a test harness), the
 *   analysis runs synchronously on the main thread, exactly as before.
 */
export function useAnalysis(
  input: AnalysisInput,
  enabled: boolean,
): { output: AnalysisOutput | null; pending: boolean } {
  const workerRef = useRef<Worker | null | undefined>(undefined)
  const seqRef = useRef(0)
  const postedRef = useRef<AnalysisInput | null>(null)
  const [state, setState] = useState<{ input: AnalysisInput; output: AnalysisOutput } | null>(null)

  useEffect(() => {
    return () => {
      workerRef.current?.terminate()
      workerRef.current = undefined
      // A remount (StrictMode's rehearsal, hot reload) must post again: the
      // request in flight died with the worker.
      postedRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!enabled || postedRef.current === input) return
    postedRef.current = input
    const id = ++seqRef.current

    if (workerRef.current === undefined) {
      try {
        workerRef.current = new Worker(new URL("../lib/analysis.worker.ts", import.meta.url), {
          type: "module",
        })
      } catch {
        workerRef.current = null
      }
    }
    const worker = workerRef.current

    // Deferred a task so the fallback, like the worker, answers asynchronously.
    const runHere = () =>
      setTimeout(() => {
        const output = runAnalysis(input)
        if (id === seqRef.current) setState({ input, output })
      }, 0)
    if (!worker) {
      runHere()
      return
    }

    worker.onmessage = (e: MessageEvent<{ id: number; ok: boolean; output?: AnalysisOutput; error?: string }>) => {
      const msg = e.data
      if (msg.id !== seqRef.current) return // an answer to an older question
      if (msg.ok && msg.output) {
        setState({ input, output: msg.output })
      } else {
        // A failure inside the worker is a bug, not a model problem: fall
        // back to the main thread so the user still gets results.
        runHere()
      }
    }
    worker.onerror = () => {
      workerRef.current?.terminate()
      workerRef.current = null
      runHere()
    }
    worker.postMessage({ id, input })
  }, [input, enabled])

  const current = !!state && state.input === input
  return { output: current ? state.output : null, pending: enabled && !current }
}

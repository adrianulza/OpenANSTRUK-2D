import { useCallback, useEffect, useRef, useState } from "react"
import type { StructureModel } from "@/lib/model"

/** Maximum number of undo entries kept. Snapshots are references to past
 *  (immutable) model objects, so the memory cost is ~one pointer each. */
const HISTORY_CAP = 20

interface UseModelHistoryArgs {
  model: StructureModel
  setModel: (m: StructureModel) => void
  /** Node currently being screen-dragged, or null. Used to coalesce a drag
   *  gesture into a single undo entry. */
  draggingNodeId: string | null
}

interface ModelHistory {
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
  /** Clear all history. Call after a whole-model swap (New / Load / template
   *  / example) — the ensuing `model` change is suppressed so stacks stay empty. */
  resetHistory: () => void
}

/**
 * Single-stack undo/redo for the whole `StructureModel`.
 *
 * Because every mutation in the app replaces `model` with a new immutable
 * object, history just keeps references to past models — covering node, member,
 * support, section, and load edits with one stack.
 *
 * Capture is observational: a `[model]` effect pushes the previous model onto
 * the undo stack whenever `model` changes. Two cases are guarded — the change
 * caused by undo/redo itself (identity check on `prevModelRef`), and the rapid
 * intermediate updates of an on-screen node drag (coalesced via `draggingNodeId`).
 */
export function useModelHistory({
  model,
  setModel,
  draggingNodeId,
}: UseModelHistoryArgs): ModelHistory {
  const undoStackRef = useRef<StructureModel[]>([])
  const redoStackRef = useRef<StructureModel[]>([])
  const prevModelRef = useRef<StructureModel>(model)
  const skipNextRef = useRef(false)
  const isApplyingRef = useRef(false)
  // Pre-drag model, captured at drag start; pushed on drag end iff it changed.
  const dragBaselineRef = useRef<StructureModel | null>(null)

  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncFlags = useCallback(() => {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }, [])

  // Observe model changes and capture the previous state.
  useEffect(() => {
    if (model === prevModelRef.current) return

    // Change produced by undo/redo (or a reset) — don't re-capture.
    if (isApplyingRef.current || skipNextRef.current) {
      isApplyingRef.current = false
      skipNextRef.current = false
      prevModelRef.current = model
      return
    }

    // Mid-drag intermediate update — the pre-drag snapshot was already pushed
    // on drag start; just advance the baseline.
    if (draggingNodeId != null) {
      prevModelRef.current = model
      return
    }

    undoStackRef.current = [...undoStackRef.current, prevModelRef.current].slice(-HISTORY_CAP)
    redoStackRef.current = []
    prevModelRef.current = model
    syncFlags()
  }, [model, draggingNodeId, syncFlags])

  // Drag start/end bracketing. Capture the pre-drag model at the start and push
  // it once on drag end — but only if the drag actually changed the model, so a
  // bare click-without-move produces no spurious undo entry.
  useEffect(() => {
    if (draggingNodeId != null) {
      dragBaselineRef.current = prevModelRef.current
    } else if (dragBaselineRef.current != null) {
      const baseline = dragBaselineRef.current
      dragBaselineRef.current = null
      if (model !== baseline) {
        undoStackRef.current = [...undoStackRef.current, baseline].slice(-HISTORY_CAP)
        redoStackRef.current = []
        syncFlags()
      }
      prevModelRef.current = model
    }
    // `model` intentionally excluded: we only react to the drag transition, not
    // to every intermediate model update during the drag.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draggingNodeId, syncFlags])

  const undo = useCallback(() => {
    const stack = undoStackRef.current
    if (stack.length === 0) return
    const target = stack[stack.length - 1]
    undoStackRef.current = stack.slice(0, -1)
    redoStackRef.current = [...redoStackRef.current, model].slice(-HISTORY_CAP)
    isApplyingRef.current = true
    prevModelRef.current = target
    setModel(target)
    syncFlags()
  }, [model, setModel, syncFlags])

  const redo = useCallback(() => {
    const stack = redoStackRef.current
    if (stack.length === 0) return
    const target = stack[stack.length - 1]
    redoStackRef.current = stack.slice(0, -1)
    undoStackRef.current = [...undoStackRef.current, model].slice(-HISTORY_CAP)
    isApplyingRef.current = true
    prevModelRef.current = target
    setModel(target)
    syncFlags()
  }, [model, setModel, syncFlags])

  const resetHistory = useCallback(() => {
    undoStackRef.current = []
    redoStackRef.current = []
    skipNextRef.current = true
    syncFlags()
  }, [syncFlags])

  return { undo, redo, canUndo, canRedo, resetHistory }
}

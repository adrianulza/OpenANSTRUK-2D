import { useCallback, useEffect, useRef, useState } from "react"
import type { NodeId, StructureModel } from "@/lib/model"
import type { AnalysisResult } from "@/lib/solver"
import type { WorldPoint } from "@/lib/geometry"
import { evaluateLive, equilibriumResidual, LIVE_P_MAX, type LiveSystem } from "@/lib/live-solver"
import {
  ropeToForce,
  newSpring,
  springStep,
  springKick,
  springSettled,
  releaseFade,
  SQUISHY_SPRING,
  CALM_SPRING,
  type RopeForce,
  type SpringState,
  type LiveReadout,
} from "@/lib/live-physics"

// ── Live pull controller ─────────────────────────────────────────────────────
//
// Owns everything that changes every frame while a student pulls a node:
// the rope end, the spring that the drawn shape follows, and the release fade.
// All of it lives in refs and runs on requestAnimationFrame, so a pull never
// re-renders React. The loop runs only while a node is held, the spring is
// still wobbling, or the release fade is playing; an idle Live tab costs nothing.

/** How long diagrams, reactions and numbers take to fade out after release. */
const RELEASE_MS = 150
/** Overshoot added when the rope first reaches the cap, as a share of P_max. */
const CAP_BUMP = 0.08
/** Readout pushes to React at most this often (ms). */
const READOUT_INTERVAL_MS = 80

export type LiveDiagram = "AXIAL" | "SHEAR" | "MOMENT" | null

/** Everything the canvas needs to draw one Live frame. */
export interface LiveFrame {
  /** Node the rope is tied to right now (null after release) */
  grabbed: NodeId | null
  cursor: WorldPoint | null
  /** Exact rope force while held (null otherwise) */
  force: RopeForce | null
  /** Exact result for diagrams, reactions and numbers (fades out after release) */
  exact: AnalysisResult | null
  /** Spring-smoothed result for the drawn deformed shape */
  shape: AnalysisResult | null
  /** Load-arrow size, 0 → 1 of its full length, eased so the arrow stretches smoothly */
  arrowScale: number
}

type PullState = {
  grabbed: NodeId | null
  cursor: WorldPoint | null
  shift: boolean
  spring: SpringState
  /** Node the spring's force acts at; outlives the grab so the release can wobble */
  springNode: NodeId | null
  wasCapped: boolean
  releaseAt: number | null
  releaseForce: { px: number; py: number }
  lastT: number
  arrowScale: number
  lastEmit: number
  frame: LiveFrame | null
}

const freshState = (): PullState => ({
  grabbed: null,
  cursor: null,
  shift: false,
  spring: newSpring(),
  springNode: null,
  wasCapped: false,
  releaseAt: null,
  releaseForce: { px: 0, py: 0 },
  lastT: 0,
  lastEmit: 0,
  frame: null,
  arrowScale: 0,
})

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function useLivePull({
  liveSystem,
  model,
  snap,
  diagram,
  onReadout,
  redraw,
}: {
  liveSystem: LiveSystem | null
  model: StructureModel
  snap: boolean
  diagram: LiveDiagram
  onReadout?: (r: LiveReadout | null) => void
  redraw: () => void
}) {
  const stateRef = useRef<PullState>(freshState())
  const rafRef = useRef<number | null>(null)
  const [pulling, setPulling] = useState(false)

  // Latest inputs, read from inside the animation loop.
  const inputs = useRef({ liveSystem, model, snap, diagram, onReadout, redraw })
  useEffect(() => {
    inputs.current = { liveSystem, model, snap, diagram, onReadout, redraw }
  }, [liveSystem, model, snap, diagram, onReadout, redraw])

  const computeFrame = useCallback((now: number): { frame: LiveFrame; target: { x: number; y: number } } => {
    const st = stateRef.current
    const { liveSystem: sys, model: m, snap: snapOn } = inputs.current
    let force: RopeForce | null = null
    if (sys && st.grabbed && st.cursor) {
      const n = m.nodes[st.grabbed]
      if (n) force = ropeToForce(n, st.cursor, sys.ropeCap, LIVE_P_MAX, snapOn || st.shift)
    }
    let exact: AnalysisResult | null = null
    if (sys && force && st.grabbed) {
      exact = evaluateLive(sys, st.grabbed, force.px, force.py)
    } else if (sys && st.springNode && st.releaseAt !== null) {
      const f = releaseFade(now - st.releaseAt, RELEASE_MS)
      if (f > 0) exact = evaluateLive(sys, st.springNode, st.releaseForce.px * f, st.releaseForce.py * f)
    }
    return {
      // The shape is filled in by the tick, after the spring has stepped.
      frame: { grabbed: st.grabbed, cursor: st.cursor, force, exact, shape: null, arrowScale: st.arrowScale },
      target: force ? { x: force.px, y: force.py } : { x: 0, y: 0 },
    }
  }, [])

  const emitReadout = useCallback((now: number, frame: LiveFrame, force: boolean) => {
    const st = stateRef.current
    const { onReadout: emit, model: m, diagram: dg } = inputs.current
    if (!emit) return
    // The readout describes the rope being held. Once it is let go the panel
    // clears at once, while the canvas still plays the fade and the wobble.
    if (!frame.grabbed || !frame.force || !frame.exact) {
      if (st.lastEmit !== -1) emit(null)
      st.lastEmit = -1
      return
    }
    if (!force && st.lastEmit > 0 && now - st.lastEmit < READOUT_INTERVAL_MS) return
    st.lastEmit = now
    const node = frame.grabbed
    const { px, py, P } = frame.force
    const d = frame.exact.nodeDisplacements[node]
    let peak: number | null = null
    if (dg) {
      peak = 0
      for (const ef of Object.values(frame.exact.memberEndForces)) {
        // No distributed load in Live: values are constant or linear, so the ends are the extremes.
        const pair = dg === "AXIAL" ? [ef.N1, ef.N2] : dg === "SHEAR" ? [ef.V1, ef.V2] : [ef.M1, ef.M2]
        for (const v of pair) if (Math.abs(v) > Math.abs(peak)) peak = v
      }
    }
    emit({
      nodeId: node,
      P,
      angleDeg: frame.force.angleDeg,
      capped: frame.force.capped,
      u: d?.u ?? 0,
      v: d?.v ?? 0,
      peak,
      eq: equilibriumResidual(m, frame.exact, node, px, py),
    })
  }, [])

  // The loop re-schedules itself through a ref, so the frame callback stays
  // stable while tick() is rebuilt with its dependencies.
  const tickRef = useRef<(now: number) => void>(() => {})
  const onFrame = useCallback((now: number) => tickRef.current(now), [])

  const tick = useCallback((now: number) => {
    rafRef.current = null
    const st = stateRef.current
    const sys = inputs.current.liveSystem
    if (!sys) return
    const dt = st.lastT ? (now - st.lastT) / 1000 : 1 / 60
    st.lastT = now
    const params = prefersReducedMotion() ? CALM_SPRING : SQUISHY_SPRING

    const { frame, target } = computeFrame(now)
    if (frame.force) {
      // A small bump the moment the rope goes taut, so the limit feels like a stop.
      if (frame.force.capped && !st.wasCapped) {
        springKick(st.spring, frame.force.px, frame.force.py, CAP_BUMP * LIVE_P_MAX, params)
        navigator.vibrate?.(10)
      }
      st.wasCapped = frame.force.capped
    }
    springStep(st.spring, target, dt, params)
    // The arrow follows P / P_max with a quick exponential ease (about 60 ms),
    // so it stretches smoothly instead of jumping between mouse samples.
    const arrowTarget = frame.force ? frame.force.P / LIVE_P_MAX : 0
    st.arrowScale += (arrowTarget - st.arrowScale) * (1 - Math.exp(-Math.min(dt, 1 / 30) / 0.06))
    frame.arrowScale = st.arrowScale
    if (st.springNode) frame.shape = evaluateLive(sys, st.springNode, st.spring.x, st.spring.y)
    st.frame = frame
    inputs.current.redraw()

    const fading = st.releaseAt !== null && now - st.releaseAt < RELEASE_MS
    const settled = springSettled(st.spring, target, LIVE_P_MAX)
    if (st.grabbed || fading || !settled) {
      emitReadout(now, frame, false)
      rafRef.current = requestAnimationFrame(onFrame)
    } else {
      // At rest: drop back to the undeformed structure and stop the loop.
      st.springNode = null
      st.releaseAt = null
      st.lastT = 0
      st.spring = newSpring()
      st.frame = null
      inputs.current.redraw()
      inputs.current.onReadout?.(null)
    }
  }, [computeFrame, emitReadout, onFrame])
  useEffect(() => { tickRef.current = tick }, [tick])

  const ensureRunning = useCallback(() => {
    if (rafRef.current === null) {
      stateRef.current.lastT = 0
      rafRef.current = requestAnimationFrame(onFrame)
    }
  }, [onFrame])

  const begin = useCallback((nodeId: NodeId, cursor: WorldPoint, shift: boolean) => {
    const st = stateRef.current
    // Grabbing another node while the last one still wobbles: start clean.
    if (st.springNode !== nodeId) st.spring = newSpring()
    st.grabbed = nodeId
    st.springNode = nodeId
    st.cursor = cursor
    st.shift = shift
    st.wasCapped = false
    st.releaseAt = null
    setPulling(true)
    ensureRunning()
  }, [ensureRunning])

  const move = useCallback((cursor: WorldPoint, shift: boolean) => {
    const st = stateRef.current
    if (!st.grabbed) return
    st.cursor = cursor
    st.shift = shift
    ensureRunning()
  }, [ensureRunning])

  const setShift = useCallback((shift: boolean) => {
    const st = stateRef.current
    if (!st.grabbed || st.shift === shift) return
    st.shift = shift
    ensureRunning()
  }, [ensureRunning])

  const end = useCallback(() => {
    const st = stateRef.current
    if (!st.grabbed) return
    const f = st.frame?.force
    st.releaseForce = { px: f?.px ?? 0, py: f?.py ?? 0 }
    st.releaseAt = performance.now()
    st.grabbed = null
    st.cursor = null
    st.wasCapped = false
    setPulling(false)
    ensureRunning()
  }, [ensureRunning])

  // A new system (tab entered or left, model changed) always starts from rest:
  // Live mode keeps no memory between visits. The React flag resets during
  // render (the documented pattern for state tied to a prop); the loop and the
  // refs reset in the effect below.
  const [prevSystem, setPrevSystem] = useState(liveSystem)
  if (prevSystem !== liveSystem) {
    setPrevSystem(liveSystem)
    setPulling(false)
  }
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    stateRef.current = freshState()
    inputs.current.onReadout?.(null)
  }, [liveSystem])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  // Changing the diagram or snap mid-pull should update the readout right away.
  useEffect(() => {
    if (stateRef.current.grabbed) ensureRunning()
  }, [diagram, snap, ensureRunning])

  return { stateRef, pulling, begin, move, setShift, end }
}

export type LivePullApi = ReturnType<typeof useLivePull>

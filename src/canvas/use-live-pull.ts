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
  CALM_SPRING,
  LIVE_SPRING,
  LIVE_MOTION,
  easeOutCubic,
  easeInBack,
  easeInOutCubic,
  clamp01,
  type RopeForce,
  type SpringState,
  type SpringParams,
  type LiveReadout,
} from "@/lib/live-physics"

// ── Live pull controller ─────────────────────────────────────────────────────
//
// Owns everything that changes every frame while a student pulls a node:
// the rope end, the spring that the drawn frame follows, and the playful
// motion around it (diagram grow and retract, diagram morph, eased reactions
// that flash when they flip, ripples and the entrance drop). All of it lives
// in refs and runs on requestAnimationFrame, so a pull never re-renders React.
// The loop runs only while something is moving; an idle Live tab costs nothing.

/** Readout pushes to React at most this often (ms). */
const READOUT_INTERVAL_MS = 80
/** The entrance lasts until the last grab ring has popped in. */
const ENTRY_TOTAL_MS = LIVE_MOTION.entryMs + 1100

export type LiveDiagram = "AXIAL" | "SHEAR" | "MOMENT" | null

export type LiveReactions = Record<NodeId, { Rx: number; Ry: number; Mz: number }>

/** Everything the canvas needs to draw one Live frame. */
export interface LiveFrame {
  now: number
  /** Node the rope is tied to right now (null after release) */
  grabbed: NodeId | null
  cursor: WorldPoint | null
  /** Exact rope force while held (null otherwise) */
  force: RopeForce | null
  /** Exact result for diagrams and numbers (held at the release force while retracting) */
  exact: AnalysisResult | null
  /** Diagram size, 0 → 1: grows out of the members on grab, retracts on release */
  grow: number
  /** Diagram morph after the selected diagram changed: previous kind and progress 0 → 1 */
  morph: { from: LiveDiagram; t: number } | null
  /** Spring-smoothed result for the drawn frame */
  shape: AnalysisResult | null
  /** Eased support reactions, and the time each component last flipped sign */
  reactions: LiveReactions
  flashAt: Record<NodeId, [number, number, number]>
  /** Load-arrow thickness 0 → 1, and the force number shown (both eased) */
  arrowScale: number
  shownP: number
  grabAt: number
  entryAt: number
  ripples: { node: NodeId; t: number }[]
}

type PullState = {
  grabbed: NodeId | null
  cursor: WorldPoint | null
  shift: boolean
  spring: SpringState
  /** Node the spring's force acts at; outlives the grab so the release can wobble */
  springNode: NodeId | null
  wasCapped: boolean
  grabAt: number
  releaseAt: number | null
  releaseForce: { px: number; py: number }
  lastT: number
  arrowScale: number
  shownP: number
  reactions: LiveReactions
  flashAt: Record<NodeId, [number, number, number]>
  ripples: { node: NodeId; t: number }[]
  entryAt: number
  diagram: LiveDiagram
  morphFrom: LiveDiagram
  morphAt: number
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
  grabAt: -1e9,
  releaseAt: null,
  releaseForce: { px: 0, py: 0 },
  lastT: 0,
  arrowScale: 0,
  shownP: 0,
  reactions: {},
  flashAt: {},
  ripples: [],
  entryAt: -1e9,
  diagram: null,
  morphFrom: null,
  morphAt: -1e9,
  lastEmit: 0,
  frame: null,
})

export const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches

export function useLivePull({
  liveSystem,
  model,
  onReadout,
  redraw,
}: {
  liveSystem: LiveSystem | null
  model: StructureModel
  onReadout?: (r: LiveReadout | null) => void
  redraw: () => void
}) {
  const stateRef = useRef<PullState>(freshState())
  const rafRef = useRef<number | null>(null)
  const [pulling, setPulling] = useState(false)

  // Latest inputs, read from inside the animation loop.
  const inputs = useRef({ liveSystem, model, onReadout, redraw })
  useEffect(() => {
    inputs.current = { liveSystem, model, onReadout, redraw }
  }, [liveSystem, model, onReadout, redraw])

  const emitReadout = useCallback((now: number, frame: LiveFrame) => {
    const st = stateRef.current
    const { onReadout: emit, model: m } = inputs.current
    if (!emit) return
    // The readout describes the rope being held. Once it is let go the chip
    // clears at once, while the canvas still plays the retract and the wobble.
    if (!frame.grabbed || !frame.force || !frame.exact) {
      if (st.lastEmit !== -1) emit(null)
      st.lastEmit = -1
      return
    }
    if (st.lastEmit > 0 && now - st.lastEmit < READOUT_INTERVAL_MS) return
    st.lastEmit = now
    const { px, py, P } = frame.force
    emit({ nodeId: frame.grabbed, P, eq: equilibriumResidual(m, frame.exact, frame.grabbed, px, py) })
  }, [])

  // The loop re-schedules itself through a ref, so the frame callback stays
  // stable while tick() is rebuilt with its dependencies.
  const tickRef = useRef<(now: number) => void>(() => {})
  const onFrame = useCallback((now: number) => tickRef.current(now), [])

  const tick = useCallback((now: number) => {
    rafRef.current = null
    const st = stateRef.current
    const { liveSystem: sys, model: m } = inputs.current
    if (!sys) return
    const dt = Math.min(st.lastT ? (now - st.lastT) / 1000 : 1 / 60, 1 / 30)
    st.lastT = now
    const calm = prefersReducedMotion()

    // Rope force and the exact result (held at the release force while retracting).
    let force: RopeForce | null = null
    if (st.grabbed && st.cursor) {
      const n = m.nodes[st.grabbed]
      if (n) force = ropeToForce(n, st.cursor, sys.ropeCap, LIVE_P_MAX, st.shift)
    }
    let exact: AnalysisResult | null = null
    let grow = 0
    if (force && st.grabbed) {
      exact = evaluateLive(sys, st.grabbed, force.px, force.py)
      grow = calm ? 1 : easeOutCubic(clamp01((now - st.grabAt) / LIVE_MOTION.growMs))
    } else if (st.springNode && st.releaseAt !== null) {
      const e = clamp01((now - st.releaseAt) / LIVE_MOTION.retractMs)
      if (e < 1 && !calm) {
        exact = evaluateLive(sys, st.springNode, st.releaseForce.px, st.releaseForce.py)
        grow = Math.max(0, 1 - easeInBack(e))
      }
    }

    // The frame's spring: quicker while held so it sticks to the hand.
    const base: SpringParams = calm ? CALM_SPRING : LIVE_SPRING
    const params: SpringParams = force && !calm ? { ...base, freq: base.freq * LIVE_MOTION.followWhileHeld } : base
    if (force) {
      if (force.capped && !st.wasCapped && !calm) {
        springKick(st.spring, force.px, force.py, LIVE_MOTION.capBump, params)
        navigator.vibrate?.(10)
      }
      st.wasCapped = force.capped
    }
    const target = force ? { x: force.px, y: force.py } : { x: 0, y: 0 }
    springStep(st.spring, target, dt, params)

    const ease = (tau: number) => (calm ? 1 : 1 - Math.exp(-dt / tau))
    st.arrowScale += ((force ? force.P / LIVE_P_MAX : 0) - st.arrowScale) * ease(LIVE_MOTION.arrowTau)
    st.shownP += ((force ? force.P : 0) - st.shownP) * ease(LIVE_MOTION.countTau)

    // Reactions glide; a component that crosses zero flashes as it flips.
    let reactionsMoving = false
    for (const id of sys.supportNodeIds) {
      const tgt = exact?.reactions[id]
      const t3 = [tgt ? tgt.Rx * grow : 0, tgt ? tgt.Ry * grow : 0, tgt ? tgt.Mz * grow : 0]
      const cur = st.reactions[id] ?? { Rx: 0, Ry: 0, Mz: 0 }
      const prev = [cur.Rx, cur.Ry, cur.Mz]
      const next = prev.map((v, i) => v + (t3[i] - v) * ease(LIVE_MOTION.reactionTau))
      const flash = st.flashAt[id] ?? [-1e9, -1e9, -1e9]
      next.forEach((v, i) => {
        if (prev[i] * v < 0 && Math.abs(t3[i]) > 0.04 * sys.refs.R) flash[i] = now
        if (Math.abs(v - t3[i]) > 1e-3 * Math.max(sys.refs.R, 1)) reactionsMoving = true
      })
      st.reactions[id] = { Rx: next[0], Ry: next[1], Mz: next[2] }
      st.flashAt[id] = flash
    }

    st.ripples = st.ripples.filter((r) => now - r.t < LIVE_MOTION.rippleMs)
    const morphT = calm ? 1 : easeInOutCubic(clamp01((now - st.morphAt) / LIVE_MOTION.morphMs))
    const frame: LiveFrame = {
      now,
      grabbed: st.grabbed,
      cursor: st.cursor,
      force,
      exact,
      grow,
      morph: morphT < 1 && st.morphFrom ? { from: st.morphFrom, t: morphT } : null,
      shape: st.springNode ? evaluateLive(sys, st.springNode, st.spring.x, st.spring.y) : null,
      reactions: st.reactions,
      flashAt: st.flashAt,
      arrowScale: st.arrowScale,
      shownP: st.shownP,
      grabAt: st.grabAt,
      entryAt: st.entryAt,
      ripples: st.ripples,
    }
    st.frame = frame
    inputs.current.redraw()
    emitReadout(now, frame)

    const settled = springSettled(st.spring, target, LIVE_P_MAX)
    const busy =
      st.grabbed !== null ||
      exact !== null ||
      !settled ||
      reactionsMoving ||
      st.ripples.length > 0 ||
      frame.morph !== null ||
      now - st.entryAt < ENTRY_TOTAL_MS ||
      Math.abs(st.shownP) > 0.05 ||
      st.arrowScale > 0.002
    if (busy) {
      rafRef.current = requestAnimationFrame(onFrame)
    } else {
      // At rest: drop back to the undeformed structure and stop the loop.
      st.springNode = null
      st.releaseAt = null
      st.lastT = 0
      st.spring = newSpring()
      st.reactions = {}
      st.shownP = 0
      st.arrowScale = 0
      st.frame = { ...frame, shape: null, exact: null, grow: 0, reactions: {} }
      inputs.current.redraw()
    }
  }, [emitReadout, onFrame])
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
    st.grabAt = performance.now()
    if (LIVE_MOTION.ripplePx > 0) st.ripples.push({ node: nodeId, t: st.grabAt })
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
    if (LIVE_MOTION.ripplePx > 0 && f && f.P > 5) st.ripples.push({ node: st.grabbed, t: st.releaseAt })
    // Release fling: extra speed towards rest, so the frame overshoots and rings.
    if (!prefersReducedMotion()) {
      const w = 2 * Math.PI * LIVE_SPRING.freq
      st.spring.vx -= st.spring.x * LIVE_MOTION.releaseFling * w
      st.spring.vy -= st.spring.y * LIVE_MOTION.releaseFling * w
    }
    st.grabbed = null
    st.cursor = null
    st.wasCapped = false
    setPulling(false)
    ensureRunning()
  }, [ensureRunning])

  /** Tells the controller which diagram is shown, so a change morphs smoothly. */
  const setDiagram = useCallback((kind: LiveDiagram) => {
    const st = stateRef.current
    if (st.diagram === kind) return
    if (st.diagram) { st.morphFrom = st.diagram; st.morphAt = performance.now() }
    st.diagram = kind
    ensureRunning()
  }, [ensureRunning])

  // A new system (tab entered or left, model changed) always starts from rest:
  // Live mode keeps no memory between visits. The React flag resets during
  // render (the documented pattern for state tied to a prop); the loop and the
  // refs reset in the effect below, which also plays the entrance.
  const [prevSystem, setPrevSystem] = useState(liveSystem)
  if (prevSystem !== liveSystem) {
    setPrevSystem(liveSystem)
    setPulling(false)
  }
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
    rafRef.current = null
    const diagram = stateRef.current.diagram
    stateRef.current = freshState()
    stateRef.current.diagram = diagram
    inputs.current.onReadout?.(null)
    if (liveSystem) {
      stateRef.current.entryAt = prefersReducedMotion() ? -1e9 : performance.now()
      ensureRunning()
    }
  }, [liveSystem, ensureRunning])

  useEffect(() => () => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current)
  }, [])

  return { stateRef, pulling, begin, move, setShift, end, setDiagram }
}

export type LivePullApi = ReturnType<typeof useLivePull>

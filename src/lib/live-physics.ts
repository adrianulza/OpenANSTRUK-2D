// ── Live-mode interaction physics (pure, no React) ───────────────────────────
//
// Two small pieces drive how Live mode feels:
//
// 1. ropeToForce: the rope from a node's ORIGINAL position to the cursor is the
//    point load. Its direction is the load direction and its length sets the
//    magnitude linearly, capped at pMax once the rope reaches ropeCap. Measuring
//    from the original (not the deformed) position keeps the force independent
//    of the drawing scale, so there is no feedback loop between load and drawing.
//
// 2. A damped 2D spring that the DRAWN deformed shape follows. Because the
//    deformed shape is linear in (Px, Py), animating that one force vector
//    animates the whole structure consistently. Numbers, diagrams and reactions
//    use the exact target instead, so the wobble never shows a wrong value.

export interface Vec2 { x: number; y: number }

export interface RopeForce {
  px: number
  py: number
  /** Magnitude (kN) */
  P: number
  /** Direction in degrees, CCW from +x (world axes, y up) */
  angleDeg: number
  /** Rope length from the original node position (world m) */
  ropeLen: number
  /** True when the rope is at or past the cap */
  capped: boolean
}

/** Angle-snap increment (degrees) when Shift is held or the snap toggle is on. */
export const SNAP_STEP_DEG = 45

export function ropeToForce(
  anchor: Vec2,
  cursor: Vec2,
  ropeCap: number,
  pMax: number,
  snap = false,
): RopeForce {
  const dx = cursor.x - anchor.x
  const dy = cursor.y - anchor.y
  const ropeLen = Math.hypot(dx, dy)
  if (ropeLen < 1e-12 || ropeCap <= 0) {
    return { px: 0, py: 0, P: 0, angleDeg: 0, ropeLen, capped: false }
  }
  let ang = Math.atan2(dy, dx)
  if (snap) {
    const step = (SNAP_STEP_DEG * Math.PI) / 180
    ang = Math.round(ang / step) * step
  }
  const capped = ropeLen >= ropeCap
  const P = pMax * Math.min(ropeLen / ropeCap, 1)
  // Snap away tiny round-off so 90° reads as exactly (0, P).
  const cx = Math.abs(Math.cos(ang)) < 1e-12 ? 0 : Math.cos(ang)
  const sy = Math.abs(Math.sin(ang)) < 1e-12 ? 0 : Math.sin(ang)
  let angleDeg = (ang * 180) / Math.PI
  if (Object.is(angleDeg, -0)) angleDeg = 0
  return { px: P * cx, py: P * sy, P, angleDeg, ropeLen, capped }
}

// ── Damped spring ────────────────────────────────────────────────────────────

export interface SpringParams {
  /** Natural frequency (Hz) */
  freq: number
  /** Damping ratio ζ (1 = critical, no overshoot) */
  zeta: number
}

/** The "squishy" default: a couple of visible wobbles that settle in about a second. */
export const SQUISHY_SPRING: SpringParams = { freq: 2.5, zeta: 0.12 }
/** Used when the viewer prefers reduced motion: follows the target without overshoot. */
export const CALM_SPRING: SpringParams = { freq: 4, zeta: 1 }

export interface SpringState {
  x: number
  y: number
  vx: number
  vy: number
}

export function newSpring(): SpringState {
  return { x: 0, y: 0, vx: 0, vy: 0 }
}

/** Largest frame gap honoured; a longer gap (tab in background) just resumes. */
const MAX_DT = 1 / 30
/** Internal substep: keeps semi-implicit Euler accurate at ω·h ≪ 1. */
const SUBSTEP = 1 / 240

/**
 * Advances the spring toward `target` by dt seconds (semi-implicit Euler with
 * fixed substeps, which is stable for these frequencies and never produces NaN).
 */
export function springStep(state: SpringState, target: Vec2, dt: number, params: SpringParams): void {
  const w = 2 * Math.PI * params.freq
  const w2 = w * w
  const c = 2 * params.zeta * w
  let remaining = Math.min(Math.max(dt, 0), MAX_DT)
  while (remaining > 1e-9) {
    const h = Math.min(SUBSTEP, remaining)
    state.vx += (w2 * (target.x - state.x) - c * state.vx) * h
    state.vy += (w2 * (target.y - state.y) - c * state.vy) * h
    state.x += state.vx * h
    state.y += state.vy * h
    remaining -= h
  }
}

/** Adds a velocity impulse so the spring overshoots by roughly `amplitude` along (dirX, dirY). */
export function springKick(state: SpringState, dirX: number, dirY: number, amplitude: number, params: SpringParams): void {
  const len = Math.hypot(dirX, dirY)
  if (len < 1e-12) return
  const v = amplitude * 2 * Math.PI * params.freq
  state.vx += (dirX / len) * v
  state.vy += (dirY / len) * v
}

/** True when the spring sits at the target and has (practically) stopped. */
export function springSettled(state: SpringState, target: Vec2, scale: number): boolean {
  const posTol = 1e-3 * scale
  const velTol = 1e-2 * scale
  return (
    Math.abs(state.x - target.x) < posTol &&
    Math.abs(state.y - target.y) < posTol &&
    Math.abs(state.vx) < velTol &&
    Math.abs(state.vy) < velTol
  )
}

/** Release fade for diagrams and numbers: 1 → 0 over `durationMs`, ease-out, no bounce. */
export function releaseFade(elapsedMs: number, durationMs: number): number {
  if (elapsedMs <= 0) return 1
  if (elapsedMs >= durationMs) return 0
  const t = elapsedMs / durationMs
  return (1 - t) * (1 - t)
}

/** What the Live side panel shows while (or just after) a node is pulled. */
export interface LiveReadout {
  nodeId: string
  /** Rope force (kN) and direction (degrees CCW from +x) */
  P: number
  angleDeg: number
  capped: boolean
  /** Real displacement of the pulled node (m) */
  u: number
  v: number
  /** Largest |value| of the selected diagram, with its sign (kN or kN·m); null when none selected */
  peak: number | null
  /** Global equilibrium residual: rope force plus all reactions (≈ 0) */
  eq: { Fx: number; Fy: number; M: number }
}

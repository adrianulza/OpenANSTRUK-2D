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

/** What the Live controls show while a node is pulled (the equilibrium chip). */
export interface LiveReadout {
  nodeId: string
  /** Rope force magnitude (kN) */
  P: number
  /** Global equilibrium residual: rope force plus all reactions (≈ 0) */
  eq: { Fx: number; Fy: number; M: number }
}

// ── Tuned motion (chosen in the Live Mode Studies wobble tuner) ──────────────

/** The frame's wobble: a stiff, quick spring that still rings a little. */
export const LIVE_SPRING: SpringParams = { freq: 3, zeta: 0.4 }

/** Every other motion constant, in one place so the feel can be retuned. */
export const LIVE_MOTION = {
  /** While a node is held the spring runs this much faster, so the frame sticks to the hand. */
  followWhileHeld: 1.25,
  /** Overshoot (kN) added when the rope reaches the cap, so the limit feels like a stop. */
  capBump: 15,
  /** Extra speed on release, as a multiple of the spring's natural speed: throws the frame past rest. */
  releaseFling: 2,
  /** Grabbed-node pop: peak extra radius as a multiple of the node radius. */
  nodePop: 2,
  /** Ripple ring radius (px) spreading from the node on grab and release. */
  ripplePx: 30,
  rippleMs: 650,
  /** Diagram grows out of the member on grab (ease-out, no overshoot)... */
  growMs: 100,
  /** ...and snaps back into it on release (ease-in with a small wind-up). */
  retractMs: 200,
  /** Time constants (s) for exponential easing. */
  reactionTau: 0.05,
  countTau: 0.25,
  arrowTau: 0.15,
  /** Diagram morph when switching Axial / Shear / Moment. */
  morphMs: 420,
  /** Entrance: the frame drops onto its supports, then the grab rings pop in. */
  entryDropPx: 120,
  entryMs: 700,
} as const

export const easeOutCubic = (x: number) => 1 - (1 - x) ** 3
export const easeInOutCubic = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2)
export const easeOutBack = (x: number, k = 1.7) => 1 + (k + 1) * (x - 1) ** 3 + k * (x - 1) ** 2
export const easeInBack = (x: number, k = 1.7) => (k + 1) * x ** 3 - k * x * x
export function easeOutBounce(x: number): number {
  const n = 7.5625, d = 2.75
  if (x < 1 / d) return n * x * x
  if (x < 2 / d) { x -= 1.5 / d; return n * x * x + 0.75 }
  if (x < 2.5 / d) { x -= 2.25 / d; return n * x * x + 0.9375 }
  x -= 2.625 / d
  return n * x * x + 0.984375
}
export const clamp01 = (x: number) => Math.max(0, Math.min(1, x))

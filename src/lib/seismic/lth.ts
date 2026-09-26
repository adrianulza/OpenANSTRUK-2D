/**
 * Linear time history — direct integration under a ground-motion record along
 * global X. The 2D counterpart of OpenANSTRUK-3D's `lth.ts`.
 *
 * The procedure:
 *   1. Retained system: the massed free DOFs, exactly the modal pass's
 *      condensed problem (K̂, lumped M). Condensation is exact because every
 *      DOF with mass is retained; the massless ones follow statically.
 *   2. Rayleigh damping C = αM + βK, ζ fitted exactly at T₁ and at the mode
 *      where the cumulative X mass first reaches 90 % (`rayleighFitModes`).
 *   3. Newmark-β (average acceleration by default) at the record step, or at
 *      a user Δt with the record resampled. p(t) = −M·ι·ag(t), ι = 1 on u.
 *   4. Recovery per step: u_m(t) → full d(t) = [u_m, −X·u_m] → member end
 *      forces and reactions through the static solver's own recovery. Every
 *      step folds into the envelope; a thinned set of frames is kept so any
 *      instant can be drawn later.
 *
 * ⚠ R, Cd, Ie AND THE DESIGN SPECTRUM ARE NOT APPLIED — the record × scale is
 * the input, as in reference software's linear direct-integration case.
 *
 * ⚠ THE CASE RESULT IS THE SIGNED PEAK ENVELOPE: each quantity takes its value
 * at the instant of largest magnitude. The MRS convention, so the ±E
 * combinations bracket the response and diagrams keep a sign.
 *
 * Displacements are RELATIVE to the ground. Member forces are elastic (K·u).
 */

import type { NodeId, StructureModel } from "../model"
import { recoverResults, type AnalysisResult, type MemberEndForces } from "../solver"
import { lthSettingsOf, type SeismicDefinition } from "./definition"
import { recordAccelerations, resampleUniform, type GroundMotionRecord } from "./ground-motion"
import type { ModalSolution } from "./modal"
import { newmarkIssues, newmarkLinear, rayleighCoefficients } from "./newmark"

type ModalOk = Extract<ModalSolution, { ok: true }>

/** Frames kept for drawing the response at an instant. */
const MAX_FRAMES = 400

export interface LthFrame {
  t: number
  /** Retained (massed-DOF) displacements at this instant. */
  um: Float64Array
}

export interface LthRun {
  result: AnalysisResult
  record: GroundMotionRecord
  dt: number
  steps: number
  duration: number
  /** Peak |ag|, m/s², after scale and unit. */
  pga: number
  zeta: number
  alpha: number
  betaR: number
  /** Periods the Rayleigh fit is exact at, s (see `rayleighFitModes`). */
  T1: number
  T2: number
  /** Mode numbers of those two periods. */
  fitModes: [number, number]
  /** Roof node: the highest node (the first one found on a tie). */
  roofNodeId: NodeId
  /** Roof displacement u(t), m, every integration step. */
  roofU: Float64Array
  /** Base shear V(t) = −ΣRx, kN, every integration step. */
  baseShear: Float64Array
  peakRoof: { value: number; t: number }
  peakBase: { value: number; t: number }
  frames: LthFrame[]
  issues: string[]
}

export type LthOutcome = { ok: true; run: LthRun } | { ok: false; reason: string }

/** Full global displacement vector from the retained one. */
function expand(modal: ModalOk, um: Float64Array): number[] {
  const { mDofs, oDofs, X } = modal.condensed
  const d = new Array<number>(modal.system.ndof).fill(0)
  const nm = mDofs.length
  for (let a = 0; a < nm; a++) d[mDofs[a]] = um[a]
  for (let r = 0; r < oDofs.length; r++) {
    let s = 0
    const row = r * nm
    for (let b = 0; b < nm; b++) s -= X[row + b] * um[b]
    d[oDofs[r]] = s
  }
  return d
}

/** The full response at a kept frame — for drawing one instant. */
export function lthFrameResult(
  model: StructureModel,
  modal: ModalOk,
  frame: LthFrame,
): AnalysisResult {
  return recoverResults(model, modal.system, expand(modal, frame.um))
}

const EF_KEYS: (keyof MemberEndForces)[] = ["N1", "V1", "M1", "N2", "V2", "M2"]

/**
 * The two modes the Rayleigh damping is fitted at: mode 1 (the longest
 * period) and the first mode at which the cumulative X participation reaches
 * 90 %, the usual reference software / reference software practice. With C = αM + βK the damping is
 * exactly ζ at both, a little below ζ between them and above it outside, so
 * the modes that carry the response are damped close to the target.
 *
 * ⚠ NOT THE SHORTEST PERIOD. Without a diaphragm a plane frame keeps its
 * axial column modes, at periods two orders below T₁; fitting there leaves the
 * intermediate lateral modes at a fraction of ζ (2.4 % instead of 5 % at mode 2
 * of the default portal).
 *
 * When mode 1 alone reaches 90 %, the second point is the next mode that
 * moves any X mass, else simply mode 2. A single-mode system gets mass-
 * proportional damping only (`second` undefined).
 */
export function rayleighFitModes(modal: ModalOk): {
  first: ModalOk["modes"][number]
  second?: ModalOk["modes"][number]
} {
  const modes = modal.modes
  const first = modes[0]
  if (modes.length < 2) return { first }
  let second = modes.find((m) => m.cumX >= 0.9 - 1e-9)
  if (!second || second === first) {
    second = modes.slice(1).find((m) => m.ratioX > 1e-4) ?? modes[1]
  }
  return { first, second }
}

export function runLth(
  model: StructureModel,
  def: SeismicDefinition,
  modal: ModalOk,
  record: GroundMotionRecord,
): LthOutcome {
  const set = lthSettingsOf(def)
  const issues: string[] = []
  const { mDofs, K } = modal.condensed
  const nm = mDofs.length
  const m = Float64Array.from(mDofs, (k) => modal.mass[k])
  const isX = mDofs.map((k) => k % 3 === 0)
  if (!isX.some(Boolean)) {
    return { ok: false, reason: "No mass is free to move along X — every massed node is restrained horizontally." }
  }

  // Ground acceleration, m/s², on the integration step.
  const dt = set.dt ?? record.dt
  const agRaw = recordAccelerations(record, set.scale, { unit: set.unit })
  const ag = resampleUniform(agRaw, record.dt, dt)
  const steps = ag.length
  let pga = 0
  for (let i = 0; i < steps; i++) pga = Math.max(pga, Math.abs(ag[i]))

  const fit = rayleighFitModes(modal)
  const w1 = fit.first.omega
  const w2 = fit.second?.omega
  const { alpha, beta: betaR } =
    w2 !== undefined
      ? rayleighCoefficients(set.dampingRatio, w1, w2)
      : { alpha: 2 * set.dampingRatio * w1, beta: 0 }
  // Stability is a question about the stiffest mode, not the fitted pair.
  const wn = Math.max(...modal.modes.map((md) => md.omega))

  const gamma = set.gamma ?? 0.5
  const beta = set.beta ?? 0.25
  issues.push(...newmarkIssues(gamma, beta, dt, wn))

  const a0 = new Float64Array(nm)
  for (let a = 0; a < nm; a++) if (isX[a]) a0[a] = -ag[0]
  const out = newmarkLinear(
    K,
    m,
    { alpha, beta: betaR },
    steps,
    (s, p) => {
      for (let a = 0; a < nm; a++) p[a] = isX[a] ? -m[a] * ag[s] : 0
    },
    dt,
    { gamma, beta, a0 },
  )
  if (!out.ok) return out

  // Roof: the highest node; the u DOF of it.
  let roofNodeId = modal.system.nodeList[0]
  for (const id of modal.system.nodeList) {
    if (model.nodes[id].y > model.nodes[roofNodeId].y) roofNodeId = id
  }
  const roofDof = 3 * modal.system.nodeIdx[roofNodeId]

  const roofU = new Float64Array(steps)
  const baseShear = new Float64Array(steps)
  const every = Math.max(1, Math.ceil(steps / MAX_FRAMES))
  const frames: LthFrame[] = []

  // Envelope: the signed value at the instant of largest magnitude.
  let env: AnalysisResult | null = null
  const pick = (cur: number, v: number) => (Math.abs(v) > Math.abs(cur) ? v : cur)

  for (let s = 0; s < steps; s++) {
    const um = out.u[s]
    const d = expand(modal, um)
    const r = recoverResults(model, modal.system, d)
    roofU[s] = d[roofDof]
    let sumRx = 0
    for (const rc of Object.values(r.reactions)) sumRx += rc.Rx
    baseShear[s] = -sumRx
    if (s % every === 0 || s === steps - 1) frames.push({ t: s * dt, um })

    if (!env) {
      env = r
      continue
    }
    for (const [id, nd] of Object.entries(r.nodeDisplacements)) {
      const e = env.nodeDisplacements[id]
      e.u = pick(e.u, nd.u)
      e.v = pick(e.v, nd.v)
      e.theta = pick(e.theta, nd.theta)
    }
    for (const [id, ef] of Object.entries(r.memberEndForces)) {
      const e = env.memberEndForces[id]
      for (const k of EF_KEYS) e[k] = pick(e[k], ef[k])
    }
    for (const [id, rc] of Object.entries(r.reactions)) {
      const e = env.reactions[id]
      e.Rx = pick(e.Rx, rc.Rx)
      e.Ry = pick(e.Ry, rc.Ry)
      e.Mz = pick(e.Mz, rc.Mz)
    }
  }

  const peak = (h: Float64Array) => {
    let value = 0
    let t = 0
    for (let i = 0; i < h.length; i++) {
      if (Math.abs(h[i]) > Math.abs(value)) {
        value = h[i]
        t = i * dt
      }
    }
    return { value, t }
  }

  return {
    ok: true,
    run: {
      result: env!,
      record,
      dt,
      steps,
      duration: (steps - 1) * dt,
      pga,
      zeta: set.dampingRatio,
      alpha,
      betaR,
      T1: (2 * Math.PI) / w1,
      T2: w2 !== undefined ? (2 * Math.PI) / w2 : (2 * Math.PI) / w1,
      fitModes: [fit.first.index, fit.second?.index ?? fit.first.index],
      roofNodeId,
      roofU,
      baseShear,
      peakRoof: peak(roofU),
      peakBase: peak(baseShear),
      frames,
      issues,
    },
  }
}

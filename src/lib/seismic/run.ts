/**
 * Earthquake load cases for the plane frame: static equivalent (ELF, §12.8) and
 * modal response spectrum (MRS, §12.9.1). ASCE 7-16 and SNI 1726:2019 share
 * these clauses (SNI §7.8 and §7.9.1).
 *
 * The earthquake always acts along global X — the frame's own plane.
 *
 * ⚠ WHICH PROCEDURE IS THE ENGINEER'S DECISION. Table 12.6-1 (SNI Tabel 16)
 * limits ELF by SDC, period and irregularity, but irregularity is a judgement
 * the model cannot make, so the tool does not rule on it either way: both
 * procedures always run as chosen, and nothing here says "not permitted".
 *
 * ELF, per node rather than per storey:
 *   F_i = V · w_i·h_i^k / Σ w·h^k,   V = Cs·W
 * where h is measured from the base (the lowest support). When the nodes of a
 * floor share one elevation this is exactly the storey distribution of
 * Eq. 12.8-11/12, split between that floor's nodes in proportion to weight; it
 * also stays meaningful for a pitched roof or a frame with no clear floors.
 *
 * MRS: every mode of the modal pass, with
 *   A_i = Sa(T_i)·g·Ie/R           (design pseudo-acceleration, m/s²)
 *   d_i = Γx_i·A_i/ω_i² · φ_i      (modal displacement, all DOFs)
 * Member forces and reactions per mode are recovered from d_i with the static
 * solver's own element recovery, then combined by CQC. Base shear is scaled up
 * to the ELF value where it falls short (§12.9.1.4.1, SNI §7.9.1.4.1); drifts
 * are scaled only where Cs was set by Eq. 12.8-6 (§12.9.1.4.2).
 */

import type { NodeId, PointLoad, StructureModel } from "../model"
import type { LoadCaseId } from "../load-cases"
import {
  memberInternalForces,
  recoverResults,
  STATION_COUNT,
  stationCorrection,
  stationX,
  type AnalysisResult,
  type MemberEndForces,
} from "../solver"
import type { SeismicDefinition } from "./definition"
import { siteCoefficients, siteSpecificNote } from "./site"
import { designAccelerations, spectrumCorners, spectralAcceleration } from "./spectrum"
import { approximatePeriod, cuFactor, governingPeriod, type PeriodSource } from "./period"
import { kExponent, seismicCoefficient, type CsGoverning } from "./elf"
import { seismicDesignCategory, type SDC } from "./sdc"
import { GRAVITY, type MassReport } from "./mass"
import { dominantModeX, type ModalSolution } from "./modal"

type ModalOk = Extract<ModalSolution, { ok: true }>

// ── The coefficient ladder (no weight, no solve) ─────────────────────────────

export interface SeismicLadder {
  Fa: number
  Fv: number
  siteSpecific: ("Fa" | "Fv")[]
  SMS: number
  SM1: number
  SDS: number
  SD1: number
  T0: number
  Ts: number
  sdc: SDC
  /** Height of the structure above the base, m. */
  hn: number
  Ct: number
  x: number
  Ta: number
  Cu: number
  cuTa: number
  /** The design period used for Cs. */
  T: number
  periodSource: PeriodSource
  Cs: number
  csGoverning: CsGoverning
  CsMax: number
  CsMin: number
  k: number
  siteNote: string | null
}

/** Elevation of the base: the lowest supported node. */
export function baseElevation(model: StructureModel): number {
  let base = Infinity
  for (const s of Object.values(model.supports)) {
    const n = model.nodes[s.nodeId]
    if (n) base = Math.min(base, n.y)
  }
  if (base === Infinity) {
    for (const n of Object.values(model.nodes)) base = Math.min(base, n.y)
  }
  return base === Infinity ? 0 : base
}

export function structureHeight(model: StructureModel): number {
  const base = baseElevation(model)
  let top = base
  for (const n of Object.values(model.nodes)) top = Math.max(top, n.y)
  return top - base
}

/**
 * Everything the dialog shows that does not need the weight or a solve. Cheap,
 * so the dialog recomputes it on every keystroke. `computedT` is the modal
 * period, when one exists.
 */
export function seismicLadder(
  model: StructureModel,
  def: SeismicDefinition,
  computedT?: number,
): SeismicLadder {
  const site = siteCoefficients(def.siteClass, def.Ss, def.S1, {
    code: def.code,
    FaOverride: def.FaOverride,
    FvOverride: def.FvOverride,
  })
  const acc = designAccelerations({ Ss: def.Ss, S1: def.S1, Fa: site.Fa, Fv: site.Fv })
  const { T0, Ts } = spectrumCorners(acc)
  const sdc = seismicDesignCategory({
    SDS: acc.SDS,
    SD1: acc.SD1,
    S1: def.S1,
    riskCategory: def.riskCategory,
  })
  const hn = structureHeight(model)
  const { Ct, x, Ta } = approximatePeriod(hn, def.system)
  const Cu = cuFactor(acc.SD1)
  const per = governingPeriod({ Ta, Cu, mode: def.periodMode, userT: def.userT, computedT })
  const cs = seismicCoefficient({
    SDS: acc.SDS,
    SD1: acc.SD1,
    S1: def.S1,
    TL: def.TL,
    T: per.T,
    R: def.R,
    Ie: def.Ie,
  })
  return {
    Fa: site.Fa,
    Fv: site.Fv,
    siteSpecific: site.siteSpecific.filter((f) => !site.overridden.includes(f)),
    SMS: acc.SMS,
    SM1: acc.SM1,
    SDS: acc.SDS,
    SD1: acc.SD1,
    T0,
    Ts,
    sdc: sdc.sdc,
    hn,
    Ct,
    x,
    Ta,
    Cu,
    cuTa: per.upperLimit,
    T: per.T,
    periodSource: per.source,
    Cs: cs.Cs,
    csGoverning: cs.governing,
    CsMax: cs.CsEq2,
    CsMin: cs.CsMin,
    k: kExponent(per.T),
    siteNote: siteSpecificNote(site, def.siteClass, def.code),
  }
}

// ── ELF ──────────────────────────────────────────────────────────────────────

export interface ElfNodeForce {
  nodeId: NodeId
  /** Height above base, m. */
  h: number
  /** Seismic weight at the node, kN. */
  w: number
  Cvx: number
  /** Lateral force, kN (+X). */
  Fx: number
}

export interface ElfRun {
  ladder: SeismicLadder
  /** Effective seismic weight above the base, kN. */
  W: number
  /** Weight lumped at base-level nodes — straight into the foundation, kN. */
  Wbase: number
  V: number
  forces: ElfNodeForce[]
}

const H_TOL = 1e-6

export function runElf(
  model: StructureModel,
  def: SeismicDefinition,
  mass: MassReport,
  computedT?: number,
): ElfRun {
  const ladder = seismicLadder(model, def, computedT)
  const base = baseElevation(model)
  const rows: { nodeId: NodeId; h: number; w: number }[] = []
  let W = 0
  let Wbase = 0
  for (const [id, w] of Object.entries(mass.nodeWeight)) {
    const n = model.nodes[id]
    if (!n) continue
    const h = n.y - base
    if (h <= H_TOL) {
      Wbase += w
      continue
    }
    rows.push({ nodeId: id, h, w })
    W += w
  }
  const V = ladder.Cs * W
  const whk = rows.map((r) => r.w * Math.pow(r.h, ladder.k))
  const sum = whk.reduce((a, b) => a + b, 0)
  const forces = rows.map((r, i) => {
    const Cvx = sum > 0 ? whk[i] / sum : 0
    return { ...r, Cvx, Fx: Cvx * V }
  })
  forces.sort((a, b) => b.h - a.h)
  return { ladder, W, Wbase, V, forces }
}

/** The ELF forces as point loads in the case's slice. Never persisted. */
export function elfLoads(run: ElfRun, caseId: LoadCaseId): PointLoad[] {
  return run.forces
    .filter((f) => f.Fx !== 0)
    .map((f) => ({
      id: `elf_${caseId}_${f.nodeId}`,
      type: "point",
      nodeId: f.nodeId,
      loadCaseId: caseId,
      fx: f.Fx,
      fy: 0,
    }))
}

export function memberLength(model: StructureModel, memberId: string): number {
  const m = model.members[memberId]
  const a = m && model.nodes[m.a]
  const b = m && model.nodes[m.b]
  return a && b ? Math.hypot(b.x - a.x, b.y - a.y) : 0
}

// ── CQC ──────────────────────────────────────────────────────────────────────

/** Der Kiureghian's CQC correlation coefficients for equal modal damping ζ. */
export function cqcRho(omegas: number[], zeta: number): number[][] {
  const n = omegas.length
  const rho = Array.from({ length: n }, () => new Array<number>(n).fill(0))
  for (let i = 0; i < n; i++) {
    rho[i][i] = 1
    for (let j = i + 1; j < n; j++) {
      const b = omegas[i] / omegas[j]
      const num = 8 * zeta * zeta * (1 + b) * Math.pow(b, 1.5)
      const den = (1 - b * b) ** 2 + 4 * zeta * zeta * b * (1 + b) ** 2
      const r = den > 0 ? num / den : 1
      rho[i][j] = r
      rho[j][i] = r
    }
  }
  return rho
}

/**
 * CQC of one response quantity, returned SIGNED: the magnitude is the CQC
 * value, the sign is that of the mode contributing most. A pure CQC is always
 * positive, and a member whose two end moments are both positive draws a
 * nonsense diagram; borrowing the dominant mode's sign keeps the diagram's
 * shape and lets the ±E combinations bracket the response as intended.
 */
function signedCqc(values: number[], rho: number[][]): number {
  const n = values.length
  let s = 0
  let dom = 0
  for (let i = 0; i < n; i++) {
    const vi = values[i]
    if (vi === 0) continue
    if (Math.abs(vi) > Math.abs(dom)) dom = vi
    const ri = rho[i]
    for (let j = 0; j < n; j++) s += ri[j] * vi * values[j]
  }
  const mag = Math.sqrt(Math.max(s, 0))
  return dom < 0 ? -mag : mag
}

// ── MRS ──────────────────────────────────────────────────────────────────────

export interface MrsModeRow {
  index: number
  T: number
  /** Sa(T)/g from the design spectrum, before R/Ie. */
  Sa: number
  /** Base shear of the mode, kN. */
  V: number
}

export interface MrsRun {
  result: AnalysisResult
  /** ELF run at the modal period (capped at Cu·Ta), for the scaling check. */
  elf: ElfRun
  /** CQC base shear before scaling, kN. */
  unscaledV: number
  /** Base shear after scaling, kN. */
  V: number
  scaleFactor: number
  /** Whether displacements were scaled too (Cs from Eq. 12.8-6 only). */
  driftsScaled: boolean
  modes: MrsModeRow[]
  massRatioX: number
}

export function runMrs(
  model: StructureModel,
  def: SeismicDefinition,
  mass: MassReport,
  modal: ModalOk,
): MrsRun {
  const T1 = dominantModeX(modal).T
  const elf = runElf(model, def, mass, T1)
  const { SDS, SD1 } = elf.ladder
  const { system } = modal
  const factor = (GRAVITY * def.Ie) / def.R

  // A mode with no X participation (Γx ≈ 0: the vertical beam modes of a
  // symmetric frame) has zero response to an X earthquake. Dropping it before
  // the O(n²) CQC changes nothing but the run time.
  const used = modal.modes.filter((m) => m.ratioX > 1e-10)

  const results: AnalysisResult[] = []
  const modes: MrsModeRow[] = []
  const Vs: number[] = []
  for (const m of used) {
    const Sa = spectralAcceleration(m.T, { SDS, SD1, TL: def.TL })
    const A = Sa * factor
    const q = (m.gammaX * A) / (m.omega * m.omega)
    const d = m.phi.map((p) => p * q)
    results.push(recoverResults(model, system, d))
    // Base shear of the mode = effective mass × pseudo-acceleration.
    const V = m.gammaX * m.gammaX * A
    Vs.push(V)
    modes.push({ index: m.index, T: m.T, Sa, V })
  }

  const rho = cqcRho(
    used.map((m) => m.omega),
    Math.min(Math.max(def.damping, 0), 0.99),
  )
  const unscaledV = Math.abs(signedCqc(Vs, rho))
  const scaleFactor = unscaledV > 0 && elf.V > unscaledV ? elf.V / unscaledV : 1
  const driftsScaled = elf.ladder.csGoverning === "12.8-6"
  const sd = driftsScaled ? scaleFactor : 1

  const combine = (pick: (r: AnalysisResult) => number, sf: number) =>
    signedCqc(results.map(pick), rho) * sf

  const first = results[0]
  const nodeDisplacements: AnalysisResult["nodeDisplacements"] = {}
  for (const id of Object.keys(first.nodeDisplacements)) {
    nodeDisplacements[id] = {
      u: combine((r) => r.nodeDisplacements[id].u, sd),
      v: combine((r) => r.nodeDisplacements[id].v, sd),
      theta: combine((r) => r.nodeDisplacements[id].theta, sd),
    }
  }
  const keys = ["N1", "V1", "M1", "N2", "V2", "M2"] as const
  const memberEndForces: AnalysisResult["memberEndForces"] = {}
  for (const id of Object.keys(first.memberEndForces)) {
    const ef: MemberEndForces = { N1: 0, V1: 0, M1: 0, N2: 0, V2: 0, M2: 0, q1: 0, q2: 0, qx1: 0, qx2: 0 }
    for (const k of keys) ef[k] = combine((r) => r.memberEndForces[id][k], scaleFactor)
    // CQC at every station, not only at the ends: a CQC is never negative, so
    // interpolating between two end values of opposite sign would cross a
    // zero that is not there and understate the moment near inflection points.
    const L = memberLength(model, id)
    if (L > 0) {
      const totals = { N: [] as number[], V: [] as number[], M: [] as number[] }
      for (let k = 0; k < STATION_COUNT; k++) {
        const x = stationX(L, k)
        const per = results.map((r) => memberInternalForces(r.memberEndForces[id], x, L))
        totals.N.push(signedCqc(per.map((f) => f.N), rho) * scaleFactor)
        totals.V.push(signedCqc(per.map((f) => f.V), rho) * scaleFactor)
        totals.M.push(signedCqc(per.map((f) => f.M), rho) * scaleFactor)
      }
      ef.stations = stationCorrection(ef, L, totals)
    }
    memberEndForces[id] = ef
  }
  const reactions: AnalysisResult["reactions"] = {}
  for (const id of Object.keys(first.reactions)) {
    reactions[id] = {
      Rx: combine((r) => r.reactions[id].Rx, scaleFactor),
      Ry: combine((r) => r.reactions[id].Ry, scaleFactor),
      Mz: combine((r) => r.reactions[id].Mz, scaleFactor),
    }
  }

  return {
    result: { ok: true, nodeDisplacements, memberEndForces, reactions },
    elf,
    unscaledV,
    V: unscaledV * scaleFactor,
    scaleFactor,
    driftsScaled,
    modes,
    massRatioX: modal.modes.length ? modal.modes[modal.modes.length - 1].cumX : 0,
  }
}

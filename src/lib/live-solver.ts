import type { StructureModel, NodeId } from "@/lib/model"
import {
  localStiffness,
  condensedTrussElement,
  transformMatrix,
  sectionShearRigidity,
  type AnalysisResult,
  type MemberEndForces,
  type NodeDisplacement,
} from "@/lib/solver"
import { dofToLocation } from "@/lib/analysis-diagnostics"

// ── Live solver ──────────────────────────────────────────────────────────────
//
// Live mode pulls ONE node with a rope, so the only load is a nodal force
// (Px, Py) whose value changes every frame. The structure does not change, so
// K is assembled and Cholesky-factored once when the tab opens. Because the
// analysis is linear, every response is a superposition of two unit cases per
// node:
//
//     response(Px, Py) = Px · response(Fx = 1) + Py · response(Fy = 1)
//
// A frame therefore costs a weighted sum of cached arrays and no matrix solve.
//
// Assembly mirrors analyze() in solver.ts exactly (DOF order, unit conversions,
// truss condensation, support rules, θ restraint at pure-truss nodes) and
// ignores every model load. live-solver.test.ts checks parity with analyze().

/** Rope force at the cap (kN). Fixed so students compare structures on one scale. */
export const LIVE_P_MAX = 100

/** Rope length (world m) at which the force reaches LIVE_P_MAX: a share of the model size. */
const CAP_FRACTION = 0.25
const CAP_MIN_M = 1

/** Stations per member used for the deformed-shape reference and drawing. */
export const LIVE_SPLINE_PTS = 24

/** Above this many grabbable nodes, the global reference scales use an even sample. */
const REF_SAMPLE_MAX = 80

type MemberData = {
  id: string
  a: string
  b: string
  ia: number
  ib: number
  L: number
  c: number
  s: number
  isTruss: boolean
  k: number[][]     // local 6×6 (condensed for trusses)
}

/** Unit-load responses for one node: index 0 = Fx = 1, index 1 = Fy = 1. */
export interface LiveUnitResponse {
  disp: [Float64Array, Float64Array]        // ndof, global [u, v, θ] per node
  endForces: [Float64Array, Float64Array]   // 6 per member: N1 V1 M1 N2 V2 M2
  reactions: [Float64Array, Float64Array]   // 3 per support: Rx Ry Mz
}

export interface LiveReferenceScales {
  /** Largest displacement magnitude anywhere (m) under LIVE_P_MAX in the worst direction. */
  disp: number
  /** Largest |N|, |V|, |M| anywhere under LIVE_P_MAX in the worst direction (kN, kN·m). */
  N: number
  V: number
  M: number
  /** Largest reaction component (kN or kN·m). */
  R: number
}

export interface LiveSystem {
  ok: true
  nodeIds: string[]
  nodeIndex: Record<string, number>
  members: MemberData[]
  supportNodeIds: string[]
  /** Nodes with at least one free translational DOF: the rope can attach there. */
  grabbable: Set<NodeId>
  /** Rope length at which the force reaches LIVE_P_MAX (world m). */
  ropeCap: number
  refs: LiveReferenceScales
  // Internals used by getUnitResponse
  ndof: number
  chol: Float64Array
  constrained: Uint8Array
  supportRows: Float64Array       // 3 rows of the unconstrained K per support
  unitCache: Map<NodeId, LiveUnitResponse>
}

export type LiveBuildResult =
  | LiveSystem
  | { ok: false; reason: string; nodeId?: NodeId; direction?: "u" | "v" | "θ" }

export interface LiveBuildOptions {
  shearDeformation?: boolean
}

export function buildLiveSystem(model: StructureModel, opts?: LiveBuildOptions): LiveBuildResult {
  const nodes = Object.values(model.nodes)
  const supports = Object.values(model.supports)

  if (nodes.length === 0) return { ok: false, reason: "No nodes to pull yet." }
  if (Object.keys(model.members).length === 0) return { ok: false, reason: "No members to pull yet." }
  const totalReactions = supports.reduce((sum, s) =>
    sum + (s.type === "fixed" ? 3 : s.type === "pin" ? 2 : 1), 0)
  if (totalReactions < 3) {
    return { ok: false, reason: "The structure needs at least 3 support reactions to stand." }
  }

  const n = nodes.length
  const ndof = 3 * n
  const nodeIds = nodes.map(nd => nd.id)
  const nodeIndex: Record<string, number> = {}
  nodeIds.forEach((id, i) => { nodeIndex[id] = i })

  // ── Assemble K (same element code as analyze) ──
  const K = new Float64Array(ndof * ndof)
  const members: MemberData[] = []
  for (const member of Object.values(model.members)) {
    const nA = model.nodes[member.a]
    const nB = model.nodes[member.b]
    const sec = model.sections[member.section]
    if (!nA || !nB || !sec) continue
    const ia = nodeIndex[member.a]
    const ib = nodeIndex[member.b]
    if (ia === undefined || ib === undefined) continue
    const dx = nB.x - nA.x
    const dy = nB.y - nA.y
    const L = Math.hypot(dx, dy)
    if (L < 1e-9) continue

    const E = sec.E * 1000        // MPa → kN/m²
    const EA = E * sec.A * 1e-6   // mm² → m²
    const EI = E * sec.I33 * 1e-12 // mm⁴ → m⁴
    const c = dx / L, s = dy / L
    const isTruss = member.memberType === "truss"
    const GAs = sectionShearRigidity(sec, opts?.shearDeformation)

    let k: number[][]
    if (isTruss) {
      const cond = condensedTrussElement(EA, EI, L, 0, 0, 0, 0, GAs)
      if (!cond) return { ok: false, reason: "A truss member has zero bending stiffness (EI must be > 0)." }
      k = cond.K_loc
    } else {
      k = localStiffness(EA, EI, L, GAs)
    }
    const T = transformMatrix(c, s)
    // Kg = Tᵀ k T
    const kT = mul6(k, T)
    const dofs = [3 * ia, 3 * ia + 1, 3 * ia + 2, 3 * ib, 3 * ib + 1, 3 * ib + 2]
    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < 6; j++) {
        let v = 0
        for (let m = 0; m < 6; m++) v += T[m][i] * kT[m][j]
        K[dofs[i] * ndof + dofs[j]] += v
      }
    }
    members.push({ id: member.id, a: member.a, b: member.b, ia, ib, L, c, s, isTruss, k })
  }

  // Keep the unconstrained rows of support DOFs for reaction recovery (R = K·d − F).
  const supportNodeIds: string[] = []
  const supportRowsList: number[] = []
  for (const sup of supports) {
    const i = nodeIndex[sup.nodeId]
    if (i === undefined) continue
    supportNodeIds.push(sup.nodeId)
    for (let r = 0; r < 3; r++) supportRowsList.push(3 * i + r)
  }
  const supportRows = new Float64Array(supportRowsList.length * ndof)
  supportRowsList.forEach((dof, r) => {
    supportRows.set(K.subarray(dof * ndof, (dof + 1) * ndof), r * ndof)
  })

  // ── Restraints (same rules as analyze) ──
  const constrained = new Uint8Array(ndof)
  for (const sup of supports) {
    const i = nodeIndex[sup.nodeId]
    if (i === undefined) continue
    if (sup.type === "pin" || sup.type === "fixed") constrained[3 * i] = 1
    constrained[3 * i + 1] = 1
    if (sup.type === "fixed") constrained[3 * i + 2] = 1
  }
  const frameConnected = new Set<string>()
  for (const mem of Object.values(model.members)) {
    if (mem.memberType !== "truss") {
      frameConnected.add(mem.a)
      frameConnected.add(mem.b)
    }
  }
  for (const id of nodeIds) {
    if (!frameConnected.has(id)) constrained[3 * nodeIndex[id] + 2] = 1
  }

  const chol = K // factor in place; the unconstrained rows were already copied
  for (let dof = 0; dof < ndof; dof++) {
    if (!constrained[dof]) continue
    for (let j = 0; j < ndof; j++) { chol[dof * ndof + j] = 0; chol[j * ndof + dof] = 0 }
    chol[dof * ndof + dof] = 1
  }

  // Per-DOF singularity tolerance, as in gaussSolve: compare each pivot against
  // the DOF's own (restrained) diagonal, not a global scale.
  const tol = new Float64Array(ndof)
  for (let i = 0; i < ndof; i++) tol[i] = Math.max(Math.abs(chol[i * ndof + i]), 1) * 1e-12

  const bad = choleskyInPlace(chol, ndof, tol)
  if (bad >= 0) {
    const loc = dofToLocation(bad, nodeIds)
    const dirWord = loc.direction === "θ" ? "rotate" : loc.direction === "u" ? "slide sideways" : "move vertically"
    return {
      ok: false,
      reason: `The structure is unstable: node ${loc.nodeId} can ${dirWord} freely. Add a support or member in the Model tab.`,
      nodeId: loc.nodeId,
      direction: loc.direction,
    }
  }

  const grabbable = new Set<NodeId>()
  for (const id of nodeIds) {
    const i = nodeIndex[id]
    if (!constrained[3 * i] || !constrained[3 * i + 1]) grabbable.add(id)
  }

  const extent = modelExtent(model)
  const sys: LiveSystem = {
    ok: true,
    nodeIds,
    nodeIndex,
    members,
    supportNodeIds,
    grabbable,
    ropeCap: Math.max(CAP_FRACTION * extent, CAP_MIN_M),
    refs: { disp: 0, N: 0, V: 0, M: 0, R: 0 },
    ndof,
    chol,
    constrained,
    supportRows,
    unitCache: new Map(),
  }
  sys.refs = computeReferenceScales(sys)
  return sys
}

/** Unit responses for a grabbable node (computed on first use, then cached). */
export function getUnitResponse(sys: LiveSystem, nodeId: NodeId): LiveUnitResponse | null {
  const cached = sys.unitCache.get(nodeId)
  if (cached) return cached
  const i = sys.nodeIndex[nodeId]
  if (i === undefined) return null
  const { ndof, members, supportRows, constrained } = sys
  const nSupRows = supportRows.length / ndof

  const one = (dir: 0 | 1) => {
    const loadDof = 3 * i + dir
    const d = new Float64Array(ndof)
    if (!constrained[loadDof]) {
      d[loadDof] = 1
      choleskySolveInPlace(sys.chol, ndof, d)
    }
    const ef = new Float64Array(6 * members.length)
    members.forEach((m, mi) => {
      const dl = localDisplacements(m, d)
      for (let r = 0; r < 6; r++) {
        let f = 0
        for (let q = 0; q < 6; q++) f += m.k[r][q] * dl[q]
        // Same sign mapping as analyze(): N1 = −f0, V1 = −f1, M1 = −f2, N2 = f3, V2 = f4, M2 = f5
        ef[6 * mi + r] = r < 3 ? -f : f
      }
    })
    const R = new Float64Array(nSupRows)
    for (let r = 0; r < nSupRows; r++) {
      let v = 0
      const row = r * ndof
      for (let j = 0; j < ndof; j++) v += supportRows[row + j] * d[j]
      // Only the loaded DOF carries external force; a load on a restrained DOF
      // (e.g. pulling a roller down) goes straight into its reaction.
      const sn = sys.nodeIndex[sys.supportNodeIds[Math.floor(r / 3)]]
      if (3 * sn + (r % 3) === loadDof) v -= 1
      R[r] = v
    }
    return { d, ef, R }
  }

  const x = one(0)
  const y = one(1)
  const resp: LiveUnitResponse = {
    disp: [x.d, y.d],
    endForces: [x.ef, y.ef],
    reactions: [x.R, y.R],
  }
  sys.unitCache.set(nodeId, resp)
  return resp
}

/** Superposes Px·(Fx = 1) + Py·(Fy = 1) into the same shape analyze() returns. */
export function evaluateLive(sys: LiveSystem, nodeId: NodeId, px: number, py: number): AnalysisResult | null {
  const u = getUnitResponse(sys, nodeId)
  if (!u) return null
  const [dx, dy] = u.disp
  const nodeDisplacements: Record<string, NodeDisplacement> = {}
  sys.nodeIds.forEach((id, i) => {
    nodeDisplacements[id] = {
      u: px * dx[3 * i] + py * dy[3 * i],
      v: px * dx[3 * i + 1] + py * dy[3 * i + 1],
      theta: px * dx[3 * i + 2] + py * dy[3 * i + 2],
    }
  })
  const [ex, ey] = u.endForces
  const memberEndForces: Record<string, MemberEndForces> = {}
  sys.members.forEach((m, mi) => {
    const o = 6 * mi
    const f = (r: number) => px * ex[o + r] + py * ey[o + r]
    memberEndForces[m.id] = {
      N1: f(0), V1: f(1), M1: f(2), N2: f(3), V2: f(4), M2: f(5),
      q1: 0, q2: 0, qx1: 0, qx2: 0,
    }
  })
  const [rx, ry] = u.reactions
  const reactions: Record<string, { Rx: number; Ry: number; Mz: number }> = {}
  sys.supportNodeIds.forEach((id, si) => {
    const o = 3 * si
    reactions[id] = {
      Rx: px * rx[o] + py * ry[o],
      Ry: px * rx[o + 1] + py * ry[o + 1],
      Mz: px * rx[o + 2] + py * ry[o + 2],
    }
  })
  return { ok: true, nodeDisplacements, memberEndForces, reactions }
}

/**
 * Residual of global equilibrium for the pulled structure: applied rope force
 * plus all reactions. ΣM is taken about the global origin (kN·m). A correct
 * solution gives values at round-off level.
 */
export function equilibriumResidual(
  model: StructureModel,
  result: AnalysisResult,
  nodeId: NodeId,
  px: number,
  py: number,
): { Fx: number; Fy: number; M: number } {
  const node = model.nodes[nodeId]
  let Fx = px, Fy = py
  let M = node ? node.x * py - node.y * px : 0
  for (const [id, r] of Object.entries(result.reactions)) {
    const nd = model.nodes[id]
    if (!nd) continue
    Fx += r.Rx
    Fy += r.Ry
    M += nd.x * r.Ry - nd.y * r.Rx + r.Mz
  }
  return { Fx, Fy, M }
}

/**
 * Global displacement of a point at fraction xi along a member, from the end
 * displacements. Frames use the cubic Hermite shape (as the Analyze tab draws);
 * trusses are pin-ended, so their axis stays straight between the joints.
 */
export function memberPointDisplacement(
  L: number, c: number, s: number, isTruss: boolean,
  dA: NodeDisplacement, dB: NodeDisplacement, xi: number,
): { dx: number; dy: number } {
  const u1 = c * dA.u + s * dA.v, v1 = -s * dA.u + c * dA.v
  const u2 = c * dB.u + s * dB.v, v2 = -s * dB.u + c * dB.v
  const uLoc = (1 - xi) * u1 + xi * u2
  let vLoc: number
  if (isTruss) {
    vLoc = (1 - xi) * v1 + xi * v2
  } else {
    const H1 = 1 - 3 * xi * xi + 2 * xi * xi * xi
    const H2 = L * xi * (1 - xi) * (1 - xi)
    const H3 = 3 * xi * xi - 2 * xi * xi * xi
    const H4 = L * xi * xi * (xi - 1)
    vLoc = H1 * v1 + H2 * dA.theta + H3 * v2 + H4 * dB.theta
  }
  return { dx: c * uLoc - s * vLoc, dy: s * uLoc + c * vLoc }
}

// ── Reference scales ─────────────────────────────────────────────────────────
//
// For a response pair (a, b) = (value per unit Fx, value per unit Fy), the
// largest |a·Px + b·Py| over all rope directions with |P| = P is P·√(a² + b²).
// For a displacement vector the worst direction gives P times the largest
// singular value of the 2×2 map [[ux_x, ux_y], [uy_x, uy_y]]. Both are closed
// form, so the frozen scales need no angle sweep.

function computeReferenceScales(sys: LiveSystem): LiveReferenceScales {
  const ids = [...sys.grabbable]
  const step = ids.length > REF_SAMPLE_MAX ? ids.length / REF_SAMPLE_MAX : 1
  const sample: string[] = []
  for (let f = 0; f < ids.length && sample.length < REF_SAMPLE_MAX; f += step) sample.push(ids[Math.floor(f)])

  let disp = 0, N = 0, V = 0, M = 0, R = 0
  for (const id of sample) {
    const u = getUnitResponse(sys, id)
    if (!u) continue
    const [dx, dy] = u.disp
    const at = (arr: Float64Array, i: number): NodeDisplacement =>
      ({ u: arr[3 * i], v: arr[3 * i + 1], theta: arr[3 * i + 2] })

    for (const m of sys.members) {
      const ax = at(dx, m.ia), bx = at(dx, m.ib)
      const ay = at(dy, m.ia), by = at(dy, m.ib)
      for (let p = 0; p <= LIVE_SPLINE_PTS; p++) {
        const xi = p / LIVE_SPLINE_PTS
        const px = memberPointDisplacement(m.L, m.c, m.s, m.isTruss, ax, bx, xi)
        const py = memberPointDisplacement(m.L, m.c, m.s, m.isTruss, ay, by, xi)
        disp = Math.max(disp, maxSingular2(px.dx, py.dx, px.dy, py.dy))
      }
    }

    const [ex, ey] = u.endForces
    for (let mi = 0; mi < sys.members.length; mi++) {
      const o = 6 * mi
      // No distributed load in Live, so N and V are constant and M is linear
      // along a member: the end values are the extremes.
      N = Math.max(N, Math.hypot(ex[o], ey[o]), Math.hypot(ex[o + 3], ey[o + 3]))
      V = Math.max(V, Math.hypot(ex[o + 1], ey[o + 1]), Math.hypot(ex[o + 4], ey[o + 4]))
      M = Math.max(M, Math.hypot(ex[o + 2], ey[o + 2]), Math.hypot(ex[o + 5], ey[o + 5]))
    }
    const [rx, ry] = u.reactions
    for (let r = 0; r < rx.length; r++) R = Math.max(R, Math.hypot(rx[r], ry[r]))
  }
  return {
    disp: disp * LIVE_P_MAX,
    N: N * LIVE_P_MAX,
    V: V * LIVE_P_MAX,
    M: M * LIVE_P_MAX,
    R: R * LIVE_P_MAX,
  }
}

/** Largest singular value of [[a, b], [c, d]]. */
function maxSingular2(a: number, b: number, c: number, d: number): number {
  const s1 = a * a + b * b + c * c + d * d
  const det = a * d - b * c
  const disc = Math.sqrt(Math.max(s1 * s1 - 4 * det * det, 0))
  return Math.sqrt((s1 + disc) / 2)
}

function modelExtent(model: StructureModel): number {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const nd of Object.values(model.nodes)) {
    minX = Math.min(minX, nd.x); maxX = Math.max(maxX, nd.x)
    minY = Math.min(minY, nd.y); maxY = Math.max(maxY, nd.y)
  }
  if (!Number.isFinite(minX)) return 0
  return Math.max(maxX - minX, maxY - minY)
}

// ── Dense Cholesky (row-major Float64Array) ──────────────────────────────────

/** Factors A = L·Lᵀ in place (lower triangle). Returns the first failing DOF, or −1. */
function choleskyInPlace(A: Float64Array, n: number, tol: Float64Array): number {
  for (let j = 0; j < n; j++) {
    const rj = j * n
    let d = A[rj + j]
    for (let k = 0; k < j; k++) d -= A[rj + k] * A[rj + k]
    if (!(d > tol[j])) return j
    const ljj = Math.sqrt(d)
    A[rj + j] = ljj
    for (let i = j + 1; i < n; i++) {
      const ri = i * n
      let v = A[ri + j]
      for (let k = 0; k < j; k++) v -= A[ri + k] * A[rj + k]
      A[ri + j] = v / ljj
    }
  }
  return -1
}

/** Solves L·Lᵀ·x = b in place (b becomes x). */
function choleskySolveInPlace(Lm: Float64Array, n: number, b: Float64Array): void {
  for (let i = 0; i < n; i++) {
    const ri = i * n
    let v = b[i]
    for (let k = 0; k < i; k++) v -= Lm[ri + k] * b[k]
    b[i] = v / Lm[ri + i]
  }
  for (let i = n - 1; i >= 0; i--) {
    let v = b[i]
    for (let k = i + 1; k < n; k++) v -= Lm[k * n + i] * b[k]
    b[i] = v / Lm[i * n + i]
  }
}

function localDisplacements(m: MemberData, d: Float64Array): number[] {
  const { c, s } = m
  const a = 3 * m.ia, b = 3 * m.ib
  return [
    c * d[a] + s * d[a + 1],
    -s * d[a] + c * d[a + 1],
    d[a + 2],
    c * d[b] + s * d[b + 1],
    -s * d[b] + c * d[b + 1],
    d[b + 2],
  ]
}

function mul6(A: number[][], B: number[][]): number[][] {
  const C = Array.from({ length: 6 }, () => new Array(6).fill(0))
  for (let i = 0; i < 6; i++)
    for (let k = 0; k < 6; k++) {
      const a = A[i][k]
      if (a === 0) continue
      for (let j = 0; j < 6; j++) C[i][j] += a * B[k][j]
    }
  return C
}

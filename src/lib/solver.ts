import type { StructureModel } from "@/lib/model"

export interface MemberEndForces {
  N1: number; V1: number; M1: number   // at node-A end, kN / kN·m
  N2: number; V2: number; M2: number   // at node-B end
  q1: number; q2: number               // local-y distributed load kN/m
}

export interface NodeDisplacement { u: number; v: number; theta: number }

export interface AnalysisResult {
  ok: true
  nodeDisplacements: Record<string, NodeDisplacement>
  memberEndForces:   Record<string, MemberEndForces>
  reactions:         Record<string, { Rx: number; Ry: number; Mz: number }>
}

export type SolverResult = AnalysisResult | { ok: false; reason: string }

// ── Linear algebra helpers ────────────────────────────────────────────────────

function matMul(A: number[][], B: number[][]): number[][] {
  const m = A.length, n = B.length, p = B[0].length
  const C = Array.from({ length: m }, () => new Array(p).fill(0))
  for (let i = 0; i < m; i++)
    for (let k = 0; k < n; k++)
      for (let j = 0; j < p; j++)
        C[i][j] += A[i][k] * B[k][j]
  return C
}

function transpose(A: number[][]): number[][] {
  const m = A.length, n = A[0].length
  return Array.from({ length: n }, (_, i) =>
    Array.from({ length: m }, (_, j) => A[j][i])
  )
}

function matVec(A: number[][], v: number[]): number[] {
  return A.map(row => row.reduce((s, a, j) => s + a * v[j], 0))
}

function gaussSolve(K: number[][], F: number[]): number[] | null {
  const n = K.length
  const A = K.map((row, i) => [...row, F[i]])
  for (let col = 0; col < n; col++) {
    let maxRow = col
    let maxVal = Math.abs(A[col][col])
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(A[row][col]) > maxVal) {
        maxVal = Math.abs(A[row][col])
        maxRow = row
      }
    }
    if (maxVal < 1e-30) return null
    if (maxRow !== col) [A[col], A[maxRow]] = [A[maxRow], A[col]]
    const pivot = A[col][col]
    for (let row = col + 1; row < n; row++) {
      const f = A[row][col] / pivot
      for (let j = col; j <= n; j++) A[row][j] -= f * A[col][j]
    }
  }
  const x = new Array(n).fill(0)
  for (let i = n - 1; i >= 0; i--) {
    x[i] = A[i][n]
    for (let j = i + 1; j < n; j++) x[i] -= A[i][j] * x[j]
    x[i] /= A[i][i]
  }
  return x
}

// ── Local stiffness and transformation ───────────────────────────────────────

function localStiffness(EA: number, EI: number, L: number): number[][] {
  return [
    [ EA/L,        0,            0,       -EA/L,       0,            0          ],
    [ 0,           12*EI/L**3,   6*EI/L**2, 0,        -12*EI/L**3,  6*EI/L**2  ],
    [ 0,           6*EI/L**2,    4*EI/L,    0,         -6*EI/L**2,  2*EI/L     ],
    [-EA/L,        0,            0,        EA/L,        0,            0          ],
    [ 0,          -12*EI/L**3,  -6*EI/L**2, 0,         12*EI/L**3, -6*EI/L**2  ],
    [ 0,           6*EI/L**2,    2*EI/L,    0,         -6*EI/L**2,  4*EI/L     ],
  ]
}

// Truss element: axial-only, no bending rows/cols (still 6×6 so transform is identical).
function trussLocalStiffness(EA: number, L: number): number[][] {
  return [
    [ EA/L, 0, 0, -EA/L, 0, 0],
    [ 0,    0, 0,  0,    0, 0],
    [ 0,    0, 0,  0,    0, 0],
    [-EA/L, 0, 0,  EA/L, 0, 0],
    [ 0,    0, 0,  0,    0, 0],
    [ 0,    0, 0,  0,    0, 0],
  ]
}

// Transforms local → global DOFs. c=cos(α), s=sin(α), α=atan2(dy,dx).
function transformMatrix(c: number, s: number): number[][] {
  return [
    [ c,  s, 0,  0,  0, 0],
    [-s,  c, 0,  0,  0, 0],
    [ 0,  0, 1,  0,  0, 0],
    [ 0,  0, 0,  c,  s, 0],
    [ 0,  0, 0, -s,  c, 0],
    [ 0,  0, 0,  0,  0, 1],
  ]
}

// Fixed-end force vector (local frame) for trapezoidal load q1→q2 (kN/m, local-y positive).
function fixedEndForces(q1: number, q2: number, L: number): number[] {
  return [
    0,
    L * (7*q1 + 3*q2) / 20,
    L*L * (3*q1 + 2*q2) / 60,
    0,
    L * (3*q1 + 7*q2) / 20,
    -L*L * (2*q1 + 3*q2) / 60,
  ]
}

// ── Main solver ───────────────────────────────────────────────────────────────

export function analyze(model: StructureModel): SolverResult {
  const nodes   = Object.values(model.nodes)
  const members = Object.values(model.members)
  const supports = Object.values(model.supports)
  const loads   = Object.values(model.loads)

  const totalReactions = supports.reduce((sum, s) =>
    sum + (s.type === "fixed" ? 3 : s.type === "pin" ? 2 : 1), 0)
  if (totalReactions < 3)     return { ok: false, reason: "Need at least 3 reaction components" }
  if (nodes.length === 0)     return { ok: false, reason: "No nodes" }
  if (members.length === 0)   return { ok: false, reason: "No members" }

  const n    = nodes.length
  const ndof = 3 * n

  // Node → DOF index mapping (deterministic ordering)
  const nodeList = nodes.map(nd => nd.id)
  const nodeIdx: Record<string, number> = {}
  nodeList.forEach((id, i) => { nodeIdx[id] = i })

  // Global stiffness K and load vector F
  const K: number[][] = Array.from({ length: ndof }, () => new Array(ndof).fill(0))
  const F: number[]   = new Array(ndof).fill(0)

  // Per-member FEF storage (needed for element force recovery)
  const fefStore: Record<string, number[]> = {}

  // Assemble K and F from element contributions
  for (const member of members) {
    const nA = model.nodes[member.a]
    const nB = model.nodes[member.b]
    const sec = model.sections[member.section]
    if (!nA || !nB || !sec) continue

    const ia = nodeIdx[member.a]
    const ib = nodeIdx[member.b]
    if (ia === undefined || ib === undefined) continue

    const dx = nB.x - nA.x
    const dy = nB.y - nA.y
    const L  = Math.hypot(dx, dy)
    if (L < 1e-9) continue

    // Convert to kN, m
    const E  = sec.E * 1000        // MPa → kN/m²
    const I  = sec.I33 * 1e-12     // mm⁴ → m⁴ (strong-axis bending)
    const Ar = sec.A * 1e-6        // mm² → m²
    const EA = E * Ar
    const EI = E * I

    const c = dx / L, s = dy / L
    const isTruss = member.memberType === "truss"
    const k = isTruss ? trussLocalStiffness(EA, L) : localStiffness(EA, EI, L)
    const T = transformMatrix(c, s)
    const Tt = transpose(T)
    const Kg = matMul(Tt, matMul(k, T))   // global element stiffness

    const dofs = [3*ia, 3*ia+1, 3*ia+2, 3*ib, 3*ib+1, 3*ib+2]
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        K[dofs[i]][dofs[j]] += Kg[i][j]

    // Distributed load on this member (truss elements carry no transverse load).
    // Positive local-axis w acts in the +local-2 direction (= local-1 rotated +90° CCW).
    // No quadrant flip — the same single rule for every member orientation.
    let q1 = 0, q2 = 0
    let qx1 = 0, qx2 = 0  // axial components (local-x)
    if (!isTruss) {
      for (const load of loads) {
        if (load.type === "distributed" && load.memberId === member.id) {
          const mode = load.mode ?? "local-axis"
          if (mode === "local-axis") {
            q1 = load.wStart ?? 0; q2 = load.wEnd ?? 0
          } else {
            // Global-axis mode: project global X,Y components onto local axes
            // Local-1: (c, s); Local-2: (-s, c)
            const qxStart = load.wxStart ?? 0, qxEnd = load.wxEnd ?? 0
            const qyStart = load.wyStart ?? 0, qyEnd = load.wyEnd ?? 0
            qx1 = qxStart * c + qyStart * s  // axial component at start
            qx2 = qxEnd * c + qyEnd * s      // axial component at end
            q1 = -qxStart * s + qyStart * c  // +local-2 component at start
            q2 = -qxEnd * s + qyEnd * c      // +local-2 component at end
          }
          break
        }
      }
    }

    const FEF = fixedEndForces(q1, q2, L)
    fefStore[member.id] = FEF

    const FEF_global = matVec(Tt, FEF)
    for (let i = 0; i < 6; i++) F[dofs[i]] += FEF_global[i]

    // Add axial distributed load as equivalent point loads at nodes
    if (!isTruss && (Math.abs(qx1) > 1e-12 || Math.abs(qx2) > 1e-12)) {
      // For uniform/linear distributed axial load, apply equivalent loads at nodes
      // For simplicity: half of total axial load goes to each node
      const avgQx = (qx1 + qx2) / 2
      const totalAxialLoad = avgQx * L
      const axialAtA = totalAxialLoad / 2
      const axialAtB = totalAxialLoad / 2
      F[3*ia] += axialAtA * c        // x-component (in global coords)
      F[3*ia + 1] += axialAtA * s    // y-component
      F[3*ib] += axialAtB * c
      F[3*ib + 1] += axialAtB * s
    }
  }

  // Point loads — global axis components
  for (const load of loads) {
    if (load.type !== "point") continue
    const i = nodeIdx[load.nodeId]
    if (i === undefined) continue
    F[3*i]     += load.fx   // Fx, positive = rightward
    F[3*i + 1] += load.fy   // Fy, positive = upward
  }

  // Save unmodified K and F for reaction recovery
  const K_orig: number[][] = K.map(row => [...row])
  const F_orig: number[]   = [...F]

  // Apply boundary conditions (zero row/col → exact enforcement of d[i]=0)
  const constrained = new Set<number>()
  for (const sup of supports) {
    const i = nodeIdx[sup.nodeId]
    if (i === undefined) continue
    if (sup.type === "pin" || sup.type === "fixed") constrained.add(3*i)
    constrained.add(3*i + 1)   // roller, pin, fixed all constrain v
    if (sup.type === "fixed") constrained.add(3*i + 2)
  }

  // Constrain θ DOFs at nodes whose only connected members are truss elements.
  // Truss members contribute no rotational stiffness, leaving those θ rows/cols
  // exactly zero → singular K.  Fixing θ = 0 at such nodes is physically correct
  // (no moment is transmitted, rotation is indeterminate, set to zero).
  const frameConnectedNodes = new Set<string>()
  for (const mem of members) {
    if (mem.memberType !== "truss") {
      frameConnectedNodes.add(mem.a)
      frameConnectedNodes.add(mem.b)
    }
  }
  for (const nd of nodes) {
    if (!frameConnectedNodes.has(nd.id)) {
      const i = nodeIdx[nd.id]
      if (i !== undefined) constrained.add(3 * i + 2)
    }
  }

  for (const dof of constrained) {
    for (let j = 0; j < ndof; j++) { K[dof][j] = 0; K[j][dof] = 0 }
    K[dof][dof] = 1
    F[dof] = 0
  }

  const d = gaussSolve(K, F)
  if (!d) return { ok: false, reason: "Singular stiffness matrix" }

  // Node displacements
  const nodeDisplacements: Record<string, NodeDisplacement> = {}
  for (let i = 0; i < n; i++) {
    nodeDisplacements[nodeList[i]] = { u: d[3*i], v: d[3*i+1], theta: d[3*i+2] }
  }

  // Member end forces
  const memberEndForces: Record<string, MemberEndForces> = {}
  for (const member of members) {
    const nA  = model.nodes[member.a]
    const nB  = model.nodes[member.b]
    const sec = model.sections[member.section]
    if (!nA || !nB || !sec) continue

    const ia = nodeIdx[member.a]
    const ib = nodeIdx[member.b]
    if (ia === undefined || ib === undefined) continue

    const dx = nB.x - nA.x, dy = nB.y - nA.y
    const L  = Math.hypot(dx, dy)
    if (L < 1e-9) continue

    const E  = sec.E * 1000; const I = sec.I33 * 1e-12; const Ar = sec.A * 1e-6
    const EA = E * Ar; const EI = E * I
    const c = dx / L, s = dy / L
    const isTruss = member.memberType === "truss"

    const k  = isTruss ? trussLocalStiffness(EA, L) : localStiffness(EA, EI, L)
    const T  = transformMatrix(c, s)

    const d_elem = [d[3*ia], d[3*ia+1], d[3*ia+2], d[3*ib], d[3*ib+1], d[3*ib+2]]
    const d_loc  = matVec(T, d_elem)
    const f_raw  = matVec(k, d_loc)
    const FEF    = fefStore[member.id] ?? [0,0,0,0,0,0]
    const f      = f_raw.map((v, i) => v - FEF[i])   // element end forces (local)

    // Distributed load for interpolation — same q values used in assembly (no flip).
    let q1 = 0, q2 = 0
    if (!isTruss) {
      for (const load of loads) {
        if (load.type === "distributed" && load.memberId === member.id) {
          const mode = load.mode ?? "local-axis"
          if (mode === "local-axis") {
            q1 = load.wStart ?? 0; q2 = load.wEnd ?? 0
          } else {
            const qxStart = load.wxStart ?? 0, qxEnd = load.wxEnd ?? 0
            const qyStart = load.wyStart ?? 0, qyEnd = load.wyEnd ?? 0
            q1 = -qxStart * s + qyStart * c
            q2 = -qxEnd * s + qyEnd * c
          }
          break
        }
      }
    }

    memberEndForces[member.id] = {
      N1: -f[0],                        // tension positive
      V1:  isTruss ? 0 : -f[1],         // positive = force on +face in +local-2 direction
      M1:  isTruss ? 0 : -f[2],         // sagging positive — tension on −local-2 side
      N2:  f[3],
      V2:  isTruss ? 0 :  f[4],
      M2:  isTruss ? 0 : f[5],
      q1, q2,
    }
  }

  // Reactions: R = K_orig · d − F_orig at constrained DOFs
  const reactions: Record<string, { Rx: number; Ry: number; Mz: number }> = {}
  for (const sup of supports) {
    const i = nodeIdx[sup.nodeId]
    if (i === undefined) continue
    const Rx  = K_orig[3*i].reduce((s, k, j) => s + k * d[j], 0) - F_orig[3*i]
    const Ry  = K_orig[3*i+1].reduce((s, k, j) => s + k * d[j], 0) - F_orig[3*i+1]
    const Mz  = K_orig[3*i+2].reduce((s, k, j) => s + k * d[j], 0) - F_orig[3*i+2]
    reactions[sup.nodeId] = { Rx, Ry, Mz }
  }

  return { ok: true, nodeDisplacements, memberEndForces, reactions }
}

// ── Internal force interpolation ──────────────────────────────────────────────

/**
 * Returns internal forces at distance x (metres) from node-A along the member.
 * Sign conventions: N positive=tension, V positive=reference software (force on positive face in
 * positive local-2 direction; right-portion pushes left-portion upward for horizontal members),
 * M positive=sagging (CCW on left face).
 */
export function memberInternalForces(
  ef: MemberEndForces,
  x: number,
  L: number
): { N: number; V: number; M: number } {
  const { q1, q2 } = ef
  // reference software convention: dV_ref/dx = -q  →  V(x) = V1 - q1·x - (q2-q1)·x²/(2L)
  // Moment unchanged (sagging +): dM/dx = -V_ref  →  M(x) = M1 - V1·x + q1·x²/2 + …
  const V = ef.V1 - q1 * x - (q2 - q1) * x * x / (2 * L)
  const M = ef.M1 - ef.V1 * x + q1 * x * x / 2 + (q2 - q1) * x * x * x / (6 * L)
  return { N: ef.N1, V, M }
}

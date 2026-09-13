import type { StructureModel, Section } from "@/lib/model"
import { shearModulus } from "@/lib/sections/materials"

export interface MemberEndForces {
  N1: number; V1: number; M1: number   // at node-A end, kN / kN·m
  N2: number; V2: number; M2: number   // at node-B end
  q1: number; q2: number               // local-2 (transverse) distributed load kN/m
  qx1: number; qx2: number             // local-1 (axial) distributed load kN/m
}

export interface NodeDisplacement { u: number; v: number; theta: number }

export interface AnalysisResult {
  ok: true
  nodeDisplacements: Record<string, NodeDisplacement>
  memberEndForces:   Record<string, MemberEndForces>
  reactions:         Record<string, { Rx: number; Ry: number; Mz: number }>
}

export type SolverResult =
  | AnalysisResult
  | { ok: false; reason: string; singularDof?: number }

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

type GaussResult = { x: number[] } | { singular: true; dofIndex: number }

function gaussSolve(K: number[][], F: number[]): GaussResult {
  const n = K.length
  // Per-DOF singularity tolerance (v1.0.6 refinement).
  //
  // Naively scaling the tolerance by the global max-diagonal makes ill-
  // conditioned matrices report false singularities: when EA and EI differ
  // by many orders of magnitude (e.g. user authors A = 100 m² with
  // I = 1e-12 m⁴), the axial diagonal entries dominate maxDiag and the
  // bending diagonal entries fall below `1e-12 · maxDiag` even though they
  // are physically nonzero. Compare each pivot against *its own* original
  // diagonal instead — a DOF is singular only if its column collapsed
  // relative to its starting scale, not relative to some other DOF's scale.
  // `1e-12 · |K[i][i]|` keeps the same relative threshold per DOF while
  // tolerating extreme stiffness contrasts across the model.
  const origDiagTol = new Array(n).fill(0)
  for (let i = 0; i < n; i++) {
    origDiagTol[i] = Math.max(Math.abs(K[i][i]), 1) * 1e-12
  }

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
    // Capture *which* DOF is unconstrained so the diagnostics layer can
    // translate it into a node + direction message ("node n4, rotation").
    if (maxVal < origDiagTol[col]) return { singular: true, dofIndex: col }
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
  return { x }
}

// ── Local stiffness and transformation ───────────────────────────────────────

// 2D frame element stiffness. `GAs` is the shear rigidity G·A_s (kN); pass 0 for the
// pure Euler–Bernoulli element. When GAs > 0 the Timoshenko shear-flexibility factor
//   Φ = 12·EI / (GAs·L²)
// scales the bending block by 1/(1+Φ), with the rotational diagonal/off-diagonal terms
// becoming (4+Φ) and (2−Φ). As Φ→0 this reduces algebraically to the Euler matrix, so the
// GAs=0 path is byte-identical to the original formulation. Axial terms are unaffected.
function localStiffness(EA: number, EI: number, L: number, GAs = 0): number[][] {
  const phi = GAs > 0 ? 12 * EI / (GAs * L * L) : 0
  const d   = 1 + phi
  const kv  = 12 * EI / (L**3 * d)        // shear (v–v) term
  const kvt = 6 * EI / (L**2 * d)         // shear–rotation coupling
  const ktt = (4 + phi) * EI / (L * d)    // rotation diagonal
  const ktc = (2 - phi) * EI / (L * d)    // rotation off-diagonal (carry-over)
  return [
    [ EA/L,   0,     0,    -EA/L,   0,     0   ],
    [ 0,      kv,    kvt,   0,     -kv,    kvt  ],
    [ 0,      kvt,   ktt,   0,     -kvt,   ktc  ],
    [-EA/L,   0,     0,     EA/L,   0,     0   ],
    [ 0,     -kv,   -kvt,   0,      kv,   -kvt  ],
    [ 0,      kvt,   ktc,   0,     -kvt,   ktt  ],
  ]
}

// Truss element (v1.0.4): frame element with M3 releases at both ends (SAP2000 style).
// Implemented by static condensation of θᵢ, θⱼ from the full 6×6 frame stiffness.
// The result is a 6×6 matrix whose θ rows/cols are zero (matching the released-DOF
// boundary condition) but whose transverse (v) rows/cols carry the simply-supported
// beam stiffness, so distributed loads produce real internal V/M between the end
// nodes while transmitting only axial force to adjoining members.
//
// Retained DOFs r = [0,1,3,4] (uᵢ, vᵢ, uⱼ, vⱼ); released DOFs s = [2,5] (θᵢ, θⱼ).
// K_cc = K_rr − K_rs · K_ss⁻¹ · K_sr (4×4), then padded back to 6×6 with zeros at 2,5.
// FEF_cc = F_r − K_rs · K_ss⁻¹ · F_s, padded back to length 6 with zeros at 2,5.
//
// Requires EI > 0 (Step 1 input guard enforces this at the section layer).
function condensedTrussElement(
  EA: number, EI: number, L: number, q1: number, q2: number,
  qx1 = 0, qx2 = 0, GAs = 0,
): { K_loc: number[][]; FEF_loc: number[] } | null {
  const Kf  = localStiffness(EA, EI, L, GAs)
  const Ff  = fixedEndForces(q1, q2, L, qx1, qx2)
  const r   = [0, 1, 3, 4]
  const s   = [2, 5]

  // Extract sub-blocks.
  const Krr = r.map((i) => r.map((j) => Kf[i][j]))      // 4×4
  const Krs = r.map((i) => s.map((j) => Kf[i][j]))      // 4×2
  const Ksr = s.map((i) => r.map((j) => Kf[i][j]))      // 2×4
  const Kss = s.map((i) => s.map((j) => Kf[i][j]))      // 2×2
  const Fr  = r.map((i) => Ff[i])                        // length 4
  const Fs  = s.map((i) => Ff[i])                        // length 2

  // K_ss⁻¹ via closed-form 2×2 inverse.
  const det = Kss[0][0] * Kss[1][1] - Kss[0][1] * Kss[1][0]
  if (Math.abs(det) < 1e-15) return null
  const KssInv = [
    [ Kss[1][1] / det, -Kss[0][1] / det],
    [-Kss[1][0] / det,  Kss[0][0] / det],
  ]

  // 4×4: K_cc = K_rr − K_rs · K_ss⁻¹ · K_sr
  const KrsKssInv = matMul(Krs, KssInv)                  // 4×2
  const KrsKssInvKsr = matMul(KrsKssInv, Ksr)            // 4×4
  const Kcc = Krr.map((row, i) => row.map((v, j) => v - KrsKssInvKsr[i][j]))

  // Length-4: F_cc = F_r − K_rs · K_ss⁻¹ · F_s
  const KssInvFs = matVec(KssInv, Fs)                    // length 2
  const KrsKssInvFs = matVec(KrsKssInv, KssInvFs)        // length 4
  const Fcc = Fr.map((v, i) => v - KrsKssInvFs[i])

  // Pad back to 6×6 with zero θ rows/cols at indices 2, 5.
  const K_loc: number[][] = Array.from({ length: 6 }, () => new Array(6).fill(0))
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      K_loc[r[i]][r[j]] = Kcc[i][j]
    }
  }

  // Pad FEF back to length 6 with zeros at indices 2, 5.
  const FEF_loc = new Array(6).fill(0)
  for (let i = 0; i < 4; i++) FEF_loc[r[i]] = Fcc[i]

  return { K_loc, FEF_loc }
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

// Fixed-end force vector (local frame) for trapezoidal load.
//   q1, q2  — transverse load (local-2 / local-y), kN/m
//   qx1, qx2 — axial load (local-1 / local-x), kN/m
// Axial entries use the consistent trapezoidal FEF:
//   Fx_i = L·(2·qx1 + qx2)/6,  Fx_j = L·(qx1 + 2·qx2)/6
// For uniform qx (qx1=qx2=q), both reduce to qL/2 (the 50/50 lumping).
// Putting axial into the local FEF (rather than lumping straight into global F)
// ensures `f = K·d_loc − FEF` reproduces the full element-level reaction at each
// end — the same mechanism that makes the transverse N1/N2 read the full clamped
// reaction (not half). Without this, N1 at a fixed column base reads as half the
// integrated self-weight instead of the full weight.
function fixedEndForces(q1: number, q2: number, L: number, qx1 = 0, qx2 = 0): number[] {
  return [
    L * (2*qx1 + qx2) / 6,
    L * (7*q1 + 3*q2) / 20,
    L*L * (3*q1 + 2*q2) / 60,
    L * (qx1 + 2*qx2) / 6,
    L * (3*q1 + 7*q2) / 20,
    -L*L * (2*q1 + 3*q2) / 60,
  ]
}

// ── Main solver ───────────────────────────────────────────────────────────────

export interface AnalyzeOptions {
  /** Timoshenko shear deformation (default off → pure Euler–Bernoulli). */
  shearDeformation?: boolean
}

export function analyze(model: StructureModel, opts?: AnalyzeOptions): SolverResult {
  // Per-member shear rigidity G·A_s (kN) used to build the Timoshenko element.
  // Returns 0 — the Euler element — when shear deformation is off, or when the
  // section has no positive shear area A_s (legacy/manual sections that left it
  // blank). The latter mirrors the γ≤0 self-weight skip: silent Euler fallback,
  // no crash, no invented data.
  const memberGAs = (sec: Section): number => {
    if (!opts?.shearDeformation) return 0
    const As = (sec["Aκ2"] ?? 0) * 1e-6                          // mm² → m²
    if (As <= 0) return 0
    const G = (sec.derived?.G ?? shearModulus(sec.E, sec.nu ?? 0.3)) * 1000  // MPa → kN/m²
    return G * As                                               // kN
  }

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

    // Read distributed load on this member (now applies to trusses too post-v1.0.4).
    // Positive local-axis w acts in the +local-2 direction (= local-1 rotated +90° CCW).
    // No quadrant flip — the same single rule for every member orientation.
    let q1 = 0, q2 = 0
    let qx1 = 0, qx2 = 0  // axial components (local-x)
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

    // Build local stiffness and FEF. For trusses, condense out the released θᵢ, θⱼ.
    let k: number[][]
    let FEF: number[]
    const GAs = memberGAs(sec)
    if (isTruss) {
      const cond = condensedTrussElement(EA, EI, L, q1, q2, qx1, qx2, GAs)
      if (!cond) return { ok: false, reason: "Truss condensation failed (EI must be > 0)" }
      k = cond.K_loc
      FEF = cond.FEF_loc
    } else {
      k = localStiffness(EA, EI, L, GAs)
      FEF = fixedEndForces(q1, q2, L, qx1, qx2)
    }
    const T = transformMatrix(c, s)
    const Tt = transpose(T)
    const Kg = matMul(Tt, matMul(k, T))   // global element stiffness

    const dofs = [3*ia, 3*ia+1, 3*ia+2, 3*ib, 3*ib+1, 3*ib+2]
    for (let i = 0; i < 6; i++)
      for (let j = 0; j < 6; j++)
        K[dofs[i]][dofs[j]] += Kg[i][j]

    fefStore[member.id] = FEF

    const FEF_global = matVec(Tt, FEF)
    for (let i = 0; i < 6; i++) F[dofs[i]] += FEF_global[i]
    // (Axial distributed load is now carried in the local FEF entries [0] and [3]
    // and assembled into global F by the Tᵀ transform above — same code path as
    // transverse load. This makes element-level recovery `f − FEF` produce the
    // correct N1/N2 instead of half the integrated value.)
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

  // Constrain θ DOFs at nodes whose only connections are moment-released (truss) members.
  // After v1.0.4 the truss element is a condensed-frame: its θ rows/cols are zero by
  // construction (the released-end boundary condition). At pure-truss nodes, the global
  // K would be singular in θ. Pinning θ = 0 there is physically correct (no moment is
  // transmitted to/from the joint) and keeps K invertible. Confirmed required by the
  // full truss-template matrix; removing this guard makes Warren/Pratt/Howe singular.
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

  const gs = gaussSolve(K, F)
  if ("singular" in gs) {
    return { ok: false, reason: "Singular stiffness matrix", singularDof: gs.dofIndex }
  }
  const d = gs.x

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

    // Distributed load for interpolation — same q values used in assembly (no flip).
    // Now applies to trusses too (released-end frame element carries transverse load
    // simply-supported between its end nodes).
    let q1 = 0, q2 = 0
    let qx1 = 0, qx2 = 0
    for (const load of loads) {
      if (load.type === "distributed" && load.memberId === member.id) {
        const mode = load.mode ?? "local-axis"
        if (mode === "local-axis") {
          q1 = load.wStart ?? 0; q2 = load.wEnd ?? 0
        } else {
          const qxStart = load.wxStart ?? 0, qxEnd = load.wxEnd ?? 0
          const qyStart = load.wyStart ?? 0, qyEnd = load.wyEnd ?? 0
          qx1 = qxStart * c + qyStart * s
          qx2 = qxEnd   * c + qyEnd   * s
          q1  = -qxStart * s + qyStart * c
          q2  = -qxEnd   * s + qyEnd   * c
        }
        break
      }
    }

    // Use the SAME stiffness used in assembly (condensed for trusses, full for frames).
    // Pairing K and FEF consistently is critical: f_raw = K · d_loc, then f = f_raw − FEF.
    let k: number[][]
    const GAs = memberGAs(sec)
    if (isTruss) {
      const cond = condensedTrussElement(EA, EI, L, q1, q2, qx1, qx2, GAs)
      if (!cond) return { ok: false, reason: "Truss condensation failed (EI must be > 0)" }
      k = cond.K_loc
    } else {
      k = localStiffness(EA, EI, L, GAs)
    }
    const T  = transformMatrix(c, s)

    const d_elem = [d[3*ia], d[3*ia+1], d[3*ia+2], d[3*ib], d[3*ib+1], d[3*ib+2]]
    const d_loc  = matVec(T, d_elem)
    const f_raw  = matVec(k, d_loc)
    const FEF    = fefStore[member.id] ?? [0,0,0,0,0,0]
    const f      = f_raw.map((v, i) => v - FEF[i])   // element end forces (local)

    memberEndForces[member.id] = {
      N1: -f[0],   // tension positive
      V1: -f[1],   // positive = force on +face in +local-2 direction
      M1: -f[2],   // sagging positive — tension on −local-2 side; ~0 for truss by construction
      N2:  f[3],
      V2:  f[4],
      M2:  f[5],   // ~0 for truss by construction
      q1, q2,
      qx1, qx2,
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
 * Sign conventions: N positive=tension, V positive=SAP2000 (force on positive face in
 * positive local-2 direction; right-portion pushes left-portion upward for horizontal members),
 * M positive=sagging (CCW on left face).
 */
export function memberInternalForces(
  ef: MemberEndForces,
  x: number,
  L: number
): { N: number; V: number; M: number } {
  const { q1, q2, qx1, qx2 } = ef
  // Axial: dN/dx = -qx  →  N(x) = N1 - qx1·x - (qx2-qx1)·x²/(2L)
  // SAP2000 convention: dV_SAP/dx = -q  →  V(x) = V1 - q1·x - (q2-q1)·x²/(2L)
  // Moment unchanged (sagging +): dM/dx = -V_SAP  →  M(x) = M1 - V1·x + q1·x²/2 + …
  const N = ef.N1 - qx1 * x - (qx2 - qx1) * x * x / (2 * L)
  const V = ef.V1 - q1 * x - (q2 - q1) * x * x / (2 * L)
  const M = ef.M1 - ef.V1 * x + q1 * x * x / 2 + (q2 - q1) * x * x * x / (6 * L)
  return { N, V, M }
}

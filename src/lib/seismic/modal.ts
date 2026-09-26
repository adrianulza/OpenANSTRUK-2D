/**
 * Modal (free-vibration) analysis of the plane frame.
 *
 *   K·φ = ω²·M·φ
 *
 * K is the static solver's own stiffness (`assembleSystem`), so the modal and
 * static passes can never disagree about elements, truss condensation or
 * supports. M is the lumped nodal mass of `mass.ts`: m on u and v, nothing on θ.
 *
 * Method:
 *  1. Partition the free DOFs into massed (m) and massless (o) sets and
 *     condense the massless ones out (Guyan):
 *       K̂ = Kmm − Kmo·Koo⁻¹·Kom
 *     With a lumped mass this is EXACT, not an approximation: a massless DOF
 *     carries no inertia force, so it is in static equilibrium at every
 *     instant and Koo·φo + Kom·φm = 0 holds in every mode.
 *  2. M is diagonal and positive on the massed set, so the problem is made
 *     standard by symmetric scaling, A = M^−½·K̂·M^−½, and A is solved with
 *     Householder tridiagonalisation + implicit QL (EISPACK tred2/tql2, as in
 *     JAMA). Dense O(n³), robust for the sizes a plane frame produces.
 *  3. φm = M^−½·v is mass-normalised by construction (φᵀMφ = 1), and the
 *     massless DOFs are recovered as φo = −Koo⁻¹·Kom·φm.
 *
 * ⚠ ALL MODES ARE KEPT. The condensed problem has exactly one mode per massed
 * DOF, and together they carry the whole mass: Σ effective mass = total free
 * mass in each direction, so the cumulative participation reaches 100 %. That
 * is what "automatic" means here — there is no truncation to choose.
 *
 * Units: kN, m, t → ω in rad/s, T in s.
 */

import type { StructureModel } from "../model"
import { assembleSystem, type AnalyzeOptions, type AssembledSystem } from "../solver"
import { GRAVITY, type MassReport } from "./mass"

export interface ModeResult {
  /** 1-based mode number; mode 1 has the longest period. */
  index: number
  omega: number
  /** Period, s. */
  T: number
  /** Frequency, Hz. */
  f: number
  /** Mass-normalised shape over ALL global DOFs (u, v, θ per node). */
  phi: number[]
  /** Participation factor Γ = φᵀ·M·r, t^½. */
  gammaX: number
  gammaY: number
  /** Effective-mass ratio in X and Y, 0…1. */
  ratioX: number
  ratioY: number
  /** Running sums of the ratios up to and including this mode, 0…1. */
  cumX: number
  cumY: number
}

export type ModalSolution =
  | {
      ok: true
      modes: ModeResult[]
      /** Total participating (free-DOF) mass in X and Y, t. */
      massX: number
      massY: number
      /** Mass sitting on restrained DOFs — carried straight into the supports. */
      restrainedMassX: number
      restrainedMassY: number
      /** Diagonal lumped mass per global DOF, t. */
      mass: number[]
      /** The assembled (load-free) system, reused by the response-spectrum pass. */
      system: AssembledSystem
      /**
       * The condensed problem, reused by the time-history pass: massed DOFs
       * `mDofs`, massless `oDofs`, K̂ on the massed set (row-major, nm × nm)
       * and the recovery map X = Koo⁻¹·Kom (row-major, no × nm), so that
       * φo = −X·φm for any massed-DOF vector.
       */
      condensed: { mDofs: number[]; oDofs: number[]; K: Float64Array; X: Float64Array }
      issues: string[]
    }
  | { ok: false; reason: string }

// ── Dense helpers ─────────────────────────────────────────────────────────────

/** LU factorisation with partial pivoting, in place on a copy. */
function luFactor(A: number[][]): { lu: number[][]; piv: number[] } | null {
  const n = A.length
  const lu = A.map((r) => [...r])
  const piv = Array.from({ length: n }, (_, i) => i)
  for (let k = 0; k < n; k++) {
    let p = k
    let max = Math.abs(lu[k][k])
    for (let i = k + 1; i < n; i++) {
      if (Math.abs(lu[i][k]) > max) {
        max = Math.abs(lu[i][k])
        p = i
      }
    }
    if (max < Math.max(Math.abs(A[k][k]), 1) * 1e-13) return null
    if (p !== k) {
      ;[lu[p], lu[k]] = [lu[k], lu[p]]
      ;[piv[p], piv[k]] = [piv[k], piv[p]]
    }
    const pivot = lu[k][k]
    for (let i = k + 1; i < n; i++) {
      const f = (lu[i][k] /= pivot)
      if (f === 0) continue
      const ri = lu[i]
      const rk = lu[k]
      for (let j = k + 1; j < n; j++) ri[j] -= f * rk[j]
    }
  }
  return { lu, piv }
}

function luSolve({ lu, piv }: { lu: number[][]; piv: number[] }, b: number[]): number[] {
  const n = lu.length
  const x = piv.map((p) => b[p])
  for (let i = 0; i < n; i++) {
    let s = x[i]
    for (let j = 0; j < i; j++) s -= lu[i][j] * x[j]
    x[i] = s
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]
    for (let j = i + 1; j < n; j++) s -= lu[i][j] * x[j]
    x[i] = s / lu[i][i]
  }
  return x
}

/**
 * Symmetric eigen-decomposition: Householder reduction to tridiagonal form
 * (tred2) followed by the implicit QL algorithm (tql2). Straight port of the
 * public-domain JAMA routines. Returns ascending eigenvalues `d` and the
 * orthonormal eigenvectors as the COLUMNS of `V`.
 */
export function symmetricEigen(A: number[][]): { d: number[]; V: number[][] } {
  const n = A.length
  const V = A.map((r) => [...r])
  const d = new Array<number>(n).fill(0)
  const e = new Array<number>(n).fill(0)
  if (n === 0) return { d, V }

  // tred2
  for (let j = 0; j < n; j++) d[j] = V[n - 1][j]
  for (let i = n - 1; i > 0; i--) {
    let scale = 0
    let h = 0
    for (let k = 0; k < i; k++) scale += Math.abs(d[k])
    if (scale === 0) {
      e[i] = d[i - 1]
      for (let j = 0; j < i; j++) {
        d[j] = V[i - 1][j]
        V[i][j] = 0
        V[j][i] = 0
      }
    } else {
      for (let k = 0; k < i; k++) {
        d[k] /= scale
        h += d[k] * d[k]
      }
      let f = d[i - 1]
      let g = Math.sqrt(h)
      if (f > 0) g = -g
      e[i] = scale * g
      h -= f * g
      d[i - 1] = f - g
      for (let j = 0; j < i; j++) e[j] = 0
      for (let j = 0; j < i; j++) {
        f = d[j]
        V[j][i] = f
        g = e[j] + V[j][j] * f
        for (let k = j + 1; k <= i - 1; k++) {
          g += V[k][j] * d[k]
          e[k] += V[k][j] * f
        }
        e[j] = g
      }
      f = 0
      for (let j = 0; j < i; j++) {
        e[j] /= h
        f += e[j] * d[j]
      }
      const hh = f / (h + h)
      for (let j = 0; j < i; j++) e[j] -= hh * d[j]
      for (let j = 0; j < i; j++) {
        f = d[j]
        g = e[j]
        for (let k = j; k <= i - 1; k++) V[k][j] -= f * e[k] + g * d[k]
        d[j] = V[i - 1][j]
        V[i][j] = 0
      }
    }
    d[i] = h
  }
  for (let i = 0; i < n - 1; i++) {
    V[n - 1][i] = V[i][i]
    V[i][i] = 1
    const h = d[i + 1]
    if (h !== 0) {
      for (let k = 0; k <= i; k++) d[k] = V[k][i + 1] / h
      for (let j = 0; j <= i; j++) {
        let g = 0
        for (let k = 0; k <= i; k++) g += V[k][i + 1] * V[k][j]
        for (let k = 0; k <= i; k++) V[k][j] -= g * d[k]
      }
    }
    for (let k = 0; k <= i; k++) V[k][i + 1] = 0
  }
  for (let j = 0; j < n; j++) {
    d[j] = V[n - 1][j]
    V[n - 1][j] = 0
  }
  V[n - 1][n - 1] = 1
  e[0] = 0

  // tql2
  for (let i = 1; i < n; i++) e[i - 1] = e[i]
  e[n - 1] = 0
  let f = 0
  let tst1 = 0
  const eps = Math.pow(2, -52)
  for (let l = 0; l < n; l++) {
    tst1 = Math.max(tst1, Math.abs(d[l]) + Math.abs(e[l]))
    let m = l
    while (m < n) {
      if (Math.abs(e[m]) <= eps * tst1) break
      m++
    }
    if (m > l) {
      let iter = 0
      do {
        iter++
        if (iter > 60) break
        let g = d[l]
        let p = (d[l + 1] - g) / (2 * e[l])
        let r = Math.hypot(p, 1)
        if (p < 0) r = -r
        d[l] = e[l] / (p + r)
        d[l + 1] = e[l] * (p + r)
        const dl1 = d[l + 1]
        let h = g - d[l]
        for (let i = l + 2; i < n; i++) d[i] -= h
        f += h
        p = d[m]
        let c = 1
        let c2 = c
        let c3 = c
        const el1 = e[l + 1]
        let s = 0
        let s2 = 0
        for (let i = m - 1; i >= l; i--) {
          c3 = c2
          c2 = c
          s2 = s
          g = c * e[i]
          h = c * p
          r = Math.hypot(p, e[i])
          e[i + 1] = s * r
          s = e[i] / r
          c = p / r
          p = c * d[i] - s * g
          d[i + 1] = h + s * (c * g + s * d[i])
          for (let k = 0; k < n; k++) {
            h = V[k][i + 1]
            V[k][i + 1] = s * V[k][i] + c * h
            V[k][i] = c * V[k][i] - s * h
          }
        }
        p = (-s * s2 * c3 * el1 * e[l]) / dl1
        e[l] = s * p
        d[l] = c * p
      } while (Math.abs(e[l]) > eps * tst1)
    }
    d[l] = d[l] + f
    e[l] = 0
  }

  // Sort ascending, carrying the vectors.
  for (let i = 0; i < n - 1; i++) {
    let k = i
    let p = d[i]
    for (let j = i + 1; j < n; j++) {
      if (d[j] < p) {
        k = j
        p = d[j]
      }
    }
    if (k !== i) {
      d[k] = d[i]
      d[i] = p
      for (let j = 0; j < n; j++) {
        const t = V[j][i]
        V[j][i] = V[j][k]
        V[j][k] = t
      }
    }
  }
  return { d, V }
}

// ── Modal pass ────────────────────────────────────────────────────────────────

export function runModalAnalysis(
  model: StructureModel,
  mass: MassReport,
  opts?: AnalyzeOptions,
): ModalSolution {
  // Load-free slice: the modal pass wants K alone, and the response-spectrum
  // pass reuses this system with F = 0 for its force recovery.
  const sys = assembleSystem({ ...model, loads: {} }, opts)
  if ("ok" in sys) return sys

  const { ndof, nodeList, constrained, K } = sys
  const M = new Array<number>(ndof).fill(0)
  nodeList.forEach((id, i) => {
    const m = (mass.nodeWeight[id] ?? 0) / GRAVITY
    M[3 * i] = m
    M[3 * i + 1] = m
  })

  let massX = 0
  let massY = 0
  let restrainedMassX = 0
  let restrainedMassY = 0
  const mDofs: number[] = []
  const oDofs: number[] = []
  for (let k = 0; k < ndof; k++) {
    const isX = k % 3 === 0
    const isY = k % 3 === 1
    if (constrained.has(k)) {
      if (isX) restrainedMassX += M[k]
      if (isY) restrainedMassY += M[k]
      continue
    }
    if (M[k] > 0) {
      mDofs.push(k)
      if (isX) massX += M[k]
      if (isY) massY += M[k]
    } else {
      oDofs.push(k)
    }
  }
  if (mDofs.length === 0) {
    return {
      ok: false,
      reason:
        "No mass on any free degree of freedom. Tick at least one loaded case in the mass source.",
    }
  }

  // Guyan condensation onto the massed DOFs.
  const nm = mDofs.length
  const no = oDofs.length
  let X: number[][] = [] // Koo⁻¹·Kom, no × nm
  if (no > 0) {
    const Koo = oDofs.map((i) => oDofs.map((j) => K[i][j]))
    const fac = luFactor(Koo)
    if (!fac) {
      return {
        ok: false,
        reason:
          "The massless part of the structure is unstable (singular stiffness). Check supports and member connectivity.",
      }
    }
    const cols = mDofs.map((j) => luSolve(fac, oDofs.map((i) => K[i][j])))
    X = Array.from({ length: no }, (_, r) => cols.map((col) => col[r]))
  }
  const Kc: number[][] = mDofs.map((i) => mDofs.map((j) => K[i][j]))
  if (no > 0) {
    for (let a = 0; a < nm; a++) {
      const Kmo = oDofs.map((o) => K[mDofs[a]][o])
      for (let b = 0; b < nm; b++) {
        let s = 0
        for (let r = 0; r < no; r++) s += Kmo[r] * X[r][b]
        Kc[a][b] -= s
      }
    }
  }

  // Standard form A = M^−½ K̂ M^−½, symmetrised against round-off.
  const sqm = mDofs.map((k) => Math.sqrt(M[k]))
  const A = Kc.map((row, a) => row.map((v, b) => v / (sqm[a] * sqm[b])))
  for (let a = 0; a < nm; a++)
    for (let b = 0; b < a; b++) {
      const v = (A[a][b] + A[b][a]) / 2
      A[a][b] = v
      A[b][a] = v
    }
  const { d, V } = symmetricEigen(A)

  const issues: string[] = []
  const lamMax = Math.max(...d.map(Math.abs), 0)
  const modes: ModeResult[] = []
  let cumX = 0
  let cumY = 0
  let dropped = 0
  for (let k = 0; k < nm; k++) {
    const lam = d[k]
    if (!(lam > lamMax * 1e-12)) {
      dropped++
      continue
    }
    const phiM = mDofs.map((_, a) => V[a][k] / sqm[a])
    const phi = new Array<number>(ndof).fill(0)
    mDofs.forEach((dof, a) => {
      phi[dof] = phiM[a]
    })
    for (let r = 0; r < no; r++) {
      let s = 0
      for (let b = 0; b < nm; b++) s -= X[r][b] * phiM[b]
      phi[oDofs[r]] = s
    }
    // Sign: largest translational entry positive, for a stable picture.
    let big = 0
    mDofs.forEach((dof) => {
      if (Math.abs(phi[dof]) > Math.abs(big)) big = phi[dof]
    })
    if (big < 0) for (let i = 0; i < ndof; i++) phi[i] = -phi[i]

    let gammaX = 0
    let gammaY = 0
    for (const dof of mDofs) {
      if (dof % 3 === 0) gammaX += M[dof] * phi[dof]
      else gammaY += M[dof] * phi[dof]
    }
    const ratioX = massX > 0 ? (gammaX * gammaX) / massX : 0
    const ratioY = massY > 0 ? (gammaY * gammaY) / massY : 0
    cumX += ratioX
    cumY += ratioY
    const omega = Math.sqrt(lam)
    modes.push({
      index: modes.length + 1,
      omega,
      T: (2 * Math.PI) / omega,
      f: omega / (2 * Math.PI),
      phi,
      gammaX,
      gammaY,
      ratioX,
      ratioY,
      cumX,
      cumY,
    })
  }
  if (dropped > 0) {
    issues.push(
      `${dropped} mode${dropped === 1 ? "" : "s"} with zero or negative stiffness were dropped — the structure may be a mechanism.`,
    )
  }
  if (modes.length === 0) {
    return { ok: false, reason: "The eigen solution produced no vibration modes." }
  }
  return {
    ok: true,
    modes,
    massX,
    massY,
    restrainedMassX,
    restrainedMassY,
    mass: M,
    system: sys,
    condensed: {
      mDofs,
      oDofs,
      K: Float64Array.from(Kc.flat()),
      X: Float64Array.from(X.flat()),
    },
    issues,
  }
}

/** The mode with the largest effective mass in X — the one that sets the ELF period. */
export function dominantModeX(modal: Extract<ModalSolution, { ok: true }>): ModeResult {
  return modal.modes.reduce((best, m) => (m.ratioX > best.ratioX ? m : best), modal.modes[0])
}

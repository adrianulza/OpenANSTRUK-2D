/**
 * Newmark-β direct integration on a small dense linear system — the linear
 * half of OpenANSTRUK-3D's `newmark.ts`.
 *
 * Pure and model-free: matrices in, histories out. Defaults are the average-
 * acceleration member of the family (γ = 1/2, β = 1/4): unconditionally stable
 * and free of algorithmic damping.
 */

/**
 * Rayleigh coefficients fitting the SAME ζ at two circular frequencies:
 *
 *   α = 2ζ·ω₁ω₂/(ω₁+ω₂),   β = 2ζ/(ω₁+ω₂)
 *
 * so ζ(ω₁) = ζ(ω₂) = ζ exactly, below ζ between them, above outside.
 */
export function rayleighCoefficients(
  zeta: number,
  omega1: number,
  omega2: number,
): { alpha: number; beta: number } {
  const s = omega1 + omega2
  if (!(s > 0)) return { alpha: 0, beta: 0 }
  return { alpha: (2 * zeta * omega1 * omega2) / s, beta: (2 * zeta) / s }
}

export interface NewmarkOptions {
  /** γ, default 1/2. */
  gamma?: number
  /** β, default 1/4 (average acceleration). */
  beta?: number
  /** Initial acceleration; for p = −M·ι·ag the exact a₀ is −ι·ag(0). */
  a0?: Float64Array
}

export type NewmarkOutcome =
  | { ok: true; u: Float64Array[] }
  | { ok: false; reason: string }

/** Cholesky K = L·Lᵀ on a flat row-major array. Null when not positive definite. */
function choleskyFlat(K: Float64Array, n: number): Float64Array | null {
  const L = new Float64Array(n * n)
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let s = K[i * n + j]
      for (let k = 0; k < j; k++) s -= L[i * n + k] * L[j * n + k]
      if (i === j) {
        if (s <= Math.max(Math.abs(K[i * n + i]), 1) * 1e-12) return null
        L[i * n + i] = Math.sqrt(s)
      } else {
        L[i * n + j] = s / L[j * n + j]
      }
    }
  }
  return L
}

function choleskySolve(L: Float64Array, n: number, b: Float64Array, x: Float64Array): void {
  for (let i = 0; i < n; i++) {
    let s = b[i]
    for (let j = 0; j < i; j++) s -= L[i * n + j] * x[j]
    x[i] = s / L[i * n + i]
  }
  for (let i = n - 1; i >= 0; i--) {
    let s = x[i]
    for (let j = i + 1; j < n; j++) s -= L[j * n + i] * x[j]
    x[i] = s / L[i * n + i]
  }
}

/**
 * Integrate M·ü + C·u̇ + K·u = p(t) from rest at constant step `dt`, with a
 * DIAGONAL mass `m` and Rayleigh damping C = α·M + β_R·K.
 *
 * Exploiting both keeps each step at one K·x product plus one triangular pair:
 *   p̂ = p + M·(a0·u + a2·v + a3·a) + C·(a1·u + a4·v + a5·a)
 *     = p + M·(x + α·y) + β_R·K·y
 * with x = a0·u + a2·v + a3·a and y = a1·u + a4·v + a5·a.
 *
 * `load(s, out)` writes p at step s into `out`; returns the displacement
 * history, `u[0] = 0`.
 */
export function newmarkLinear(
  K: Float64Array,
  m: Float64Array,
  rayleigh: { alpha: number; beta: number },
  steps: number,
  load: (s: number, out: Float64Array) => void,
  dt: number,
  opts?: NewmarkOptions,
): NewmarkOutcome {
  const n = m.length
  if (n === 0) return { ok: false, reason: "The system is empty." }
  if (!(dt > 0)) return { ok: false, reason: "The time step must be positive." }
  if (steps < 2) return { ok: false, reason: "The ground-motion record is too short." }

  const gamma = opts?.gamma ?? 0.5
  const beta = opts?.beta ?? 0.25
  const { alpha, beta: bR } = rayleigh

  const a0c = 1 / (beta * dt * dt)
  const a1c = gamma / (beta * dt)
  const a2c = 1 / (beta * dt)
  const a3c = 1 / (2 * beta) - 1
  const a4c = gamma / beta - 1
  const a5c = dt * (gamma / (2 * beta) - 1)

  // K̂ = K + a0·M + a1·C = (1 + a1·β_R)·K + (a0 + a1·α)·M, factorised once.
  const Keff = new Float64Array(n * n)
  const kf = 1 + a1c * bR
  for (let i = 0; i < n * n; i++) Keff[i] = kf * K[i]
  for (let i = 0; i < n; i++) Keff[i * n + i] += (a0c + a1c * alpha) * m[i]
  const L = choleskyFlat(Keff, n)
  if (!L) {
    return {
      ok: false,
      reason: "The effective stiffness matrix is not positive definite — the structure is unstable.",
    }
  }

  let u = new Float64Array(n)
  let v = new Float64Array(n)
  let a = opts?.a0 ? Float64Array.from(opts.a0) : new Float64Array(n)
  const out: Float64Array[] = [u]

  const p = new Float64Array(n)
  const x = new Float64Array(n)
  const y = new Float64Array(n)
  const rhs = new Float64Array(n)
  for (let s = 1; s < steps; s++) {
    load(s, p)
    for (let i = 0; i < n; i++) {
      x[i] = a0c * u[i] + a2c * v[i] + a3c * a[i]
      y[i] = a1c * u[i] + a4c * v[i] + a5c * a[i]
    }
    for (let i = 0; i < n; i++) {
      let ky = 0
      const row = i * n
      for (let j = 0; j < n; j++) ky += K[row + j] * y[j]
      rhs[i] = p[i] + m[i] * (x[i] + alpha * y[i]) + bR * ky
    }
    const u1 = new Float64Array(n)
    choleskySolve(L, n, rhs, u1)
    const a1 = new Float64Array(n)
    const v1 = new Float64Array(n)
    for (let i = 0; i < n; i++) {
      a1[i] = a0c * (u1[i] - u[i]) - a2c * v[i] - a3c * a[i]
      v1[i] = v[i] + dt * ((1 - gamma) * a[i] + gamma * a1[i])
    }
    u = u1
    v = v1
    a = a1
    out.push(u1)
  }
  return { ok: true, u: out }
}

/**
 * What a γ/β pair costs, said rather than refused (Chopra §16.3): the scheme
 * is unconditionally stable only inside 2β ≥ γ ≥ 1/2, so outside it the
 * critical step is computed from the shortest period and named.
 */
export function newmarkIssues(gamma: number, beta: number, dt: number, omegaMax: number): string[] {
  const out: string[] = []
  if (gamma < 0.5) {
    out.push(
      `Newmark γ = ${gamma} is below 1/2: the integration is negatively damped and the response grows whatever Δt is.`,
    )
  }
  if (2 * beta < gamma) {
    const tMin = omegaMax > 0 ? (2 * Math.PI) / omegaMax : 0
    const ratio = 1 / (Math.PI * Math.SQRT2 * Math.sqrt(Math.max(gamma - 2 * beta, 1e-300)))
    const crit = tMin * ratio
    if (crit > 0 && dt > crit) {
      out.push(
        `Newmark γ = ${gamma}, β = ${beta} is conditionally stable and Δt = ${dt} s exceeds the critical step ${crit.toPrecision(3)} s for the shortest period (${tMin.toPrecision(3)} s). The result diverges; reduce Δt or use β = 1/4.`,
      )
    }
  }
  if (gamma > 0.5) {
    out.push(`Newmark γ = ${gamma} adds numerical damping on top of the Rayleigh damping.`)
  }
  return out
}

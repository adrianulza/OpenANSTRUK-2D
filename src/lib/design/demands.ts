/**
 * Design demands: exact analytic zone extremes from per-combo member end forces.
 *
 * V(x) is quadratic and M(x) cubic (closed-form, see `memberInternalForces` in
 * lib/solver.ts), so zone extremes are found exactly from zone boundaries plus
 * interior polynomial roots — no station sampling, no discretization error:
 *   - M extremes where dM/dx = −V(x) = 0  (quadratic in x)
 *   - V extreme  where dV/dx = −q(x) = 0  (linear in x)
 *   - N extreme  where dN/dx = −qx(x) = 0 (linear in x)
 */

import { memberInternalForces, type MemberEndForces } from "@/lib/solver"
import type { LoadCase, LoadCaseId, LoadCombination, LoadComboId } from "@/lib/load-cases"
import type { FrameType, ZoneId } from "./types"

// ── Zones ────────────────────────────────────────────────────────────────────

export interface ZoneRange {
  x0: number
  x1: number
}

/**
 * Three design zones: end zones of length 2h (the SMF/IMF hinge length,
 * 18.6.4.1) measured from each end, midspan between. End zones are clamped at
 * L/2 so they never overlap; for short members (L ≤ 4h) the midspan zone
 * degenerates to the single point L/2 — still evaluated, never negative.
 */
export function zoneRanges(L: number, h_mm: number): Record<ZoneId, ZoneRange> {
  const hz = Math.min((2 * h_mm) / 1000, L / 2)
  return {
    "end-i": { x0: 0, x1: hz },
    midspan: { x0: hz, x1: L - hz },
    "end-j": { x0: L - hz, x1: L },
  }
}

// ── Analytic extremes ────────────────────────────────────────────────────────

export interface ZoneExtremes {
  Mmax: number
  Mmin: number
  /** max |V| in zone, kN */
  Vabs: number
  Nmin: number
  Nmax: number
}

/** Roots of A·x² + B·x + C = 0 restricted to the open interval (x0, x1). */
function rootsIn(A: number, B: number, C: number, x0: number, x1: number): number[] {
  const out: number[] = []
  const push = (x: number) => {
    if (Number.isFinite(x) && x > x0 && x < x1) out.push(x)
  }
  if (Math.abs(A) < 1e-14) {
    if (Math.abs(B) > 1e-14) push(-C / B)
    return out
  }
  const disc = B * B - 4 * A * C
  if (disc < 0) return out
  const sq = Math.sqrt(disc)
  push((-B + sq) / (2 * A))
  push((-B - sq) / (2 * A))
  return out
}

export function zoneExtremes(ef: MemberEndForces, L: number, r: ZoneRange): ZoneExtremes {
  const { q1, q2, qx1, qx2, V1 } = ef
  const xs: number[] = [r.x0, r.x1]

  // M extremes: V(x) = V1 − q1·x − (q2−q1)·x²/(2L) = 0
  xs.push(...rootsIn(-(q2 - q1) / (2 * L), -q1, V1, r.x0, r.x1))
  // V extreme: q(x) = q1 + (q2−q1)·x/L = 0
  xs.push(...rootsIn(0, (q2 - q1) / L, q1, r.x0, r.x1))
  // N extreme: qx(x) = qx1 + (qx2−qx1)·x/L = 0
  xs.push(...rootsIn(0, (qx2 - qx1) / L, qx1, r.x0, r.x1))

  let Mmax = -Infinity, Mmin = Infinity, Vabs = 0, Nmin = Infinity, Nmax = -Infinity
  for (const x of xs) {
    const { N, V, M } = memberInternalForces(ef, x, L)
    if (M > Mmax) Mmax = M
    if (M < Mmin) Mmin = M
    const av = Math.abs(V)
    if (av > Vabs) Vabs = av
    if (N < Nmin) Nmin = N
    if (N > Nmax) Nmax = N
  }
  return { Mmax, Mmin, Vabs, Nmin, Nmax }
}

// ── Envelope across combinations ─────────────────────────────────────────────

export interface ZoneDemand {
  /** Max sagging design moment in zone (≥ 0), kN·m */
  MuPos: number
  /** Max hogging design moment in zone (≤ 0), kN·m */
  MuNeg: number
  /** Max |V| in zone, kN */
  Vu: number
  governing: { M: LoadComboId; V: LoadComboId }
}

export interface MemberZoneDemands {
  zones: Record<ZoneId, ZoneDemand>
  /** Governing axial compression across combos/zones (≥ 0), kN. Solver N is tension-positive. */
  PuMaxCompression: number
}

export function envelopeMemberDemands(
  perComboEf: Record<LoadComboId, MemberEndForces>,
  L: number,
  h_mm: number,
): MemberZoneDemands {
  const ranges = zoneRanges(L, h_mm)
  const zones = {} as Record<ZoneId, ZoneDemand>
  let PuMaxCompression = 0

  for (const zid of Object.keys(ranges) as ZoneId[]) {
    const z: ZoneDemand = { MuPos: 0, MuNeg: 0, Vu: 0, governing: { M: "", V: "" } }
    for (const [comboId, ef] of Object.entries(perComboEf)) {
      const e = zoneExtremes(ef, L, ranges[zid])
      if (e.Mmax > z.MuPos) {
        z.MuPos = e.Mmax
        z.governing.M = comboId
      }
      if (e.Mmin < z.MuNeg) {
        z.MuNeg = e.Mmin
        if (Math.abs(e.Mmin) > Math.abs(z.MuPos)) z.governing.M = comboId
      }
      if (e.Vabs > z.Vu) {
        z.Vu = e.Vabs
        z.governing.V = comboId
      }
      const comp = -e.Nmin // compression is negative N
      if (comp > PuMaxCompression) PuMaxCompression = comp
    }
    zones[zid] = z
  }

  return { zones, PuMaxCompression }
}

// ── Frame-type demand minimums ───────────────────────────────────────────────

/**
 * Seismic moment floors applied to demands (book §5.4 / Gambar 5-9):
 *  - SMF (18.6.3.2): Mu⁺ at each support ≥ ½|Mu⁻| there; every zone's Mu⁺ and
 *    |Mu⁻| ≥ ¼ of the max support |Mu⁻|.
 *  - IMF (18.4.2.2): same shape with ⅓ (at support) and ⅕ (anywhere).
 *  - OMF: no-op.
 * Returns a new object; the input is not mutated.
 */
export function applyFrameMomentMinimums(
  d: MemberZoneDemands,
  frameType: FrameType,
): MemberZoneDemands {
  if (frameType === "OMF") return d
  const fSupport = frameType === "SMF" ? 1 / 2 : 1 / 3
  const fAnywhere = frameType === "SMF" ? 1 / 4 : 1 / 5

  const out: MemberZoneDemands = {
    PuMaxCompression: d.PuMaxCompression,
    zones: {
      "end-i": { ...d.zones["end-i"], governing: { ...d.zones["end-i"].governing } },
      midspan: { ...d.zones["midspan"], governing: { ...d.zones["midspan"].governing } },
      "end-j": { ...d.zones["end-j"], governing: { ...d.zones["end-j"].governing } },
    },
  }

  for (const end of ["end-i", "end-j"] as ZoneId[]) {
    const z = out.zones[end]
    z.MuPos = Math.max(z.MuPos, fSupport * Math.abs(z.MuNeg))
  }
  const maxSupportNeg = Math.max(
    Math.abs(out.zones["end-i"].MuNeg),
    Math.abs(out.zones["end-j"].MuNeg),
  )
  for (const zid of Object.keys(out.zones) as ZoneId[]) {
    const z = out.zones[zid]
    z.MuPos = Math.max(z.MuPos, fAnywhere * maxSupportNeg)
    z.MuNeg = Math.min(z.MuNeg, -fAnywhere * maxSupportNeg)
  }
  return out
}

// ── Internal gravity combination (Vg for capacity-design shear) ──────────────

/**
 * Synthesize the 1.2D + 1.0L gravity combination used for Vg in Ve
 * (18.6.5 / Gambar 5-17). Kind-matched over enabled cases: every enabled Dead
 * case (incl. the locked Selfweight case when enabled) at 1.2, every enabled
 * Live case at 1.0. Never shown in the UI.
 */
export function buildGravityCombo(loadCases: Record<LoadCaseId, LoadCase>): LoadCombination {
  const terms: { factor: number; caseId: LoadCaseId }[] = []
  for (const c of Object.values(loadCases)) {
    if (!c.enabled) continue
    if (c.kind === "Dead") terms.push({ factor: 1.2, caseId: c.id })
    else if (c.kind === "Live") terms.push({ factor: 1.0, caseId: c.id })
  }
  return {
    id: "__design_gravity__",
    name: "1.2D + 1.0L (design internal)",
    terms,
    source: "custom",
    enabled: true,
  }
}

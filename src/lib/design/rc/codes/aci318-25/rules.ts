/**
 * ACI 318-25 — scalar code rules shared by the beam + column strategies of this
 * code. The numbers that distinguish one code edition from another live here;
 * beam.ts and column.ts read them.
 *
 * Edition deltas vs SNI 2847:2019 (≡ ACI 318-14, see ../sni2847-19/rules.ts):
 *   - `lambdaS(d)`  — one-way-shear size-effect factor (22.5.5.1.3). NOT in 318-14.
 *   - `epsTC(cr)`   — tension-controlled strain limit εty+0.003 (Table 21.2.2),
 *                     vs the fixed 0.005 used by 318-14.
 *   - `sqrtFc(fc)`  — √f'c ≤ 8.3 MPa cap (22.5.3.1). Edition-stable, so the SNI
 *                     copy carries it too; it only bites at f'c > 68.9 MPa.
 */

import { minClearSpacing } from "../../shared/bar-geometry"

export const EPS_CU = 0.003 // concrete crushing strain (22.2.2.1)
export const EPS_T_MIN = 0.005 // legacy tension-controlled constant (kept for back-compat exports)

/** √f'c with the 22.5.3.1 cap (√f'c ≤ 8.3 MPa ⇒ f'c ≤ 68.9 MPa) applied to all
 *  shear/anchorage uses. Edition-stable — present since well before 318-14. */
export function sqrtFc(fc: number): number {
  return Math.sqrt(Math.min(fc, 8.3 * 8.3))
}

/** One-way-shear size-effect factor for members WITHOUT at least minimum shear
 *  reinforcement (ACI 318-25 §22.5.5.1.3): λs = √(2/(1+d/250)) ≤ 1. Members with
 *  ≥ Av,min keep λs = 1. ACI 318-14 / SNI 2847:2019 have no size effect (λs ≡ 1). */
export function lambdaS(d: number): number {
  return Math.min(1, Math.sqrt(2 / (1 + d / 250)))
}

/** Net tensile strain at the tension-controlled limit (ACI 318-25 Table 21.2.2):
 *  εty + 0.003, where εty = fy/Es. Drives `cMax` (singly-reinforced ceiling) and
 *  the φ ramp. ACI 318-14 / SNI 2847:2019 use a fixed 0.005 instead. */
export function epsTC(cr: { fy: number; Es: number }): number {
  return cr.fy / cr.Es + 0.003
}

/** Stress-block factor β₁ (22.2.2.4.3): 0.85 − 0.05(f'c−28)/7, clamped [0.65, 0.85]. */
export function beta1(fc: number): number {
  const b = 0.85 - (0.05 * (fc - 28)) / 7
  return Math.min(0.85, Math.max(0.65, b))
}

/** Minimum flexural steel (9.6.1.2): max(0.25√f'c, 1.4)/fy · bw·d. mm² */
export function asMin(fc: number, fy: number, bw: number, d: number): number {
  return (Math.max(0.25 * Math.sqrt(fc), 1.4) / fy) * bw * d
}

/** Max centre spacing of flexural tension bars (24.3.2), fs = ⅔·fy (24.3.2.1). */
export function maxCrackSpacing(fy: number, ccToBar: number): number {
  const fs = (2 / 3) * fy
  const r = 280 / fs
  return Math.min(380 * r - 2.5 * ccToBar, 300 * r)
}

/** Column longitudinal ratio bounds (10.6.1.1 / 25.7.2.1): 1% ≤ ρg ≤ 8%. */
export const RHO_G_MIN = 0.01
export const RHO_G_MAX = 0.08

/** Min clear spacing between column longitudinal bars (25.2.3): greatest of
 *  40 mm, 1.5·db, (4/3)·d_agg. (Beams use 25 mm via shared minClearSpacing.) */
export function minColumnClearSpacing(db: number): number {
  return Math.max(40, 1.5 * db, minClearSpacing(db))
}

/**
 * ACI 318-25 / SNI 2847:2019 — scalar code rules shared by the beam + column
 * strategies of this code. The numbers that distinguish one code edition from
 * another live here; beam.ts and column.ts read them.
 *
 * NOTE: this is the v1.1.2 restructure baseline — byte-identical to the former
 * flat rc/ math. Edition-specific updates (true 318-25 vs 2847:2019 deltas) are
 * future work; the SNI copy currently mirrors this file exactly.
 */

import { minClearSpacing } from "../../shared/bar-geometry"

export const EPS_CU = 0.003 // concrete crushing strain (22.2.2.1)
export const EPS_T_MIN = 0.005 // tension-controlled limit strain for beams (9.3.3.1 / 21.2.2)

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

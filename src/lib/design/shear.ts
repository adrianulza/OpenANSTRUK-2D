/**
 * RC beam shear design / check — ACI 318-14 / SNI 2847:2019 (book §5.4.2.2).
 *
 * Forces in kN at the boundary; fc/fyt in MPa, bw/d/spacing in mm.
 */

import { barArea, barDia, type RebarSize } from "./rebar"
import type { DesignCriteria } from "./types"

/** Concrete shear capacity Vc = 0.17·λ·√f'c·bw·d (22.5.5.1). kN */
export function vc(lambda: number, fc: number, bw: number, d: number): number {
  return (0.17 * lambda * Math.sqrt(fc) * bw * d) / 1e3
}

/** Cross-section ceiling Vc + 0.66√f'c·bw·d (22.5.1.2). kN */
export function vMaxLimit(vcVal: number, fc: number, bw: number, d: number): number {
  return vcVal + (0.66 * Math.sqrt(fc) * bw * d) / 1e3
}

/** Minimum stirrups Av,min/s = max(0.062√f'c, 0.35)·bw/fyt (9.6.3.4). mm²/mm */
export function avMinPerS(fc: number, fyt: number, bw: number): number {
  return (Math.max(0.062 * Math.sqrt(fc), 0.35) * bw) / fyt
}

/**
 * Required Av/s for the design shear (R22.5.10.5):
 * (Vu − φVc)/(φ·fyt·d), floored at Av,min/s. Returns mm²/m.
 */
export function avSRequired(
  Vdesign: number, // kN
  phiVc: number, // kN
  fyt: number,
  d: number,
  cr: DesignCriteria,
  fc: number,
  bw: number,
): number {
  const demand = Math.max(0, (Vdesign - phiVc) * 1e3) / (cr.phiShear * fyt * d) // mm²/mm
  return Math.max(demand, avMinPerS(fc, fyt, bw)) * 1000
}

/**
 * Suggest a stirrup spacing for a required Av/s (mm²/m): spacing rounded DOWN
 * to 25 mm steps, capped by `sCap` (e.g. SMF end-zone limit) and clamped ≥ 25.
 */
export function suggestStirrup(
  avS_per_m: number,
  legs: number,
  size: RebarSize,
  sCap?: number,
): { size: RebarSize; legs: number; spacing: number } {
  const Av = legs * barArea(size) // mm²
  let s = avS_per_m > 0 ? (Av / avS_per_m) * 1000 : sCap ?? 600
  if (sCap !== undefined) s = Math.min(s, sCap)
  s = Math.max(25, Math.floor(s / 25) * 25)
  return { size, legs, spacing: s }
}

/** SMF hoop spacing limit in end (hinge) zones (18.6.4.4): min(d/4, 6db, 150). mm */
export function smfEndZoneSpacingMax(d: number, dbMain: number): number {
  return Math.min(d / 4, 6 * dbMain, 150)
}

/** IMF hoop spacing limit in end (hinge) zones (18.4.2.5):
 *  min(d/4, 8·db,long, 24·db,hoop, 300). mm */
export function imfEndZoneSpacingMax(d: number, dbLong: number, dbHoop: number): number {
  return Math.min(d / 4, 8 * dbLong, 24 * dbHoop, 300)
}

/** Vs threshold of 9.7.6.2.2: 0.33·√f'c·bw·d. Above it, the general max spacing
 *  halves (d/2→d/4, 600→300). Also the practical upper bound on Vs design. kN */
export function vsSpacingThreshold(fc: number, bw: number, d: number): number {
  return (0.33 * Math.sqrt(fc) * bw * d) / 1e3
}

/** General stirrup spacing cap (9.7.6.2.2): min(d/2, 600), tightening to
 *  min(d/4, 300) when Vs exceeds 0.33√f'c·bw·d. mm */
export function generalSpacingMax(d: number, highVs = false): number {
  return highVs ? Math.min(d / 4, 300) : Math.min(d / 2, 600)
}

/** Provided Av/s from an arrangement, mm²/m. */
export function avSProvided(legs: number, size: RebarSize, spacing: number): number {
  if (spacing <= 0) return 0
  return ((legs * barArea(size)) / spacing) * 1000
}

/** φVn for provided stirrups: φ(Vc + Av/s·fyt·d). Inputs kN / mm²/m / MPa / mm → kN. */
export function phiVnProvided(
  vcVal: number, // kN (already zeroed for SMF end zones by caller)
  avS_per_m: number,
  fyt: number,
  d: number,
  cr: DesignCriteria,
): number {
  const Vs = ((avS_per_m / 1000) * fyt * d) / 1e3 // kN
  return cr.phiShear * (vcVal + Vs)
}

export { barDia }

/**
 * Steel design criteria (AISC 360-16 / SNI 1729:2020) — global, reference software-
 * Preferences style. Pure domain module: no React imports.
 */

import type { FrameType } from "../core/types"

export type SteelDesignCode = "AISC360-16_SNI1729-2020"

export interface SteelCriteria {
  code: SteelDesignCode
  frameType: FrameType
  /** Specified minimum yield stress, MPa */
  Fy: number
  /** Specified minimum tensile strength, MPa */
  Fu: number
  /** Elastic modulus, MPa */
  E: number
  /** φ, flexure (LRFD, F1) */
  phiB: number
  /** φ, shear (G1) */
  phiV: number
  /** φ, compression (E1) */
  phiC: number
  /**
   * Apply the AISC H1.3 alternative (separate in-plane / out-of-plane checks)
   * to BUILT-UP I-shapes.
   *
   * AISC H1.3 is titled "Doubly Symmetric ROLLED Compact Members", and this
   * engine models its parametric IWF as built-up throughout — that is why the
   * kc term and φv = 0.90 are used rather than the rolled-shape shortcuts. the reference manual
   * §3.6.1 does not repeat the "rolled" restriction and reference software applies the
   * alternative to built-up shapes, so this is a genuine AISC-vs-tool
   * divergence rather than a transcription question.
   *
   * H1.3 reports min(H1-1, in-plane, out-of-plane), so enabling it can only
   * LOWER the reported D/C. Default false = AISC-strict. Set true to reconcile
   * against reference software.
   */
  h13ForBuiltUp: boolean
}

export function defaultSteelCriteria(): SteelCriteria {
  return {
    code: "AISC360-16_SNI1729-2020",
    frameType: "OMF",
    Fy: 250,
    Fu: 400,
    E: 200000,
    phiB: 0.9,
    phiV: 0.9,
    phiC: 0.9,
    h13ForBuiltUp: false,
  }
}

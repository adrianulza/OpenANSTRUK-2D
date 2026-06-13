/**
 * Steel design criteria (AISC 360-16 / SNI 1729:2020) — global, SAP2000-
 * Preferences style. Pure domain module: no React imports.
 *
 * STUB (v1.1.2): the field set + defaults are in place so the UI can be built and
 * the criteria can be persisted in App state. Member-level steel design mechanics
 * (flexure / compression / shear per geometry) are implemented in a later pass —
 * see docs/DESIGN_RULES.md "Steel design (planned)".
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
  }
}

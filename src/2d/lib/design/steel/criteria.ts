/**
 * Steel design criteria (AISC 360-16 + AISC 341-16 / SNI 1729:2020 + SNI 7860).
 * Global, SAP2000-Preferences style. Pure domain module: no React imports.
 */

import type { FrameType } from "../core/types"

/**
 * Design code edition.
 *
 * **The two editions share identical math.** SNI 1729:2020 adopts AISC 360-16
 * and SNI 7860 adopts AISC 341-16, so unlike the RC side — where ACI 318-25 and
 * SNI 2847:2019 genuinely diverge (εt, λs, the third Ash equation) — there is no
 * steel clause that differs between them. `code` is a **labelling axis only**:
 * it selects the framing-type nomenclature the user sees (RMK/RMM/RMB vs
 * SMF/IMF/OMF) and nothing else.
 *
 * If a future SNI amendment does diverge, this is the hook to branch on — but
 * do NOT assume it already does.
 */
export type SteelCode = "AISC360-341-16" | "SNI1729-2020"

export const STEEL_CODE_LABELS: Record<SteelCode, string> = {
  "AISC360-341-16": "AISC 360/341-16",
  "SNI1729-2020": "SNI 1729:2020",
}

export interface SteelCriteria {
  code: SteelCode
  /**
   * Seismic framing type. Drives AISC 341 detailing — see `steel/seismic.ts`.
   * `OMF` means no seismic ductility requirement, i.e. AISC 360 alone, which is
   * the default and reproduces the pre-seismic behaviour exactly.
   *
   * Only MOMENT frames are modelled. Braced-frame systems (OCBF/SCBF/EBF/BRBF)
   * are out of scope: they need brace mechanism analyses this engine cannot run.
   */
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
    code: "SNI1729-2020",
    frameType: "OMF",
    Fy: 250,
    Fu: 400,
    E: 200000,
    phiB: 0.9,
    phiV: 0.9,
    phiC: 0.9,
  }
}

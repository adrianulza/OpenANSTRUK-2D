/**
 * RC design criteria (ACI 318-14 / SNI 2847:2019) — global, SAP2000-Preferences
 * style. Pure domain module: no React imports.
 */

import type { FrameType } from "../core/types"

export type RcDesignCode = "ACI318-14_SNI2847-2019"

export interface RcCriteria {
  code: RcDesignCode
  frameType: FrameType
  /** Main (longitudinal) bar yield strength, MPa */
  fy: number
  /** Transverse (stirrup) bar yield strength, MPa */
  fyt: number
  /** Steel elastic modulus, MPa */
  Es: number
  /** φ, tension-controlled flexure (21.2.1) */
  phiTension: number
  /** φ, shear (21.2.1) */
  phiShear: number
  /** φ, compression-controlled (tied) — lower bound of the flexure ramp */
  phiCompression: number
  /** Lightweight-concrete modification factor (normal-weight = 1.0) */
  lambda: number
  /** Stirrup legs crossing the shear plane */
  stirrupLegs: number
}

export function defaultRcCriteria(): RcCriteria {
  return {
    code: "ACI318-14_SNI2847-2019",
    frameType: "OMF",
    fy: 420,
    fyt: 420,
    Es: 200000,
    phiTension: 0.9,
    phiShear: 0.75,
    phiCompression: 0.65,
    lambda: 1.0,
    stirrupLegs: 2,
  }
}

/**
 * RC code registry. Maps a `RcCode` id to its code module (beam + column +
 * report math). The strategy and UI resolve the active module via `getRcCode`
 * and call the same named functions regardless of which code is selected — the
 * two modules expose an identical surface but now DIVERGE in their math:
 *   - sni2847-19 = the ACI 318-14 baseline (fixed εt = 0.005, no shear size effect).
 *   - aci318-25  = adds εty+0.003 tension-controlled limit (Table 21.2.2) and the
 *                  one-way-shear size-effect factor λs (22.5.5.1.3).
 * Frame-type detailing (OMF/IMF/SMF) is edition-stable and identical in both.
 */

import * as aci318_25 from "./aci318-25"
import * as sni2847_19 from "./sni2847-19"

export type RcCode = "ACI318-25" | "SNI2847-19"

export const RC_CODES = {
  "ACI318-25": aci318_25,
  "SNI2847-19": sni2847_19,
} as const

/** Shape every RC code module conforms to (taken from the ACI module). */
export type RcCodeModule = typeof aci318_25

export const RC_CODE_LABELS: Record<RcCode, string> = {
  "ACI318-25": "ACI 318-25",
  "SNI2847-19": "SNI 2847:2019",
}

export function getRcCode(code: RcCode): RcCodeModule {
  // SNI 2847:2019 is the main code → it is the fallback for an unknown id.
  return RC_CODES[code] ?? sni2847_19
}

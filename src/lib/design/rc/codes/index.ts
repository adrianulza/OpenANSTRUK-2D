/**
 * RC code registry. Maps a `RcCode` id to its code module (beam + column +
 * report math). The strategy and UI resolve the active module via `getRcCode`
 * and call the same named functions regardless of which code is selected — the
 * two modules expose an identical surface (the v1.1.2 restructure ships them
 * byte-identical; edition-specific divergence is future work).
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
  return RC_CODES[code] ?? aci318_25
}

/**
 * Steel member design strategy (AISC 360-16 / SNI 1729:2020).
 *
 * STUB (v1.1.2): the dispatch seam exists so the orchestrator can route steel
 * sections here, but member-level checks (flexure F2–F5, compression E3, shear
 * G2) are not yet implemented. Returns `not-implemented` so the canvas/report
 * render nothing for steel members without crashing.
 *
 * Pure domain module: no React imports.
 */

import type { MemberId } from "@/lib/model"
import type { LoadComboId } from "@/lib/load-cases"
import type { MemberEndForces } from "@/lib/solver"
import type { MemberDesignResult } from "../core/types"
import type { MemberZoneDemands } from "../core/demands"
import type { SteelCriteria } from "./criteria"
import type { SteelSectionInput } from "./types"

export interface SteelMemberInput {
  memberId: MemberId
  /** Section identity + derived properties live on the Section; pulled in when
   *  the real strategy lands. */
  L: number
  di: SteelSectionInput
  cr: SteelCriteria
  efByCombo: Record<LoadComboId, MemberEndForces>
  raw: MemberZoneDemands
  Pu: number
  isVertical: boolean
}

/** Design one steel member. STUB — returns not-implemented. */
export function designMemberSteel(inp: SteelMemberInput): MemberDesignResult {
  return { memberId: inp.memberId, status: "not-implemented", material: "steel", Pu: inp.Pu }
}

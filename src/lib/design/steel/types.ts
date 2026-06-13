/**
 * Steel per-section design input types. Pure domain module: no React imports.
 *
 * STUB (v1.1.2): minimal field set so per-section steel inputs can be stored and
 * the tool slot exists. Real flexure/compression checks (and the inputs they
 * need, e.g. unbraced length Lb, Cb, effective-length K) are fleshed out in a
 * later pass — see docs/DESIGN_RULES.md "Steel design (planned)".
 */

import type { SectionId } from "@/lib/model"
import type { ElementType } from "../core/types"

export interface SteelSectionInput {
  material: "steel"
  sectionId: SectionId
  /** Beam vs column (auto = by orientation + axial threshold). */
  elementType: ElementType
  /** Laterally-unbraced length for LTB, m (0 / undefined → assume continuously braced). */
  Lb?: number
  /** Lateral-torsional buckling modification factor Cb (F1, default 1.0). */
  Cb?: number
}

export function defaultSteelSectionInput(sectionId: SectionId): SteelSectionInput {
  return {
    material: "steel",
    sectionId,
    elementType: "auto",
    Lb: 0,
    Cb: 1.0,
  }
}

/**
 * Steel per-section design input. Pure domain module: no React imports.
 *
 * Unlike RC there is no "required" vs "checked" mode. Steel design here is
 * always a CHECK of the section the user assigned — there is no rebar-style
 * "solve for the missing quantity". Auto-selecting a lighter section from a
 * catalogue is a separate feature and out of scope.
 */

import type { SectionId } from "@/lib/model"
import type { ElementType } from "../core/types"

export interface SteelSectionInput {
  material: "steel"
  sectionId: SectionId
  /** Beam vs column (auto = by orientation + axial threshold). */
  elementType: ElementType
  /**
   * Laterally-unbraced length for LTB, m. `undefined` or 0 means "use the full
   * member length", which is the conservative default — OpenAnstruk has no
   * intermediate lateral-brace concept, so a shorter Lb must be entered by
   * hand when the real structure provides bracing.
   */
  Lb?: number
  /**
   * LTB modification factor Cb (AISC F1-1). `undefined` = compute it from the
   * member's own moment diagram (the accurate default). A number overrides it;
   * enter 1.0 for the conservative uniform-moment assumption.
   */
  Cb?: number
  /**
   * Effective length factors. Default 1.0 for both, which is what the AISC
   * Direct Analysis Method prescribes (K = 1.0 always) and what a braced frame
   * warrants. Sway-frame K2 via the alignment-chart nomograph is not computed.
   */
  K33?: number
  K22?: number
}

export function defaultSteelSectionInput(sectionId: SectionId): SteelSectionInput {
  return {
    material: "steel",
    sectionId,
    elementType: "auto",
    Lb: 0,
    Cb: undefined, // auto-compute from the moment diagram
    K33: 1.0,
    K22: 1.0,
  }
}

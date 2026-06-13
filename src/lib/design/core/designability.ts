/**
 * Designability registry — which (material, section geometry, element type)
 * combinations the Design tab supports, and which are actually implemented.
 *
 * The full target matrix is declared here so the UI can show planned-but-not-yet
 * combinations as "N.A.", and so enabling a new geometry/material in a later pass
 * is a data edit (flip `implemented`) plus its strategy. Pure domain module.
 */

import type { Section, SectionShape } from "@/lib/model"
import type { DesignMaterial } from "./types"

export interface DesignSupportEntry {
  material: DesignMaterial
  kind: SectionShape
  /** Designable as a beam (flexure + shear). */
  beam: boolean
  /** Designable as a column (axial + flexure). */
  column: boolean
  /** Mechanics actually built. `false` → listed in the registry but treated as
   *  not-designable at runtime (shows as N.A. in the picker). */
  implemented: boolean
}

/**
 * Target support matrix.
 *   RC:    rect (beam + column), circle (column only), tee (beam only)
 *   Steel: IWF, angle, CHS, RHS (beam + column)
 * Only RC-rectangular is implemented today; the rest are planned (see
 * docs/DESIGN_RULES.md). Flip `implemented` when a strategy is added.
 */
export const DESIGN_SUPPORT: DesignSupportEntry[] = [
  { material: "rc", kind: "rect", beam: true, column: true, implemented: true },
  { material: "rc", kind: "circle", beam: false, column: true, implemented: false },
  { material: "rc", kind: "tee", beam: true, column: false, implemented: false },
  { material: "steel", kind: "iwf", beam: true, column: true, implemented: false },
  { material: "steel", kind: "angle", beam: true, column: true, implemented: false },
  { material: "steel", kind: "chs", beam: true, column: true, implemented: false },
  { material: "steel", kind: "rhs", beam: true, column: true, implemented: false },
]

/** Material family a section belongs to, or null if it can't be designed at all. */
export function materialOf(s: Section | undefined): DesignMaterial | null {
  if (!s) return null
  if (s.materialClass === "concrete") return "rc"
  if (s.materialClass === "steel") return "steel"
  return null
}

function entryFor(material: DesignMaterial, kind: SectionShape): DesignSupportEntry | undefined {
  return DESIGN_SUPPORT.find((e) => e.material === material && e.kind === kind)
}

/** Section geometry/strength is valid for its material's design path. */
function hasValidGeometry(s: Section, material: DesignMaterial): boolean {
  const dims = s.shape?.dims ?? {}
  if (material === "rc") {
    // Rect uses b×h; concrete needs f'c. (Circle/tee gain their own checks when implemented.)
    return (
      (s.strength?.fc ?? 0) > 0 &&
      (dims.b ?? 0) > 0 &&
      (dims.h ?? 0) > 0
    )
  }
  // Steel: needs a yield stress. Geometry validity per shape lands with the strategy.
  return (s.strength?.fy ?? 0) > 0
}

/**
 * Whether a section can be designed today (an IMPLEMENTED registry entry whose
 * material + geometry + strength check out). RC-rectangular only for now — this
 * preserves the previous `isSectionDesignable` behaviour exactly.
 */
export function isSectionDesignable(s: Section | undefined): boolean {
  if (!s || !s.shape) return false
  const material = materialOf(s)
  if (!material) return false
  const entry = entryFor(material, s.shape.kind)
  if (!entry || !entry.implemented) return false
  return hasValidGeometry(s, material)
}

/** Whether a section is listed in the target matrix for its material (implemented
 *  or not) — used to show planned geometries as "N.A." rather than hiding them. */
export function isSectionInTargetMatrix(s: Section | undefined, material: DesignMaterial): boolean {
  if (!s || !s.shape) return false
  if (materialOf(s) !== material) return false
  return !!entryFor(material, s.shape.kind)
}

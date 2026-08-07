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
 *   Steel: IWF, RHS, CHS, tee, single angle (beam + column)
 *
 * Everything is implemented except the RC tee, which still needs the ACI
 * flanged-beam flexure path (effective flange width; rectangular vs true-T
 * behaviour depending on whether the stress block falls inside the flange).
 * Flip `implemented` when a strategy is added — and remember `hasValidGeometry`
 * below needs a matching branch, or the new shape gets validated against the
 * wrong dimension keys.
 */
export const DESIGN_SUPPORT: DesignSupportEntry[] = [
  { material: "rc", kind: "rect", beam: true, column: true, implemented: true },
  { material: "rc", kind: "circle", beam: false, column: true, implemented: true },
  { material: "rc", kind: "tee", beam: true, column: false, implemented: false },
  { material: "steel", kind: "iwf", beam: true, column: true, implemented: true },
  { material: "steel", kind: "chs", beam: true, column: true, implemented: true },
  { material: "steel", kind: "rhs", beam: true, column: true, implemented: true },
  // AISC F9 — singly symmetric, so the capacity depends on the sign of the
  // moment; a hogging tee is checked with H2 rather than H1.
  { material: "steel", kind: "tee", beam: true, column: true, implemented: true },
  // AISC F10 + E4 + H2 — principal axes rotated from the geometric axes, so one
  // geometric moment resolves into two principal components.
  { material: "steel", kind: "angle", beam: true, column: true, implemented: true },
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
    // Concrete needs f'c. Rect uses b×h; circle uses the diameter d.
    if ((s.strength?.fc ?? 0) <= 0) return false
    if (s.shape?.kind === "circle") return (dims.d ?? 0) > 0
    return (dims.b ?? 0) > 0 && (dims.h ?? 0) > 0
  }
  // Steel: needs a yield stress, a modulus, and the derived section moduli the
  // AISC checks consume (S33/Z33/r33/r22). Legacy manual sections have no
  // `derived` cache, so they are correctly rejected rather than designed off
  // zeros.
  if (!((s.strength?.fy ?? 0) > 0) || !(s.E > 0)) return false
  const d = s.derived
  if (!d) return false
  if (!(d.S33b > 0 && d.Z33 > 0 && d.r22 > 0 && d.r33 > 0)) return false

  // Explicit per-shape dimension keys with a closed default. This used to fall
  // through to the IWF keys for any shape that was not chs/rhs, which was
  // harmless only while every other steel shape was `implemented: false` — the
  // moment angle and tee were switched on, that fall-through would have
  // validated them against `tf`/`tw` they do not have.
  switch (s.shape?.kind) {
    case "iwf":
      return (dims.b ?? 0) > 0 && (dims.h ?? 0) > 0 && (dims.tf ?? 0) > 0 && (dims.tw ?? 0) > 0
    case "chs":
      return (dims.d ?? 0) > 0 && (dims.t ?? 0) > 0
    case "rhs":
      return (dims.b ?? 0) > 0 && (dims.h ?? 0) > 0 && (dims.t ?? 0) > 0
    case "tee":
      return (
        (dims.bf ?? 0) > 0 && (dims.tf ?? 0) > 0 &&
        (dims.bw ?? 0) > 0 && (dims.h ?? 0) > 0
      )
    case "angle":
      // `d` (the vertical leg) is optional for back-compatibility: sections
      // saved before unequal legs existed stored only {b, t} and mean d = b.
      return (
        (dims.b ?? 0) > 0 && (dims.t ?? 0) > 0 && (dims.d ?? dims.b ?? 0) > 0 &&
        // AISC F10 is evaluated on the principal axes, which a section authored
        // before this pass will not have cached.
        d.principal !== undefined
      )
    default:
      return false
  }
}

/**
 * Whether a section can be designed today: an IMPLEMENTED registry entry whose
 * material, geometry and strength all check out.
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

/**
 * RC element-type resolution — beam vs column, and what `auto` resolves to.
 *
 * **Why this is a section property, not a member one.** A concrete section's
 * reinforcement definition *is* its design type: a column takes a perimeter bar
 * grid and ties, a beam takes top/bottom/side bars and stirrups. They are
 * different data, not two views of one thing, so the choice belongs where the
 * rebar is defined. This matches ETABS, whose section dialog offers
 * "P-M2-M3 Design (Column)" against "M3 Design Only (Beam)" — and matches how
 * engineers actually work, defining `C1 500×500` and `B1 300×500` separately
 * rather than reusing one section as both.
 *
 * Steel is the opposite and deliberately so: nothing per-section differs between
 * a steel beam and a steel column, and the same IWF genuinely serves as both, so
 * steel infers a per-MEMBER role from geometry instead (`steel/member-role.ts`).
 * The asymmetry between the two tools is principled, not an oversight.
 *
 * Pure domain module: no React imports.
 */

import type { StructureModel, SectionId } from "@/lib/model"
import type { ElementType } from "./types"

/**
 * Resolve a section's element-type setting for one member. Explicit beam/column
 * is honoured; `auto` picks by orientation (vertical → column, horizontal →
 * beam) but is promoted to column whenever the axial compression reaches the
 * beam gate Pu ≥ 0.1·f'c·Ag (ACI 18.6.1 — the code's own boundary between a
 * flexural member and a member carrying axial).
 *
 * An explicit `beam` is NOT promoted. The user said beam; if the member then
 * carries too much axial the honest answer is `axial-exceeded`, not a silent
 * switch to a formulation they did not ask for.
 */
export function resolveElementType(
  et: ElementType,
  isVertical: boolean,
  Pu: number,
  PuLimit: number,
): "beam" | "column" {
  if (et === "beam") return "beam"
  if (et === "column") return "column"
  if (Pu >= PuLimit) return "column"
  return isVertical ? "column" : "beam"
}

/** What `auto` resolves to for a section, as shown next to the Auto option. */
export type AutoElementLabel = "Beam" | "Column" | "mixed" | "—"

/**
 * What `auto` would give the members using this section, from **orientation
 * alone**.
 *
 * Orientation alone because both editors of this field — the MATERIAL flyout and
 * the DESIGN SCHEDULE — must answer identically, and the MATERIAL flyout lives
 * in the Model tab where no design result exists. The axial gate above can still
 * promote a horizontal member to column at design time, which is why the control
 * says so in its help text rather than pretending this label is the last word.
 *
 * `mixed` when the section's members disagree — the honest answer for a section
 * used both ways, and the cue to define two sections instead.
 */
export function sectionAutoLabel(
  model: StructureModel | undefined,
  sectionId: SectionId | null | undefined,
): AutoElementLabel {
  if (!model || !sectionId) return "—"
  let sawBeam = false
  let sawColumn = false
  for (const m of Object.values(model.members)) {
    if (m.section !== sectionId) continue
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (!a || !b) continue
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) sawColumn = true
    else sawBeam = true
  }
  if (sawBeam && sawColumn) return "mixed"
  if (sawColumn) return "Column"
  if (sawBeam) return "Beam"
  return "—"
}

/** Option label for the Type control — `auto` shows what it resolves to. */
export function elementTypeOptionLabel(et: ElementType, auto: AutoElementLabel): string {
  if (et === "beam") return "Beam"
  if (et === "column") return "Column"
  return auto === "—" ? "Auto" : `Auto (${auto})`
}

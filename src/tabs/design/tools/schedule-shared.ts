/**
 * Pure table helpers shared by the two model-wide design tools.
 *
 * DESIGN SCHEDULE (setup — what each section is designed AS) and DESIGN REPORT
 * (results — how each member did) were one tool with a view toggle, which meant
 * neither was designed for its job. They are separate tools now; these are the
 * non-component parts they genuinely share. The components live beside this in
 * `schedule-controls.tsx` — same split as verdict-group / verdict-group-context.
 */

import type { SectionId, StructureModel } from "@/lib/model"
import { formatValue } from "@/lib/constants"

export const TH = "text-left font-semibold text-[#1a2f5e] py-1 px-1.5"
export const TD = "py-1 px-1.5 align-top"

export type MaterialFilter = "all" | "rc" | "steel"

export function materialLabel(m: string | null): string {
  if (m === "rc") return "RC"
  if (m === "steel") return "Steel"
  return "—"
}

export function geometryOf(model: StructureModel, sectionId: SectionId): string {
  const sec = model.sections[sectionId]
  const shape = sec?.shape
  if (!shape) return "—"
  const { b, h } = shape.dims
  if (b && h) return `${formatValue(b)}×${formatValue(h)}`
  return shape.kind
}

/** Does a row survive the filter? Rows carry the display label ("RC"/"Steel"). */
export function passesMaterialFilter(rowMaterial: string, f: MaterialFilter): boolean {
  if (f === "all") return true
  return rowMaterial === (f === "steel" ? "Steel" : "RC")
}

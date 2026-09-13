import * as React from "react"
import { cn } from "@/lib/utils"
import type { SectionId, StructureModel } from "@/lib/model"
import { materialOf, isSectionDesignable } from "@/lib/design/core/designability"
import {
  asRcInput, type SectionDesignInput, type SectionDesignInputs,
} from "@/lib/design/core/section-input"
import type { DesignMode, ElementType } from "@/lib/design/core/types"
import { elementTypeOptionLabel, sectionAutoLabel } from "@/lib/design/core/element-type"
import { inferSteelRole, steelRoleLabel, type SteelMemberRole } from "@/lib/design/steel/member-role"
import {
  geometryOf, materialLabel, passesMaterialFilter, TD, TH, type MaterialFilter,
} from "./schedule-shared"
import { MaterialFilterChips } from "./schedule-controls"

interface DesignScheduleToolProps {
  model?: StructureModel
  inputs: SectionDesignInputs
  onPatchInput: (id: SectionId, patch: Partial<SectionDesignInput>) => void
}

/** One row: a section, the members carrying it, and how it is to be designed. */
interface ScheduleRow {
  sectionId: SectionId
  sectionName: string
  material: string
  geometry: string
  designable: boolean
  isSteel: boolean
  memberIds: string[]
  /** RC: the setting. Steel: nothing — role is inferred per member. */
  elementType: ElementType
  mode: DesignMode
  /** What `auto` resolves to for this section, from orientation. */
  auto: ReturnType<typeof sectionAutoLabel>
  /** Steel only: the inferred role per member, or "mixed". */
  steelRole: SteelMemberRole | "mixed" | null
}

/**
 * DESIGN SCHEDULE — the setup table. One row per **section**: what it is
 * designed as, and how.
 *
 * Rows are per section rather than per member because a concrete section's
 * reinforcement definition *is* its design type — a column takes a bar grid and
 * ties, a beam takes top/bottom bars and stirrups. Different data, not two views
 * of one thing. See `lib/design/core/element-type.ts`.
 *
 * Steel rows are read-only on both counts: its role is inferred per member from
 * geometry (one IWF is genuinely a beam here and a column there), and it has no
 * required/checked split at all.
 */
export function DesignScheduleToolContent({
  model,
  inputs,
  onPatchInput,
}: DesignScheduleToolProps) {
  const [materialFilter, setMaterialFilter] = React.useState<MaterialFilter>("all")

  const rows: ScheduleRow[] = React.useMemo(() => {
    if (!model) return []
    const bySection = new Map<SectionId, ScheduleRow>()
    for (const m of Object.values(model.members)) {
      let row = bySection.get(m.section)
      if (!row) {
        const sec = model.sections[m.section]
        const di = asRcInput(inputs[m.section], m.section)
        row = {
          sectionId: m.section,
          sectionName: sec?.name ?? m.section,
          material: materialLabel(materialOf(sec)),
          geometry: geometryOf(model, m.section),
          designable: isSectionDesignable(sec),
          isSteel: materialOf(sec) === "steel",
          memberIds: [],
          elementType: di.elementType,
          mode: di.mode,
          auto: sectionAutoLabel(model, m.section),
          steelRole: null,
        }
        bySection.set(m.section, row)
      }
      row.memberIds.push(m.id)
      if (row.isSteel) {
        const a = model.nodes[m.a]
        const b = model.nodes[m.b]
        const role = a && b ? inferSteelRole(a.x, a.y, b.x, b.y) : "beam"
        row.steelRole = row.steelRole === null || row.steelRole === role ? role : "mixed"
      }
    }
    return Array.from(bySection.values())
  }, [model, inputs])

  const shown = React.useMemo(
    () => rows.filter((r) => passesMaterialFilter(r.material, materialFilter)),
    [rows, materialFilter],
  )
  const materials = React.useMemo(
    () => new Set(rows.filter((r) => r.designable).map((r) => r.material)),
    [rows],
  )

  if (!model || rows.length === 0) {
    return (
      <p className="text-[10px] text-gray-500 leading-snug">
        No members to schedule. Add members in the Model tab.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <MaterialFilterChips value={materialFilter} onChange={setMaterialFilter} show={materials.size > 1} />

      <div className="overflow-x-auto">
        <table className="w-full text-[10px] border-collapse">
          <thead>
            <tr className="border-b border-gray-200">
              <th className={TH}>Section</th>
              <th className={TH}>Class</th>
              <th className={TH}>Geometry</th>
              <th className={TH}>Members</th>
              <th
                className={TH}
                title={
                  "Also set in the Model tab's MATERIAL tool, beside the section's " +
                  "dimensions — the same setting, either place. An explicit Beam or " +
                  "Column is never promoted: a forced beam carrying too much axial is " +
                  "refused rather than switched."
                }
              >
                Type
              </th>
              <th className={TH}>Mode</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr
                key={r.sectionId}
                className={cn("border-b border-gray-100", !r.designable && "text-gray-400")}
              >
                <td className={TD}>{r.sectionName}</td>
                <td className={TD}>{r.material}</td>
                <td className={cn(TD, "font-mono")}>{r.geometry}</td>
                <td className={cn(TD, "font-mono text-gray-500")}>{r.memberIds.join(", ")}</td>
                <td className={TD}>
                  {!r.designable ? "N.A." : r.isSteel ? (
                    <span className="text-gray-500" title="Inferred from each member's orientation">
                      {r.steelRole === "mixed" ? "mixed" : steelRoleLabel(r.steelRole ?? "beam")}
                    </span>
                  ) : (
                    <CellSelect
                      value={r.elementType}
                      options={(["auto", "beam", "column"] as ElementType[]).map((et) => [
                        et, elementTypeOptionLabel(et, r.auto),
                      ])}
                      onChange={(v) => onPatchInput(r.sectionId, { elementType: v as ElementType })}
                    />
                  )}
                </td>
                <td className={TD}>
                  {/* Steel has no required/checked split. A disabled control
                      would imply a setting that exists but is unavailable — a
                      different, and false, statement. */}
                  {!r.designable ? "N.A." : r.isSteel ? (
                    <span className="text-gray-400" title="Steel has no required/checked mode">—</span>
                  ) : (
                    <CellSelect
                      value={r.mode}
                      options={[["required", "As required"], ["checked", "As checked"]]}
                      onChange={(v) => onPatchInput(r.sectionId, { mode: v as DesignMode })}
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Reference register: this sits under a spec table, so it stays dry.
          Where the setting also lives, and the fact that an explicit choice is
          never promoted, are on the Type column's tooltip — true but not needed
          to read the table. */}
      <div className="space-y-0.5 text-[9px] text-gray-400 leading-snug">
        <p>RC: Auto reads orientation, switching to Column once Pu reaches 0.1·f′c·Ag.</p>
        <p>Steel: orientation only, not settable.</p>
      </div>
    </div>
  )
}

/** Compact dropdown sized for a table cell. */
function CellSelect({
  value, options, onChange,
}: {
  value: string
  options: [string, string][]
  onChange: (v: string) => void
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[10px] bg-white border border-gray-200 rounded px-1 py-0.5 cursor-pointer hover:border-[#2563eb] focus:outline-none focus:ring-1 focus:ring-[#2563eb]"
    >
      {options.map(([id, label]) => (
        <option key={id} value={id}>{label}</option>
      ))}
    </select>
  )
}

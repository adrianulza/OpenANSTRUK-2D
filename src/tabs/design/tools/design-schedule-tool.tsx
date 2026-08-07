import * as React from "react"
import { cn } from "@/lib/utils"
import type { SectionId, StructureModel } from "@/lib/model"
import { designColorForDC, formatValue } from "@/lib/constants"
import { materialOf, isSectionDesignable } from "@/lib/design/core/designability"
import {
  asRcInput, asSteelInput,
  type SectionDesignInput, type SectionDesignInputs,
} from "@/lib/design/core/section-input"
import type { DesignCriteria } from "@/lib/design/core/criteria"
import type { DesignRunResult, MemberDesignResult, ElementType, DesignMode } from "@/lib/design/core/types"
import type { RcSectionInput } from "@/lib/design/rc/types"

interface DesignScheduleToolProps {
  model?: StructureModel
  inputs: SectionDesignInputs
  /** Union-typed: this table edits both RC and steel sections. */
  onPatchInput: (id: SectionId, patch: Partial<SectionDesignInput>) => void
  criteria: DesignCriteria
  designResult?: DesignRunResult | null
}

type ViewMode = "overview" | "edit"

/** D/C cell value: a formatted number + colour, or a sentinel string. */
interface DC {
  text: string
  /** Numeric D/C when known (for grouping max); undefined for N.A./not-run. */
  value?: number
  color?: string
}

/** Per-member row model derived purely from existing state (no domain logic). */
interface MemberRow {
  memberId: string
  sectionId: SectionId
  sectionName: string
  material: string
  geometry: string
  designable: boolean
  type: "beam" | "column" | null
  /**
   * RC only. Steel has no required/checked split — there is no rebar-style
   * unknown to solve for — so a steel row shows its governing AISC equation
   * here instead of a meaningless mode.
   */
  mode: DesignMode | null
  isSteel: boolean
  /** Steel only: the AISC equation that governed, once a run has happened. */
  equation: string | null
  dc: DC
}

const NA: DC = { text: "N.A." }
const NOT_RUN: DC = { text: "not run", color: "#94a3b8" }

function memberDC(r: MemberDesignResult | undefined, designable: boolean): DC {
  if (!designable) return NA
  if (!r || r.status === "no-result") return NOT_RUN
  if (r.status === "not-implemented") return NA
  if (r.status === "axial-exceeded") return { text: "axial >", color: "#ef4444" }
  if (r.status !== "designed") return NA
  // Steel reports one combined-force ratio for beams and columns alike; only RC
  // splits the column channel out into a separate interaction result.
  const value = r.material === "steel"
    ? r.steel?.ratio
    : r.kind === "column" ? r.column?.worstDC : r.worstFlexureDC
  if (value === undefined) return NOT_RUN
  return { text: formatValue(value), value, color: designColorForDC(value) }
}

function geometryOf(model: StructureModel, sectionId: SectionId): string {
  const sec = model.sections[sectionId]
  const shape = sec?.shape
  if (!shape) return "—"
  const { b, h } = shape.dims
  if (b && h) return `${formatValue(b)}×${formatValue(h)}`
  return shape.kind
}

function materialLabel(m: string | null): string {
  if (m === "rc") return "RC"
  if (m === "steel") return "Steel"
  return "—"
}

/**
 * DESIGN SCHEDULE — model-wide table of design setup + results. Two view modes:
 *  • Overview (default, read-only): one row per member.
 *  • Edit: one row per section with beam/column + mode toggles, expandable to
 *    per-member D/C. Writes the same `sectionDesignInputs` the RC tool uses.
 */
export function DesignScheduleToolContent({
  model,
  inputs,
  onPatchInput,
  designResult,
}: DesignScheduleToolProps) {
  const [view, setView] = React.useState<ViewMode>("overview")

  const rows: MemberRow[] = React.useMemo(() => {
    if (!model) return []
    return Object.values(model.members).map((m) => {
      const sec = model.sections[m.section]
      const designable = isSectionDesignable(sec)
      const isSteel = materialOf(sec) === "steel"
      // Narrow to the right input union member — reading a steel section through
      // `asRcInput` silently materialises an RC default and shows a mode that
      // does not exist for steel.
      const di = isSteel
        ? asSteelInput(inputs[m.section], m.section)
        : asRcInput(inputs[m.section], m.section)
      const result = designResult?.members[m.id]
      const type = designable
        ? di.elementType === "column" ? "column"
          : di.elementType === "beam" ? "beam"
            : result?.kind ?? "beam"
        : null
      return {
        memberId: m.id,
        sectionId: m.section,
        sectionName: sec?.name ?? m.section,
        material: materialLabel(materialOf(sec)),
        geometry: geometryOf(model, m.section),
        designable,
        type,
        isSteel,
        mode: designable && !isSteel ? (di as RcSectionInput).mode : null,
        equation: isSteel ? result?.steel?.equation ?? null : null,
        dc: memberDC(result, designable),
      }
    })
  }, [model, inputs, designResult])

  if (!model || rows.length === 0) {
    return (
      <div className="space-y-3">
        <ViewToggle view={view} onChange={setView} />
        <p className="text-[10px] text-gray-500 leading-snug">
          No members to schedule. Add members in the Model tab.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <ViewToggle view={view} onChange={setView} />
      {view === "overview" ? (
        <OverviewTable rows={rows} />
      ) : (
        <EditTable rows={rows} onPatchInput={onPatchInput} />
      )}
    </div>
  )
}

// ── View toggle ──────────────────────────────────────────────────────────────

function ViewToggle({ view, onChange }: { view: ViewMode; onChange: (v: ViewMode) => void }) {
  return (
    <div className="grid grid-cols-2 gap-1">
      <ToggleButton active={view === "overview"} onClick={() => onChange("overview")} title="Read-only inventory — one row per member">
        Overview
      </ToggleButton>
      <ToggleButton active={view === "edit"} onClick={() => onChange("edit")} title="Edit beam/column and design mode per section">
        Edit
      </ToggleButton>
    </div>
  )
}

function ToggleButton({
  active, onClick, title, disabled, children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  disabled?: boolean
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      className={cn(
        "h-7 rounded text-xs font-medium transition-colors px-1",
        disabled
          ? "border border-gray-200 text-gray-300 cursor-not-allowed"
          : active
          ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
          : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
      )}
    >
      {children}
    </button>
  )
}

// ── Overview (per-member) ──────────────────────────────────────────────────────

const TH = "text-left font-semibold text-[#1a2f5e] py-1 px-1.5"
const TD = "py-1 px-1.5 align-top"

function DCCell({ dc }: { dc: DC }) {
  return (
    <span
      className="font-mono"
      style={{ color: dc.color ?? "#475569", fontWeight: dc.value !== undefined ? 600 : 400 }}
    >
      {dc.text}
    </span>
  )
}

function OverviewTable({ rows }: { rows: MemberRow[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className={TH}>Member</th>
            <th className={TH}>Section</th>
            <th className={TH}>Class</th>
            <th className={TH}>Geometry</th>
            <th className={TH}>Type</th>
            <th className={TH}>Mode / Eq.</th>
            <th className={TH}>D/C</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.memberId}
              className={cn("border-b border-gray-100", !r.designable && "text-gray-400")}
            >
              <td className={cn(TD, "font-mono")}>{r.memberId}</td>
              <td className={TD}>{r.sectionName}</td>
              <td className={TD}>{r.material}</td>
              <td className={cn(TD, "font-mono")}>{r.geometry}</td>
              <td className={cn(TD, "capitalize")}>{r.type ?? "N.A."}</td>
              <td className={cn(TD, r.isSteel && "font-mono")}>
                {r.isSteel ? (r.equation ?? "—") : r.mode ? modeLabel(r.mode) : "N.A."}
              </td>
              <td className={TD}>{r.designable ? <DCCell dc={r.dc} /> : "N.A."}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function modeLabel(m: DesignMode): string {
  return m === "required" ? "As req." : "As chk."
}

// ── Edit (per-section, expandable) ─────────────────────────────────────────────

interface SectionGroup {
  sectionId: SectionId
  sectionName: string
  material: string
  geometry: string
  designable: boolean
  type: "beam" | "column" | null
  mode: DesignMode | null
  isSteel: boolean
  members: MemberRow[]
  worstDC: DC
}

function groupBySection(rows: MemberRow[]): SectionGroup[] {
  const map = new Map<SectionId, SectionGroup>()
  for (const r of rows) {
    let g = map.get(r.sectionId)
    if (!g) {
      g = {
        sectionId: r.sectionId,
        sectionName: r.sectionName,
        material: r.material,
        geometry: r.geometry,
        designable: r.designable,
        type: r.type,
        mode: r.mode,
        isSteel: r.isSteel,
        members: [],
        worstDC: NA,
      }
      map.set(r.sectionId, g)
    }
    g.members.push(r)
  }
  // Resolve worst D/C per group (max of known numeric values; else not-run/N.A.).
  for (const g of map.values()) {
    if (!g.designable) {
      g.worstDC = NA
      continue
    }
    let worst: DC = NOT_RUN
    let max = -Infinity
    let anyNumeric = false
    for (const m of g.members) {
      if (m.dc.value !== undefined && m.dc.value > max) {
        max = m.dc.value
        worst = m.dc
        anyNumeric = true
      }
    }
    g.worstDC = anyNumeric ? worst : NOT_RUN
  }
  return Array.from(map.values())
}

function EditTable({
  rows, onPatchInput,
}: {
  rows: MemberRow[]
  onPatchInput: (id: SectionId, patch: Partial<SectionDesignInput>) => void
}) {
  const groups = React.useMemo(() => groupBySection(rows), [rows])

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[10px] border-collapse">
        <thead>
          <tr className="border-b border-gray-200">
            <th className={TH}>Member</th>
            <th className={TH}>Section</th>
            <th className={TH}>Class</th>
            <th className={TH}>Type</th>
            <th className={TH}>Mode</th>
            <th className={TH}>D/C</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.sectionId} className={cn("border-b border-gray-100", !g.designable && "text-gray-400")}>
              <td className={cn(TD, "font-mono")}>{g.members.map((m) => m.memberId).join(", ")}</td>
              <td className={TD}>{g.sectionName}</td>
              <td className={TD}>{g.material}</td>
              <td className={TD}>
                {g.designable ? (
                  <MiniToggle
                    options={[["beam", "Beam"], ["column", "Column"]]}
                    value={g.type ?? "beam"}
                    onChange={(v) => onPatchInput(g.sectionId, { elementType: v as ElementType })}
                  />
                ) : "N.A."}
              </td>
              <td className={TD}>
                {/* Steel has no required/checked split — offering the toggle
                    would write a field the steel input does not have. */}
                {!g.designable ? "N.A." : g.isSteel ? (
                  <span className="text-gray-400">check only</span>
                ) : (
                  <MiniToggle
                    options={[["required", "Required"], ["checked", "Checked"]]}
                    value={g.mode ?? "required"}
                    onChange={(v) => onPatchInput(g.sectionId, { mode: v as DesignMode })}
                  />
                )}
              </td>
              <td className={TD}>{g.designable ? <DCCell dc={g.worstDC} /> : "N.A."}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/**
 * Two-way toggle for the edit table cells — matches the project's standard
 * ModeButton style (border-2 navy-blue when active).
 */
function MiniToggle({
  options, value, onChange,
}: {
  options: [string, string][]
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div className="flex gap-1">
      {options.map(([id, label]) => (
        <button
          key={id}
          onClick={() => onChange(id)}
          className={cn(
            "rounded px-1.5 py-0.5 text-[10px] font-medium transition-colors",
            value === id
              ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
              : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
          )}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

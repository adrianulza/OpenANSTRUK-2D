import * as React from "react"
import { cn } from "@/lib/utils"
import type { SectionId, StructureModel } from "@/lib/model"
import { designColorForDC, formatValue } from "@/lib/constants"
import { materialOf, isSectionDesignable } from "@/lib/design/core/designability"
import { asRcInput, type SectionDesignInputs } from "@/lib/design/core/section-input"
import type { DesignRunResult, MemberDesignResult, DesignMode } from "@/lib/design/core/types"
import { inferSteelRole, type SteelMemberRole } from "@/lib/design/steel/member-role"
import {
  causeText, memberDesignDC, memberVerdict, type MemberVerdict,
} from "@/lib/design/core/verdict"
import {
  geometryOf, materialLabel, passesMaterialFilter, TD, TH, type MaterialFilter,
} from "./schedule-shared"
import { MaterialFilterChips } from "./schedule-controls"

interface DesignReportToolProps {
  model?: StructureModel
  inputs: SectionDesignInputs
  designResult?: DesignRunResult | null
}

/** D/C cell value: a formatted number + colour, or a sentinel string. */
interface DC {
  text: string
  /** Numeric D/C when known (for grouping max); undefined for N.A./not-run. */
  value?: number
  color?: string
}

const NA: DC = { text: "N.A." }
const NOT_RUN: DC = { text: "not run", color: "#94a3b8" }

const NO_RATIO: DC = { text: "—", color: "#94a3b8" }

function memberDC(r: MemberDesignResult | undefined, designable: boolean): DC {
  if (!designable) return NA
  if (!r || r.status === "no-result") return NOT_RUN
  if (r.status === "not-implemented") return NA
  if (r.status === "axial-exceeded") return { text: "axial >", color: "#ef4444" }
  if (r.status !== "designed") return NA
  // Single-sourced with the canvas: `memberDesignDC` is the one place that knows
  // which channels a ratio spans per material, and that "As required" has none.
  //
  // That last part is why this column used to lie. Required mode is a SOLVE, not
  // a check — it reports the steel a member needs — so the engine's `dc` is a
  // flag there, and the two element types spell it differently: a beam stores 0
  // when adequate, a column stores 1 (the ρg the bisection converged on, where
  // D/C equals 1 by construction). Printed raw, an adequate column showed a red
  // "1" and an adequate beam a blue "0". The verdict in the Status column is the
  // real answer in that mode.
  const value = memberDesignDC(r)
  if (value === undefined) return r.mode === "required" ? NO_RATIO : NOT_RUN
  return { text: formatValue(value), value, color: designColorForDC(value) }
}

interface ReportRow {
  memberId: string
  sectionId: SectionId
  sectionName: string
  material: string
  geometry: string
  designable: boolean
  /** RC: the resolved beam/column. Steel: the inferred geometric role. */
  type: SteelMemberRole | null
  /**
   * RC only. Steel has no required/checked split — there is no rebar-style
   * unknown to solve for — so a steel row shows its governing AISC equation
   * here instead of a meaningless mode.
   */
  mode: DesignMode | null
  isSteel: boolean
  equation: string | null
  dc: DC
  /** The same verdict the canvas prints, so the two never disagree. */
  verdict: MemberVerdict | null
}

/**
 * DESIGN REPORT — model-wide results, one row per member: class, geometry, the
 * resolved element type, D/C and the verdict.
 *
 * Read-only by design. Everything that *decides* how a member is designed lives
 * in DESIGN SCHEDULE; mixing the two into one tool is what left the old Edit
 * view feeling like an afterthought.
 */
export function DesignReportToolContent({
  model,
  inputs,
  designResult,
}: DesignReportToolProps) {
  const [materialFilter, setMaterialFilter] = React.useState<MaterialFilter>("all")

  const rows: ReportRow[] = React.useMemo(() => {
    if (!model) return []
    return Object.values(model.members).map((m) => {
      const sec = model.sections[m.section]
      const designable = isSectionDesignable(sec)
      const isSteel = materialOf(sec) === "steel"
      const di = asRcInput(inputs[m.section], m.section)
      const result = designResult?.members[m.id]
      const na = model.nodes[m.a]
      const nb = model.nodes[m.b]
      // Prefer what the run actually resolved — it includes the axial-gate
      // promotion, which no amount of reading the input can tell you.
      const type: SteelMemberRole | null = !designable
        ? null
        : isSteel
          ? (na && nb ? inferSteelRole(na.x, na.y, nb.x, nb.y) : "beam")
          : result?.kind
            ?? (di.elementType === "column" ? "column"
              : di.elementType === "beam" ? "beam"
                : na && nb && Math.abs(nb.y - na.y) > Math.abs(nb.x - na.x) ? "column" : "beam")
      return {
        memberId: m.id,
        sectionId: m.section,
        sectionName: sec?.name ?? m.section,
        material: materialLabel(materialOf(sec)),
        geometry: geometryOf(model, m.section),
        designable,
        type,
        isSteel,
        mode: designable && !isSteel ? di.mode : null,
        equation: isSteel ? result?.steel?.equation ?? null : null,
        dc: memberDC(result, designable),
        verdict: result ? memberVerdict(result) : null,
      }
    })
  }, [model, inputs, designResult])

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
        No members to report on. Add members in the Model tab.
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
              <th className={TH}>Member</th>
              <th className={TH}>Section</th>
              <th className={TH}>Class</th>
              <th className={TH}>Geometry</th>
              <th className={TH}>Type</th>
              <th className={TH}>Mode / Eq.</th>
              <th className={TH}>D/C</th>
              <th className={TH}>Status</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
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
                {/* Same words as the canvas pill — one vocabulary for one verdict. */}
                <td className={TD}>
                  {r.verdict ? (
                    <span style={{ color: r.verdict.color }}>
                      {statusWord(r.verdict)}
                      {causeText(r.verdict) && (
                        <span className="text-gray-500"> · {causeText(r.verdict)}</span>
                      )}
                    </span>
                  ) : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

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

function modeLabel(m: DesignMode): string {
  return m === "required" ? "As req." : "As chk."
}

/**
 * The verdict's headline without the ratio — the D/C already has its own column
 * here, and repeating it would push the causes off the edge of a narrow flyout.
 */
function statusWord(v: MemberVerdict): string {
  switch (v.level) {
    case "satisfied": return "Satisfied"
    case "overstressed": return "Overstressed"
    case "detailing": return "Insufficient Detailing"
    default: return v.top
  }
}

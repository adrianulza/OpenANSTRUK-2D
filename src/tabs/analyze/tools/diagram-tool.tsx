import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import { ToggleButton } from "@/components/flyout-shared"
import type { StructureModel } from "@/lib/model"
import type { AnalysisResult } from "@/lib/solver"
import { memberInternalForces } from "@/lib/solver"
import { Label } from "@/components/ui/label"
import { formatValue } from "@/lib/constants"
import {
  type UnitSettings,
  DEFAULT_UNIT_SETTINGS,
  displayForce, labelForce,
  displayMoment, labelMoment,
} from "@/lib/units"

export type DiagramKind = "AXIAL" | "SHEAR" | "MOMENT"

export function DiagramToolContent({
  label,
  scale,
  onScaleChange,
  invert = false,
  onInvertChange,
  showMemberLabels = true,
  onShowMemberLabelsChange,
  analysisResult,
  model,
  unitSettings = DEFAULT_UNIT_SETTINGS,
}: {
  label: DiagramKind
  scale?: number
  onScaleChange?: (v: number) => void
  invert?: boolean
  onInvertChange?: (v: boolean) => void
  showMemberLabels?: boolean
  onShowMemberLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
  model?: StructureModel
  unitSettings?: UnitSettings
}) {
  const kind = label

  const sectionLabel = "Forces Summary"

  const memberRows = React.useMemo(() => {
    if (!analysisResult || !model) return []
    const N_PTS = 40
    return Object.values(model.members).flatMap((member) => {
      const ef = analysisResult.memberEndForces[member.id]
      const nA = model.nodes[member.a]
      const nB = model.nodes[member.b]
      if (!ef || !nA || !nB) return []
      const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
      if (L < 1e-9) return []
      let peak = 0
      if (kind === "AXIAL") {
        peak = ef.N1
      } else {
        for (let i = 0; i <= N_PTS; i++) {
          const x = (i / N_PTS) * L
          const { V, M } = memberInternalForces(ef, x, L)
          const v = kind === "SHEAR" ? V : M
          if (Math.abs(v) > Math.abs(peak)) peak = v
        }
      }
      return [{ id: member.id, peak }]
    })
  }, [analysisResult, model, kind])

  const unit = kind === "MOMENT" ? labelMoment(unitSettings) : labelForce(unitSettings)
  const toDisplay = (v: number) =>
    kind === "MOMENT" ? displayMoment(v, unitSettings) : displayForce(v, unitSettings)
  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${formatValue(toDisplay(v))}`
  const peakColor = (v: number) =>
    v >= 0 ? FLYOUT_PANEL_COLORS.positiveValue : FLYOUT_PANEL_COLORS.negativeValue

  const [showReport, setShowReport] = React.useState(false)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 select-none">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Diagram Scale Factor</span>
          <span className="text-xs font-mono text-gray-500">{scale ?? 10}</span>
        </div>
        <input
          type="range"
          value={scale ?? 10}
          min={1}
          max={200}
          className="w-full h-1.5 accent-[#2563eb] cursor-pointer touch-none"
          onChange={(e) => onScaleChange?.(Number(e.target.value))}
        />
      </div>

      <div className="flex items-center justify-between select-none">
        <span className="text-xs text-gray-600">Member Labels</span>
        <ToggleButton
          active={showMemberLabels}
          onClick={() => onShowMemberLabelsChange?.(!showMemberLabels)}
          className="!flex-none h-6 text-xs px-3"
        >
          {showMemberLabels ? "On" : "Off"}
        </ToggleButton>
      </div>

      {onInvertChange !== undefined && (
        <div className="flex items-center justify-between select-none">
          <span className="text-xs text-gray-600">Invert Diagram</span>
          <ToggleButton
            active={invert}
            onClick={() => onInvertChange(!invert)}
            className="!flex-none h-6 text-xs px-3"
          >
            {invert ? "On" : "Off"}
          </ToggleButton>
        </div>
      )}

      <div className="space-y-1.5 border-t pt-3" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">{sectionLabel}</Label>
          <ToggleButton
            active={showReport}
            onClick={() => setShowReport(v => !v)}
            className="!flex-none h-6 text-xs px-3"
          >
            {showReport ? "On" : "Off"}
          </ToggleButton>
        </div>
        {showReport && (
          memberRows.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No results</p>
          ) : (
            <div className="space-y-1">
              {memberRows.map(({ id, peak }) => (
                <div key={id} className="flex items-baseline justify-between rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                  <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 uppercase">{id.toUpperCase()}</span>
                  <span className="text-[11px] font-mono" style={{ color: peakColor(peak) }}>
                    {fmt(peak)} {unit}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import { ToggleButton } from "@/components/flyout-shared"
import type { AnalysisResult } from "@/lib/solver"
import { Label } from "@/components/ui/label"
import { formatValue } from "@/lib/constants"
import {
  type UnitSettings,
  DEFAULT_UNIT_SETTINGS,
  displayForce, labelForce,
  displayMoment, labelMoment,
} from "@/lib/units"

export function ReactionToolContent({
  analysisResult,
  unitSettings = DEFAULT_UNIT_SETTINGS,
}: {
  analysisResult: AnalysisResult | null
  unitSettings?: UnitSettings
}) {
  const [showReport, setShowReport] = React.useState(false)
  const forceUnit  = labelForce(unitSettings)
  const momentUnit = labelMoment(unitSettings)

  const entries = analysisResult ? (Object.entries(analysisResult.reactions) as [string, { Rx: number; Ry: number; Mz: number }][]) : []
  const valColor = (v: number) =>
    v >= 0 ? FLYOUT_PANEL_COLORS.positiveValue : FLYOUT_PANEL_COLORS.negativeValue
  const fmtForce  = (v: number) => `${v >= 0 ? "+" : ""}${formatValue(displayForce(v, unitSettings))} ${forceUnit}`
  const fmtMoment = (v: number) => `${v >= 0 ? "+" : ""}${formatValue(displayMoment(v, unitSettings))} ${momentUnit}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-600">Summary</Label>
        <ToggleButton
          active={showReport}
          onClick={() => setShowReport(v => !v)}
          className="!flex-none h-6 text-xs px-3"
        >
          {showReport ? "On" : "Off"}
        </ToggleButton>
      </div>
      {showReport && (
        entries.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No results</p>
        ) : (
          <div className="space-y-2">
            {entries.map(([nodeId, r]) => (
              <div key={nodeId} className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 space-y-1">
                <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 tracking-wide">{nodeId}</span>
                <div className="grid grid-cols-2 gap-x-2">
                  <span className="text-[10px] text-gray-500">Rx</span>
                  <span className="text-[10px] font-mono text-right" style={{ color: valColor(r.Rx) }}>{fmtForce(r.Rx)}</span>
                  <span className="text-[10px] text-gray-500">Ry</span>
                  <span className="text-[10px] font-mono text-right" style={{ color: valColor(r.Ry) }}>{fmtForce(r.Ry)}</span>
                  <span className="text-[10px] text-gray-500">Mz</span>
                  <span className="text-[10px] font-mono text-right" style={{ color: valColor(r.Mz) }}>{fmtMoment(r.Mz)}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

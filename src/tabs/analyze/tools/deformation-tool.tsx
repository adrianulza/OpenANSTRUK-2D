import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import { ToggleButton } from "@/components/flyout-shared"
import type { AnalysisResult, NodeDisplacement } from "@/lib/solver"
import { Label } from "@/components/ui/label"
import {
  type UnitSettings,
  DEFAULT_UNIT_SETTINGS,
  displayDisplacement, labelDisplacement,
  displayRotation, labelRotation,
} from "@/lib/units"

export function DeformationToolContent({
  scale,
  onScaleChange,
  showNodeLabels = true,
  onShowNodeLabelsChange,
  analysisResult,
  unitSettings = DEFAULT_UNIT_SETTINGS,
}: {
  scale?: number
  onScaleChange?: (v: number) => void
  showNodeLabels?: boolean
  onShowNodeLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
  unitSettings?: UnitSettings
}) {
  const dispUnit = labelDisplacement(unitSettings)
  const rotUnit  = labelRotation(unitSettings)
  const [showReport, setShowReport] = React.useState(false)
  const nodeEntries = analysisResult
    ? Object.entries(analysisResult.nodeDisplacements) as [string, NodeDisplacement][]
    : []

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 select-none">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Deformation Scale Factor</span>
          <span className="text-xs font-mono text-gray-500">{scale ?? 25}</span>
        </div>
        <input
          type="range"
          value={scale ?? 25}
          min={1}
          max={1000}
          className="w-full h-1.5 accent-[#2563eb] cursor-pointer touch-none"
          onChange={(e) => onScaleChange?.(Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between select-none">
        <span className="text-xs text-gray-600">Node Labels</span>
        <ToggleButton
          active={showNodeLabels}
          onClick={() => onShowNodeLabelsChange?.(!showNodeLabels)}
          className="!flex-none h-6 text-xs px-3"
        >
          {showNodeLabels ? "On" : "Off"}
        </ToggleButton>
      </div>

      <div className="border-t pt-3 space-y-1.5" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Displacement Summary</Label>
          <ToggleButton
            active={showReport}
            onClick={() => setShowReport(v => !v)}
            className="!flex-none h-6 text-xs px-3"
          >
            {showReport ? "On" : "Off"}
          </ToggleButton>
        </div>
        {showReport && (
          nodeEntries.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No results</p>
          ) : (
            <div className="space-y-2">
              {nodeEntries.map(([nodeId, d]) => (
                <div key={nodeId} className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 space-y-1">
                  <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 uppercase tracking-wide">{"N" + nodeId.replace(/^\D+/, "")}</span>
                  <div className="grid grid-cols-2 gap-x-2">
                    <span className="text-[10px] text-gray-500">x</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{displayDisplacement(d.u, unitSettings).toFixed(3)} {dispUnit}</span>
                    <span className="text-[10px] text-gray-500">y</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{displayDisplacement(d.v, unitSettings).toFixed(3)} {dispUnit}</span>
                    <span className="text-[10px] text-gray-500">θ</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{displayRotation(d.theta, unitSettings).toFixed(3)} {rotUnit}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

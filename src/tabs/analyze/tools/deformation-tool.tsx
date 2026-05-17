import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { AnalysisResult, NodeDisplacement } from "@/lib/solver"
import { Label } from "@/components/ui/label"

export function DeformationToolContent({
  scale,
  onScaleChange,
  showNodeLabels = true,
  onShowNodeLabelsChange,
  analysisResult,
}: {
  scale?: number
  onScaleChange?: (v: number) => void
  showNodeLabels?: boolean
  onShowNodeLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
}) {
  const [showReport, setShowReport] = React.useState(true)
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
        <button
          onClick={() => onShowNodeLabelsChange?.(!showNodeLabels)}
          className="text-xs px-2 py-0.5 rounded border transition-colors"
          style={showNodeLabels ? {
            backgroundColor: FLYOUT_PANEL_COLORS.primary,
            color: 'white',
            borderColor: FLYOUT_PANEL_COLORS.primary,
          } : {
            backgroundColor: 'white',
            color: '#6b7280',
            borderColor: '#d1d5db',
          }}
        >
          {showNodeLabels ? "On" : "Off"}
        </button>
      </div>

      <div className="border-t pt-3 space-y-1.5" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Displacement Summary</Label>
          <button
            onClick={() => setShowReport(v => !v)}
            className="text-xs px-2 py-0.5 rounded border transition-colors"
            style={showReport ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
              borderColor: FLYOUT_PANEL_COLORS.primary,
            } : {
              backgroundColor: 'white',
              color: '#6b7280',
              borderColor: '#d1d5db',
            }}
          >
            {showReport ? "On" : "Off"}
          </button>
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
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{(d.u * 1000).toFixed(3)} mm</span>
                    <span className="text-[10px] text-gray-500">y</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{(d.v * 1000).toFixed(3)} mm</span>
                    <span className="text-[10px] text-gray-500">θ</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{(d.theta * 1000).toFixed(3)} mrad</span>
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

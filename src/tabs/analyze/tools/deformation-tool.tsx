import * as React from "react"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import { ToggleButton } from "@/components/flyout-shared"
import type { AnalysisResult, NodeDisplacement } from "@/lib/solver"
import type { StructureModel } from "@/lib/model"
import { peakDeformation } from "@/lib/deformation"
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
  analysisResult,
  model,
  unitSettings = DEFAULT_UNIT_SETTINGS,
  peakOverride,
}: {
  scale?: number
  onScaleChange?: (v: number) => void
  analysisResult?: AnalysisResult | null
  model?: StructureModel
  unitSettings?: UnitSettings
  /** The peak the canvas scales against, when it is not this result's own. */
  peakOverride?: number
}) {
  const dispUnit = labelDisplacement(unitSettings)
  const rotUnit  = labelRotation(unitSettings)
  const [showReport, setShowReport] = React.useState(false)
  const nodeEntries = analysisResult
    ? Object.entries(analysisResult.nodeDisplacements) as [string, NodeDisplacement][]
    : []

  // Slider position s ∈ [-1, +1] maps to multiplier:
  //   s ≤ 0 → 0.1 + 0.9·(s+1)   (linear 0.1 → 1.0)
  //   s > 0 → 1.0 + 3.0·s        (linear 1.0 → 4.0)
  const m = scale ?? 1
  const sliderPos = m <= 1.0 ? (m - 1.0) / 0.9 : (m - 1.0) / 3.0
  const posToMult = (s: number) => {
    if (Math.abs(s) < 0.06) return 1.0
    return s <= 0 ? 0.1 + 0.9 * (s + 1) : 1.0 + 3.0 * s
  }
  const atCenter = Math.abs(m - 1.0) < 0.01

  // True amplification factor: matches canvas k = (TARGET_M / peakDisp) * scale, TARGET_M = 1.
  // Peak is sampled along each member's cubic-Hermite spline (not just at nodes) so it
  // captures mid-span sag — same algorithm as drawDeformedShape in the canvas.
  const ownPeak = React.useMemo(
    () => (model ? peakDeformation(model, analysisResult ?? null) : 0),
    [analysisResult, model],
  )
  const peakDisp = peakOverride ?? ownPeak
  const trueFactor = peakDisp > 1e-12 ? (1 / peakDisp) * m : 0
  const factorLabel = trueFactor === 0
    ? "—"
    : trueFactor >= 100 ? `×${Math.round(trueFactor)}`
    : trueFactor >= 10  ? `×${trueFactor.toFixed(1)}`
    : `×${trueFactor.toFixed(2)}`

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 select-none">
        <span className="text-xs text-gray-600">Deformation Size</span>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono w-2 text-center">−</span>
          <div className="relative flex-1 flex flex-col items-start">
            <input
              type="range"
              value={sliderPos}
              min={-1}
              max={1}
              step={0.01}
              className="w-full h-1.5 accent-[#2563eb] cursor-pointer touch-none"
              onChange={(e) => onScaleChange?.(posToMult(Number(e.target.value)))}
            />
            <div
              className="absolute pointer-events-none"
              style={{
                left: "50%",
                top: "100%",
                transform: "translateX(-50%)",
                opacity: atCenter ? 0.2 : 0.55,
                transition: "opacity 0.15s",
              }}
            >
              <div style={{
                width: 0, height: 0,
                borderLeft: "2.5px solid transparent",
                borderRight: "2.5px solid transparent",
                borderBottom: "3.5px solid #1a2f5e",
              }} />
            </div>
          </div>
          <span className="text-xs text-gray-400 font-mono w-2 text-center">+</span>
        </div>
        <div className="text-[11px] font-mono text-gray-500 text-center pt-0.5">
          {peakDisp > 1e-12 ? `Amplification: ${factorLabel}` : "—"}
        </div>
      </div>

      <div className="border-t" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }} />

      <div className="space-y-1.5">
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
          nodeEntries.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No results</p>
          ) : (
            <div className="space-y-2">
              {nodeEntries.map(([nodeId, d]) => (
                <div key={nodeId} className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 space-y-1">
                  <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 tracking-wide">{nodeId}</span>
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

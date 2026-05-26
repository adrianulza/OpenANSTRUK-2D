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
  analysisResult,
  model,
  unitSettings = DEFAULT_UNIT_SETTINGS,
}: {
  label: DiagramKind
  scale?: number
  onScaleChange?: (v: number) => void
  invert?: boolean
  onInvertChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
  model?: StructureModel
  unitSettings?: UnitSettings
}) {
  const kind = label

  const sectionLabel = "Summary"

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

  // Peak |value| across all members for the readout
  const peakValue = React.useMemo(() => {
    let p = 0
    for (const row of memberRows) if (Math.abs(row.peak) > Math.abs(p)) p = row.peak
    return p
  }, [memberRows])

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 select-none">
        <span className="text-xs text-gray-600">Diagram Size</span>
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
          {memberRows.length === 0 ? "—" : `Max. force: ${fmt(peakValue)} ${unit}`}
        </div>
      </div>

      <div className="border-t" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }} />

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

      <div className="space-y-1.5">
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
                  <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5">{id}</span>
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

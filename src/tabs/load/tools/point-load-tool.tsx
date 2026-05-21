import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { CaseSelectorRow } from "./case-selector-row"
import type { LoadCase, LoadCaseId } from "@/lib/load-cases"

export function PointLoadToolContent({
  inputMode,
  onInputModeChange,
  axis,
  magnitude,
  onAxisChange,
  onMagnitudeChange,
  angle,
  onAngleChange,
  loadCases,
  activeLoadCaseId,
  onActiveLoadCaseChange,
}: {
  inputMode: "principal" | "angular"
  onInputModeChange?: (mode: "principal" | "angular") => void
  axis: "x" | "y"
  magnitude: number
  onAxisChange?: (a: "x" | "y") => void
  onMagnitudeChange?: (v: number) => void
  angle: number
  onAngleChange?: (angle: number) => void
  loadCases?: Record<LoadCaseId, LoadCase>
  activeLoadCaseId?: LoadCaseId
  onActiveLoadCaseChange?: (id: LoadCaseId) => void
}) {
  return (
    <div className="space-y-3">
      {loadCases && activeLoadCaseId && onActiveLoadCaseChange && (
        <CaseSelectorRow
          label="Load Case"
          loadCases={loadCases}
          value={activeLoadCaseId}
          onChange={onActiveLoadCaseChange}
          excludeLocked
        />
      )}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Input Mode</Label>
        <div className="flex gap-1">
          <button
            onClick={() => onInputModeChange?.("principal")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={inputMode === "principal" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Principal
          </button>
          <button
            onClick={() => onInputModeChange?.("angular")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={inputMode === "angular" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Angular
          </button>
        </div>
      </div>

      {inputMode === "principal" ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Global axis</Label>
            <div className="flex gap-1">
              <button
                onClick={() => onAxisChange?.("x")}
                className="flex-1 h-7 text-[11px] rounded-md transition-colors"
                style={axis === "x" ? {
                  backgroundColor: FLYOUT_PANEL_COLORS.primary,
                  color: 'white',
                } : {
                  backgroundColor: '#f3f4f6',
                  color: '#4b5563',
                }}
              >
                X-axis
              </button>
              <button
                onClick={() => onAxisChange?.("y")}
                className="flex-1 h-7 text-[11px] rounded-md transition-colors"
                style={axis === "y" ? {
                  backgroundColor: FLYOUT_PANEL_COLORS.primary,
                  color: 'white',
                } : {
                  backgroundColor: '#f3f4f6',
                  color: '#4b5563',
                }}
              >
                Y-axis
              </button>
            </div>
            <p className="text-[10px] text-gray-500 leading-snug">
              {axis === "x" ? "+ rightward, − leftward" : "+ upward, − downward"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Magnitude</Label>
            <div className="flex gap-2">
              <NumericInput
                value={magnitude}
                onChange={(v) => onMagnitudeChange?.(v)}
                className="h-8 text-xs font-mono flex-1"
              />
              <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN</span>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Direction angle</Label>
            <div className="flex gap-2">
              <Input
                type="number"
                min={0}
                max={360}
                step={1}
                value={angle}
                onChange={(e) => {
                  const v = parseFloat(e.target.value)
                  if (!isNaN(v)) onAngleChange?.(((Math.round(v) % 360) + 360) % 360)
                }}
                className="h-7 text-xs font-mono flex-1"
              />
              <span className="text-xs text-gray-500 self-center">°</span>
            </div>
            <p className="text-[10px] text-gray-500 leading-snug">
              {angle === 0 ? "→ rightward" : angle === 90 ? "↓ downward" : angle === 180 ? "← leftward" : angle === 270 ? "↑ upward" : "diagonal"}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Magnitude</Label>
            <div className="flex gap-2">
              <NumericInput
                value={magnitude}
                onChange={(v) => onMagnitudeChange?.(v)}
                className="h-8 text-xs font-mono flex-1"
              />
              <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN</span>
            </div>
          </div>
        </>
      )}

      <p className="text-xs text-gray-500 leading-relaxed">Click a node to place</p>
    </div>
  )
}

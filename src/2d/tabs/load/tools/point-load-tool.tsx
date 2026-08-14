import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { ToggleButton } from "@/components/flyout-shared"
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
          <ToggleButton
            active={inputMode === "principal"}
            onClick={() => onInputModeChange?.("principal")}
            className="h-7 text-[11px]"
          >
            Principal
          </ToggleButton>
          <ToggleButton
            active={inputMode === "angular"}
            onClick={() => onInputModeChange?.("angular")}
            className="h-7 text-[11px]"
          >
            Angular
          </ToggleButton>
        </div>
      </div>

      {inputMode === "principal" ? (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Global axis</Label>
            <div className="flex gap-1">
              <ToggleButton
                active={axis === "x"}
                onClick={() => onAxisChange?.("x")}
                className="h-7 text-[11px]"
              >
                X-axis
              </ToggleButton>
              <ToggleButton
                active={axis === "y"}
                onClick={() => onAxisChange?.("y")}
                className="h-7 text-[11px]"
              >
                Y-axis
              </ToggleButton>
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

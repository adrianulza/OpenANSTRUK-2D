import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
import { ToggleButton } from "@/components/flyout-shared"
import { CaseSelectorRow } from "./case-selector-row"
import type { LoadCase, LoadCaseId } from "@/lib/load-cases"

export function DistributedLoadToolContent({
  distType,
  distMode,
  activeAxis,
  onActiveAxisChange,
  wStart,
  wEnd,
  wxStart,
  wxEnd,
  wyStart,
  wyEnd,
  onDistTypeChange,
  onDistModeChange,
  onWStartChange,
  onWEndChange,
  onWxStartChange,
  onWxEndChange,
  onWyStartChange,
  onWyEndChange,
  loadCases,
  activeLoadCaseId,
  onActiveLoadCaseChange,
}: {
  distType: "uniform" | "asymmetric"
  distMode: "local-axis" | "global-axis"
  activeAxis: "x" | "y"
  onActiveAxisChange?: (axis: "x" | "y") => void
  wStart: number
  wEnd: number
  wxStart: number
  wxEnd: number
  wyStart: number
  wyEnd: number
  onDistTypeChange?: (t: "uniform" | "asymmetric") => void
  onDistModeChange?: (m: "local-axis" | "global-axis") => void
  onWStartChange?: (v: number) => void
  onWEndChange?: (v: number) => void
  onWxStartChange?: (v: number) => void
  onWxEndChange?: (v: number) => void
  onWyStartChange?: (v: number) => void
  onWyEndChange?: (v: number) => void
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
            active={distMode === "local-axis"}
            onClick={() => onDistModeChange?.("local-axis")}
            className="h-7 text-[11px]"
          >
            Local-axis
          </ToggleButton>
          <ToggleButton
            active={distMode === "global-axis"}
            onClick={() => onDistModeChange?.("global-axis")}
            className="h-7 text-[11px]"
          >
            Global Axis
          </ToggleButton>
        </div>
      </div>

      {distMode === "global-axis" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-600">Axis</Label>
          <div className="flex gap-1">
            <ToggleButton
              active={activeAxis === "x"}
              onClick={() => onActiveAxisChange?.("x")}
              className="h-7 text-[11px]"
            >
              X-axis
            </ToggleButton>
            <ToggleButton
              active={activeAxis === "y"}
              onClick={() => onActiveAxisChange?.("y")}
              className="h-7 text-[11px]"
            >
              Y-axis
            </ToggleButton>
          </div>
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Distribution</Label>
        <div className="flex gap-1">
          <ToggleButton
            active={distType === "uniform"}
            onClick={() => onDistTypeChange?.("uniform")}
            className="h-7 text-[11px]"
          >
            Uniform
          </ToggleButton>
          <ToggleButton
            active={distType === "asymmetric"}
            onClick={() => onDistTypeChange?.("asymmetric")}
            className="h-7 text-[11px]"
          >
            Asymmetric
          </ToggleButton>
        </div>
      </div>

      {distMode === "local-axis" && (
        <>
          {distType === "uniform" ? (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Load</Label>
              <div className="flex gap-2">
                <NumericInput
                  value={wStart}
                  onChange={(v) => onWStartChange?.(v)}
                  className="h-8 text-xs font-mono flex-1"
                />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Start (i)</Label>
                <div className="flex gap-2">
                  <NumericInput
                    value={wStart}
                    onChange={(v) => onWStartChange?.(v)}
                    className="h-8 text-xs font-mono flex-1"
                  />
                  <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">End (j)</Label>
                <div className="flex gap-2">
                  <NumericInput
                    value={wEnd}
                    onChange={(v) => onWEndChange?.(v)}
                    className="h-8 text-xs font-mono flex-1"
                  />
                  <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                </div>
              </div>
            </div>
          )}
          <p className="text-[10px] text-gray-400 leading-snug">⊥ along +local-2 (i→j rotated 90° CCW)  ·  + that direction  ·  − opposite</p>
        </>
      )}

      {distMode === "global-axis" && (
        <>
          {activeAxis === "x" && (
            <>
              {distType === "uniform" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">Load</Label>
                  <div className="flex gap-2">
                    <NumericInput
                      value={wxStart}
                      onChange={(v) => onWxStartChange?.(v)}
                      className="h-8 text-xs font-mono flex-1"
                    />
                    <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Start (i)</Label>
                    <div className="flex gap-2">
                      <NumericInput
                        value={wxStart}
                        onChange={(v) => onWxStartChange?.(v)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                      <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">End (j)</Label>
                    <div className="flex gap-2">
                      <NumericInput
                        value={wxEnd}
                        onChange={(v) => onWxEndChange?.(v)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                      <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-gray-400 leading-snug">+ rightward  ·  − leftward</p>
            </>
          )}

          {activeAxis === "y" && (
            <>
              {distType === "uniform" ? (
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">Load</Label>
                  <div className="flex gap-2">
                    <NumericInput
                      value={wyStart}
                      onChange={(v) => onWyStartChange?.(v)}
                      className="h-8 text-xs font-mono flex-1"
                    />
                    <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">Start (i)</Label>
                    <div className="flex gap-2">
                      <NumericInput
                        value={wyStart}
                        onChange={(v) => onWyStartChange?.(v)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                      <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">End (j)</Label>
                    <div className="flex gap-2">
                      <NumericInput
                        value={wyEnd}
                        onChange={(v) => onWyEndChange?.(v)}
                        className="h-8 text-xs font-mono flex-1"
                      />
                      <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                    </div>
                  </div>
                </div>
              )}
              <p className="text-[10px] text-gray-400 leading-snug">+ upward  ·  − downward</p>
            </>
          )}
        </>
      )}

      <p className="text-xs text-gray-500 leading-relaxed">Click a member to place</p>
    </div>
  )
}

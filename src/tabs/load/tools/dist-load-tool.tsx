import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"

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
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Input Mode</Label>
        <div className="flex gap-1">
          <button
            onClick={() => onDistModeChange?.("local-axis")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={distMode === "local-axis" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Local-axis
          </button>
          <button
            onClick={() => onDistModeChange?.("global-axis")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={distMode === "global-axis" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Global Axis
          </button>
        </div>
      </div>

      {distMode === "global-axis" && (
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-600">Axis</Label>
          <div className="flex gap-1">
            <button
              onClick={() => onActiveAxisChange?.("x")}
              className="flex-1 h-7 text-[11px] rounded-md transition-colors"
              style={activeAxis === "x" ? {
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
              onClick={() => onActiveAxisChange?.("y")}
              className="flex-1 h-7 text-[11px] rounded-md transition-colors"
              style={activeAxis === "y" ? {
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
        </div>
      )}

      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Distribution</Label>
        <div className="flex gap-1">
          <button
            onClick={() => onDistTypeChange?.("uniform")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={distType === "uniform" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Uniform
          </button>
          <button
            onClick={() => onDistTypeChange?.("asymmetric")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={distType === "asymmetric" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Asymmetric
          </button>
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

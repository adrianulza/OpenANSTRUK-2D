import { useState, useEffect, startTransition } from "react"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import {
  type UnitSettings,
  displayGridSpacing,
  parseGridSpacing,
  labelGridSpacing,
  GRID_SPACING_MIN_M,
  GRID_SPACING_MAX_M,
} from "@/lib/units"

interface GridUnitsPanelProps {
  unitSettings: UnitSettings
  onUnitSettingsChange: (next: UnitSettings) => void
}

const PRESET_SPACINGS_M = [0.25, 0.5, 1.0]

export function GridUnitsPanel({ unitSettings, onUnitSettingsChange }: GridUnitsPanelProps) {
  const [spacingInput, setSpacingInput] = useState(
    displayGridSpacing(unitSettings.gridSpacing, unitSettings).toString()
  )

  // Sync the input when length unit changes (displayed value changes, stored value stays the same)
  useEffect(() => {
    startTransition(() =>
      setSpacingInput(
        parseFloat(displayGridSpacing(unitSettings.gridSpacing, unitSettings).toPrecision(8)).toString()
      )
    )
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unitSettings.length, unitSettings.gridSpacing])

  const commitSpacing = () => {
    const display = parseFloat(spacingInput)
    if (!Number.isFinite(display) || display <= 0) {
      // Reset to current value
      setSpacingInput(
        parseFloat(displayGridSpacing(unitSettings.gridSpacing, unitSettings).toPrecision(8)).toString()
      )
      return
    }
    const metres = parseGridSpacing(display, unitSettings)
    const clamped = Math.min(GRID_SPACING_MAX_M, Math.max(GRID_SPACING_MIN_M, metres))
    onUnitSettingsChange({ ...unitSettings, gridSpacing: clamped })
    setSpacingInput(
      parseFloat(displayGridSpacing(clamped, unitSettings).toPrecision(8)).toString()
    )
  }

  return (
    <div className="w-56 p-3 space-y-3">
      <p className="text-xs font-semibold text-[#1e293b]">Grid and Units</p>

      {/* Force unit */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Force</p>
        <ToggleGroup
          type="single"
          value={unitSettings.force}
          onValueChange={(v) => { if (v) onUnitSettingsChange({ ...unitSettings, force: v as UnitSettings["force"] }) }}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <ToggleGroupItem value="kN" className="flex-1 text-xs data-[state=on]:bg-[#2563eb] data-[state=on]:text-white data-[state=on]:border-[#2563eb]">kN</ToggleGroupItem>
          <ToggleGroupItem value="N"  className="flex-1 text-xs data-[state=on]:bg-[#2563eb] data-[state=on]:text-white data-[state=on]:border-[#2563eb]">N</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Pressure unit */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Pressure</p>
        <ToggleGroup
          type="single"
          value={unitSettings.pressure}
          onValueChange={(v) => { if (v) onUnitSettingsChange({ ...unitSettings, pressure: v as UnitSettings["pressure"] }) }}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <ToggleGroupItem value="GPa" className="flex-1 text-xs data-[state=on]:bg-[#2563eb] data-[state=on]:text-white data-[state=on]:border-[#2563eb]">GPa</ToggleGroupItem>
          <ToggleGroupItem value="MPa" className="flex-1 text-xs data-[state=on]:bg-[#2563eb] data-[state=on]:text-white data-[state=on]:border-[#2563eb]">MPa</ToggleGroupItem>
        </ToggleGroup>
      </div>

      {/* Length unit */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Length</p>
        <ToggleGroup
          type="single"
          value={unitSettings.length}
          onValueChange={(v) => { if (v) onUnitSettingsChange({ ...unitSettings, length: v as UnitSettings["length"] }) }}
          variant="outline"
          size="sm"
          className="w-full"
        >
          <ToggleGroupItem value="m"  className="flex-1 text-xs data-[state=on]:bg-[#2563eb] data-[state=on]:text-white data-[state=on]:border-[#2563eb]">m</ToggleGroupItem>
          <ToggleGroupItem value="mm" className="flex-1 text-xs data-[state=on]:bg-[#2563eb] data-[state=on]:text-white data-[state=on]:border-[#2563eb]">mm</ToggleGroupItem>
        </ToggleGroup>
      </div>

      <Separator />

      {/* Grid spacing */}
      <div className="space-y-1.5">
        <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Grid Spacing</p>
        <div className="flex gap-2 items-center">
          <Input
            type="number"
            value={spacingInput}
            onChange={(e) => setSpacingInput(e.target.value)}
            onBlur={commitSpacing}
            onKeyDown={(e) => { if (e.key === "Enter") commitSpacing() }}
            className="h-7 text-xs font-mono flex-1"
            min={displayGridSpacing(GRID_SPACING_MIN_M, unitSettings)}
            max={displayGridSpacing(GRID_SPACING_MAX_M, unitSettings)}
          />
          <span className="text-xs text-gray-500 w-6 text-right">{labelGridSpacing(unitSettings)}</span>
        </div>
        {/* Presets */}
        <div className="flex gap-1">
          {PRESET_SPACINGS_M.map((m) => {
            const display = parseFloat(displayGridSpacing(m, unitSettings).toPrecision(6))
            const isActive = Math.abs(unitSettings.gridSpacing - m) < 1e-9
            return (
              <button
                key={m}
                onClick={() => onUnitSettingsChange({ ...unitSettings, gridSpacing: m })}
                className={`flex-1 h-6 rounded text-[10px] font-mono border transition-colors ${
                  isActive
                    ? "border-[#2563eb] bg-[#2563eb]/10 text-[#2563eb]"
                    : "border-gray-200 text-gray-500 hover:border-gray-300 hover:bg-gray-50"
                }`}
              >
                {display}
              </button>
            )
          })}
        </div>
      </div>
    </div>
  )
}

import { useState, useEffect, startTransition } from "react"
import { Separator } from "@/components/ui/separator"
import { Input } from "@/components/ui/input"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { Magnet, Crosshair, Ruler, Scaling, MoveVertical } from "lucide-react"
import {
  type UnitSettings,
  displayGridSpacing,
  parseGridSpacing,
  labelGridSpacing,
  GRID_SPACING_MIN_M,
  GRID_SPACING_MAX_M,
} from "@/lib/units"

interface SettingsPanelProps {
  unitSettings: UnitSettings
  onUnitSettingsChange: (next: UnitSettings) => void
  showDimensions: boolean
  onToggleDimensions: () => void
  showSectionLabels: boolean
  onToggleSectionLabels: () => void
  showNodeIds: boolean
  onToggleNodeIds: () => void
  showMemberIds: boolean
  onToggleMemberIds: () => void
  showLocalAxes: boolean
  onToggleLocalAxes: () => void
  snapToGrid: boolean
  onSnapToGridChange: (v: boolean) => void
  snapToNode: boolean
  onSnapToNodeChange: (v: boolean) => void
  adaptiveView: boolean
  onAdaptiveViewChange: (v: boolean) => void
  shearDeformation: boolean
  onShearDeformationChange: (v: boolean) => void
}

const PRESET_SPACINGS_M = [0.25, 0.5, 1.0]

export function SettingsPanel({ unitSettings, onUnitSettingsChange, showDimensions, onToggleDimensions, showSectionLabels, onToggleSectionLabels, showNodeIds, onToggleNodeIds, showMemberIds, onToggleMemberIds, showLocalAxes, onToggleLocalAxes, snapToGrid, onSnapToGridChange, snapToNode, onSnapToNodeChange, adaptiveView, onAdaptiveViewChange, shearDeformation, onShearDeformationChange }: SettingsPanelProps) {
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
      <p className="text-xs font-semibold text-[#1e293b]">Settings</p>

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

      {/* Toggle rows: label on left, checkbox on right */}
      {([
        { label: "Enable Shear Deformation", icon: <MoveVertical className="w-3.5 h-3.5 shrink-0" />, value: shearDeformation, onToggle: () => onShearDeformationChange(!shearDeformation) },
        { label: "Adaptive View",   icon: <Scaling className="w-3.5 h-3.5 shrink-0" />, value: adaptiveView,   onToggle: () => onAdaptiveViewChange(!adaptiveView) },
        { label: "Show Dimensions",     icon: <Ruler className="w-3.5 h-3.5 shrink-0" />, value: showDimensions,    onToggle: onToggleDimensions },
        { label: "Show Section Labels", icon: <span className="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center text-[10px] font-mono font-bold leading-none">s</span>, value: showSectionLabels, onToggle: onToggleSectionLabels },
        { label: "Show Node IDs",   icon: <span className="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center text-[10px] font-mono font-bold leading-none">n</span>, value: showNodeIds,    onToggle: onToggleNodeIds },
        { label: "Show Member IDs", icon: <span className="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center text-[10px] font-mono font-bold leading-none">m</span>, value: showMemberIds,  onToggle: onToggleMemberIds },
        { label: "Show Local Axes", icon: <span className="w-3.5 h-3.5 shrink-0 inline-flex items-center justify-center text-[9px] font-mono font-bold leading-none">1,2</span>, value: showLocalAxes,  onToggle: onToggleLocalAxes },
        { label: "Snap to Node",    icon: <Crosshair className="w-3.5 h-3.5 shrink-0" />, value: snapToNode,  onToggle: () => onSnapToNodeChange(!snapToNode) },
        { label: "Snap to Grid",    icon: <Magnet className="w-3.5 h-3.5 shrink-0" />,    value: snapToGrid,  onToggle: () => onSnapToGridChange(!snapToGrid) },
      ] as const).map(({ label, icon, value, onToggle }) => (
        <div
          key={label}
          onClick={onToggle}
          className="flex items-center justify-between cursor-pointer group"
        >
          <span className="flex items-center gap-1.5 text-xs text-gray-600 group-hover:text-gray-900 transition-colors select-none">
            {icon}
            {label}
          </span>
          <span className={`w-4 h-4 rounded shrink-0 flex items-center justify-center border transition-colors ${
            value
              ? "bg-[#2563eb] border-[#2563eb]"
              : "bg-white border-gray-300 group-hover:border-gray-400"
          }`}>
            {value && (
              <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                <path d="M1 3.5L3.5 6L8 1" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            )}
          </span>
        </div>
      ))}

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

import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Grid3X3 } from "lucide-react"
import type { UnitSettings } from "@/lib/units"
import { GridUnitsPanel } from "@/components/grid-units-panel"
import type { AnalysisStatus } from "@/lib/analysis-diagnostics"

interface StatusBarProps {
  nodes: number
  members: number
  status: AnalysisStatus
  onStatusClick?: () => void
  unitSettings: UnitSettings
  showDimensions: boolean
  cursorX: number
  cursorY: number
  snapToGrid: boolean
  onSnapToGridChange: (v: boolean) => void
  snapToNode: boolean
  onSnapToNodeChange: (v: boolean) => void
  adaptiveView: boolean
  onAdaptiveViewChange: (v: boolean) => void
  onUnitSettingsChange: (next: UnitSettings) => void
  onToggleDimensions: () => void
  showSectionLabels: boolean
  onToggleSectionLabels: () => void
  showNodeIds: boolean
  onToggleNodeIds: () => void
  showMemberIds: boolean
  onToggleMemberIds: () => void
  showLocalAxes: boolean
  onToggleLocalAxes: () => void
}

const STATUS_STYLE: Record<AnalysisStatus, { text: string; bg: string; label: string }> = {
  determinate:   { text: "text-[#16a34a]", bg: "bg-[#16a34a]", label: "DETERMINATE" },
  indeterminate: { text: "text-[#d97706]", bg: "bg-[#d97706]", label: "INDETERMINATE" },
  unstable:      { text: "text-[#dc2626]", bg: "bg-[#dc2626]", label: "UNSTABLE" },
}

export function StatusBar({
  nodes,
  members,
  status,
  onStatusClick,
  unitSettings,
  showDimensions,
  cursorX,
  cursorY,
  snapToGrid,
  onSnapToGridChange,
  snapToNode,
  onSnapToNodeChange,
  adaptiveView,
  onAdaptiveViewChange,
  onUnitSettingsChange,
  onToggleDimensions,
  showSectionLabels,
  onToggleSectionLabels,
  showNodeIds,
  onToggleNodeIds,
  showMemberIds,
  onToggleMemberIds,
  showLocalAxes,
  onToggleLocalAxes,
}: StatusBarProps) {
  const lenUnit = unitSettings.length
  const coordScale = lenUnit === "mm" ? 1000 : 1
  const statusStyle = STATUS_STYLE[status]

  return (
    <footer className="h-9 bg-white border-t border-gray-200 flex items-center px-4 text-xs">
      {/* Left section - Model info */}
      <div className="flex items-center gap-6 text-[#1e293b]">
        <span>
          <span className="text-gray-500">NODES:</span>{" "}
          <span className="font-medium">{nodes}</span>
        </span>
        <span>
          <span className="text-gray-500">MEMBERS:</span>{" "}
          <span className="font-medium">{members}</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-500">STATUS:</span>
          <button
            type="button"
            onClick={onStatusClick}
            className={cn(
              "flex items-center gap-1 font-medium rounded px-1 -mx-1",
              "hover:bg-gray-100 transition-colors cursor-pointer",
              statusStyle.text,
            )}
            title="Click to view analysis issues"
          >
            <span className={cn("w-2 h-2 rounded-full", statusStyle.bg)} />
            {statusStyle.label}
          </button>
        </span>
      </div>

      <div className="flex-1" />

      {/* Right section - Controls */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-3 font-mono text-[#1e293b]">
          <span>
            <span className="text-gray-400">X:</span> {(cursorX * coordScale).toFixed(lenUnit === "mm" ? 0 : 3)} {lenUnit}
          </span>
          <span>
            <span className="text-gray-400">Y:</span> {(cursorY * coordScale).toFixed(lenUnit === "mm" ? 0 : 3)} {lenUnit}
          </span>
        </div>

        <Popover>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-gray-500 hover:bg-gray-100 gap-1.5"
            >
              <Grid3X3 size={14} />
              Settings
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" collisionPadding={8} className="w-56 p-0 max-h-[80dvh] overflow-y-auto">
            <GridUnitsPanel
              unitSettings={unitSettings}
              onUnitSettingsChange={onUnitSettingsChange}
              showDimensions={showDimensions}
              onToggleDimensions={onToggleDimensions}
              showSectionLabels={showSectionLabels}
              onToggleSectionLabels={onToggleSectionLabels}
              showNodeIds={showNodeIds}
              onToggleNodeIds={onToggleNodeIds}
              showMemberIds={showMemberIds}
              onToggleMemberIds={onToggleMemberIds}
              showLocalAxes={showLocalAxes}
              onToggleLocalAxes={onToggleLocalAxes}
              snapToGrid={snapToGrid}
              onSnapToGridChange={onSnapToGridChange}
              snapToNode={snapToNode}
              onSnapToNodeChange={onSnapToNodeChange}
              adaptiveView={adaptiveView}
              onAdaptiveViewChange={onAdaptiveViewChange}
            />
          </PopoverContent>
        </Popover>
      </div>
    </footer>
  )
}
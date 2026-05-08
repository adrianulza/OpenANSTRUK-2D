import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Grid3X3, Check } from "lucide-react"
import type { UnitSettings } from "@/lib/units"
import { GridUnitsPanel } from "@/components/grid-units-panel"

interface StatusBarProps {
  nodes: number
  members: number
  stability: "STABLE" | "UNSTABLE"
  unitSettings: UnitSettings
  showDimensions: boolean
  cursorX: number
  cursorY: number
  onUnitSettingsChange: (next: UnitSettings) => void
  onToggleDimensions: () => void
}

export function StatusBar({
  nodes,
  members,
  stability,
  unitSettings,
  showDimensions,
  cursorX,
  cursorY,
  onUnitSettingsChange,
  onToggleDimensions,
}: StatusBarProps) {
  const lenUnit = unitSettings.length
  const coordScale = lenUnit === "mm" ? 1000 : 1

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
          <span className="text-gray-500">STABILITY:</span>
          <span
            className={cn(
              "flex items-center gap-1 font-medium",
              stability === "STABLE" ? "text-[#16a34a]" : "text-[#dc2626]"
            )}
          >
            <span
              className={cn(
                "w-2 h-2 rounded-full",
                stability === "STABLE" ? "bg-[#16a34a]" : "bg-[#dc2626]"
              )}
            />
            {stability}
          </span>
        </span>
      </div>

      <div className="flex-1" />

      {/* Right section - Controls */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleDimensions}
          className={cn(
            "h-7 px-2 text-xs gap-1.5",
            showDimensions
              ? "bg-[#2563eb]/10 text-[#2563eb] hover:bg-[#2563eb]/15"
              : "text-gray-500 hover:bg-gray-100"
          )}
        >
          <span className={cn(
            "w-3.5 h-3.5 rounded-sm border flex items-center justify-center",
            showDimensions ? "border-[#2563eb] bg-[#2563eb]" : "border-gray-300"
          )}>
            {showDimensions && <Check size={10} className="text-white" />}
          </span>
          DIMENSION
        </Button>

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
              Grid and Units
            </Button>
          </PopoverTrigger>
          <PopoverContent side="top" align="end" className="w-56 p-0">
            <GridUnitsPanel
              unitSettings={unitSettings}
              onUnitSettingsChange={onUnitSettingsChange}
            />
          </PopoverContent>
        </Popover>
      </div>
    </footer>
  )
}

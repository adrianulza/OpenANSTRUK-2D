import { Activity, BarChart3, TrendingUp } from "lucide-react"
import { cn } from "@/lib/utils"

export type LiveDiagramKind = "AXIAL" | "SHEAR" | "MOMENT"

const OPTIONS: Array<{ id: LiveDiagramKind; name: string; symbol: string; icon: React.ReactNode }> = [
  { id: "AXIAL", name: "Axial", symbol: "N", icon: <Activity size={16} /> },
  { id: "SHEAR", name: "Shear", symbol: "V", icon: <BarChart3 size={16} /> },
  { id: "MOMENT", name: "Moment", symbol: "M", icon: <TrendingUp size={16} /> },
]

/**
 * Live tab: which internal-force diagram grows with the pull. Three separate
 * buttons that act as one radio group, so exactly one diagram is always shown.
 */
export function LiveDiagramSwitch({
  value,
  onChange,
}: {
  value: LiveDiagramKind
  onChange: (v: LiveDiagramKind) => void
}) {
  return (
    <div role="radiogroup" aria-label="Diagram to show" className="flex items-center gap-2 select-none">
      {OPTIONS.map((o) => {
        const active = o.id === value
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={`${o.name} (${o.symbol})`}
            onClick={() => onChange(o.id)}
            className={cn(
              "flex items-center gap-2 h-10 px-3 sm:px-4 rounded-xl border text-sm font-medium",
              "transition-all duration-150 motion-reduce:transition-none",
              active
                ? "bg-[#1a2f5e] border-[#1a2f5e] text-white shadow-[0_4px_14px_rgba(26,47,94,0.35)] scale-105"
                : "bg-white/95 border-gray-200 text-gray-500 shadow-sm hover:text-[#1a2f5e] hover:border-gray-300 hover:-translate-y-0.5 hover:shadow-md",
            )}
          >
            {o.icon}
            {/* Name hides on narrow phones; the icon and symbol still say which diagram. */}
            <span className="max-[420px]:sr-only">{o.name}</span>
            <span
              className={cn(
                "font-mono text-xs rounded px-1.5 py-0.5",
                active ? "bg-white/15 text-white" : "bg-gray-100 text-gray-500",
              )}
            >
              {o.symbol}
            </span>
          </button>
        )
      })}
    </div>
  )
}

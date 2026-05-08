import { cn } from "@/lib/utils"
import {
  MousePointer2,
  Pencil,
  BoxSelect,
  Triangle,
  Layers,
  ArrowDown,
  AlignVerticalJustifyEnd,
  TrendingUp,
  Activity,
  BarChart3,
  Waves,
  CircleDot,
  Anchor,
  Trash2,
} from "lucide-react"

export type TabType = "Model" | "Load" | "Analyze"
export type ToolType =
  | "SELECT"
  | "NODE"
  | "MEMBER"
  | "SUPPORT"
  | "MATERIAL"
  | "DELETE"
  | "POINT_LOAD"
  | "DISTRIBUTED_LOAD"
  | "MODIFY_LOAD"
  | "REACTION"
  | "AXIAL"
  | "SHEAR"
  | "MOMENT"
  | "DEFORMATION"
  | null

interface Tool {
  id: NonNullable<ToolType>
  label: string
  icon: React.ReactNode
}

const modelTools: Tool[] = [
  { id: "NODE", label: "NODE", icon: <CircleDot size={20} /> },
  { id: "MEMBER", label: "MEMBER", icon: <BoxSelect size={20} strokeWidth={1.5} /> },
  { id: "SUPPORT", label: "SUPPORT", icon: <Triangle size={18} /> },
  { id: "MATERIAL", label: "MATERIAL", icon: <Layers size={20} /> },
  { id: "SELECT", label: "MODIFY", icon: <Pencil size={20} /> },
  { id: "DELETE", label: "DELETE", icon: <Trash2 size={20} /> },
]

const loadTools: Tool[] = [
  { id: "POINT_LOAD", label: "POINT", icon: <ArrowDown size={20} /> },
  { id: "DISTRIBUTED_LOAD", label: "DISTRIBUTED", icon: <AlignVerticalJustifyEnd size={20} /> },
  { id: "MODIFY_LOAD", label: "MODIFY", icon: <Pencil size={20} /> },
  { id: "DELETE", label: "DELETE", icon: <Trash2 size={20} /> },
]

const analyzeTools: Tool[] = [
  { id: "REACTION", label: "REACTION", icon: <Anchor size={20} /> },
  { id: "AXIAL", label: "AXIAL\nDIAGRAM", icon: <Activity size={20} /> },
  { id: "SHEAR", label: "SHEAR\nDIAGRAM", icon: <BarChart3 size={20} /> },
  { id: "MOMENT", label: "MOMENT\nDIAGRAM", icon: <TrendingUp size={20} /> },
  { id: "DEFORMATION", label: "DEFORMATION", icon: <Waves size={20} /> },
]

interface ToolSidebarProps {
  activeTab: TabType
  activeTool: ToolType
  onToolSelect: (tool: ToolType) => void
}

export function ToolSidebar({ activeTab, activeTool, onToolSelect }: ToolSidebarProps) {
  const tools = activeTab === "Model" 
    ? modelTools 
    : activeTab === "Load" 
    ? loadTools 
    : analyzeTools

  const handleToolClick = (toolId: NonNullable<ToolType>) => {
    // Toggle behaviour: clicking the active tool deselects it
    onToolSelect(activeTool === toolId ? null : toolId)
  }

  return (
    <aside className="w-[72px] bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1">
      {tools.map((tool) => (
        <button
          key={tool.id}
          onClick={() => handleToolClick(tool.id)}
          className={cn(
            "w-14 flex flex-col items-center justify-center rounded gap-0.5 transition-colors py-2",
            tool.label.includes("\n") ? "min-h-16" : "h-14",
            activeTool === tool.id
              ? "bg-[#1a2f5e] text-white"
              : "text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          )}
        >
          {tool.icon}
          <span className="text-[9px] font-medium tracking-wide text-center whitespace-pre-line leading-tight">{tool.label}</span>
        </button>
      ))}
    </aside>
  )
}

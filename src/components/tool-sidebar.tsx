import { cn } from "@/lib/utils"
import {
  Pencil,
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
  Move,
  ListChecks,
  Combine,
  Table2,
  ClipboardList,
} from "lucide-react"

export type TabType = "Model" | "Load" | "Analyze" | "Design"
export type ToolType =
  | "SELECT"
  | "NODE"
  | "MEMBER"
  | "SUPPORT"
  | "MATERIAL"
  | "MOVE_NODE"
  | "DELETE"
  | "LOAD_CASE"
  | "LOAD_COMBINATION"
  | "POINT_LOAD"
  | "DISTRIBUTED_LOAD"
  | "MODIFY_LOAD"
  | "REACTION"
  | "AXIAL"
  | "SHEAR"
  | "MOMENT"
  | "DEFORMATION"
  | "DESIGN_SCHEDULE"
  | "DESIGN_REPORT"
  | "SECTION_DESIGN"
  | "STEEL_DESIGN"
  | null

interface Tool {
  id: NonNullable<ToolType>
  label: string
  icon: React.ReactNode
}

const memberIcon = (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round">
    <line x1="4" y1="16" x2="16" y2="4" />
    <circle cx="4" cy="16" r="1.5" fill="currentColor" />
    <circle cx="16" cy="4" r="1.5" fill="currentColor" />
  </svg>
)

const modelTools: Tool[] = [
  { id: "NODE", label: "NODE", icon: <CircleDot size={20} /> },
  { id: "MEMBER", label: "MEMBER", icon: memberIcon },
  { id: "SUPPORT", label: "SUPPORT", icon: <Triangle size={18} /> },
  { id: "MATERIAL", label: "MATERIAL", icon: <Layers size={20} /> },
  { id: "SELECT", label: "MODIFY\nSECTION", icon: <Pencil size={20} /> },
  { id: "MOVE_NODE", label: "MOVE\nNODE", icon: <Move size={20} /> },
  { id: "DELETE", label: "DELETE", icon: <Trash2 size={20} /> },
]

const loadTools: Tool[] = [
  { id: "LOAD_CASE", label: "LOAD\nCASE", icon: <ListChecks size={20} /> },
  { id: "LOAD_COMBINATION", label: "LOAD\nCOMBO", icon: <Combine size={20} /> },
  { id: "POINT_LOAD", label: "POINT", icon: <ArrowDown size={20} /> },
  { id: "DISTRIBUTED_LOAD", label: "DISTRIBUTED", icon: <AlignVerticalJustifyEnd size={20} /> },
  { id: "MODIFY_LOAD", label: "MODIFY", icon: <Pencil size={20} /> },
  { id: "DELETE", label: "DELETE", icon: <Trash2 size={20} /> },
]

// RC rectangular section with corner bars — Design tab "Section Design" icon.
// Exported: the RC tool's pane switch reuses it for its SECTION step, so the
// sidebar and the pane inside it carry the same mark.
export const rcSectionIcon = (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}>
    <rect x="4.5" y="2.5" width="11" height="15" rx="1.5" />
    <circle cx="7.5" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="5.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="7.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="12.5" cy="14.5" r="1.1" fill="currentColor" stroke="none" />
  </svg>
)

const analyzeTools: Tool[] = [
  { id: "REACTION", label: "REACTION", icon: <Anchor size={20} /> },
  { id: "AXIAL", label: "AXIAL\nDIAGRAM", icon: <Activity size={20} /> },
  { id: "SHEAR", label: "SHEAR\nDIAGRAM", icon: <BarChart3 size={20} /> },
  { id: "MOMENT", label: "MOMENT\nDIAGRAM", icon: <TrendingUp size={20} /> },
  { id: "DEFORMATION", label: "DEFORMATION", icon: <Waves size={20} /> },
]

// Steel I-section — Design tab "Steel" icon. Exported for the same reason as
// `rcSectionIcon` above.
export const steelSectionIcon = (
  <svg width={20} height={20} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
    <line x1="5" y1="3.5" x2="15" y2="3.5" />
    <line x1="5" y1="16.5" x2="15" y2="16.5" />
    <line x1="10" y1="3.5" x2="10" y2="16.5" />
  </svg>
)

// One tool per material, plus the cross-material schedule. The old DESIGN
// CRITERIA tool is gone: its content is now each material tool's PREFERENCES
// pane, because a code setting only means something once you know the material
// it applies to. Its sliders icon lives on in the pane switch.
// Workflow order: say what each section IS, detail it per material, read the
// results. The schedule leads because everything after it depends on the answer.
const designTools: Tool[] = [
  { id: "DESIGN_SCHEDULE", label: "DESIGN\nSCHEDULE", icon: <Table2 size={20} /> },
  { id: "SECTION_DESIGN", label: "REINFORCED\nCONCRETE", icon: rcSectionIcon },
  { id: "STEEL_DESIGN", label: "STEEL", icon: steelSectionIcon },
  { id: "DESIGN_REPORT", label: "DESIGN\nREPORT", icon: <ClipboardList size={20} /> },
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
    : activeTab === "Design"
    ? designTools
    : analyzeTools

  const handleToolClick = (toolId: NonNullable<ToolType>) => {
    // Toggle behaviour: clicking the active tool deselects it
    onToolSelect(activeTool === toolId ? null : toolId)
  }

  return (
    <aside className="w-[72px] bg-white border-r border-gray-200 flex flex-col items-center py-3 gap-1 overflow-y-auto scrollbar-hide">
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
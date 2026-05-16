import * as React from "react"
import { cn } from "@/lib/utils"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { TabType, ToolType } from "./tool-sidebar"
import type { Section, SectionId, MultiSelection, StructureModel, SupportType, MemberType, Load, LoadId, PointLoad, DistributedLoad } from "@/lib/model"
import { MaterialFlyout } from "@/features/material/material-flyout"
import type { AnalysisResult, NodeDisplacement } from "@/lib/solver"
import { memberInternalForces } from "@/lib/solver"
import type { UnitSettings } from "@/lib/units"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Trash2,
  X,
} from "lucide-react"

const pinIcon = (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" strokeWidth={0.5}>
    <polygon points="8,2 12,10 4,10" />
    <line x1="3" y1="11" x2="13" y2="11" strokeWidth={1.5} />
  </svg>
)

const rollerIcon = (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" strokeWidth={0.5}>
    <polygon points="8,2 12,10 4,10" />
    <circle cx="6" cy="12.5" r="1.5" fill="none" strokeWidth={1.5} />
    <circle cx="10" cy="12.5" r="1.5" fill="none" strokeWidth={1.5} />
    <line x1="3" y1="14" x2="13" y2="14" strokeWidth={1.5} />
  </svg>
)

const fixedIcon = (
  <svg width={16} height={16} viewBox="0 0 16 16" fill="currentColor" stroke="currentColor" strokeWidth={0.5}>
    <rect x="4" y="3" width="8" height="6" fill="currentColor" />
    <line x1="2.5" y1="10" x2="13.5" y2="10" strokeWidth={1.5} />
    <line x1="4" y1="10" x2="3" y2="13" strokeWidth={1.5} />
    <line x1="9" y1="10" x2="8" y2="13" strokeWidth={1.5} />
    <line x1="12" y1="10" x2="11" y2="13" strokeWidth={1.5} />
  </svg>
)
import { formatValue } from "@/lib/constants"

export type SelectedLoadType = "point" | "uniform" | "asymmetric" | null

interface FlyoutPanelProps {
  activeTab: TabType
  activeTool: ToolType
  onClose: () => void
  model?: StructureModel
  selection?: MultiSelection
  activeSection?: SectionId
  onSectionChange?: (id: SectionId) => void
  activeMemberType?: MemberType
  onMemberTypeChange?: (t: MemberType) => void
  activeSupportType?: SupportType
  onSupportTypeChange?: (t: SupportType) => void
  onSectionPropsChange?: (id: SectionId, patch: Partial<Section>) => void
  onDeleteSelection?: () => void
  onModifySelection?: () => void
  onModifySupportSelection?: (type: SupportType) => void
  onAddSection?: (section: Section) => void
  onDeleteSection?: (id: SectionId) => void
  unitSettings?: UnitSettings
  // Load tab
  activePtInputMode?: "principal" | "angular"
  onPtInputModeChange?: (mode: "principal" | "angular") => void
  activePointLoadAxis?: "x" | "y"
  onPointLoadAxisChange?: (axis: "x" | "y") => void
  activePtMagnitude?: number
  onPtMagnitudeChange?: (v: number) => void
  activePtAngle?: number
  onPtAngleChange?: (angle: number) => void
  activeDistType?: "uniform" | "asymmetric"
  onDistTypeChange?: (t: "uniform" | "asymmetric") => void
  activeDistMode?: "local-axis" | "global-axis"
  onDistModeChange?: (m: "local-axis" | "global-axis") => void
  activeDistAxis?: "x" | "y"
  onDistAxisChange?: (axis: "x" | "y") => void
  activeDistWStart?: number
  onDistWStartChange?: (v: number) => void
  activeDistWEnd?: number
  onDistWEndChange?: (v: number) => void
  activeDistWxStart?: number
  onDistWxStartChange?: (v: number) => void
  activeDistWxEnd?: number
  onDistWxEndChange?: (v: number) => void
  activeDistWyStart?: number
  onDistWyStartChange?: (v: number) => void
  activeDistWyEnd?: number
  onDistWyEndChange?: (v: number) => void
  selectedLoadId?: LoadId | null
  selectedLoadIds?: string[]
  onModifyLoad?: (patch: Partial<Load>) => void
  onModifyLoadsByType?: (type: "point" | "distributed", patch: Partial<Load>) => void
  onDeleteLoad?: () => void
  onDeleteLoadIds?: () => void
  diagramScale?: number
  onDiagramScaleChange?: (v: number) => void
  invertSFD?: boolean
  onInvertSFDChange?: (v: boolean) => void
  invertBMD?: boolean
  onInvertBMDChange?: (v: boolean) => void
  deformationScale?: number
  onDeformationScaleChange?: (v: number) => void
  showDeformNodeLabels?: boolean
  onShowDeformNodeLabelsChange?: (v: boolean) => void
  showReactionNodeLabels?: boolean
  onShowReactionNodeLabelsChange?: (v: boolean) => void
  showDiagramMemberLabels?: boolean
  onShowDiagramMemberLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
  onToolSelect?: (tool: ToolType) => void
  // Move Node tool
  moveNodeMode?: "coordinates" | "screen"
  onMoveNodeModeChange?: (mode: "coordinates" | "screen") => void
  moveNodeCoordMode?: "set" | "offset"
  onMoveNodeCoordModeChange?: (mode: "set" | "offset") => void
  moveNodeSelectedId?: string | null
  onMoveNodeSelectId?: (id: string | null) => void
  onMoveNode?: (nodeId: string, x: number, y: number) => void
}

export function FlyoutPanel({
  activeTab,
  activeTool,
  onClose,
  model,
  selection,
  activeSection,
  onSectionChange,
  activeMemberType,
  onMemberTypeChange,
  activeSupportType,
  onSupportTypeChange,
  onSectionPropsChange,
  onDeleteSelection,
  onModifySelection,
  onModifySupportSelection,
  onAddSection,
  onDeleteSection,
  unitSettings,
  activePtInputMode,
  onPtInputModeChange,
  activePointLoadAxis,
  onPointLoadAxisChange,
  activePtMagnitude,
  onPtMagnitudeChange,
  activePtAngle,
  onPtAngleChange,
  activeDistType,
  onDistTypeChange,
  activeDistMode,
  onDistModeChange,
  activeDistAxis,
  onDistAxisChange,
  activeDistWStart,
  onDistWStartChange,
  activeDistWEnd,
  onDistWEndChange,
  activeDistWxStart,
  onDistWxStartChange,
  activeDistWxEnd,
  onDistWxEndChange,
  activeDistWyStart,
  onDistWyStartChange,
  activeDistWyEnd,
  onDistWyEndChange,
  selectedLoadId,
  selectedLoadIds,
  onModifyLoad,
  onModifyLoadsByType,
  onDeleteLoad,
  onDeleteLoadIds,
  diagramScale = 10,
  onDiagramScaleChange,
  invertSFD = false,
  onInvertSFDChange,
  invertBMD = false,
  onInvertBMDChange,
  deformationScale = 25,
  onDeformationScaleChange,
  showDeformNodeLabels = true,
  onShowDeformNodeLabelsChange,
  showReactionNodeLabels = true,
  onShowReactionNodeLabelsChange,
  showDiagramMemberLabels = true,
  onShowDiagramMemberLabelsChange,
  analysisResult,
  onToolSelect,
  moveNodeMode = "coordinates",
  onMoveNodeModeChange,
  moveNodeCoordMode = "set",
  onMoveNodeCoordModeChange,
  moveNodeSelectedId,
  onMoveNodeSelectId,
  onMoveNode,
}: FlyoutPanelProps) {
  if (!activeTool) return null

  return (
    <div
      data-flyout-root
      className={cn(
        "absolute top-3 left-3 w-[200px] bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 z-10",
        "animate-in fade-in slide-in-from-left-2 duration-150 ease-out",
        "flex flex-col max-h-[calc(100dvh-5rem)]"
      )}
    >
      <div className="p-3 flex items-center justify-between shrink-0">
        <span className="font-medium text-sm" style={{ color: FLYOUT_PANEL_COLORS.headerFont }}>{getToolTitle(activeTool, activeTab)}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded hover:bg-gray-100"
        >
          <X size={14} />
        </button>
      </div>
      <div className="mx-3" style={{ borderTopColor: FLYOUT_PANEL_COLORS.headerSeparator, borderTopWidth: 3 }} />
      <div className="p-3 overflow-y-auto">
        <FlyoutContent
          activeTab={activeTab}
          activeTool={activeTool}
          model={model}
          selection={selection}
          activeSection={activeSection}
          onSectionChange={onSectionChange}
          activeMemberType={activeMemberType}
          onMemberTypeChange={onMemberTypeChange}
          activeSupportType={activeSupportType}
          onSupportTypeChange={onSupportTypeChange}
          onSectionPropsChange={onSectionPropsChange}
          onDeleteSelection={onDeleteSelection}
          onModifySelection={onModifySelection}
          onModifySupportSelection={onModifySupportSelection}
          onAddSection={onAddSection}
          onDeleteSection={onDeleteSection}
          unitSettings={unitSettings}
          activePtInputMode={activePtInputMode}
          onPtInputModeChange={onPtInputModeChange}
          activePointLoadAxis={activePointLoadAxis}
          onPointLoadAxisChange={onPointLoadAxisChange}
          activePtMagnitude={activePtMagnitude}
          onPtMagnitudeChange={onPtMagnitudeChange}
          activePtAngle={activePtAngle}
          onPtAngleChange={onPtAngleChange}
          activeDistType={activeDistType}
          onDistTypeChange={onDistTypeChange}
          activeDistMode={activeDistMode}
          onDistModeChange={onDistModeChange}
          activeDistAxis={activeDistAxis}
          onDistAxisChange={onDistAxisChange}
          activeDistWStart={activeDistWStart}
          onDistWStartChange={onDistWStartChange}
          activeDistWEnd={activeDistWEnd}
          onDistWEndChange={onDistWEndChange}
          activeDistWxStart={activeDistWxStart}
          onDistWxStartChange={onDistWxStartChange}
          activeDistWxEnd={activeDistWxEnd}
          onDistWxEndChange={onDistWxEndChange}
          activeDistWyStart={activeDistWyStart}
          onDistWyStartChange={onDistWyStartChange}
          activeDistWyEnd={activeDistWyEnd}
          onDistWyEndChange={onDistWyEndChange}
          selectedLoadId={selectedLoadId}
          selectedLoadIds={selectedLoadIds}
          onModifyLoad={onModifyLoad}
          onModifyLoadsByType={onModifyLoadsByType}
          onDeleteLoad={onDeleteLoad}
          onDeleteLoadIds={onDeleteLoadIds}
          diagramScale={diagramScale}
          onDiagramScaleChange={onDiagramScaleChange}
          invertSFD={invertSFD}
          onInvertSFDChange={onInvertSFDChange}
          invertBMD={invertBMD}
          onInvertBMDChange={onInvertBMDChange}
          deformationScale={deformationScale}
          onDeformationScaleChange={onDeformationScaleChange}
          showDeformNodeLabels={showDeformNodeLabels}
          onShowDeformNodeLabelsChange={onShowDeformNodeLabelsChange}
          showReactionNodeLabels={showReactionNodeLabels}
          onShowReactionNodeLabelsChange={onShowReactionNodeLabelsChange}
          showDiagramMemberLabels={showDiagramMemberLabels}
          onShowDiagramMemberLabelsChange={onShowDiagramMemberLabelsChange}
          analysisResult={analysisResult}
          moveNodeMode={moveNodeMode}
          onMoveNodeModeChange={onMoveNodeModeChange}
          moveNodeCoordMode={moveNodeCoordMode}
          onMoveNodeCoordModeChange={onMoveNodeCoordModeChange}
          moveNodeSelectedId={moveNodeSelectedId}
          onMoveNodeSelectId={onMoveNodeSelectId}
          onMoveNode={onMoveNode}
          onToolSelect={onToolSelect}
        />
      </div>
    </div>
  )
}

function getToolTitle(tool: ToolType, activeTab?: TabType): string {
  if (!tool) return ""
  if (tool === "SELECT") return "MODIFY COMPONENT"
  if (tool === "MOVE_NODE") return "MOVE NODE"
  if (tool === "DELETE") return activeTab === "Load" ? "DELETE LOAD" : "DELETE COMPONENT"
  return tool.replace(/_/g, " ")
}

type FlyoutContentProps = Omit<FlyoutPanelProps, "onClose">

function FlyoutContent({
  activeTab,
  activeTool,
  model,
  selection,
  activeSection,
  onSectionChange,
  activeMemberType,
  onMemberTypeChange,
  activeSupportType,
  onSupportTypeChange,
  onSectionPropsChange,
  onDeleteSelection,
  onModifySelection,
  onModifySupportSelection,
  onAddSection,
  onDeleteSection,
  unitSettings,
  activePtInputMode,
  onPtInputModeChange,
  activePointLoadAxis,
  onPointLoadAxisChange,
  activePtMagnitude,
  onPtMagnitudeChange,
  activePtAngle,
  onPtAngleChange,
  activeDistType,
  onDistTypeChange,
  activeDistMode,
  onDistModeChange,
  activeDistAxis,
  onDistAxisChange,
  activeDistWStart,
  onDistWStartChange,
  activeDistWEnd,
  onDistWEndChange,
  activeDistWxStart,
  onDistWxStartChange,
  activeDistWxEnd,
  onDistWxEndChange,
  activeDistWyStart,
  onDistWyStartChange,
  activeDistWyEnd,
  onDistWyEndChange,
  selectedLoadId,
  selectedLoadIds = [],
  onModifyLoad,
  onModifyLoadsByType,
  onDeleteLoad,
  onDeleteLoadIds,
  diagramScale = 10,
  onDiagramScaleChange,
  invertSFD = false,
  onInvertSFDChange,
  invertBMD = false,
  onInvertBMDChange,
  deformationScale = 25,
  onDeformationScaleChange,
  showDeformNodeLabels = true,
  onShowDeformNodeLabelsChange,
  showReactionNodeLabels = true,
  onShowReactionNodeLabelsChange,
  showDiagramMemberLabels = true,
  onShowDiagramMemberLabelsChange,
  analysisResult,
  moveNodeMode = "coordinates",
  onMoveNodeModeChange,
  moveNodeCoordMode = "set",
  onMoveNodeCoordModeChange,
  moveNodeSelectedId,
  onMoveNodeSelectId,
  onMoveNode,
}: FlyoutContentProps) {
  if (activeTab === "Model") {
    switch (activeTool) {
      case "SELECT":
        return (
          <ModifyComponentToolContent
            selection={selection ?? { nodeIds: [], memberIds: [], supportNodeIds: [] }}
            sectionId={activeSection ?? "iwf150"}
            sections={model?.sections}
            onSectionChange={onSectionChange}
            onModify={onModifySelection}
            onModifySupport={onModifySupportSelection}
          />
        )
      case "MOVE_NODE":
        return (
          <MoveNodeToolContent
            model={model}
            moveNodeMode={moveNodeMode}
            onMoveNodeModeChange={onMoveNodeModeChange}
            moveNodeCoordMode={moveNodeCoordMode}
            onMoveNodeCoordModeChange={onMoveNodeCoordModeChange}
            moveNodeSelectedId={moveNodeSelectedId ?? null}
            onMoveNodeSelectId={onMoveNodeSelectId}
            onMoveNode={onMoveNode}
          />
        )
      case "DELETE":
        return (
          <DeleteComponentToolContent
            selection={selection ?? { nodeIds: [], memberIds: [], supportNodeIds: [] }}
            onDelete={onDeleteSelection}
          />
        )
      case "NODE":
        return <NodeToolContent />
      case "MEMBER":
        return (
          <MemberToolContent
            activeSection={activeSection ?? "iwf150"}
            sections={model?.sections}
            onSectionChange={onSectionChange}
            activeMemberType={activeMemberType ?? "frame"}
            onMemberTypeChange={onMemberTypeChange}
          />
        )
      case "SUPPORT":
        return (
          <SupportToolContent
            activeSupportType={activeSupportType ?? "pin"}
            onSupportTypeChange={onSupportTypeChange}
          />
        )
      case "MATERIAL":
        return (
          <MaterialFlyout
            model={model}
            activeSection={activeSection ?? "iwf150"}
            onSectionChange={onSectionChange}
            onSectionPropsChange={onSectionPropsChange}
            onAddSection={onAddSection}
            onDeleteSection={onDeleteSection}
            unitSettings={unitSettings}
          />
        )
      default:
        return null
    }
  }

  if (activeTab === "Load") {
    switch (activeTool) {
      case "POINT_LOAD":
        return (
          <PointLoadToolContent
            inputMode={activePtInputMode ?? "principal"}
            onInputModeChange={onPtInputModeChange}
            axis={activePointLoadAxis ?? "y"}
            magnitude={activePtMagnitude ?? 10}
            onAxisChange={onPointLoadAxisChange}
            onMagnitudeChange={onPtMagnitudeChange}
            angle={activePtAngle ?? 90}
            onAngleChange={onPtAngleChange}
          />
        )
      case "DISTRIBUTED_LOAD":
        return (
          <DistributedLoadToolContent
            distType={activeDistType ?? "uniform"}
            distMode={activeDistMode ?? "local-axis"}
            activeAxis={activeDistAxis ?? "x"}
            onActiveAxisChange={onDistAxisChange}
            wStart={activeDistWStart ?? 5}
            wEnd={activeDistWEnd ?? 5}
            wxStart={activeDistWxStart ?? 5}
            wxEnd={activeDistWxEnd ?? 5}
            wyStart={activeDistWyStart ?? 5}
            wyEnd={activeDistWyEnd ?? 5}
            onDistTypeChange={onDistTypeChange}
            onDistModeChange={onDistModeChange}
            onWStartChange={onDistWStartChange}
            onWEndChange={onDistWEndChange}
            onWxStartChange={onDistWxStartChange}
            onWxEndChange={onDistWxEndChange}
            onWyStartChange={onDistWyStartChange}
            onWyEndChange={onDistWyEndChange}
          />
        )
      case "MODIFY_LOAD": {
        const selectedLoad = selectedLoadId && model?.loads ? model.loads[selectedLoadId] ?? null : null
        return (
          <ModifyLoadToolContent
            selectedLoad={selectedLoad}
            selectedLoadIds={selectedLoadIds ?? []}
            model={model ?? null}
            onModify={onModifyLoad}
            onModifyByType={onModifyLoadsByType}
          />
        )
      }
      case "DELETE": {
        return (
          <DeleteLoadToolContent
            selectedLoadIds={selectedLoadIds}
            model={model}
            onDelete={onDeleteLoadIds}
          />
        )
      }
      default:
        return null
    }
  }

  if (activeTab === "Analyze") {
    switch (activeTool) {
      case "SELECT":
        return <AnalyzeSelectContent analysisResult={analysisResult ?? null} />
      case "REACTION":
        return <ReactionToolContent analysisResult={analysisResult ?? null} showNodeLabels={showReactionNodeLabels} onShowNodeLabelsChange={onShowReactionNodeLabelsChange} />
      case "AXIAL":
        return <DiagramToolContent label={activeTool} scale={diagramScale} onScaleChange={onDiagramScaleChange} showMemberLabels={showDiagramMemberLabels} onShowMemberLabelsChange={onShowDiagramMemberLabelsChange} analysisResult={analysisResult} model={model} />
      case "SHEAR":
        return <DiagramToolContent label={activeTool} scale={diagramScale} onScaleChange={onDiagramScaleChange} invert={invertSFD} onInvertChange={onInvertSFDChange} showMemberLabels={showDiagramMemberLabels} onShowMemberLabelsChange={onShowDiagramMemberLabelsChange} analysisResult={analysisResult} model={model} />
      case "MOMENT":
        return <DiagramToolContent label={activeTool} scale={diagramScale} onScaleChange={onDiagramScaleChange} invert={invertBMD} onInvertChange={onInvertBMDChange} showMemberLabels={showDiagramMemberLabels} onShowMemberLabelsChange={onShowDiagramMemberLabelsChange} analysisResult={analysisResult} model={model} />
      case "DEFORMATION":
        return <DeformationToolContent scale={deformationScale} onScaleChange={onDeformationScaleChange} showNodeLabels={showDeformNodeLabels} onShowNodeLabelsChange={onShowDeformNodeLabelsChange} analysisResult={analysisResult} />
      default:
        return null
    }
  }

  return null
}

// ── Shared sub-components ────────────────────────────────────────────────────

function SectionSelect({
  value,
  onChange,
  sections,
  label = "Section",
}: {
  value: SectionId
  onChange?: (id: SectionId) => void
  sections?: Record<string, Section>
  label?: string
}) {
  const items = sections
    ? Object.values(sections)
    : [
        { id: "iwf150", name: "IWF 150" },
        { id: "iwf200", name: "IWF 200" },
        { id: "wf300",  name: "WF 300"  },
      ]
  return (
    <div className="space-y-2">
      <Label className="text-xs text-gray-600">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange?.(v)}>
        <SelectTrigger className="h-8 text-xs">
          <SelectValue placeholder="Select section" />
        </SelectTrigger>
        <SelectContent>
          {items.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

// ── Model Tab Tool Contents ───────────────────────────────────────────────────

function ModifyComponentToolContent({
  selection,
  sectionId,
  sections,
  onSectionChange,
  onModify,
  onModifySupport,
}: {
  selection: MultiSelection
  sectionId: SectionId
  sections?: Record<string, Section>
  onSectionChange?: (id: SectionId) => void
  onModify?: () => void
  onModifySupport?: (type: SupportType) => void
}) {
  const hasMembers = selection.memberIds.length > 0
  const hasSupports = selection.supportNodeIds.length > 0

  const [sectionApplied, setSectionApplied] = React.useState(false)
  const [supportType, setSupportType] = React.useState<SupportType>("pin")
  const [supportApplied, setSupportApplied] = React.useState(false)

  const memberKey = selection.memberIds.join(",")
  React.useEffect(() => { setSectionApplied(false) }, [sectionId, memberKey])

  const supportKey = selection.supportNodeIds.join(",")
  React.useEffect(() => { setSupportApplied(false) }, [supportType, supportKey])

  const canApplySection = hasMembers && !sectionApplied
  const canApplySupport = hasSupports && !supportApplied

  const supportBtn = (type: SupportType, icon: React.ReactNode, title: string) => (
    <button
      key={type}
      onClick={() => { setSupportType(type); setSupportApplied(false) }}
      className="flex-1 h-10 flex flex-col items-center justify-center gap-0.5 rounded transition-colors text-[11px]"
      style={supportType === type ? {
        color: FLYOUT_PANEL_COLORS.primary,
        backgroundColor: FLYOUT_PANEL_COLORS.primary + '19',
        fontWeight: 500,
      } : {
        backgroundColor: '#f3f4f6',
        color: '#6b7280',
      }}
    >
      {icon}
      {title}
    </button>
  )

  // Show member count if members are selected
  const memberCount = selection.memberIds.length
  const supportCount = selection.supportNodeIds.length

  return (
    <div className="space-y-3">
      {memberCount > 0 && (
        <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600 truncate">
          {memberCount} member{memberCount > 1 ? "s" : ""} selected
        </div>
      )}

      {hasMembers && (
        <div className="space-y-2">
          <SectionSelect value={sectionId} sections={sections} onChange={onSectionChange} label="Modify section" />
          <button
            onClick={() => {
              if (!canApplySection) return
              onModify?.()
              setSectionApplied(true)
            }}
            disabled={!canApplySection}
            className="w-full py-1.5 rounded-md text-[13px] font-medium transition-colors"
            style={canApplySection ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#9ca3af',
              cursor: 'not-allowed',
            }}
          >
            Apply
          </button>
        </div>
      )}

      {supportCount > 0 && (
        <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600 truncate">
          {supportCount} support{supportCount > 1 ? "s" : ""} selected
        </div>
      )}

      {hasSupports && (
        <div className="space-y-2">
          <Label className="text-xs text-gray-600">Modify support</Label>
          <div className="flex gap-1.5">
            {supportBtn("pin", pinIcon, "Pin")}
            {supportBtn("roller", rollerIcon, "Roller")}
            {supportBtn("fixed", fixedIcon, "Fixed")}
          </div>
          <button
            onClick={() => {
              if (!canApplySupport) return
              onModifySupport?.(supportType)
              setSupportApplied(true)
            }}
            disabled={!canApplySupport}
            className="w-full py-1.5 rounded-md text-[13px] font-medium transition-colors"
            style={canApplySupport ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#9ca3af',
              cursor: 'not-allowed',
            }}
          >
            Apply
          </button>
        </div>
      )}

      {!hasMembers && !hasSupports && (
        <p className="text-xs text-gray-500">Select members or supports to modify</p>
      )}
    </div>
  )
}

function DeleteComponentToolContent({
  selection,
  onDelete,
}: {
  selection: MultiSelection
  onDelete?: () => void
}) {
  const hasSelection =
    selection.nodeIds.length > 0 ||
    selection.memberIds.length > 0 ||
    selection.supportNodeIds.length > 0

  // Build a compact summary label
  const parts: string[] = []
  if (selection.nodeIds.length > 0)
    parts.push(`${selection.nodeIds.length} node${selection.nodeIds.length > 1 ? "s" : ""}`)
  if (selection.memberIds.length > 0)
    parts.push(`${selection.memberIds.length} member${selection.memberIds.length > 1 ? "s" : ""}`)
  if (selection.supportNodeIds.length > 0)
    parts.push(`${selection.supportNodeIds.length} support${selection.supportNodeIds.length > 1 ? "s" : ""}`)
  const label = parts.length > 0 ? parts.join(", ") : "No components selected"

  return (
    <div className="space-y-3">
      <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600 truncate">
        {label}
      </div>

      <button
        onClick={onDelete}
        disabled={!hasSelection}
        className={cn(
          "w-full flex items-center justify-center gap-2.5 py-2 px-2.5 rounded-lg transition-colors text-[13px] font-medium",
          hasSelection
            ? "bg-red-50 text-red-600 hover:bg-red-100"
            : "text-gray-300 cursor-not-allowed"
        )}
      >
        <Trash2 size={15} />
        <span>Delete</span>
      </button>
    </div>
  )
}

function MoveNodeToolContent({
  model,
  moveNodeMode,
  onMoveNodeModeChange,
  moveNodeCoordMode,
  onMoveNodeCoordModeChange,
  moveNodeSelectedId,
  onMoveNodeSelectId,
  onMoveNode,
}: {
  model?: StructureModel
  moveNodeMode: "coordinates" | "screen"
  onMoveNodeModeChange?: (mode: "coordinates" | "screen") => void
  moveNodeCoordMode: "set" | "offset"
  onMoveNodeCoordModeChange?: (mode: "set" | "offset") => void
  moveNodeSelectedId: string | null
  onMoveNodeSelectId?: (id: string | null) => void
  onMoveNode?: (nodeId: string, x: number, y: number) => void
}) {
  const node = moveNodeSelectedId ? model?.nodes[moveNodeSelectedId] : null
  const [inputX, setInputX] = React.useState(0)
  const [inputY, setInputY] = React.useState(0)

  // Reset inputs when node selection or coord mode changes
  React.useEffect(() => {
    if (moveNodeCoordMode === "set" && node) {
      setInputX(node.x)
      setInputY(node.y)
    } else {
      setInputX(0)
      setInputY(0)
    }
  }, [moveNodeSelectedId, moveNodeCoordMode, node?.x, node?.y])

  const handleApply = () => {
    if (!moveNodeSelectedId || !node) return
    if (moveNodeCoordMode === "set") {
      onMoveNode?.(moveNodeSelectedId, inputX, inputY)
    } else {
      onMoveNode?.(moveNodeSelectedId, node.x + inputX, node.y + inputY)
    }
  }

  return (
    <div className="space-y-3">
      {/* Top-level mode toggle */}
      <div className="flex gap-1.5">
        <button
          className={cn(
            "flex-1 h-8 text-[10px] font-medium rounded border transition-colors",
            moveNodeMode === "coordinates"
              ? "bg-[#1a2f5e] text-white border-[#1a2f5e]"
              : "text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
          )}
          onClick={() => onMoveNodeModeChange?.("coordinates")}
        >By Coordinates</button>
        <button
          className={cn(
            "flex-1 h-8 text-[10px] font-medium rounded border transition-colors",
            moveNodeMode === "screen"
              ? "bg-[#1a2f5e] text-white border-[#1a2f5e]"
              : "text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
          )}
          onClick={() => { onMoveNodeModeChange?.("screen"); onMoveNodeSelectId?.(null) }}
        >On-Screen</button>
      </div>

      {moveNodeMode === "coordinates" && (
        <div className="space-y-2.5">
          {!moveNodeSelectedId ? (
            <p className="text-xs text-gray-500 leading-relaxed">
              Click a node on the canvas to select it.
            </p>
          ) : (
            <>
              {/* Selected node indicator */}
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-gray-500">
                  Node {moveNodeSelectedId} — ({formatValue(node?.x ?? 0)}, {formatValue(node?.y ?? 0)})
                </span>
                <button
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  onClick={() => onMoveNodeSelectId?.(null)}
                  title="Deselect"
                ><X size={12} /></button>
              </div>

              {/* Sub-mode toggle */}
              <div className="flex gap-1.5">
                <button
                  className={cn(
                    "flex-1 h-7 text-[10px] font-medium rounded border transition-colors",
                    moveNodeCoordMode === "set"
                      ? "bg-[#1a2f5e] text-white border-[#1a2f5e]"
                      : "text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                  )}
                  onClick={() => onMoveNodeCoordModeChange?.("set")}
                >Set Position</button>
                <button
                  className={cn(
                    "flex-1 h-7 text-[10px] font-medium rounded border transition-colors",
                    moveNodeCoordMode === "offset"
                      ? "bg-[#1a2f5e] text-white border-[#1a2f5e]"
                      : "text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-700"
                  )}
                  onClick={() => onMoveNodeCoordModeChange?.("offset")}
                >Offset</button>
              </div>

              {/* X / Y inputs */}
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label className="text-[10px] text-gray-500">{moveNodeCoordMode === "offset" ? "ΔX (m)" : "X (m)"}</Label>
                  <NumericInput value={inputX} onChange={setInputX} className="h-7 text-xs font-mono w-full" />
                </div>
                <div>
                  <Label className="text-[10px] text-gray-500">{moveNodeCoordMode === "offset" ? "ΔY (m)" : "Y (m)"}</Label>
                  <NumericInput value={inputY} onChange={setInputY} className="h-7 text-xs font-mono w-full" />
                </div>
              </div>

              <button
                className="w-full h-8 text-xs font-medium bg-[#1a2f5e] text-white rounded hover:bg-[#243d7a] transition-colors"
                onClick={handleApply}
              >Apply</button>
            </>
          )}
        </div>
      )}

      {moveNodeMode === "screen" && (
        <p className="text-xs text-gray-500 leading-relaxed">
          Click and hold a node on the canvas, then drag it to its new position and release.
        </p>
      )}
    </div>
  )
}

function NodeToolContent() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 leading-relaxed">
        Place anywhere on the canvas. Placing on an existing member will split it.
      </p>
    </div>
  )
}

function MemberToolContent({
  activeSection,
  sections,
  onSectionChange,
  activeMemberType,
  onMemberTypeChange,
}: {
  activeSection: SectionId
  sections?: Record<string, Section>
  onSectionChange?: (id: SectionId) => void
  activeMemberType: MemberType
  onMemberTypeChange?: (t: MemberType) => void
}) {
  return (
    <div className="space-y-4">
      {/* Member type toggle */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Member Type</Label>
        <div className="flex gap-1">
          <button
            onClick={() => onMemberTypeChange?.("frame")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={activeMemberType === "frame" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Frame
          </button>
          <button
            onClick={() => onMemberTypeChange?.("truss")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={activeMemberType === "truss" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Truss
          </button>
        </div>
        <p className="text-[10px] text-gray-400 leading-snug">
          {activeMemberType === "frame"
            ? "Full beam-column: axial + shear + moment"
            : "Pure axial only: pin-released both ends"}
        </p>
      </div>

      <SectionSelect value={activeSection} sections={sections} onChange={onSectionChange} />
      <p className="text-xs text-gray-500 leading-relaxed">
        Click two points on canvas to draw a member
      </p>
    </div>
  )
}

function SupportToolContent({
  activeSupportType,
  onSupportTypeChange,
}: {
  activeSupportType: SupportType
  onSupportTypeChange?: (t: SupportType) => void
}) {
  const btn = (type: SupportType, icon: React.ReactNode, label: string) => {
    const active = activeSupportType === type
    return (
      <button
        onClick={() => onSupportTypeChange?.(type)}
        className="flex-1 h-12 flex flex-col items-center justify-center gap-1 rounded transition-colors"
        style={active ? {
          borderWidth: 2,
          borderColor: FLYOUT_PANEL_COLORS.primary,
          backgroundColor: FLYOUT_PANEL_COLORS.primary + '0d',
          color: FLYOUT_PANEL_COLORS.primary,
        } : {
          borderWidth: 1,
          borderColor: '#e5e7eb',
          color: '#9ca3af',
        }}
      >
        {icon}
        <span className="text-[10px] font-medium">{label}</span>
      </button>
    )
  }

  return (
    <div className="space-y-4">
      <Label className="text-xs text-gray-600">Support Type</Label>
      <div className="flex gap-2">
        {btn("pin", pinIcon, "Pin")}
        {btn("roller", rollerIcon, "Roller")}
        {btn("fixed", fixedIcon, "Fixed")}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">Click a node to assign</p>
    </div>
  )
}


// ── Numeric input that allows typing negative values ─────────────────────────
// Uses local string state so the browser never resets mid-entry. Commits the
// parsed number to the parent only on blur or Enter. Syncs back when the
// external value changes (e.g. switching selected load).

function NumericInput({
  value,
  onChange,
  className,
  min,
}: {
  value: number
  onChange: (v: number) => void
  className?: string
  min?: number
}) {
  const [text, setText] = React.useState(String(value))

  // Sync external value → local text only when it differs from what we'd parse
  React.useEffect(() => {
    if (parseFloat(text) !== value) setText(String(value))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  const commit = () => {
    const parsed = parseFloat(text)
    if (!isNaN(parsed)) {
      const clamped = min !== undefined ? Math.max(min, parsed) : parsed
      onChange(clamped)
      if (clamped !== parsed) setText(String(clamped))
    } else {
      // Revert to last valid value
      setText(String(value))
    }
  }

  const handleChange = (newText: string) => {
    setText(newText)
    // Update immediately on every keystroke
    const parsed = parseFloat(newText)
    if (!isNaN(parsed)) {
      const clamped = min !== undefined ? Math.max(min, parsed) : parsed
      onChange(clamped)
    }
  }

  return (
    <Input
      type="text"
      inputMode="decimal"
      value={text}
      onChange={(e) => handleChange(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => { if (e.key === "Enter") { e.currentTarget.blur() } }}
      className={className}
    />
  )
}

// ── Load Tab Tool Contents ────────────────────────────────────────────────────

function PointLoadToolContent({
  inputMode,
  onInputModeChange,
  axis,
  magnitude,
  onAxisChange,
  onMagnitudeChange,
  angle,
  onAngleChange,
}: {
  inputMode: "principal" | "angular"
  onInputModeChange?: (mode: "principal" | "angular") => void
  axis: "x" | "y"
  magnitude: number
  onAxisChange?: (a: "x" | "y") => void
  onMagnitudeChange?: (v: number) => void
  angle: number
  onAngleChange?: (angle: number) => void
}) {
  return (
    <div className="space-y-3">
      {/* Input Mode selection */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Input Mode</Label>
        <div className="flex gap-1">
          <button
            onClick={() => onInputModeChange?.("principal")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={inputMode === "principal" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Principal
          </button>
          <button
            onClick={() => onInputModeChange?.("angular")}
            className="flex-1 h-7 text-[11px] rounded-md transition-colors"
            style={inputMode === "angular" ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
            } : {
              backgroundColor: '#f3f4f6',
              color: '#4b5563',
            }}
          >
            Angular
          </button>
        </div>
      </div>

      {inputMode === "principal" ? (
        <>
          {/* Global axis selection */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Global axis</Label>
            <div className="flex gap-1">
              <button
                onClick={() => onAxisChange?.("x")}
                className="flex-1 h-7 text-[11px] rounded-md transition-colors"
                style={axis === "x" ? {
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
                onClick={() => onAxisChange?.("y")}
                className="flex-1 h-7 text-[11px] rounded-md transition-colors"
                style={axis === "y" ? {
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
            <p className="text-[10px] text-gray-500 leading-snug">
              {axis === "x" ? "+ rightward, − leftward" : "+ upward, − downward"}
            </p>
          </div>

          {/* Magnitude input */}
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
          {/* Direction angle */}
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

          {/* Magnitude input */}
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

function DistributedLoadToolContent({
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
          <p className="text-[10px] text-gray-400 leading-snug">⊥ perpendicular to member  ·  + outward  ·  − inward</p>
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

function DistributedLoadEditor({
  load,
  onApply,
}: {
  load: DistributedLoad
  onApply: (patch: Partial<Load>) => void
}) {
  const initMode = load.mode ?? "local-axis"
  const [editDistMode, setEditDistMode] = React.useState<"local-axis" | "global-axis">(initMode)
  const [editDistType, setEditDistType] = React.useState<"uniform" | "asymmetric">(() => {
    if (initMode === "local-axis") return (load.wStart ?? 0) !== (load.wEnd ?? 0) ? "asymmetric" : "uniform"
    return (load.wxStart ?? 0) !== (load.wxEnd ?? 0) || (load.wyStart ?? 0) !== (load.wyEnd ?? 0) ? "asymmetric" : "uniform"
  })
  const [editWStart, setEditWStart] = React.useState(load.wStart ?? 0)
  const [editWEnd, setEditWEnd] = React.useState(load.wEnd ?? 0)
  const [editWxStart, setEditWxStart] = React.useState(load.wxStart ?? 0)
  const [editWxEnd, setEditWxEnd] = React.useState(load.wxEnd ?? 0)
  const [editWyStart, setEditWyStart] = React.useState(load.wyStart ?? 0)
  const [editWyEnd, setEditWyEnd] = React.useState(load.wyEnd ?? 0)

  React.useEffect(() => {
    const mode = load.mode ?? "local-axis"
    setEditDistMode(mode)
    if (mode === "local-axis") {
      setEditWStart(load.wStart ?? 0)
      setEditWEnd(load.wEnd ?? 0)
      setEditDistType((load.wStart ?? 0) !== (load.wEnd ?? 0) ? "asymmetric" : "uniform")
    } else {
      setEditWxStart(load.wxStart ?? 0)
      setEditWxEnd(load.wxEnd ?? 0)
      setEditWyStart(load.wyStart ?? 0)
      setEditWyEnd(load.wyEnd ?? 0)
      setEditDistType((load.wxStart ?? 0) !== (load.wxEnd ?? 0) || (load.wyStart ?? 0) !== (load.wyEnd ?? 0) ? "asymmetric" : "uniform")
    }
  }, [load])

  const handleApply = () => {
    if (editDistMode === "local-axis") {
      const wEnd = editDistType === "asymmetric" ? editWEnd : editWStart
      onApply({ mode: "local-axis", wStart: editWStart, wEnd, wxStart: undefined, wxEnd: undefined, wyStart: undefined, wyEnd: undefined } as Partial<Load>)
    } else {
      const wxEnd = editDistType === "asymmetric" ? editWxEnd : editWxStart
      const wyEnd = editDistType === "asymmetric" ? editWyEnd : editWyStart
      onApply({ mode: "global-axis", wxStart: editWxStart, wxEnd, wyStart: editWyStart, wyEnd, wStart: undefined, wEnd: undefined } as Partial<Load>)
    }
  }

  const modeBtn = (mode: "local-axis" | "global-axis", label: string) => (
    <button onClick={() => setEditDistMode(mode)} className="flex-1 h-7 text-[11px] rounded-md transition-colors"
      style={editDistMode === mode ? { backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}>
      {label}
    </button>
  )
  const distBtn = (type: "uniform" | "asymmetric", label: string) => (
    <button onClick={() => setEditDistType(type)} className="flex-1 h-7 text-[11px] rounded-md transition-colors"
      style={editDistType === type ? { backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' } : { backgroundColor: '#f3f4f6', color: '#4b5563' }}>
      {label}
    </button>
  )

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Input Mode</Label>
        <div className="flex gap-1">{modeBtn("local-axis", "Local-axis")}{modeBtn("global-axis", "Global Axis")}</div>
      </div>

      {editDistMode === "local-axis" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Distribution</Label>
            <div className="flex gap-1">{distBtn("uniform", "Uniform")}{distBtn("asymmetric", "Asymmetric")}</div>
          </div>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">{editDistType === "asymmetric" ? "Start (i)" : "Load"}</Label>
              <div className="flex gap-2">
                <NumericInput value={editWStart} onChange={setEditWStart} className="h-7 text-xs font-mono flex-1" />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
              </div>
            </div>
            {editDistType === "asymmetric" && (
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">End (j)</Label>
                <div className="flex gap-2">
                  <NumericInput value={editWEnd} onChange={setEditWEnd} className="h-7 text-xs font-mono flex-1" />
                  <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                </div>
              </div>
            )}
          </div>
          <p className="text-[10px] text-gray-400 leading-snug">⊥ perpendicular to member  ·  + outward  ·  − inward</p>
        </>
      )}

      {editDistMode === "global-axis" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Distribution</Label>
            <div className="flex gap-1">{distBtn("uniform", "Uniform")}{distBtn("asymmetric", "Asymmetric")}</div>
          </div>
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">X-axis (horizontal)</Label>
              <div className="flex gap-2">
                <NumericInput value={editWxStart} onChange={setEditWxStart} className="h-7 text-xs font-mono flex-1" />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
              </div>
              {editDistType === "asymmetric" && (
                <div className="flex gap-2">
                  <div className="text-[10px] text-gray-400 self-center">End (j)</div>
                  <NumericInput value={editWxEnd} onChange={setEditWxEnd} className="h-7 text-xs font-mono flex-1" />
                </div>
              )}
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Y-axis (vertical)</Label>
              <div className="flex gap-2">
                <NumericInput value={editWyStart} onChange={setEditWyStart} className="h-7 text-xs font-mono flex-1" />
                <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
              </div>
              {editDistType === "asymmetric" && (
                <div className="flex gap-2">
                  <div className="text-[10px] text-gray-400 self-center">End (j)</div>
                  <NumericInput value={editWyEnd} onChange={setEditWyEnd} className="h-7 text-xs font-mono flex-1" />
                </div>
              )}
            </div>
          </div>
          <p className="text-[10px] text-gray-400 leading-snug">+ rightward (X)  ·  − leftward  ·  + upward (Y)  ·  − downward</p>
        </>
      )}

      <Button size="sm" className="w-full text-xs h-7" style={{ backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' }} onClick={handleApply}>
        Apply
      </Button>
    </div>
  )
}

function ModifyLoadToolContent({
  selectedLoad,
  selectedLoadIds = [],
  model,
  onModify,
  onModifyByType,
}: {
  selectedLoad: Load | null
  selectedLoadIds?: string[]
  model: import("../lib/model").StructureModel | null
  onModify?: (patch: Partial<Load>) => void
  onModifyByType?: (type: "point" | "distributed", patch: Partial<Load>) => void
}) {
  const [editFx, setEditFx] = React.useState<number>(0)
  const [editFy, setEditFy] = React.useState<number>(0)

  // Derive all selected loads by type
  const allSelected = React.useMemo(() => {
    if (!model) return { points: [], dists: [] }
    const ids = selectedLoadIds.length > 0 ? selectedLoadIds : (selectedLoad ? [selectedLoad.id] : [])
    const points: PointLoad[] = []
    const dists: DistributedLoad[] = []
    for (const id of ids) {
      const l = model.loads[id]
      if (!l) continue
      if (l.type === "point") points.push(l as PointLoad)
      else dists.push(l as DistributedLoad)
    }
    return { points, dists }
  }, [selectedLoadIds, selectedLoad, model])

  const hasPoints = allSelected.points.length > 0
  const hasDists = allSelected.dists.length > 0
  const totalCount = allSelected.points.length + allSelected.dists.length

  // Seed point load editor from first point load in selection
  const firstPoint = allSelected.points[0] ?? null
  React.useEffect(() => {
    if (!firstPoint) return
    setEditFx(firstPoint.fx)
    setEditFy(firstPoint.fy)
  }, [firstPoint])

  if (totalCount === 0) {
    return (
      <p className="text-xs text-gray-500 leading-relaxed">
        Click a load or drag a box on the canvas to select loads
      </p>
    )
  }

  const handleApplyPoint = () => {
    onModifyByType?.("point", { fx: editFx, fy: editFy } as Partial<Load>)
  }

  const handleApplyDist = (patch: Partial<Load>) => {
    onModifyByType?.("distributed", patch)
  }

  return (
    <div className="space-y-3">
      {totalCount > 1 && (
        <div className="flex items-center gap-2 rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5">
          <span className="text-xs text-gray-600">{totalCount} loads selected</span>
        </div>
      )}

      {hasPoints && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Point Load</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Global axis</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-gray-500">X (rightward)</Label>
                <NumericInput value={editFx} onChange={setEditFx} className="h-7 text-xs font-mono w-full" />
              </div>
              <div>
                <Label className="text-[10px] text-gray-500">Y (upward)</Label>
                <NumericInput value={editFy} onChange={setEditFy} className="h-7 text-xs font-mono w-full" />
              </div>
            </div>
          </div>
          <Button size="sm" className="w-full text-xs h-7" style={{ backgroundColor: FLYOUT_PANEL_COLORS.primary, color: 'white' }} onClick={handleApplyPoint}>
            Apply
          </Button>
        </>
      )}

      {hasPoints && hasDists && (
        <div className="h-px bg-gray-100" />
      )}

      {hasDists && (
        <>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Distributed Load</span>
            <div className="flex-1 h-px bg-gray-100" />
          </div>
          <DistributedLoadEditor load={allSelected.dists[0]} onApply={handleApplyDist} />
        </>
      )}
    </div>
  )
}

function DeleteLoadToolContent({
  selectedLoadIds,
  model,
  onDelete,
}: {
  selectedLoadIds: string[]
  model?: import("../lib/model").StructureModel | null
  onDelete?: () => void
}) {
  if (selectedLoadIds.length === 0) {
    return (
      <p className="text-xs text-gray-500 leading-relaxed">
        Click a load or drag a box on the canvas to select loads
      </p>
    )
  }

  const pointCount = selectedLoadIds.filter(id => model?.loads[id]?.type === "point").length
  const distCount  = selectedLoadIds.filter(id => model?.loads[id]?.type === "distributed").length
  const parts: string[] = []
  if (pointCount > 0) parts.push(`${pointCount} point load${pointCount > 1 ? "s" : ""}`)
  if (distCount  > 0) parts.push(`${distCount} distributed load${distCount > 1 ? "s" : ""}`)

  return (
    <div className="space-y-3">
      <div className="px-2.5 py-1.5 rounded-md bg-gray-50 border border-gray-100 text-[12px] text-gray-600">
        {parts.join(", ")} selected
      </div>

      <button
        onClick={onDelete}
        className="w-full flex items-center justify-center gap-2.5 py-2 px-2.5 rounded-lg transition-colors text-[13px] font-medium bg-red-50 text-red-600 hover:bg-red-100"
      >
        <Trash2 size={15} />
        <span>Delete {selectedLoadIds.length > 1 ? `${selectedLoadIds.length} Loads` : "Load"}</span>
      </button>
    </div>
  )
}

// ── Analyze Tab Tool Contents ─────────────────────────────────────────────────

function ReactionToolContent({ analysisResult, showNodeLabels = true, onShowNodeLabelsChange }: { analysisResult: AnalysisResult | null, showNodeLabels?: boolean, onShowNodeLabelsChange?: (v: boolean) => void }) {
  const [showReport, setShowReport] = React.useState(true)

  const entries = analysisResult ? (Object.entries(analysisResult.reactions) as [string, { Rx: number; Ry: number; Mz: number }][]) : []
  const valColor = (v: number) => v >= 0 ? "#2563eb" : "#ef4444"
  const fmt = (v: number, unit: string) => `${v >= 0 ? "+" : ""}${formatValue(v)} ${unit}`

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-600">Node Labels</Label>
        <button
          onClick={() => onShowNodeLabelsChange?.(!showNodeLabels)}
          className="text-xs px-2 py-0.5 rounded border transition-colors"
          style={showNodeLabels ? {
            backgroundColor: FLYOUT_PANEL_COLORS.primary,
            color: 'white',
            borderColor: FLYOUT_PANEL_COLORS.primary,
          } : {
            backgroundColor: 'white',
            color: '#6b7280',
            borderColor: '#d1d5db',
          }}
        >
          {showNodeLabels ? "On" : "Off"}
        </button>
      </div>
      <div className="flex items-center justify-between border-t pt-3" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}>
        <Label className="text-xs text-gray-600">Reactions Summary</Label>
        <button
          onClick={() => setShowReport(v => !v)}
          className="text-xs px-2 py-0.5 rounded border transition-colors"
          style={showReport ? {
            backgroundColor: FLYOUT_PANEL_COLORS.primary,
            color: 'white',
            borderColor: FLYOUT_PANEL_COLORS.primary,
          } : {
            backgroundColor: 'white',
            color: '#6b7280',
            borderColor: '#d1d5db',
          }}
        >
          {showReport ? "On" : "Off"}
        </button>
      </div>
      {showReport && (
        entries.length === 0 ? (
          <p className="text-xs text-gray-400 italic">No results</p>
        ) : (
          <div className="space-y-2">
            {entries.map(([nodeId, r]) => (
              <div key={nodeId} className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 space-y-1">
                <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 uppercase tracking-wide">{"N" + nodeId.replace(/^\D+/, "")}</span>
                <div className="grid grid-cols-2 gap-x-2">
                  <span className="text-[10px] text-gray-500">Rx</span>
                  <span className="text-[10px] font-mono text-right" style={{ color: valColor(r.Rx) }}>{fmt(r.Rx, "kN")}</span>
                  <span className="text-[10px] text-gray-500">Ry</span>
                  <span className="text-[10px] font-mono text-right" style={{ color: valColor(r.Ry) }}>{fmt(r.Ry, "kN")}</span>
                  <span className="text-[10px] text-gray-500">Mz</span>
                  <span className="text-[10px] font-mono text-right" style={{ color: valColor(r.Mz) }}>{fmt(r.Mz, "kN·m")}</span>
                </div>
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}

function AnalyzeSelectContent({ analysisResult }: { analysisResult: AnalysisResult | null }) {
  if (!analysisResult) {
    return <p className="text-xs text-gray-500">No analysis result. Add supports and members.</p>
  }

  const forces = Object.values(analysisResult.memberEndForces)
  const disps  = Object.values(analysisResult.nodeDisplacements)
  const rxns   = Object.values(analysisResult.reactions)

  const maxN  = Math.max(...forces.map(f => Math.max(Math.abs(f.N1), Math.abs(f.N2))))
  const maxV  = Math.max(...forces.map(f => Math.max(Math.abs(f.V1), Math.abs(f.V2))))
  const maxM  = Math.max(...forces.map(f => Math.max(Math.abs(f.M1), Math.abs(f.M2))))
  const maxU  = Math.max(...disps.map(d => Math.abs(d.u)))  * 1000  // m → mm
  const maxV2 = Math.max(...disps.map(d => Math.abs(d.v)))  * 1000
  const maxTh = Math.max(...disps.map(d => Math.abs(d.theta))) * (180 / Math.PI)

  const row = (label: string, value: string) => (
    <div className="flex justify-between text-xs" key={label}>
      <span className="text-gray-500">{label}</span>
      <span className="text-[#1e293b] font-mono">{value}</span>
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="border border-gray-100 rounded p-2.5 space-y-1.5 bg-gray-50">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Forces</p>
        {row("Max Axial",  `${formatValue(maxN)} kN`)}
        {row("Max Shear",  `${formatValue(maxV)} kN`)}
        {row("Max Moment", `${formatValue(maxM)} kN·m`)}
      </div>
      <div className="border border-gray-100 rounded p-2.5 space-y-1.5 bg-gray-50">
        <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Displacements</p>
        {row("Max horiz (u)", `${maxU.toFixed(3)} mm`)}
        {row("Max vert (v)",  `${maxV2.toFixed(3)} mm`)}
        {row("Max rotation",  `${maxTh.toFixed(4)} °`)}
      </div>
      {rxns.length > 0 && (
        <div className="border border-gray-100 rounded p-2.5 space-y-1.5 bg-gray-50">
          <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Reactions</p>
          {Object.entries(analysisResult.reactions).map(([nodeId, r]) => (
            <div key={nodeId} className="space-y-0.5">
              <p className="text-[10px] text-gray-400">{nodeId}</p>
              {Math.abs(r.Rx) > 1e-6  && row("  Rx", `${formatValue(r.Rx)} kN`)}
              {Math.abs(r.Ry) > 1e-6  && row("  Ry", `${formatValue(r.Ry)} kN`)}
              {Math.abs(r.Mz) > 1e-6  && row("  Mz", `${formatValue(r.Mz)} kN·m`)}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function DiagramToolContent({
  label,
  scale,
  onScaleChange,
  invert = false,
  onInvertChange,
  showMemberLabels = true,
  onShowMemberLabelsChange,
  analysisResult,
  model,
}: {
  label: string
  scale?: number
  onScaleChange?: (v: number) => void
  invert?: boolean
  onInvertChange?: (v: boolean) => void
  showMemberLabels?: boolean
  onShowMemberLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
  model?: StructureModel
}) {
  type DiagramKind = "AXIAL" | "SHEAR" | "MOMENT"
  const kind = label as DiagramKind

  const sectionLabel = "Forces Summary"

  const memberRows = React.useMemo(() => {
    if (!analysisResult || !model) return []
    const N_PTS = 40
    return Object.values(model.members).flatMap((member) => {
      const ef = analysisResult.memberEndForces[member.id]
      const nA = model.nodes[member.a]
      const nB = model.nodes[member.b]
      if (!ef || !nA || !nB) return []
      const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
      if (L < 1e-9) return []
      let peak = 0
      if (kind === "AXIAL") {
        peak = ef.N1
      } else {
        for (let i = 0; i <= N_PTS; i++) {
          const x = (i / N_PTS) * L
          const { V, M } = memberInternalForces(ef, x, L)
          const v = kind === "SHEAR" ? V : M
          if (Math.abs(v) > Math.abs(peak)) peak = v
        }
      }
      return [{ id: member.id, peak }]
    })
  }, [analysisResult, model, kind])

  const fmt = (v: number) => `${v >= 0 ? "+" : ""}${formatValue(v)}`
  const unit = kind === "MOMENT" ? "kN·m" : "kN"
  const peakColor = (v: number) => v >= 0 ? "#2563eb" : "#ef4444"

  const [showReport, setShowReport] = React.useState(true)

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 select-none">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Diagram Scale Factor</span>
          <span className="text-xs font-mono text-gray-500">{scale ?? 10}</span>
        </div>
        <input
          type="range"
          value={scale ?? 10}
          min={1}
          max={200}
          className="w-full h-1.5 accent-[#2563eb] cursor-pointer touch-none"
          onChange={(e) => onScaleChange?.(Number(e.target.value))}
        />
      </div>

      <div className="flex items-center justify-between select-none">
        <span className="text-xs text-gray-600">Member Labels</span>
        <button
          onClick={() => onShowMemberLabelsChange?.(!showMemberLabels)}
          className="text-xs px-2 py-0.5 rounded border transition-colors"
          style={showMemberLabels ? {
            backgroundColor: FLYOUT_PANEL_COLORS.primary,
            color: 'white',
            borderColor: FLYOUT_PANEL_COLORS.primary,
          } : {
            backgroundColor: 'white',
            color: '#6b7280',
            borderColor: '#d1d5db',
          }}
        >
          {showMemberLabels ? "On" : "Off"}
        </button>
      </div>

      {onInvertChange !== undefined && (
        <div className="flex items-center justify-between select-none">
          <span className="text-xs text-gray-600">Invert Diagram</span>
          <button
            onClick={() => onInvertChange(!invert)}
            className="text-xs px-2 py-0.5 rounded border transition-colors"
            style={invert ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
              borderColor: FLYOUT_PANEL_COLORS.primary,
            } : {
              backgroundColor: 'white',
              color: '#6b7280',
              borderColor: '#d1d5db',
            }}
          >
            {invert ? "On" : "Off"}
          </button>
        </div>
      )}

      <div className="space-y-1.5 border-t pt-3" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">{sectionLabel}</Label>
          <button
            onClick={() => setShowReport(v => !v)}
            className="text-xs px-2 py-0.5 rounded border transition-colors"
            style={showReport ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
              borderColor: FLYOUT_PANEL_COLORS.primary,
            } : {
              backgroundColor: 'white',
              color: '#6b7280',
              borderColor: '#d1d5db',
            }}
          >
            {showReport ? "On" : "Off"}
          </button>
        </div>
        {showReport && (
          memberRows.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No results</p>
          ) : (
            <div className="space-y-1">
              {memberRows.map(({ id, peak }) => (
                <div key={id} className="flex items-baseline justify-between rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                  <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 uppercase">{id.toUpperCase()}</span>
                  <span className="text-[11px] font-mono" style={{ color: peakColor(peak) }}>
                    {fmt(peak)} {unit}
                  </span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}

function DeformationToolContent({
  scale,
  onScaleChange,
  showNodeLabels = true,
  onShowNodeLabelsChange,
  analysisResult,
}: {
  scale?: number
  onScaleChange?: (v: number) => void
  showNodeLabels?: boolean
  onShowNodeLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
}) {
  const [showReport, setShowReport] = React.useState(true)
  const nodeEntries = analysisResult
    ? Object.entries(analysisResult.nodeDisplacements) as [string, NodeDisplacement][]
    : []

  return (
    <div className="space-y-3">
      <div className="space-y-1.5 select-none">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Deformation Scale Factor</span>
          <span className="text-xs font-mono text-gray-500">{scale ?? 25}</span>
        </div>
        <input
          type="range"
          value={scale ?? 25}
          min={1}
          max={1000}
          className="w-full h-1.5 accent-[#2563eb] cursor-pointer touch-none"
          onChange={(e) => onScaleChange?.(Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between select-none">
        <span className="text-xs text-gray-600">Node Labels</span>
        <button
          onClick={() => onShowNodeLabelsChange?.(!showNodeLabels)}
          className="text-xs px-2 py-0.5 rounded border transition-colors"
          style={showNodeLabels ? {
            backgroundColor: FLYOUT_PANEL_COLORS.primary,
            color: 'white',
            borderColor: FLYOUT_PANEL_COLORS.primary,
          } : {
            backgroundColor: 'white',
            color: '#6b7280',
            borderColor: '#d1d5db',
          }}
        >
          {showNodeLabels ? "On" : "Off"}
        </button>
      </div>

      <div className="border-t pt-3 space-y-1.5" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}>
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Displacement Summary</Label>
          <button
            onClick={() => setShowReport(v => !v)}
            className="text-xs px-2 py-0.5 rounded border transition-colors"
            style={showReport ? {
              backgroundColor: FLYOUT_PANEL_COLORS.primary,
              color: 'white',
              borderColor: FLYOUT_PANEL_COLORS.primary,
            } : {
              backgroundColor: 'white',
              color: '#6b7280',
              borderColor: '#d1d5db',
            }}
          >
            {showReport ? "On" : "Off"}
          </button>
        </div>
        {showReport && (
          nodeEntries.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No results</p>
          ) : (
            <div className="space-y-2">
              {nodeEntries.map(([nodeId, d]) => (
                <div key={nodeId} className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5 space-y-1">
                  <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 uppercase tracking-wide">{"N" + nodeId.replace(/^\D+/, "")}</span>
                  <div className="grid grid-cols-2 gap-x-2">
                    <span className="text-[10px] text-gray-500">x</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{(d.u * 1000).toFixed(3)} mm</span>
                    <span className="text-[10px] text-gray-500">y</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{(d.v * 1000).toFixed(3)} mm</span>
                    <span className="text-[10px] text-gray-500">θ</span>
                    <span className="text-[10px] font-mono text-right text-[#1e293b]">{(d.theta * 1000).toFixed(3)} mrad</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
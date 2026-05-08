import * as React from "react"
import { cn } from "@/lib/utils"
import type { TabType, ToolType } from "./tool-sidebar"
import type { Section, SectionId, MultiSelection, StructureModel, SupportType, MemberType, Load, LoadId } from "@/lib/model"
import { newSectionId } from "@/lib/model"
import type { AnalysisResult } from "@/lib/solver"
import { memberInternalForces } from "@/lib/solver"
import type { UnitSettings } from "@/lib/units"
import {
  DEFAULT_UNIT_SETTINGS,
  displayE, parseE, labelE,
  displayI, parseI, labelI,
  displayA, parseA, labelA,
  displayW, parseW, labelW,
} from "@/lib/units"
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
  Pencil,
  Triangle,
  Circle,
  Square,
  X,
} from "lucide-react"
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
  showDeformLabels?: boolean
  onShowDeformLabelsChange?: (v: boolean) => void
  showDeformNodeLabels?: boolean
  onShowDeformNodeLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
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
  showDeformLabels = true,
  onShowDeformLabelsChange,
  showDeformNodeLabels = true,
  onShowDeformNodeLabelsChange,
  analysisResult,
}: FlyoutPanelProps) {
  if (!activeTool) return null

  return (
    <div
      className={cn(
        "absolute top-3 left-3 w-[200px] bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 z-10",
        "animate-in fade-in slide-in-from-left-2 duration-150 ease-out",
        "flex flex-col max-h-[calc(100vh-5rem)]"
      )}
    >
      <div className="p-3 border-b border-gray-100 flex items-center justify-between shrink-0">
        <span className="font-medium text-sm text-[#1e293b]">{getToolTitle(activeTool, activeTab)}</span>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 transition-colors p-0.5 rounded hover:bg-gray-100"
        >
          <X size={14} />
        </button>
      </div>
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
          showDeformLabels={showDeformLabels}
          onShowDeformLabelsChange={onShowDeformLabelsChange}
          showDeformNodeLabels={showDeformNodeLabels}
          onShowDeformNodeLabelsChange={onShowDeformNodeLabelsChange}
          analysisResult={analysisResult}
        />
      </div>
    </div>
  )
}

function getToolTitle(tool: ToolType, activeTab?: TabType): string {
  if (!tool) return ""
  if (tool === "SELECT") return "MODIFY COMPONENT"
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
  showDeformLabels = true,
  onShowDeformLabelsChange,
  showDeformNodeLabels = true,
  onShowDeformNodeLabelsChange,
  analysisResult,
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
          <MaterialToolContent
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
            onModify={onModifyLoad}
            onDelete={onDeleteLoad}
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
        return <ReactionToolContent analysisResult={analysisResult ?? null} />
      case "AXIAL":
        return <DiagramToolContent label={activeTool} scale={diagramScale} onScaleChange={onDiagramScaleChange} analysisResult={analysisResult} model={model} />
      case "SHEAR":
        return <DiagramToolContent label={activeTool} scale={diagramScale} onScaleChange={onDiagramScaleChange} invert={invertSFD} onInvertChange={onInvertSFDChange} analysisResult={analysisResult} model={model} />
      case "MOMENT":
        return <DiagramToolContent label={activeTool} scale={diagramScale} onScaleChange={onDiagramScaleChange} invert={invertBMD} onInvertChange={onInvertBMDChange} analysisResult={analysisResult} model={model} />
      case "DEFORMATION":
        return <DeformationToolContent scale={deformationScale} onScaleChange={onDeformationScaleChange} showLabels={showDeformLabels} onShowLabelsChange={onShowDeformLabelsChange} showNodeLabels={showDeformNodeLabels} onShowNodeLabelsChange={onShowDeformNodeLabelsChange} analysisResult={analysisResult} />
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
      className={cn(
        "flex-1 h-10 flex flex-col items-center justify-center gap-0.5 rounded transition-colors text-[11px]",
        supportType === type
          ? "bg-[#2563eb]/10 text-[#2563eb] font-medium"
          : "bg-gray-50 text-gray-500 hover:bg-gray-100"
      )}
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
            className={cn(
              "w-full py-1.5 rounded-md text-[13px] font-medium transition-colors",
              canApplySection
                ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
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
            {supportBtn("pin", <Triangle size={14} />, "Pin")}
            {supportBtn("roller", <Circle size={14} />, "Roller")}
            {supportBtn("fixed", <Square size={14} />, "Fixed")}
          </div>
          <button
            onClick={() => {
              if (!canApplySupport) return
              onModifySupport?.(supportType)
              setSupportApplied(true)
            }}
            disabled={!canApplySupport}
            className={cn(
              "w-full py-1.5 rounded-md text-[13px] font-medium transition-colors",
              canApplySupport
                ? "bg-[#2563eb] text-white hover:bg-[#1d4ed8]"
                : "bg-gray-100 text-gray-400 cursor-not-allowed"
            )}
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
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              activeMemberType === "frame"
                ? "bg-[#1a2f5e] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            Frame
          </button>
          <button
            onClick={() => onMemberTypeChange?.("truss")}
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              activeMemberType === "truss"
                ? "bg-[#1a2f5e] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
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
        className={cn(
          "flex-1 h-12 flex flex-col items-center justify-center gap-1 rounded transition-colors",
          active
            ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
            : "border border-gray-200 text-gray-400 hover:border-gray-300 hover:text-gray-500"
        )}
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
        {btn("pin", <Triangle size={16} />, "Pin")}
        {btn("roller", <Circle size={16} />, "Roller")}
        {btn("fixed", <Square size={16} />, "Fixed")}
      </div>
      <p className="text-xs text-gray-500 leading-relaxed">Click a node to assign</p>
    </div>
  )
}

const MAX_SECTIONS = 5

function fmt(v: number) {
  return parseFloat(v.toPrecision(6)).toString()
}

function MaterialToolContent({
  model,
  activeSection,
  onSectionChange,
  onSectionPropsChange,
  onAddSection,
  onDeleteSection,
  unitSettings,
}: {
  model?: StructureModel
  activeSection: SectionId
  onSectionChange?: (id: SectionId) => void
  onSectionPropsChange?: (id: SectionId, patch: Partial<Section>) => void
  onAddSection?: (section: Section) => void
  onDeleteSection?: (id: SectionId) => void
  unitSettings?: UnitSettings
}) {
  const u = unitSettings ?? DEFAULT_UNIT_SETTINGS
  const sections = model?.sections ?? {}
  const s = sections[activeSection]
  const sectionCount = Object.keys(sections).length

  // ── Local form state ────────────────────────────────────────────────────────

  type Fields = { name: string; E: string; I: string; A: string; W: string; nu: string }

  const fromSection = React.useCallback(
    (sec: Section): Fields => ({
      name: sec.name,
      E:    fmt(displayE(sec.E, u)),
      I:    fmt(displayI(sec.I, u)),
      A:    fmt(displayA(sec.A, u)),
      W:    fmt(displayW(sec.W, u)),
      nu:   sec.nu.toString(),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [u.pressure, u.length, u.force]
  )

  const [saved, setSaved] = React.useState<Fields | null>(() => s ? fromSection(s) : null)
  const [local, setLocal] = React.useState<Fields | null>(saved)

  // Reset when section switches or units change
  React.useEffect(() => {
    if (!s) return
    const f = fromSection(s)
    setSaved(f)
    setLocal(f)
  }, [activeSection, fromSection]) // fromSection changes when units change

  if (!s || !local || !saved) return null

  const set = (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLocal((prev) => prev ? { ...prev, [key]: e.target.value } : prev)

  // ── Validation ──────────────────────────────────────────────────────────────

  const validNum = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 }
  const validNuV = (v: string) => { const n = parseFloat(v); return Number.isFinite(n) && n > 0 && n < 0.5 }

  const nameEmpty = local.name.trim() === ""
  const invalidE  = !validNum(local.E)
  const invalidI  = !validNum(local.I)
  const invalidA  = !validNum(local.A)
  const invalidW  = !validNum(local.W)
  const invalidNu = !validNuV(local.nu)
  const isFormValid = !nameEmpty && !invalidE && !invalidI && !invalidA && !invalidW && !invalidNu

  // ── Dirty detection ─────────────────────────────────────────────────────────

  const isNameDirty   = local.name !== saved.name
  const isValuesDirty = local.E !== saved.E || local.I !== saved.I ||
                        local.A !== saved.A || local.W !== saved.W || local.nu !== saved.nu

  // Mutually exclusive: name changed → Add intent; values only → Modify intent
  const canModify = isValuesDirty && !isNameDirty && isFormValid
  const nameTaken = isNameDirty &&
    Object.values(sections).some((sec) => sec.name === local.name && sec.id !== activeSection)
  const canAdd    = isNameDirty && !nameTaken && sectionCount < MAX_SECTIONS && isFormValid
  const canDelete = sectionCount > 1

  // ── Handlers ────────────────────────────────────────────────────────────────

  const parsedFields = () => ({
    E:  parseE(parseFloat(local.E), u),
    I:  parseI(parseFloat(local.I), u),
    A:  parseA(parseFloat(local.A), u),
    W:  parseW(parseFloat(local.W), u),
    nu: parseFloat(local.nu),
  })

  const handleModify = () => {
    if (!canModify) return
    onSectionPropsChange?.(activeSection, parsedFields())
    setSaved(local)
  }

  const handleAdd = () => {
    if (!canAdd) return
    const id = newSectionId()
    onAddSection?.({ id, name: local.name, ...parsedFields() })
    // activeSection will switch via onAddSection → parent calls setActiveSection
    // local state will reset via useEffect when activeSection changes
  }

  const handleDelete = () => {
    if (!canDelete) return
    onDeleteSection?.(activeSection)
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  const field = (
    label: string,
    key: keyof Fields,
    unit: string,
    invalid: boolean,
    extra?: React.InputHTMLAttributes<HTMLInputElement>
  ) => (
    <div className="space-y-1.5">
      <Label className="text-xs text-gray-600">{label}</Label>
      <div className="flex gap-2">
        <Input
          type="number"
          value={local[key]}
          onChange={set(key)}
          className={cn("h-7 text-xs font-mono flex-1", invalid && "border-red-400 focus-visible:ring-red-300")}
          {...extra}
        />
        {unit && <span className="text-xs text-gray-500 self-center whitespace-nowrap">{unit}</span>}
      </div>
      {invalid && <p className="text-[10px] text-red-500">Enter a valid positive value</p>}
    </div>
  )

  return (
    <div className="space-y-3">
      <SectionSelect value={activeSection} sections={sections} onChange={onSectionChange} />

      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Name</Label>
        <Input
          type="text"
          value={local.name}
          onChange={set("name")}
          className={cn("h-7 text-xs flex-1", nameEmpty && "border-red-400 focus-visible:ring-red-300")}
          placeholder="Section name"
        />
        {nameEmpty  && <p className="text-[10px] text-red-500">Name is required</p>}
        {nameTaken  && <p className="text-[10px] text-red-500">Name already exists</p>}
      </div>

      {field("Elastic Modulus, E", "E", labelE(u), invalidE)}
      {field("Inertia, I",         "I", labelI(u), invalidI)}
      {field("Section Area, A",    "A", labelA(u), invalidA)}
      {field("Unit Weight, W",     "W", labelW(u), invalidW)}
      {field("Poisson Ratio, ν",   "nu", "", invalidNu, { step: "0.01" })}

      {/* Add / Modify row */}
      <div className="flex gap-2 pt-1">
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "flex-1 h-7 text-xs transition-colors",
            canModify
              ? "border-[#2563eb] text-[#2563eb] bg-[#2563eb]/5 hover:bg-[#2563eb]/10"
              : "text-gray-400 border-gray-200"
          )}
          disabled={!canModify}
          onClick={handleModify}
        >
          Modify
        </Button>
        <Button
          size="sm"
          variant="outline"
          className={cn(
            "flex-1 h-7 text-xs transition-colors",
            canAdd
              ? "border-[#2563eb] text-[#2563eb] bg-[#2563eb]/5 hover:bg-[#2563eb]/10"
              : "text-gray-400 border-gray-200"
          )}
          disabled={!canAdd}
          onClick={handleAdd}
        >
          Add
        </Button>
      </div>

      {/* Capacity hint */}
      {sectionCount >= MAX_SECTIONS && (
        <p className="text-[10px] text-gray-400 text-center">
          Max {MAX_SECTIONS} materials reached
        </p>
      )}

      {/* Delete */}
      <div className="border-t border-gray-100 pt-2">
        <Button
          size="sm"
          variant="ghost"
          className={cn(
            "w-full h-7 text-xs gap-1.5 transition-colors",
            canDelete
              ? "text-red-500 hover:bg-red-50 hover:text-red-600"
              : "text-gray-300 cursor-not-allowed"
          )}
          disabled={!canDelete}
          onClick={handleDelete}
        >
          <Trash2 size={12} />
          Delete Material
        </Button>
      </div>
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
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              inputMode === "principal"
                ? "bg-[#2563eb] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            Principal
          </button>
          <button
            onClick={() => onInputModeChange?.("angular")}
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              inputMode === "angular"
                ? "bg-[#2563eb] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
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
                className={cn(
                  "flex-1 h-7 text-[11px] rounded-md transition-colors",
                  axis === "x"
                    ? "bg-[#2563eb] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                X-axis
              </button>
              <button
                onClick={() => onAxisChange?.("y")}
                className={cn(
                  "flex-1 h-7 text-[11px] rounded-md transition-colors",
                  axis === "y"
                    ? "bg-[#2563eb] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
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
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              distMode === "local-axis"
                ? "bg-[#2563eb] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            Local-axis
          </button>
          <button
            onClick={() => onDistModeChange?.("global-axis")}
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              distMode === "global-axis"
                ? "bg-[#2563eb] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
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
              className={cn(
                "flex-1 h-7 text-[11px] rounded-md transition-colors",
                activeAxis === "x"
                  ? "bg-[#2563eb] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
            >
              X-axis
            </button>
            <button
              onClick={() => onActiveAxisChange?.("y")}
              className={cn(
                "flex-1 h-7 text-[11px] rounded-md transition-colors",
                activeAxis === "y"
                  ? "bg-[#2563eb] text-white"
                  : "bg-gray-100 text-gray-600 hover:bg-gray-200"
              )}
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
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              distType === "uniform"
                ? "bg-[#2563eb] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
          >
            Uniform
          </button>
          <button
            onClick={() => onDistTypeChange?.("asymmetric")}
            className={cn(
              "flex-1 h-7 text-[11px] rounded-md transition-colors",
              distType === "asymmetric"
                ? "bg-[#2563eb] text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            )}
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

function ModifyLoadToolContent({
  selectedLoad,
  onModify,
  onDelete,
}: {
  selectedLoad: Load | null
  onModify?: (patch: Partial<Load>) => void
  onDelete?: () => void
}) {
  const [editFx, setEditFx] = React.useState<number>(0)
  const [editFy, setEditFy] = React.useState<number>(0)
  const [editWStart, setEditWStart] = React.useState<number>(0)
  const [editWEnd, setEditWEnd] = React.useState<number>(0)
  const [editDistType, setEditDistType] = React.useState<"uniform" | "asymmetric">("uniform")
  const [editDistMode, setEditDistMode] = React.useState<"local-axis" | "global-axis">("local-axis")
  const [editWxStart, setEditWxStart] = React.useState<number>(0)
  const [editWxEnd, setEditWxEnd] = React.useState<number>(0)
  const [editWyStart, setEditWyStart] = React.useState<number>(0)
  const [editWyEnd, setEditWyEnd] = React.useState<number>(0)

  React.useEffect(() => {
    if (!selectedLoad) return
    if (selectedLoad.type === "point") {
      setEditFx(selectedLoad.fx)
      setEditFy(selectedLoad.fy)
    } else {
      const mode = selectedLoad.mode ?? "local-axis"
      setEditDistMode(mode)
      if (mode === "local-axis") {
        setEditWStart(selectedLoad.wStart ?? 0)
        setEditWEnd(selectedLoad.wEnd ?? 0)
        setEditDistType(selectedLoad.wStart !== selectedLoad.wEnd ? "asymmetric" : "uniform")
      } else {
        setEditWxStart(selectedLoad.wxStart ?? 0)
        setEditWxEnd(selectedLoad.wxEnd ?? 0)
        setEditWyStart(selectedLoad.wyStart ?? 0)
        setEditWyEnd(selectedLoad.wyEnd ?? 0)
        setEditDistType(selectedLoad.wxStart !== selectedLoad.wxEnd || selectedLoad.wyStart !== selectedLoad.wyEnd ? "asymmetric" : "uniform")
      }
    }
  }, [selectedLoad])

  if (!selectedLoad) {
    return (
      <p className="text-xs text-gray-500 leading-relaxed">
        Click a load on the canvas to select it
      </p>
    )
  }

  const handleApply = () => {
    if (selectedLoad.type === "point") {
      onModify?.({ fx: editFx, fy: editFy } as Partial<Load>)
    } else {
      if (editDistMode === "local-axis") {
        const wEnd = editDistType === "asymmetric" ? editWEnd : editWStart
        onModify?.({
          mode: "local-axis",
          wStart: editWStart,
          wEnd,
          wxStart: undefined,
          wxEnd: undefined,
          wyStart: undefined,
          wyEnd: undefined,
        } as Partial<Load>)
      } else {
        const wxEnd = editDistType === "asymmetric" ? editWxEnd : editWxStart
        const wyEnd = editDistType === "asymmetric" ? editWyEnd : editWyStart
        onModify?.({
          mode: "global-axis",
          wxStart: editWxStart,
          wxEnd,
          wyStart: editWyStart,
          wyEnd,
          wStart: undefined,
          wEnd: undefined,
        } as Partial<Load>)
      }
    }
  }

  return (
    <div className="space-y-3">
      {selectedLoad.type === "point" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Global axis</Label>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-[10px] text-gray-500">X (rightward)</Label>
                <NumericInput
                  value={editFx}
                  onChange={setEditFx}
                  className="h-7 text-xs font-mono w-full"
                />
              </div>
              <div>
                <Label className="text-[10px] text-gray-500">Y (upward)</Label>
                <NumericInput
                  value={editFy}
                  onChange={setEditFy}
                  className="h-7 text-xs font-mono w-full"
                />
              </div>
            </div>
          </div>
        </>
      )}

      {selectedLoad.type === "distributed" && (
        <>
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Input Mode</Label>
            <div className="flex gap-1">
              <button
                onClick={() => setEditDistMode("local-axis")}
                className={cn(
                  "flex-1 h-7 text-[11px] rounded-md transition-colors",
                  editDistMode === "local-axis"
                    ? "bg-[#2563eb] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Local-axis
              </button>
              <button
                onClick={() => setEditDistMode("global-axis")}
                className={cn(
                  "flex-1 h-7 text-[11px] rounded-md transition-colors",
                  editDistMode === "global-axis"
                    ? "bg-[#2563eb] text-white"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                Global Axis
              </button>
            </div>
          </div>

          {editDistMode === "local-axis" && (
            <>
              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Distribution</Label>
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditDistType("uniform")}
                    className={cn(
                      "flex-1 h-7 text-[11px] rounded-md transition-colors",
                      editDistType === "uniform"
                        ? "bg-[#2563eb] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    Uniform
                  </button>
                  <button
                    onClick={() => setEditDistType("asymmetric")}
                    className={cn(
                      "flex-1 h-7 text-[11px] rounded-md transition-colors",
                      editDistType === "asymmetric"
                        ? "bg-[#2563eb] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    Asymmetric
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">{editDistType === "asymmetric" ? "Start (i)" : "Load"}</Label>
                  <div className="flex gap-2">
                    <NumericInput
                      value={editWStart}
                      onChange={setEditWStart}
                      className="h-7 text-xs font-mono flex-1"
                    />
                    <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                  </div>
                </div>
                {editDistType === "asymmetric" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-gray-600">End (j)</Label>
                    <div className="flex gap-2">
                      <NumericInput
                        value={editWEnd}
                        onChange={setEditWEnd}
                        className="h-7 text-xs font-mono flex-1"
                      />
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
                <div className="flex gap-1">
                  <button
                    onClick={() => setEditDistType("uniform")}
                    className={cn(
                      "flex-1 h-7 text-[11px] rounded-md transition-colors",
                      editDistType === "uniform"
                        ? "bg-[#2563eb] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    Uniform
                  </button>
                  <button
                    onClick={() => setEditDistType("asymmetric")}
                    className={cn(
                      "flex-1 h-7 text-[11px] rounded-md transition-colors",
                      editDistType === "asymmetric"
                        ? "bg-[#2563eb] text-white"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                  >
                    Asymmetric
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">X-axis (horizontal)</Label>
                  <div className="flex gap-2">
                    <NumericInput
                      value={editWxStart}
                      onChange={setEditWxStart}
                      className="h-7 text-xs font-mono flex-1"
                    />
                    <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                  </div>
                  {editDistType === "asymmetric" && (
                    <div className="flex gap-2 ml-0">
                      <div className="text-[10px] text-gray-400 self-center">End (j)</div>
                      <NumericInput
                        value={editWxEnd}
                        onChange={setEditWxEnd}
                        className="h-7 text-xs font-mono flex-1"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-gray-600">Y-axis (vertical)</Label>
                  <div className="flex gap-2">
                    <NumericInput
                      value={editWyStart}
                      onChange={setEditWyStart}
                      className="h-7 text-xs font-mono flex-1"
                    />
                    <span className="text-xs text-gray-500 self-center whitespace-nowrap">kN/m</span>
                  </div>
                  {editDistType === "asymmetric" && (
                    <div className="flex gap-2 ml-0">
                      <div className="text-[10px] text-gray-400 self-center">End (j)</div>
                      <NumericInput
                        value={editWyEnd}
                        onChange={setEditWyEnd}
                        className="h-7 text-xs font-mono flex-1"
                      />
                    </div>
                  )}
                </div>
              </div>

              <p className="text-[10px] text-gray-400 leading-snug">+ rightward (X)  ·  − leftward  ·  + upward (Y)  ·  − downward</p>
            </>
          )}
        </>
      )}

      <div className="flex gap-1.5">
        <Button
          size="sm"
          className="flex-1 bg-[#2563eb] hover:bg-[#1d4ed8] text-xs h-7"
          onClick={handleApply}
        >
          Apply
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 text-red-500 border-red-200 hover:bg-red-50 text-xs h-7"
          onClick={onDelete}
        >
          <Trash2 size={11} className="mr-1" />
          Delete
        </Button>
      </div>
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

function ReactionToolContent({ analysisResult }: { analysisResult: AnalysisResult | null }) {
  const [showReport, setShowReport] = React.useState(true)

  if (!analysisResult) {
    return <p className="text-xs text-gray-500">No results. Add supports and run analysis.</p>
  }
  const entries = Object.entries(analysisResult.reactions)
  const valColor = (v: number) => v >= 0 ? "#2563eb" : "#ef4444"
  const fmt = (v: number, unit: string) => `${v >= 0 ? "+" : ""}${formatValue(v)} ${unit}`
  const row = (label: string, v: number, unit: string) => (
    <div className="flex items-baseline justify-between rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5" key={label}>
      <span className="text-[10px] text-gray-500">{label}</span>
      <span className="text-[11px] font-mono" style={{ color: valColor(v) }}>{fmt(v, unit)}</span>
    </div>
  )
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-600">Reaction Report</Label>
        <button
          onClick={() => setShowReport(v => !v)}
          className={cn(
            "text-xs px-2 py-0.5 rounded border transition-colors",
            showReport
              ? "bg-[#2563eb] text-white border-[#2563eb]"
              : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
          )}
        >
          {showReport ? "On" : "Off"}
        </button>
      </div>
      {showReport && (
        <div className="space-y-3">
          {entries.map(([nodeId, r]) => (
            <div key={nodeId} className="space-y-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{nodeId}</p>
              {row("Rx (lateral)",  r.Rx, "kN")}
              {row("Ry (vertical)", r.Ry, "kN")}
              {row("Mz (moment)",   r.Mz, "kN·m")}
            </div>
          ))}
        </div>
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
  analysisResult,
  model,
}: {
  label: string
  scale?: number
  onScaleChange?: (v: number) => void
  invert?: boolean
  onInvertChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
  model?: StructureModel
}) {
  type DiagramKind = "AXIAL" | "SHEAR" | "MOMENT"
  const kind = label as DiagramKind

  const sectionLabel =
    kind === "AXIAL"  ? "Max. Axial" :
    kind === "SHEAR"  ? "Max. Shear" :
                        "Max. Moment"

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
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Diagram Scale Factor</Label>
          <span className="text-xs font-mono text-gray-500">{scale ?? 10}</span>
        </div>
        <input
          type="range"
          value={scale ?? 10}
          min={1}
          max={200}
          className="w-full h-1.5 accent-[#2563eb] cursor-pointer"
          onChange={(e) => onScaleChange?.(Number(e.target.value))}
        />
      </div>

      {onInvertChange !== undefined && (
        <div className="flex items-center justify-between border-t border-gray-100 pt-3">
          <Label className="text-xs text-gray-600">Invert Diagram</Label>
          <button
            onClick={() => onInvertChange(!invert)}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-colors",
              invert
                ? "bg-[#2563eb] text-white border-[#2563eb]"
                : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
            )}
          >
            {invert ? "On" : "Off"}
          </button>
        </div>
      )}

      {memberRows.length > 0 && (
        <div className="space-y-1.5 border-t border-gray-100 pt-3">
          <div className="flex items-center justify-between">
            <Label className="text-xs text-gray-600">{sectionLabel}</Label>
            <button
              onClick={() => setShowReport(v => !v)}
              className={cn(
                "text-xs px-2 py-0.5 rounded border transition-colors",
                showReport
                  ? "bg-[#2563eb] text-white border-[#2563eb]"
                  : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
              )}
            >
              {showReport ? "On" : "Off"}
            </button>
          </div>
          {showReport && (
            <div className="space-y-1">
              {memberRows.map(({ id, peak }) => (
                <div key={id} className="flex items-baseline justify-between rounded-md border border-gray-100 bg-gray-50 px-2.5 py-1.5">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{id}</span>
                  <span className="text-[11px] font-mono" style={{ color: peakColor(peak) }}>
                    {fmt(peak)} {unit}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function DeformationToolContent({
  scale,
  onScaleChange,
  showLabels = true,
  onShowLabelsChange,
  showNodeLabels = true,
  onShowNodeLabelsChange,
  analysisResult,
}: {
  scale?: number
  onScaleChange?: (v: number) => void
  showLabels?: boolean
  onShowLabelsChange?: (v: boolean) => void
  showNodeLabels?: boolean
  onShowNodeLabelsChange?: (v: boolean) => void
  analysisResult?: AnalysisResult | null
}) {
  const [showReport, setShowReport] = React.useState(true)
  const nodeEntries = analysisResult
    ? Object.entries(analysisResult.nodeDisplacements)
    : []

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Deformation Scale Factor</Label>
          <span className="text-xs font-mono text-gray-500">{scale ?? 25}</span>
        </div>
        <input
          type="range"
          value={scale ?? 25}
          min={1}
          max={1000}
          className="w-full h-1.5 accent-[#2563eb] cursor-pointer"
          onChange={(e) => onScaleChange?.(Number(e.target.value))}
        />
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-600">Displacement Labels</Label>
        <button
          onClick={() => onShowLabelsChange?.(!showLabels)}
          className={cn(
            "text-xs px-2 py-0.5 rounded border transition-colors",
            showLabels
              ? "bg-[#2563eb] text-white border-[#2563eb]"
              : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
          )}
        >
          {showLabels ? "On" : "Off"}
        </button>
      </div>
      <div className="flex items-center justify-between">
        <Label className="text-xs text-gray-600">Node Labels</Label>
        <button
          onClick={() => onShowNodeLabelsChange?.(!showNodeLabels)}
          className={cn(
            "text-xs px-2 py-0.5 rounded border transition-colors",
            showNodeLabels
              ? "bg-[#2563eb] text-white border-[#2563eb]"
              : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
          )}
        >
          {showNodeLabels ? "On" : "Off"}
        </button>
      </div>

      <div className="border-t border-gray-100 pt-3 space-y-1.5">
        <div className="flex items-center justify-between">
          <Label className="text-xs text-gray-600">Node Displacements</Label>
          <button
            onClick={() => setShowReport(v => !v)}
            className={cn(
              "text-xs px-2 py-0.5 rounded border transition-colors",
              showReport
                ? "bg-[#2563eb] text-white border-[#2563eb]"
                : "bg-white text-gray-500 border-gray-300 hover:border-gray-400"
            )}
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
                <div key={nodeId} className="space-y-0.5">
                  <span className="text-xs font-medium text-[#7c3aed]">{nodeId}</span>
                  <div className="grid grid-cols-2 gap-x-2">
                    <span className="text-xs text-gray-400">x</span>
                    <span className="text-xs font-mono text-right text-[#1e293b]">{(d.u * 1000).toFixed(3)} mm</span>
                    <span className="text-xs text-gray-400">y</span>
                    <span className="text-xs font-mono text-right text-[#1e293b]">{(d.v * 1000).toFixed(3)} mm</span>
                    <span className="text-xs text-gray-400">θ</span>
                    <span className="text-xs font-mono text-right text-[#1e293b]">{(d.theta * 1000).toFixed(3)} mrad</span>
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

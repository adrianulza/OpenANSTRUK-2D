import * as React from "react"
import { cn } from "@/lib/utils"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import type { TabType, ToolType } from "./tool-sidebar"
import type { Section, SectionId, MultiSelection, StructureModel, SupportType, MemberType, Load, LoadId } from "@/lib/model"
import { MaterialFlyout } from "@/tabs/model/tools/material/material-tool"
import type { AnalysisResult } from "@/lib/solver"
import type { UnitSettings } from "@/lib/units"
import { X } from "lucide-react"
import { ModifyComponentToolContent } from "@/tabs/model/tools/select-tool"
import { DeleteComponentToolContent } from "@/tabs/model/tools/delete-tool"
import { MoveNodeToolContent } from "@/tabs/model/tools/move-node-tool"
import { NodeToolContent } from "@/tabs/model/tools/node-tool"
import { MemberToolContent } from "@/tabs/model/tools/member-tool"
import { SupportToolContent } from "@/tabs/model/tools/support-tool"
import { PointLoadToolContent } from "@/tabs/load/tools/point-load-tool"
import { DistributedLoadToolContent } from "@/tabs/load/tools/dist-load-tool"
import { ModifyLoadToolContent } from "@/tabs/load/tools/modify-load-tool"
import { DeleteLoadToolContent } from "@/tabs/load/tools/delete-load-tool"
import { ReactionToolContent } from "@/tabs/analyze/tools/reaction-tool"
import { AnalyzeSelectContent } from "@/tabs/analyze/tools/select-tool"
import { DiagramToolContent } from "@/tabs/analyze/tools/diagram-tool"
import { DeformationToolContent } from "@/tabs/analyze/tools/deformation-tool"
import { LoadCaseToolContent } from "@/tabs/load/tools/load-case-tool"
import { LoadCombinationToolContent } from "@/tabs/load/tools/load-combination-tool"
import type {
  LoadCase,
  LoadCaseId,
  LoadCombination,
  LoadComboId,
  CodePreset,
} from "@/lib/load-cases"

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
  // Load cases & combinations
  loadCases?: Record<LoadCaseId, LoadCase>
  activeLoadCaseId?: LoadCaseId
  onActiveLoadCaseChange?: (id: LoadCaseId) => void
  onAddLoadCase?: () => void
  onDeleteLoadCase?: (id: LoadCaseId) => void
  onPatchLoadCase?: (id: LoadCaseId, patch: Partial<LoadCase>) => void
  combinations?: Record<LoadComboId, LoadCombination>
  combinationsEnabled?: boolean
  onCombinationsEnabledChange?: (v: boolean) => void
  combinationMode?: "manual" | "code"
  onCombinationModeChange?: (m: "manual" | "code") => void
  selectedCodePreset?: CodePreset
  onSelectedCodePresetChange?: (p: CodePreset) => void
  onAddCombination?: () => void
  onDeleteCombination?: (id: LoadComboId) => void
  onPatchCombination?: (id: LoadComboId, patch: Partial<LoadCombination>) => void
  onGenerateCodeCombinations?: () => void
  editingCombinationId?: LoadComboId | null
  onEditingCombinationIdChange?: (id: LoadComboId | null) => void
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
  loadCases,
  activeLoadCaseId,
  onActiveLoadCaseChange,
  onAddLoadCase,
  onDeleteLoadCase,
  onPatchLoadCase,
  combinations,
  combinationsEnabled,
  onCombinationsEnabledChange,
  combinationMode,
  onCombinationModeChange,
  selectedCodePreset,
  onSelectedCodePresetChange,
  onAddCombination,
  onDeleteCombination,
  onPatchCombination,
  onGenerateCodeCombinations,
  editingCombinationId,
  onEditingCombinationIdChange,
}: FlyoutPanelProps) {
  if (!activeTool) return null

  const wide = activeTool === "LOAD_CASE" || activeTool === "LOAD_COMBINATION"

  return (
    <div
      data-flyout-root
      className={cn(
        "absolute top-3 left-3 bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 z-10",
        wide ? "w-[640px]" : "w-[200px]",
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
          loadCases={loadCases}
          activeLoadCaseId={activeLoadCaseId}
          onActiveLoadCaseChange={onActiveLoadCaseChange}
          onAddLoadCase={onAddLoadCase}
          onDeleteLoadCase={onDeleteLoadCase}
          onPatchLoadCase={onPatchLoadCase}
          combinations={combinations}
          combinationsEnabled={combinationsEnabled}
          onCombinationsEnabledChange={onCombinationsEnabledChange}
          combinationMode={combinationMode}
          onCombinationModeChange={onCombinationModeChange}
          selectedCodePreset={selectedCodePreset}
          onSelectedCodePresetChange={onSelectedCodePresetChange}
          onAddCombination={onAddCombination}
          onDeleteCombination={onDeleteCombination}
          onPatchCombination={onPatchCombination}
          onGenerateCodeCombinations={onGenerateCodeCombinations}
          editingCombinationId={editingCombinationId}
          onEditingCombinationIdChange={onEditingCombinationIdChange}
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
  loadCases,
  activeLoadCaseId,
  onActiveLoadCaseChange,
  onAddLoadCase,
  onDeleteLoadCase,
  onPatchLoadCase,
  combinations,
  combinationsEnabled,
  onCombinationsEnabledChange,
  combinationMode,
  onCombinationModeChange,
  selectedCodePreset,
  onSelectedCodePresetChange,
  onAddCombination,
  onDeleteCombination,
  onPatchCombination,
  onGenerateCodeCombinations,
  editingCombinationId,
  onEditingCombinationIdChange,
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
      case "LOAD_CASE":
        return (
          <LoadCaseToolContent
            loadCases={loadCases ?? {}}
            activeLoadCaseId={activeLoadCaseId ?? "dead"}
            onActiveLoadCaseChange={onActiveLoadCaseChange ?? (() => {})}
            onAddLoadCase={onAddLoadCase ?? (() => {})}
            onDeleteLoadCase={onDeleteLoadCase ?? (() => {})}
            onPatchLoadCase={onPatchLoadCase ?? (() => {})}
          />
        )
      case "LOAD_COMBINATION":
        return (
          <LoadCombinationToolContent
            loadCases={loadCases ?? {}}
            combinations={combinations ?? {}}
            combinationsEnabled={combinationsEnabled ?? false}
            onCombinationsEnabledChange={onCombinationsEnabledChange ?? (() => {})}
            combinationMode={combinationMode ?? "code"}
            onCombinationModeChange={onCombinationModeChange ?? (() => {})}
            selectedCodePreset={selectedCodePreset ?? "SNI1726-2019"}
            onSelectedCodePresetChange={onSelectedCodePresetChange ?? (() => {})}
            onAddCombination={onAddCombination ?? (() => {})}
            onDeleteCombination={onDeleteCombination ?? (() => {})}
            onPatchCombination={onPatchCombination ?? (() => {})}
            onGenerateCodeCombinations={onGenerateCodeCombinations ?? (() => {})}
            editingCombinationId={editingCombinationId ?? null}
            onEditingCombinationIdChange={onEditingCombinationIdChange ?? (() => {})}
          />
        )
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
            loadCases={loadCases}
            activeLoadCaseId={activeLoadCaseId}
            onActiveLoadCaseChange={onActiveLoadCaseChange}
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
            loadCases={loadCases}
            activeLoadCaseId={activeLoadCaseId}
            onActiveLoadCaseChange={onActiveLoadCaseChange}
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
            loadCases={loadCases}
            activeLoadCaseId={activeLoadCaseId}
            onActiveLoadCaseChange={onActiveLoadCaseChange}
          />
        )
      }
      case "DELETE": {
        return (
          <DeleteLoadToolContent
            selectedLoadIds={selectedLoadIds}
            model={model}
            onDelete={onDeleteLoadIds}
            loadCases={loadCases}
            activeLoadCaseId={activeLoadCaseId}
            onActiveLoadCaseChange={onActiveLoadCaseChange}
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

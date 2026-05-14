import { useCallback, useEffect, useState, startTransition } from "react"
import { NavBar } from "@/components/nav-bar"
import { ToolSidebar } from "@/components/tool-sidebar"
import { FlyoutPanel } from "@/components/flyout-panel"
import { StructuralCanvas } from "@/components/structural-canvas"
import { StatusBar } from "@/components/status-bar"
import type { TabType, ToolType } from "@/components/tool-sidebar"
import type { UnitSettings } from "@/lib/units"
import { DEFAULT_UNIT_SETTINGS } from "@/lib/units"
import type {
  NodeId,
  Section,
  SectionId,
  MultiSelection,
  StructureModel,
  SupportType,
  MemberType,
  Load,
  LoadId,
} from "@/lib/model"
import { analyze } from "@/lib/solver"
import type { AnalysisResult } from "@/lib/solver"
import { BeamTemplateModal } from "@/templates/beam-template-modal"
import { FrameTemplateModal } from "@/templates/frame-template-modal"
import { TrussTemplateModal } from "@/templates/truss-template-modal"
import { ExamplesModal } from "@/templates/examples-modal"
import {
  template1SimpleBeam,
  template2Cantilever,
  template3Portal,
  template4PortalLateral,
  template5AsymmetricRafter,
} from "@/templates/examples"
import {
  createEmptyModel,
  stabilityOf,
  emptySelection,
  isEmptySelection,
  mergeSelection,
  removeFromSelection,
  deleteMultiSelection,
  deleteSection,
  newLoadId,
} from "@/lib/model"
import {
  addNode,
  findNodeAt,
  hitTestMember,
  hitTestNode,
  pointSegDist,
  snapWorld,
  splitMember,
  SCALE,
} from "@/lib/geometry"
import { newMemberId } from "@/lib/model"
import { HIT_TOL_NODE, HIT_TOL_MEMBER, LOAD_PT_ARROW_LEN_PX, LOAD_DIST_MAX_ARROW_PX } from "@/lib/constants"

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>("Model")
  const [activeTool, setActiveTool] = useState<ToolType>(null)
  const [unitSettings, setUnitSettings] = useState<UnitSettings>(DEFAULT_UNIT_SETTINGS)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [snapToNode, setSnapToNode] = useState(true)
  const [adaptiveView, setAdaptiveView] = useState(true)
  const [showDimensions, setShowDimensions] = useState(true)
  const [cursorX, setCursorX] = useState(0)
  const [cursorY, setCursorY] = useState(0)
  const [model, setModel] = useState<StructureModel>(template1SimpleBeam)
  const [activeSection, setActiveSection] = useState<SectionId>("iwf150")
  const [activeMemberType, setActiveMemberType] = useState<MemberType>("frame")
  const [activeSupportType, setActiveSupportType] = useState<SupportType>("pin")
  const [selection, setSelection] = useState<MultiSelection>(emptySelection)
  const [pendingFrameStart, setPendingFrameStart] = useState<NodeId | null>(null)

  const [analysisResult, setAnalysisResult] = useState<AnalysisResult | null>(null)
  const [diagramScale, setDiagramScale] = useState(10)
  const [invertSFD, setInvertSFD] = useState(true)
  const [invertBMD, setInvertBMD] = useState(false)
  const [deformationScale, setDeformationScale] = useState(25)
  const [showDeformNodeLabels, setShowDeformNodeLabels] = useState(true)
  const [showReactionNodeLabels, setShowReactionNodeLabels] = useState(true)
  const [showDiagramMemberLabels, setShowDiagramMemberLabels] = useState(true)
  const [templateModal, setTemplateModal] = useState<"beam" | "frame" | "truss" | null>(null)
  const [showExamplesModal, setShowExamplesModal] = useState(false)

  const [activePtInputMode, setActivePtInputMode] = useState<"principal" | "angular">("principal")
  const [activePointLoadAxis, setActivePointLoadAxis] = useState<"x" | "y">("y")
  const [activePtMagnitude, setActivePtMagnitude] = useState(10)
  const [activePtAngle, setActivePtAngle] = useState(90)
  const [activeDistType, setActiveDistType] = useState<"uniform" | "asymmetric">("uniform")
  const [activeDistMode, setActiveDistMode] = useState<"local-axis" | "global-axis">("local-axis")
  const [activeDistAxis, setActiveDistAxis] = useState<"x" | "y">("x")
  const [activeDistWStart, setActiveDistWStart] = useState(-1)
  const [activeDistWEnd, setActiveDistWEnd] = useState(-5)
  const [activeDistWxStart, setActiveDistWxStart] = useState(5)
  const [activeDistWxEnd, setActiveDistWxEnd] = useState(5)
  const [activeDistWyStart, setActiveDistWyStart] = useState(5)
  const [activeDistWyEnd, setActiveDistWyEnd] = useState(5)
  const [selectedLoadId, setSelectedLoadId] = useState<LoadId | null>(null)
  const [selectedLoadIds, setSelectedLoadIds] = useState<string[]>([])

  const [hoveredNodeId, setHoveredNodeId] = useState<NodeId | null>(null)
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [hoveredLoadId, setHoveredLoadId] = useState<LoadId | null>(null)

  const [showMobileModal, setShowMobileModal] = useState(() =>
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  )


  useEffect(() => {
    if (activeTab !== "Analyze") return
    const r = analyze(model)
    startTransition(() => setAnalysisResult(r.ok ? r : null))
  }, [model, activeTab])

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab)
    setActiveTool(tab === "Analyze" ? "REACTION" : null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
  }, [])

  const handleNewFile = useCallback(() => {
    setModel(createEmptyModel())
    setActiveTab("Model")
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setAnalysisResult(null)
    setSelectedLoadId(null)
  }, [])

  const handleTemplateLoad = useCallback((template: 1 | 2 | 3 | 4 | 5) => {
    const builders = {
      1: template1SimpleBeam,
      2: template2Cantilever,
      3: template3Portal,
      4: template4PortalLateral,
      5: template5AsymmetricRafter,
    }
    setModel(builders[template]())
    setActiveTab("Model")
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setAnalysisResult(null)
    setSelectedLoadId(null)
  }, [])

  const handleExampleConfirm = useCallback((model: StructureModel, section: Section) => {
    setModel({
      ...model,
      sections: { ...model.sections, [section.id]: section },
    })
    setActiveTab("Model")
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setAnalysisResult(null)
    setSelectedLoadId(null)
    setShowExamplesModal(false)
  }, [])

  const handleToolSelect = useCallback((tool: ToolType) => {
    setActiveTool(tool)
    setPendingFrameStart(null)
    setSelection(emptySelection())
  }, [])

  const handleCloseFlyout = useCallback(() => {
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setSelectedLoadId(null)
    setSelectedLoadIds([])
  }, [])

  const handleMouseMove = useCallback((x: number, y: number) => {
    setCursorX(x)
    setCursorY(y)

    const raw = { x, y }

    // Detect hover targets based on active tool
    if (activeTab === "Model" && (activeTool === "SELECT" || activeTool === "DELETE" || activeTool === "SUPPORT")) {
      const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
      setHoveredNodeId(nodeId)
      if (!nodeId && (activeTool === "SELECT" || activeTool === "DELETE")) {
        const memberId = hitTestMember(model, raw, HIT_TOL_MEMBER)
        setHoveredMemberId(memberId)
      }
    } else if (activeTab === "Load" && activeTool === "POINT_LOAD") {
      const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
      setHoveredNodeId(nodeId)
    } else if (activeTab === "Load" && activeTool === "DISTRIBUTED_LOAD") {
      const memberId = hitTestMember(model, raw, HIT_TOL_MEMBER)
      setHoveredMemberId(memberId)
    } else if (activeTab === "Load" && (activeTool === "MODIFY_LOAD" || activeTool === "DELETE")) {
      const loads = Object.values(model.loads)
      const ARROW_W = LOAD_PT_ARROW_LEN_PX / SCALE

      // Pass 1: point loads â€” always take priority
      for (const load of loads) {
        if (load.type !== "point") continue
        const node = model.nodes[load.nodeId]
        if (!node) continue
        const mag = Math.sqrt(load.fx * load.fx + load.fy * load.fy)
        if (mag < 1e-12) continue
        const sdx = load.fx / mag
        const sdy = load.fy / mag
        const baseX = node.x - sdx * ARROW_W
        const baseY = node.y - sdy * ARROW_W
        const { d } = pointSegDist(raw.x, raw.y, baseX, baseY, node.x, node.y)
        if (d < HIT_TOL_MEMBER) {
          setHoveredLoadId(load.id)
          return
        }
      }

      // Pass 2: distributed loads
      for (const load of loads) {
        if (load.type !== "distributed") continue
        const member = model.members[load.memberId]
        if (!member) continue
        const A = model.nodes[member.a], B = model.nodes[member.b]
        if (!A || !B) continue
        const dx = B.x - A.x, dy = B.y - A.y
        const len2 = dx * dx + dy * dy
        if (len2 < 1e-12) continue
        const len = Math.sqrt(len2)
        const t = ((raw.x - A.x) * dx + (raw.y - A.y) * dy) / len2
        if (t < 0 || t > 1) continue
        let nx = -dy / len, ny = dx / len
        if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny }
        const mx = A.x + t * dx, my = A.y + t * dy
        const perpDist = (raw.x - mx) * nx + (raw.y - my) * ny
        const wDominant = Math.abs(load.wStart ?? 0) >= Math.abs(load.wEnd ?? 0) ? (load.wStart ?? 0) : (load.wEnd ?? 0)
        const loadDir = wDominant <= 0 ? 1 : -1
        const maxArrowWorldLen = LOAD_DIST_MAX_ARROW_PX / SCALE
        const inLoadDir = perpDist * loadDir
        if (inLoadDir >= -HIT_TOL_MEMBER && inLoadDir <= maxArrowWorldLen + HIT_TOL_MEMBER) {
          setHoveredLoadId(load.id)
          return
        }
      }

      setHoveredLoadId(null)
    } else {
      setHoveredNodeId(null)
      setHoveredMemberId(null)
      setHoveredLoadId(null)
    }
  }, [activeTab, activeTool, model])


  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setPendingFrameStart(null)
        setSelection(emptySelection())
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])

  const ensureNodeAt = useCallback(
    (m: StructureModel, w: { x: number; y: number }): { model: StructureModel; id: NodeId } => {
      const existing = findNodeAt(m, w)
      if (existing) return { model: m, id: existing }
      const onMember = hitTestMember(m, w)
      const added = addNode(m, w)
      if (onMember) {
        return { model: splitMember(added.model, onMember, added.id), id: added.id }
      }
      return added
    },
    []
  )

  const handleCanvasClick = useCallback(
    (wx: number, wy: number) => {
      const raw = { x: wx, y: wy }

      const resolveSnap = (m: StructureModel, p: { x: number; y: number }) => {
        if (snapToNode) {
          const nodeId = hitTestNode(m, p, HIT_TOL_NODE)
          if (nodeId) return m.nodes[nodeId]
        }
        return snapToGrid ? snapWorld(p, unitSettings.gridSpacing) : p
      }

      if (activeTab === "Model" && activeTool) {
        if (activeTool === "NODE") {
          const snapped = resolveSnap(model, raw)
          setModel((m) => {
            if (findNodeAt(m, snapped)) return m
            const memberHit = hitTestMember(m, snapped)
            const { model: m2, id } = addNode(m, snapped)
            return memberHit ? splitMember(m2, memberHit, id) : m2
          })
          return
        }

        if (activeTool === "MEMBER") {
          const snapped = resolveSnap(model, raw)
          const { model: m2, id } = ensureNodeAt(model, snapped)

          if (!pendingFrameStart) {
            setModel(m2)
            setPendingFrameStart(id)
            return
          }

          if (pendingFrameStart === id) return

          const duplicate = Object.values(m2.members).some(
            (mm) =>
              (mm.a === pendingFrameStart && mm.b === id) ||
              (mm.a === id && mm.b === pendingFrameStart)
          )
          if (!duplicate) {
            const mid = newMemberId()
            setModel({
              ...m2,
              members: {
                ...m2.members,
                [mid]: { id: mid, a: pendingFrameStart, b: id, section: activeSection, memberType: activeMemberType },
              },
            })
          } else {
            setModel(m2)
          }
          setPendingFrameStart(null)
          return
        }

        if (activeTool === "SUPPORT") {
          const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
          if (!nodeId) return
          setModel((m) => ({
            ...m,
            supports: { ...m.supports, [nodeId]: { nodeId, type: activeSupportType } },
          }))
          return
        }
      }

      if (activeTab === "Load" && activeTool) {
        if (activeTool === "POINT_LOAD") {
          const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
          if (!nodeId) return
          const existingLoad = Object.values(model.loads).find(
            (l) => l.type === "point" && l.nodeId === nodeId
          )
          const id = existingLoad?.id ?? newLoadId()

          // Start with existing load values (if any) or zeros
          let fx = existingLoad?.type === "point" ? existingLoad.fx : 0
          let fy = existingLoad?.type === "point" ? existingLoad.fy : 0

          if (activePtInputMode === "principal") {
            // Principal mode: replace the selected axis, keep the other
            if (activePointLoadAxis === "x") {
              fx = activePtMagnitude
            } else {
              fy = activePtMagnitude
            }
          } else {
            // Angular mode: replace both fx and fy with new angle-based values
            const rad = activePtAngle * (Math.PI / 180)
            fx = activePtMagnitude * Math.cos(rad)
            fy = -activePtMagnitude * Math.sin(rad)  // Flip for world Y-up
          }

          setModel((m) => ({
            ...m,
            loads: {
              ...m.loads,
              [id]: { id, type: "point" as const, nodeId, fx, fy },
            },
          }))
          return
        }

        if (activeTool === "DISTRIBUTED_LOAD") {
          const memberId = hitTestMember(model, raw, HIT_TOL_MEMBER)
          if (!memberId) return
          const existing = Object.values(model.loads).find(
            (l) => l.type === "distributed" && l.memberId === memberId
          )
          const id = existing?.id ?? newLoadId()

          if (activeDistMode === "local-axis") {
            const wEnd = activeDistType === "uniform" ? activeDistWStart : activeDistWEnd
            setModel((m) => ({
              ...m,
              loads: {
                ...m.loads,
                [id]: { id, type: "distributed" as const, memberId, mode: "local-axis", wStart: activeDistWStart, wEnd },
              },
            }))
          } else {
            // Global-axis: only set the selected axis, zero the other
            if (activeDistAxis === "x") {
              const wxEnd = activeDistType === "uniform" ? activeDistWxStart : activeDistWxEnd
              setModel((m) => ({
                ...m,
                loads: {
                  ...m.loads,
                  [id]: { id, type: "distributed" as const, memberId, mode: "global-axis", wxStart: activeDistWxStart, wxEnd, wyStart: 0, wyEnd: 0 },
                },
              }))
            } else {
              const wyEnd = activeDistType === "uniform" ? activeDistWyStart : activeDistWyEnd
              setModel((m) => ({
                ...m,
                loads: {
                  ...m.loads,
                  [id]: { id, type: "distributed" as const, memberId, mode: "global-axis", wxStart: 0, wxEnd: 0, wyStart: activeDistWyStart, wyEnd },
                },
              }))
            }
          }
          return
        }

        if (activeTool === "MODIFY_LOAD" || (activeTab === "Load" && activeTool === "DELETE")) {
          const loads = Object.values(model.loads)
          const ARROW_W = LOAD_PT_ARROW_LEN_PX / SCALE
          const isDeleteTool = activeTool === "DELETE"

          const selectLoad = (id: string) => {
            if (isDeleteTool) setSelectedLoadIds([id])
            else { setSelectedLoadId(id); setSelectedLoadIds([]) }
          }
          const clearLoad = () => {
            if (isDeleteTool) setSelectedLoadIds([])
            else { setSelectedLoadId(null); setSelectedLoadIds([]) }
          }

          // Pass 1: point loads â€” always take priority over distributed loads
          for (const load of loads) {
            if (load.type !== "point") continue
            const node = model.nodes[load.nodeId]
            if (!node) continue
            const mag = Math.sqrt(load.fx * load.fx + load.fy * load.fy)
            if (mag < 1e-12) continue
            const sdx = load.fx / mag
            const sdy = load.fy / mag
            const baseX = node.x - sdx * ARROW_W
            const baseY = node.y - sdy * ARROW_W
            const { d } = pointSegDist(raw.x, raw.y, baseX, baseY, node.x, node.y)
            if (d < HIT_TOL_MEMBER) {
              selectLoad(load.id)
              return
            }
          }

          // Pass 2: distributed loads
          for (const load of loads) {
            if (load.type !== "distributed") continue
            const member = model.members[load.memberId]
            if (!member) continue
            const A = model.nodes[member.a], B = model.nodes[member.b]
            if (!A || !B) continue
            const dx = B.x - A.x, dy = B.y - A.y
            const len2 = dx * dx + dy * dy
            if (len2 < 1e-12) continue
            const len = Math.sqrt(len2)
            const t = ((raw.x - A.x) * dx + (raw.y - A.y) * dy) / len2
            if (t < 0 || t > 1) continue
            let nx = -dy / len, ny = dx / len
            if (ny < 0 || (ny === 0 && nx < 0)) { nx = -nx; ny = -ny }
            const mx = A.x + t * dx, my = A.y + t * dy
            const perpDist = (raw.x - mx) * nx + (raw.y - my) * ny
            const wDominant = Math.abs(load.wStart ?? 0) >= Math.abs(load.wEnd ?? 0) ? (load.wStart ?? 0) : (load.wEnd ?? 0)
            const loadDir = wDominant <= 0 ? 1 : -1
            const maxArrowWorldLen = LOAD_DIST_MAX_ARROW_PX / SCALE
            const inLoadDir = perpDist * loadDir
            if (inLoadDir >= -HIT_TOL_MEMBER && inLoadDir <= maxArrowWorldLen + HIT_TOL_MEMBER) {
              selectLoad(load.id)
              return
            }
          }

          clearLoad()
          return
        }
      }
    },
    [
      activeTab, activeTool, activeSection, activeMemberType, activeSupportType,
      activePtInputMode, activePointLoadAxis, activePtMagnitude, activePtAngle, activeDistType, activeDistWStart, activeDistWEnd,
      activeDistMode, activeDistAxis, activeDistWxStart, activeDistWxEnd, activeDistWyStart, activeDistWyEnd,
      model, pendingFrameStart, ensureNodeAt, unitSettings.gridSpacing, snapToGrid, snapToNode,
    ]
  )

  const handleSelectItems = useCallback(
    (items: MultiSelection) => {
      setSelection((prev) => mergeSelection(prev, items))
      if (items.memberIds.length === 1) {
        const mem = model.members[items.memberIds[0]]
        if (mem) setActiveSection(mem.section)
      }
    },
    [model]
  )

  const handleDeselectItems = useCallback((items: MultiSelection) => {
    setSelection((prev) => removeFromSelection(prev, items))
  }, [])

  const handleClearSelection = useCallback(() => {
    setSelection(emptySelection())
  }, [])

  const handleDeleteSelection = useCallback(() => {
    if (isEmptySelection(selection)) return
    setModel((m) => deleteMultiSelection(m, selection)
    )
    setSelection(emptySelection())
  }, [selection])

  const handleModifySelection = useCallback(() => {
    if (selection.memberIds.length === 0) return
    setModel((m) => {
      const members = { ...m.members }
      for (const id of selection.memberIds) {
        if (members[id]) members[id] = { ...members[id], section: activeSection }
      }
      return { ...m, members }
    })
  }, [selection, activeSection])

  const handleModifySupportSelection = useCallback((type: import("./lib/model").SupportType) => {
    if (selection.supportNodeIds.length === 0) return
    setModel((m) => {
      const supports = { ...m.supports }
      for (const nodeId of selection.supportNodeIds) {
        if (supports[nodeId]) supports[nodeId] = { ...supports[nodeId], type }
      }
      return { ...m, supports }
    })
  }, [selection.supportNodeIds])

  const handleModifyLoad = useCallback(
    (patch: Partial<Load>) => {
      if (!selectedLoadId) return
      setModel((m) => ({
        ...m,
        loads: { ...m.loads, [selectedLoadId]: { ...m.loads[selectedLoadId], ...patch } as Load },
      }))
    },
    [selectedLoadId]
  )

  const handleModifyLoadsByType = useCallback(
    (type: "point" | "distributed", patch: Partial<Load>) => {
      const ids = selectedLoadIds.length > 0 ? selectedLoadIds : (selectedLoadId ? [selectedLoadId] : [])
      if (ids.length === 0) return
      setModel((m) => {
        const loads = { ...m.loads }
        for (const id of ids) {
          if (loads[id]?.type === type) {
            loads[id] = { ...loads[id], ...patch } as Load
          }
        }
        return { ...m, loads }
      })
    },
    [selectedLoadIds, selectedLoadId]
  )

  const handleDeleteLoad = useCallback(() => {
    if (!selectedLoadId) return
    setModel((m) => {
      const loads = { ...m.loads }
      delete loads[selectedLoadId]
      return { ...m, loads }
    })
    setSelectedLoadId(null)
  }, [selectedLoadId])

  const handleDeleteLoadIds = useCallback(() => {
    if (selectedLoadIds.length === 0) return
    setModel((m) => {
      const loads = { ...m.loads }
      for (const id of selectedLoadIds) delete loads[id]
      return { ...m, loads }
    })
    setSelectedLoadIds([])
  }, [selectedLoadIds])

  const handleSelectLoadIds = useCallback((ids: string[]) => {
    setSelectedLoadIds(ids)
    if (activeTool === "MODIFY_LOAD") {
      setSelectedLoadId(ids[0] ?? null)
    }
  }, [activeTool])

  const handleSectionPropsChange = useCallback(
    (id: SectionId, patch: Partial<Section>) => {
      setModel((m) => ({
        ...m,
        sections: { ...m.sections, [id]: { ...m.sections[id], ...patch } },
      }))
    },
    []
  )

  const handleAddSection = useCallback((section: Section) => {
    setModel((m) => ({ ...m, sections: { ...m.sections, [section.id]: section } }))
    setActiveSection(section.id)
  }, [])

  const handleDeleteSection = useCallback(
    (sectionId: SectionId) => {
      const sectionCount = Object.keys(model.sections).length
      if (sectionCount <= 1) return
      const fallback = Object.keys(model.sections).find((id) => id !== sectionId)!
      setModel((m) => deleteSection(m, sectionId))
      if (sectionId === activeSection) setActiveSection(fallback)
    },
    [model.sections, activeSection]
  )

  const nodeCount = Object.keys(model.nodes).length
  const memberCount = Object.keys(model.members).length
  const stability = stabilityOf(model)

  return (
    <div className="relative h-screen w-screen flex flex-col overflow-hidden bg-[#F0F2F5]">
      {showMobileModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-2xl shadow-2xl px-8 py-10 flex flex-col items-center text-center" style={{ width: '92vw' }}>
            <div className="flex items-center mb-5 text-[#0b2550] opacity-80">
              <svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" />
                <path d="M8 21h8M12 17v4" />
              </svg>
            </div>
            <h2 className="text-[#0b2550] font-semibold text-1xl mb-3 tracking-tight">
              Better in Landscape Screen or Desktop PC
            </h2>
            <p className="text-gray-500 text-1xl leading-relaxed mb-2">
              For the best experience, rotate your device to <strong>landscape</strong> or open this app on a <strong>PC or Mac desktop browser</strong>.
            </p>
            <p className="text-gray-400 text-1xl leading-relaxed mb-8">
              OpenAnstruk-2D is designed for larger screens.
            </p>
            <button
              onClick={() => setShowMobileModal(false)}
              className="w-full bg-[#0b2550] text-white text-1xl font-medium py-3 rounded-xl hover:bg-[#0e2d60] transition-colors"
            >
              Continue Anyway
            </button>
          </div>
        </div>
      )}
      <NavBar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onTemplateLoad={handleTemplateLoad}
        onNewFile={handleNewFile}
        onOpenBeamTemplate={() => setTemplateModal("beam")}
        onOpenFrameTemplate={() => setTemplateModal("frame")}
        onOpenTrussTemplate={() => setTemplateModal("truss")}
        onOpenExamplesModal={() => setShowExamplesModal(true)}
      />

      <div className="flex-1 flex overflow-hidden">
        <ToolSidebar
          activeTab={activeTab}
          activeTool={activeTool}
          onToolSelect={handleToolSelect}
        />

        <main className="flex-1 relative overflow-hidden">
          <FlyoutPanel
            activeTab={activeTab}
            activeTool={activeTool}
            onClose={handleCloseFlyout}
            model={model}
            selection={selection}
            activeSection={activeSection}
            onSectionChange={setActiveSection}
            activeMemberType={activeMemberType}
            onMemberTypeChange={setActiveMemberType}
            activeSupportType={activeSupportType}
            onSupportTypeChange={setActiveSupportType}
            onSectionPropsChange={handleSectionPropsChange}
            onAddSection={handleAddSection}
            onDeleteSection={handleDeleteSection}
            onDeleteSelection={handleDeleteSelection}
            onModifySelection={handleModifySelection}
            onModifySupportSelection={handleModifySupportSelection}
            unitSettings={unitSettings}
            activePtInputMode={activePtInputMode}
            onPtInputModeChange={setActivePtInputMode}
            activePointLoadAxis={activePointLoadAxis}
            onPointLoadAxisChange={setActivePointLoadAxis}
            activePtMagnitude={activePtMagnitude}
            onPtMagnitudeChange={setActivePtMagnitude}
            activePtAngle={activePtAngle}
            onPtAngleChange={setActivePtAngle}
            activeDistType={activeDistType}
            onDistTypeChange={setActiveDistType}
            activeDistMode={activeDistMode}
            onDistModeChange={setActiveDistMode}
            activeDistAxis={activeDistAxis}
            onDistAxisChange={setActiveDistAxis}
            activeDistWStart={activeDistWStart}
            onDistWStartChange={setActiveDistWStart}
            activeDistWEnd={activeDistWEnd}
            onDistWEndChange={setActiveDistWEnd}
            activeDistWxStart={activeDistWxStart}
            onDistWxStartChange={setActiveDistWxStart}
            activeDistWxEnd={activeDistWxEnd}
            onDistWxEndChange={setActiveDistWxEnd}
            activeDistWyStart={activeDistWyStart}
            onDistWyStartChange={setActiveDistWyStart}
            activeDistWyEnd={activeDistWyEnd}
            onDistWyEndChange={setActiveDistWyEnd}
            selectedLoadId={selectedLoadId}
            selectedLoadIds={selectedLoadIds}
            onModifyLoad={handleModifyLoad}
            onModifyLoadsByType={handleModifyLoadsByType}
            onDeleteLoad={handleDeleteLoad}
            onDeleteLoadIds={handleDeleteLoadIds}
            diagramScale={diagramScale}
            onDiagramScaleChange={setDiagramScale}
            invertSFD={invertSFD}
            onInvertSFDChange={setInvertSFD}
            invertBMD={invertBMD}
            onInvertBMDChange={setInvertBMD}
            deformationScale={deformationScale}
            onDeformationScaleChange={setDeformationScale}
            showDeformNodeLabels={showDeformNodeLabels}
            onShowDeformNodeLabelsChange={setShowDeformNodeLabels}
            showReactionNodeLabels={showReactionNodeLabels}
            onShowReactionNodeLabelsChange={setShowReactionNodeLabels}
            showDiagramMemberLabels={showDiagramMemberLabels}
            onShowDiagramMemberLabelsChange={setShowDiagramMemberLabels}
            analysisResult={analysisResult}
          />

          <StructuralCanvas
            activeTab={activeTab}
            activeTool={activeTool}
            showDimensions={showDimensions}
            model={model}
            selection={selection}
            pendingFrameStart={pendingFrameStart}
            gridSpacing={unitSettings.gridSpacing}
            snapToGrid={snapToGrid}
            snapToNode={snapToNode}
            lengthUnit={unitSettings.length}
            adaptiveView={adaptiveView}
            onMouseMove={handleMouseMove}
            onCanvasClick={handleCanvasClick}
            onSelectItems={handleSelectItems}
            onDeselectItems={handleDeselectItems}
            onClearSelection={handleClearSelection}
            onSelectLoadIds={handleSelectLoadIds}
            selectedLoadId={selectedLoadId}
            selectedLoadIds={selectedLoadIds}
            analysisResult={analysisResult}
            diagramScale={diagramScale}
            invertSFD={invertSFD}
            invertBMD={invertBMD}
            deformationScale={deformationScale}
            showDeformNodeLabels={showDeformNodeLabels}
            showReactionNodeLabels={showReactionNodeLabels}
            showDiagramMemberLabels={showDiagramMemberLabels}
            hoveredNodeId={hoveredNodeId}
            hoveredMemberId={hoveredMemberId}
            hoveredLoadId={hoveredLoadId}
          />
        </main>
      </div>

      {/* Template modals */}
      {templateModal === "beam" && (
        <BeamTemplateModal
          onConfirm={(m) => {
            setModel(m)
            setActiveTab("Model")
            setActiveTool(null)
            setPendingFrameStart(null)
            setSelection(emptySelection())
            setAnalysisResult(null)
            setSelectedLoadId(null)
            setTemplateModal(null)
          }}
          onClose={() => setTemplateModal(null)}
        />
      )}
      {templateModal === "frame" && (
        <FrameTemplateModal
          onConfirm={(m) => {
            setModel(m)
            setActiveTab("Model")
            setActiveTool(null)
            setPendingFrameStart(null)
            setSelection(emptySelection())
            setAnalysisResult(null)
            setSelectedLoadId(null)
            setTemplateModal(null)
          }}
          onClose={() => setTemplateModal(null)}
        />
      )}
      {templateModal === "truss" && (
        <TrussTemplateModal
          onConfirm={(m) => {
            setModel(m)
            setActiveTab("Model")
            setActiveTool(null)
            setPendingFrameStart(null)
            setSelection(emptySelection())
            setAnalysisResult(null)
            setSelectedLoadId(null)
            setTemplateModal(null)
          }}
          onClose={() => setTemplateModal(null)}
        />
      )}

      {/* Examples modal â€” loaded from examples library with customizable properties */}
      {showExamplesModal && (
        <ExamplesModal
          onConfirm={handleExampleConfirm}
          onClose={() => setShowExamplesModal(false)}
          unitSettings={unitSettings}
        />
      )}

      <StatusBar
        nodes={nodeCount}
        members={memberCount}
        stability={stability}
        unitSettings={unitSettings}
        showDimensions={showDimensions}
        cursorX={cursorX}
        cursorY={cursorY}
        snapToGrid={snapToGrid}
        onSnapToGridChange={setSnapToGrid}
        snapToNode={snapToNode}
        onSnapToNodeChange={setSnapToNode}
        adaptiveView={adaptiveView}
        onAdaptiveViewChange={setAdaptiveView}
        onUnitSettingsChange={setUnitSettings}
        onToggleDimensions={() => setShowDimensions(!showDimensions)}
      />
    </div>
  )
}

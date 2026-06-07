import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { NavBar } from "@/components/nav-bar"
import { ToolSidebar } from "@/components/tool-sidebar"
import { FlyoutPanel } from "@/components/flyout-panel"
import { StructuralCanvas } from "@/canvas/structural-canvas"
import { StatusBar } from "@/components/status-bar"
import { useIsMobile } from "@/hooks/use-mobile"
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
  SupportPick,
  MemberType,
  Load,
  LoadId,
} from "@/lib/model"
import {
  solveAllCases,
  combineResults,
  envelopeResults,
  pickDisplayedResult,
} from "@/lib/analysis-pipeline"
import type { AnalysisResult } from "@/lib/analysis-pipeline"
import { analyze, type SolverResult } from "@/lib/solver"
import {
  runDiagnostics,
  dofToLocation,
  findZeroGammaSections,
  type DiagnosticIssue,
  type DiagnosticsReport,
} from "@/lib/analysis-diagnostics"
import { AnalysisIssuesDialog } from "@/components/analysis-issues-dialog"
import { AnalyzeViewSelector } from "@/components/analyze-view-selector"
import { LoadViewSelector, LOAD_VIEW_ALL, type LoadViewSelection } from "@/components/load-view-selector"
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
import { newMemberId, resetIdCounter } from "@/lib/model"
import { HIT_TOL_NODE, HIT_TOL_MEMBER, LOAD_PT_ARROW_LEN_PX, LOAD_DIST_MAX_ARROW_PX } from "@/lib/constants"
import {
  type LoadCase,
  type LoadCaseId,
  type LoadCombination,
  type LoadComboId,
  type CodePreset,
  DEFAULT_LOAD_CASES,
  newLoadCaseId,
  newLoadComboId,
} from "@/lib/load-cases"
import { generateCodeCombinations, requiredKindsForPreset } from "@/lib/combinations-presets"
import type { AnalyzeViewMode } from "@/components/analyze-view-selector"

export default function App() {
  const isMobile = useIsMobile()
  const [activeTab, setActiveTab] = useState<TabType>("Model")
  const [activeTool, setActiveTool] = useState<ToolType>(null)
  const [unitSettings, setUnitSettings] = useState<UnitSettings>(DEFAULT_UNIT_SETTINGS)
  const [snapToGrid, setSnapToGrid] = useState(true)
  const [snapToNode, setSnapToNode] = useState(true)
  const [adaptiveView, setAdaptiveView] = useState(true)
  const [shearDeformation, setShearDeformation] = useState(false)
  const [showDimensions, setShowDimensions] = useState(true)
  const [showSectionLabels, setShowSectionLabels] = useState(true)
  const [showNodeIds, setShowNodeIds] = useState(false)
  const [showMemberIds, setShowMemberIds] = useState(false)
  const [showLocalAxes, setShowLocalAxes] = useState(false)
  const [cursorX, setCursorX] = useState(0)
  const [cursorY, setCursorY] = useState(0)
  const [model, setModel] = useState<StructureModel>(template1SimpleBeam)
  const [activeSection, setActiveSection] = useState<SectionId>("section")
  const [activeMemberType, setActiveMemberType] = useState<MemberType>("frame")
  const [activeSupportType, setActiveSupportType] = useState<SupportPick>("pin")
  const [selection, setSelection] = useState<MultiSelection>(emptySelection)
  const [pendingFrameStart, setPendingFrameStart] = useState<NodeId | null>(null)

  const [envelopeComboIds, setEnvelopeComboIds] = useState<LoadComboId[]>([])
  const [diagramScale, setDiagramScale] = useState(1)
  const [invertSFD, setInvertSFD] = useState(true)
  const [invertBMD, setInvertBMD] = useState(false)
  const [deformationScale, setDeformationScale] = useState(1)
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

  // ─── Load Cases & Combinations ─────────────────────────────────────────────
  const [loadCases, setLoadCases] = useState<Record<LoadCaseId, LoadCase>>(DEFAULT_LOAD_CASES)
  const [activeLoadCaseId, setActiveLoadCaseId] = useState<LoadCaseId>("dead")
  const [combinations, setCombinations] = useState<Record<LoadComboId, LoadCombination>>({})
  const [combinationsEnabled, setCombinationsEnabled] = useState(false)
  const [combinationMode, setCombinationMode] = useState<"manual" | "code">("code")
  const [selectedCodePreset, setSelectedCodePreset] = useState<CodePreset>("ASCE7-22")
  const [editingCombinationId, setEditingCombinationId] = useState<LoadComboId | null>(null)
  // Analyze view selector
  const [analyzeViewMode, setAnalyzeViewMode] = useState<AnalyzeViewMode>("case")
  const [selectedCaseId, setSelectedCaseId] = useState<LoadCaseId>("dead")
  const [selectedCombinationId, setSelectedCombinationId] = useState<LoadComboId | null>(null)
  // Load tab: which case to show on canvas (or "all loads"). Default "all".
  const [loadViewFilter, setLoadViewFilter] = useState<LoadViewSelection>(LOAD_VIEW_ALL)

  // While a placement tool is active, the flyout's active load case drives the
  // canvas "Show Load" filter so users never place into a hidden case. Off-case
  // loads are hidden during placement; on tool exit, snap back to "All Loads".
  const isPlacingLoad = activeTool === "POINT_LOAD" || activeTool === "DISTRIBUTED_LOAD"
  useEffect(() => {
    if (isPlacingLoad) {
      setLoadViewFilter(activeLoadCaseId)
    } else {
      setLoadViewFilter(LOAD_VIEW_ALL)
    }
  }, [isPlacingLoad, activeLoadCaseId])

  // Generate (or regenerate) preset combinations on demand. Auto-creates
  // any missing load cases the preset needs (matched by kind, not name) and
  // then replaces all preset-sourced combinations. Custom combos are kept.
  const handleGenerateCodeCombinations = useCallback(() => {
    // First, ensure every required kind has a corresponding case. We compute
    // the final case map synchronously so the combo generator sees it too.
    const needed = requiredKindsForPreset(selectedCodePreset)
    const finalCases: Record<LoadCaseId, LoadCase> = { ...loadCases }
    for (const kind of needed) {
      const exists = Object.values(finalCases).some((c) => c.kind === kind)
      if (exists) continue
      const id = newLoadCaseId()
      finalCases[id] = {
        id,
        name: kind,
        kind,
        enabled: true,
      }
    }
    setLoadCases(finalCases)

    // Replace all preset combos; keep custom combos.
    const generated = generateCodeCombinations(selectedCodePreset, finalCases)
    setCombinations((prev) => {
      const kept: Record<LoadComboId, LoadCombination> = {}
      for (const [id, c] of Object.entries(prev)) {
        if (c.source === "custom") kept[id] = c
      }
      for (const c of generated) kept[c.id] = c
      return kept
    })
    // Drop old preset IDs from the envelope set, add the newly generated ones.
    setEnvelopeComboIds((prev) => {
      const presetIds = new Set(
        Object.values(combinations)
          .filter((c) => c.source === "preset")
          .map((c) => c.id),
      )
      const kept = prev.filter((id) => !presetIds.has(id))
      return [...kept, ...generated.map((c) => c.id)]
    })
  }, [selectedCodePreset, loadCases, combinations])

  const handleAddLoadCase = useCallback(() => {
    setLoadCases((prev) => {
      const id = newLoadCaseId()
      const count = Object.keys(prev).length
      const newCase: LoadCase = {
        id,
        name: `Case ${count + 1}`,
        kind: "Live",
        enabled: true,
      }
      return { ...prev, [id]: newCase }
    })
  }, [])

  const handleDeleteLoadCase = useCallback(
    (id: LoadCaseId) => {
      if (loadCases[id]?.locked) return
      setLoadCases((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      // If the deleted case was active, fall back to the first remaining case.
      setActiveLoadCaseId((cur) => {
        if (cur !== id) return cur
        const remaining = Object.keys(loadCases).filter((k) => k !== id)
        return remaining[0] ?? "dead"
      })
      // Drop any combinations referencing only this case; trim terms in others.
      setCombinations((prev) => {
        const next: Record<LoadComboId, LoadCombination> = {}
        for (const [cid, combo] of Object.entries(prev)) {
          const filteredTerms = combo.terms.filter((t) => t.caseId !== id)
          if (filteredTerms.length === 0) continue
          next[cid] = { ...combo, terms: filteredTerms }
        }
        return next
      })
      if (selectedCaseId === id) setSelectedCaseId("dead")
    },
    [loadCases, selectedCaseId]
  )

  const handlePatchLoadCase = useCallback(
    (id: LoadCaseId, patch: Partial<LoadCase>) => {
      setLoadCases((prev) => {
        const existing = prev[id]
        if (!existing) return prev
        // Locked cases can only patch `enabled`. For Selfweight, `enabled` gates
        // the synthetic γ·A body force computed in solveCase("selfweight").
        if (existing.locked) {
          const safePatch: Partial<LoadCase> = {}
          if ("enabled" in patch) safePatch.enabled = patch.enabled
          return { ...prev, [id]: { ...existing, ...safePatch } }
        }
        return { ...prev, [id]: { ...existing, ...patch } }
      })
    },
    []
  )

  const handleAddCombination = useCallback(() => {
    const id = newLoadComboId()
    // Prefer "dead" as the seed term; fall back to any non-locked case; else first.
    const seedCaseId =
      loadCases["dead"]?.id ??
      Object.values(loadCases).find((c) => !c.locked)?.id ??
      Object.keys(loadCases)[0] ?? "dead"
    const newCombo: LoadCombination = {
      id,
      name: `Combination ${Object.values(combinations).filter((c) => c.source === "custom").length + 1}`,
      terms: [{ factor: 1.0, caseId: seedCaseId }],
      source: "custom",
      enabled: true,
    }
    setCombinations((prev) => ({ ...prev, [id]: newCombo }))
    setEnvelopeComboIds((prev) => [...prev, id])
    setEditingCombinationId(id)
  }, [loadCases, combinations])

  const handleDeleteCombination = useCallback((id: LoadComboId) => {
    setCombinations((prev) => {
      const next = { ...prev }
      delete next[id]
      return next
    })
    setEnvelopeComboIds((prev) => prev.filter((x) => x !== id))
    setEditingCombinationId((cur) => (cur === id ? null : cur))
    setSelectedCombinationId((cur) => (cur === id ? null : cur))
  }, [])

  // Reassign every selected load (single or multi-selection) to a new case.
  const handleReassignLoadCase = useCallback(
    (newCaseId: LoadCaseId) => {
      const ids = selectedLoadIds.length > 0
        ? selectedLoadIds
        : (selectedLoadId ? [selectedLoadId] : [])
      if (ids.length === 0) return
      setModel((m) => {
        const nextLoads = { ...m.loads }
        for (const id of ids) {
          const l = nextLoads[id]
          if (!l) continue
          nextLoads[id] = { ...l, loadCaseId: newCaseId }
        }
        return { ...m, loads: nextLoads }
      })
    },
    [selectedLoadId, selectedLoadIds],
  )

  const handlePatchCombination = useCallback(
    (id: LoadComboId, patch: Partial<LoadCombination>) => {
      setCombinations((prev) => {
        const existing = prev[id]
        if (!existing) return prev
        return { ...prev, [id]: { ...existing, ...patch } }
      })
    },
    []
  )

  const [moveNodeMode, setMoveNodeMode] = useState<"coordinates" | "screen">("coordinates")
  const moveNodeModeRef = useRef<"coordinates" | "screen">("coordinates")
  useEffect(() => { moveNodeModeRef.current = moveNodeMode }, [moveNodeMode])
  const [moveNodeCoordMode, setMoveNodeCoordMode] = useState<"set" | "offset">("set")
  const [moveNodeSelectedId, setMoveNodeSelectedId] = useState<NodeId | null>(null)
  const [draggingNodeId, setDraggingNodeId] = useState<NodeId | null>(null)

  const [hoveredNodeId, setHoveredNodeId] = useState<NodeId | null>(null)
  const [hoveredMemberId, setHoveredMemberId] = useState<string | null>(null)
  const [hoveredLoadId, setHoveredLoadId] = useState<LoadId | null>(null)

  const [showMobileModal, setShowMobileModal] = useState(() =>
    /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
  )


  // Case-aware analysis pipeline. Each enabled case solves once; combinations
  // and envelope are derived by linear superposition. See
  // src/lib/analysis-pipeline.ts.
  //
  // Lazy gate (v1.0.6): the solver only runs while the Analyze tab is active.
  // Editing in Model/Load tabs no longer triggers solves whose results would
  // never be drawn — entering the Analyze tab is the implicit "Analyze"
  // trigger. Edits while on Analyze still re-solve live (memo dep includes
  // model/loadCases), preserving the no-button UX inside the tab.
  const caseResults = useMemo<Record<LoadCaseId, SolverResult>>(
    () => activeTab === "Analyze" ? solveAllCases(model, loadCases, { shearDeformation }) : {},
    [activeTab, model, loadCases, shearDeformation],
  )

  const comboResults = useMemo(() => {
    const out: Record<LoadComboId, AnalysisResult | null> = {}
    for (const [id, c] of Object.entries(combinations)) {
      out[id] = combineResults(caseResults, c)
    }
    return out
  }, [caseResults, combinations])

  const envelopeResult = useMemo(
    () => envelopeResults(comboResults, envelopeComboIds, combinations),
    [comboResults, envelopeComboIds, combinations],
  )

  const displayedResult = useMemo(
    () => pickDisplayedResult(
      analyzeViewMode,
      caseResults,
      comboResults,
      envelopeResult,
      selectedCaseId,
      selectedCombinationId,
    ),
    [analyzeViewMode, caseResults, comboResults, envelopeResult, selectedCaseId, selectedCombinationId],
  )

  // ── Diagnostics (always reactive) ──────────────────────────────────────────
  // Cheap structural pre-flight: empty model, reaction count, connectivity,
  // γ=0 sections. Cost is microseconds even on large models. Runs in every
  // tab so the status-bar STATUS label stays live.
  const diagnostics = useMemo(() => runDiagnostics(model), [model])

  // Sections with no positive unit weight — used by Load Case + Load
  // Combination tools to show the γ=0 inline warning.
  const zeroGammaSectionIds = useMemo(() => findZeroGammaSections(model), [model])

  // Diagnostic solve (Option B, v1.0.6+). The topology-only diagnostics above
  // can't detect every geometric mechanism (e.g. an isolated supported node
  // whose support doesn't constrain θ, or 3 collinear pins). To keep the
  // STATUS pill honest in every tab — not just Analyze — we run *one* solve
  // on a loadless slice of the model. The result itself is discarded; only
  // the `singularDof` from a failed solve is used to upgrade the diagnostics
  // report. Cost is one analyze() per edit, roughly N× cheaper than the full
  // lazy pipeline that runs on Analyze entries (N = enabled cases).
  //
  // Skipped if topology diagnostics already returned an error — the solver
  // would also fail and we'd just get a less specific message. Also skipped
  // on the Analyze tab because `caseResults` already has solver outcomes for
  // every enabled case and merging two sources would duplicate issues.
  const diagnosticSolve = useMemo<SolverResult | null>(() => {
    if (activeTab === "Analyze") return null
    if (diagnostics.issues.some((i) => i.severity === "error")) return null
    const slice: StructureModel = { ...model, loads: {} }
    return analyze(slice)
  }, [model, diagnostics, activeTab])

  // Merge solver-side singular-DOF errors into the diagnostics report. On the
  // Analyze tab the source is the full `caseResults`; in other tabs the
  // single-shot `diagnosticSolve` covers the same ground for structural
  // validity (singular K shows up in any case since K depends only on
  // geometry + sections, not on loads).
  const mergedReport = useMemo<DiagnosticsReport>(() => {
    const solverResults: SolverResult[] =
      activeTab === "Analyze"
        ? Object.values(caseResults)
        : diagnosticSolve
          ? [diagnosticSolve]
          : []
    if (solverResults.length === 0) return diagnostics
    const extras: DiagnosticIssue[] = []
    const nodeIds = Object.keys(model.nodes)
    const seen = new Set<string>()
    for (const res of solverResults) {
      if (!res.ok && res.singularDof !== undefined) {
        const loc = dofToLocation(res.singularDof, nodeIds)
        const key = `${loc.nodeId}:${loc.direction}`
        if (seen.has(key)) continue
        seen.add(key)
        extras.push({ kind: "singular-at-dof", severity: "error", ...loc })
      }
    }
    if (extras.length === 0) return diagnostics
    return { status: "unstable", issues: [...diagnostics.issues, ...extras] }
  }, [diagnostics, caseResults, diagnosticSolve, activeTab, model.nodes])

  // Analysis-issues dialog: auto-opens once per Analyze-tab entry when the
  // merged report contains any error-severity issue. Closable via the "×".
  // Manually re-openable by clicking the status-bar STATUS label.
  const [issuesDialogOpen, setIssuesDialogOpen] = useState(false)
  const wasOnAnalyzeRef = useRef(false)
  useEffect(() => {
    const onAnalyze = activeTab === "Analyze"
    const entering = onAnalyze && !wasOnAnalyzeRef.current
    wasOnAnalyzeRef.current = onAnalyze
    if (entering && mergedReport.issues.some((i) => i.severity === "error")) {
      setIssuesDialogOpen(true)
    }
  }, [activeTab, mergedReport])

  const handleTabChange = useCallback((tab: TabType) => {
    setActiveTab(tab)
    setActiveTool(tab === "Analyze" ? "REACTION" : null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setSelectedLoadId(null)
    setSelectedLoadIds([])
    setMoveNodeSelectedId(null)
    setHoveredNodeId(null)
    setHoveredMemberId(null)
    setHoveredLoadId(null)
  }, [])

  // Picks the first available section key, or falls back to a known default.
  // Used after loading a new model to ensure activeSection is never stale.
  const firstSectionId = (m: StructureModel): SectionId =>
    Object.keys(m.sections)[0] ?? "iwf150"

  const handleNewFile = useCallback(() => {
    resetIdCounter()
    const m = createEmptyModel()
    setModel(m)
    setActiveSection(firstSectionId(m))
    setActiveTab("Model")
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
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
    resetIdCounter()
    const m = builders[template]()
    setModel(m)
    setActiveSection(firstSectionId(m))
    setActiveTab("Model")
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setSelectedLoadId(null)
  }, [])

  const handleExampleConfirm = useCallback((model: StructureModel, section: Section) => {
    const merged: StructureModel = {
      ...model,
      sections: { ...model.sections, [section.id]: section },
    }
    setModel(merged)
    setActiveSection(section.id)
    setActiveTab("Model")
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setSelectedLoadId(null)
    setShowExamplesModal(false)
  }, [])

  const handleToolSelect = useCallback((tool: ToolType) => {
    setActiveTool(tool)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setSelectedLoadId(null)
    setSelectedLoadIds([])
    setMoveNodeSelectedId(null)
    setHoveredNodeId(null)
    setHoveredMemberId(null)
    setHoveredLoadId(null)
  }, [])

  const handleCloseFlyout = useCallback(() => {
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setSelectedLoadId(null)
    setSelectedLoadIds([])
    setMoveNodeSelectedId(null)
    setHoveredNodeId(null)
    setHoveredMemberId(null)
    setHoveredLoadId(null)
  }, [])

  // Shared by all three template modals (Beam / Frame / Truss).
  // Examples modal uses handleExampleConfirm instead because it also
  // merges the example's section into the model.
  const handleTemplateConfirm = useCallback((m: StructureModel) => {
    setModel(m)
    setActiveSection(firstSectionId(m))
    setActiveTab("Model")
    setActiveTool(null)
    setPendingFrameStart(null)
    setSelection(emptySelection())
    setSelectedLoadId(null)
    setTemplateModal(null)
  }, [])

  const handleMouseMove = useCallback((x: number, y: number) => {
    setCursorX(x)
    setCursorY(y)

    // Mobile: no hover state from pointer movement; click-driven selection is unaffected.
    if (isMobile) {
      setHoveredNodeId(null)
      setHoveredMemberId(null)
      setHoveredLoadId(null)
      return
    }

    const raw = { x, y }

    // Detect hover targets based on active tool
    if (activeTab === "Model" && (activeTool === "DELETE" || activeTool === "SUPPORT" || activeTool === "MOVE_NODE")) {
      // DELETE / SUPPORT / MOVE_NODE all hover nodes; SELECT does NOT (it operates on members + supports only).
      const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
      setHoveredNodeId(nodeId)
      if (!nodeId && activeTool === "DELETE") {
        const memberId = hitTestMember(model, raw, HIT_TOL_MEMBER)
        setHoveredMemberId(memberId)
      }
    } else if (activeTab === "Model" && activeTool === "SELECT") {
      // MODIFY SECTION — members only.
      setHoveredNodeId(null)
      const memberId = hitTestMember(model, raw, HIT_TOL_MEMBER)
      setHoveredMemberId(memberId)
    } else if (activeTab === "Load" && activeTool === "POINT_LOAD") {
      // Placement: hover the candidate node so the user sees what they'll target.
      setHoveredMemberId(null)
      setHoveredLoadId(null)
      const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
      setHoveredNodeId(nodeId)
    } else if (activeTab === "Load" && activeTool === "DISTRIBUTED_LOAD") {
      // Placement: hover the candidate member so the user sees what they'll target.
      setHoveredNodeId(null)
      setHoveredLoadId(null)
      const memberId = hitTestMember(model, raw, HIT_TOL_MEMBER)
      setHoveredMemberId(memberId)
    } else if (activeTab === "Load" && (activeTool === "MODIFY_LOAD" || activeTool === "DELETE" || activeTool === null)) {
      // Hover applies on Modify, Delete, or when no tool is picked in the Load tab.
      setHoveredNodeId(null)
      setHoveredMemberId(null)
      const loads = Object.values(model.loads).filter(
        (l) => loadViewFilter === LOAD_VIEW_ALL || l.loadCaseId === loadViewFilter
      )
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
  }, [activeTab, activeTool, model, isMobile, loadViewFilter])

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
          if (!nodeId) {
            // Click on empty canvas → clear any pending support selection
            if (!isEmptySelection(selection)) setSelection(emptySelection())
            return
          }
          if (model.supports[nodeId]) {
            // Existing support → toggle into selection; Apply commits the change.
            const item: MultiSelection = { nodeIds: [], memberIds: [], supportNodeIds: [nodeId] }
            if (selection.supportNodeIds.includes(nodeId)) handleDeselectItems(item)
            else handleSelectItems(item)
            return
          }
          // Bare node, type = "none" → no-op (nothing to remove or assign)
          if (activeSupportType === "none") return
          // Bare node → immediate assignment (fast path)
          setModel((m) => ({
            ...m,
            supports: { ...m.supports, [nodeId]: { nodeId, type: activeSupportType } },
          }))
          return
        }

        if (activeTool === "MOVE_NODE" && moveNodeModeRef.current === "coordinates") {
          const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
          if (nodeId) setMoveNodeSelectedId(nodeId)
          else setMoveNodeSelectedId(null)
          return
        }
      }

      if (activeTab === "Load" && activeTool) {
        if (activeTool === "POINT_LOAD") {
          const nodeId = hitTestNode(model, raw, HIT_TOL_NODE)
          if (!nodeId) return
          const existingLoad = Object.values(model.loads).find(
            (l) => l.type === "point" && l.nodeId === nodeId && l.loadCaseId === activeLoadCaseId
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
              [id]: { id, type: "point" as const, nodeId, loadCaseId: activeLoadCaseId, fx, fy },
            },
          }))
          return
        }

        if (activeTool === "DISTRIBUTED_LOAD") {
          const memberId = hitTestMember(model, raw, HIT_TOL_MEMBER)
          if (!memberId) return
          const existing = Object.values(model.loads).find(
            (l) => l.type === "distributed" && l.memberId === memberId && l.loadCaseId === activeLoadCaseId
          )
          const id = existing?.id ?? newLoadId()

          if (activeDistMode === "local-axis") {
            const wEnd = activeDistType === "uniform" ? activeDistWStart : activeDistWEnd
            setModel((m) => ({
              ...m,
              loads: {
                ...m.loads,
                [id]: { id, type: "distributed" as const, memberId, loadCaseId: activeLoadCaseId, mode: "local-axis", wStart: activeDistWStart, wEnd },
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
                  [id]: { id, type: "distributed" as const, memberId, loadCaseId: activeLoadCaseId, mode: "global-axis", wxStart: activeDistWxStart, wxEnd, wyStart: 0, wyEnd: 0 },
                },
              }))
            } else {
              const wyEnd = activeDistType === "uniform" ? activeDistWyStart : activeDistWyEnd
              setModel((m) => ({
                ...m,
                loads: {
                  ...m.loads,
                  [id]: { id, type: "distributed" as const, memberId, loadCaseId: activeLoadCaseId, mode: "global-axis", wxStart: 0, wxEnd: 0, wyStart: activeDistWyStart, wyEnd },
                },
              }))
            }
          }
          return
        }

        if (activeTool === "MODIFY_LOAD" || (activeTab === "Load" && activeTool === "DELETE")) {
          const loads = Object.values(model.loads).filter(
            (l) => loadViewFilter === LOAD_VIEW_ALL || l.loadCaseId === loadViewFilter
          )
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
      activeLoadCaseId,
      model, pendingFrameStart, ensureNodeAt, unitSettings.gridSpacing, snapToGrid, snapToNode,
      loadViewFilter,
    ]
  )

  const handleMoveNode = useCallback((nodeId: NodeId, x: number, y: number) => {
    setModel((m) => ({
      ...m,
      nodes: { ...m.nodes, [nodeId]: { ...m.nodes[nodeId], x, y } },
    }))
  }, [])

  const handleDragNodeStart = useCallback((nodeId: NodeId) => setDraggingNodeId(nodeId), [])
  const handleDragNodeEnd = useCallback(() => setDraggingNodeId(null), [])

  const handleMoveNodeModeChange = useCallback((mode: "coordinates" | "screen") => {
    setMoveNodeMode(mode)
    if (mode === "screen") setMoveNodeSelectedId(null)
  }, [])

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
    setSelectedLoadId(null)
    setSelectedLoadIds([])
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

  const handleApplySupportSelection = useCallback((type: SupportPick) => {
    if (selection.supportNodeIds.length === 0 && selection.nodeIds.length === 0) return
    setModel((m) => {
      const supports = { ...m.supports }
      if (type === "none") {
        // Remove supports from any selected support nodes; bare nodes are ignored.
        for (const nodeId of selection.supportNodeIds) {
          delete supports[nodeId]
        }
      } else {
        for (const nodeId of selection.supportNodeIds) {
          if (supports[nodeId]) supports[nodeId] = { ...supports[nodeId], type }
        }
        for (const nodeId of selection.nodeIds) {
          supports[nodeId] = { nodeId, type }
        }
      }
      return { ...m, supports }
    })
    setSelection(emptySelection())
  }, [selection.supportNodeIds, selection.nodeIds])

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
          {activeTab === "Load" && (
            <LoadViewSelector
              loadCases={loadCases}
              loads={model.loads}
              value={loadViewFilter}
              onChange={setLoadViewFilter}
              disabled={isPlacingLoad}
            />
          )}
          {activeTab === "Analyze" && (
            <AnalyzeViewSelector
              combinationsEnabled={combinationsEnabled}
              loadCases={loadCases}
              combinations={combinations}
              analyzeViewMode={analyzeViewMode}
              onAnalyzeViewModeChange={setAnalyzeViewMode}
              selectedCaseId={selectedCaseId}
              onSelectedCaseIdChange={setSelectedCaseId}
              selectedCombinationId={selectedCombinationId}
              onSelectedCombinationIdChange={setSelectedCombinationId}
              envelopeComboIds={envelopeComboIds}
              onEnvelopeComboIdsChange={setEnvelopeComboIds}
            />
          )}
          <FlyoutPanel
            activeTab={activeTab}
            activeTool={activeTool}
            onClose={handleCloseFlyout}
            onToolSelect={handleToolSelect}
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
            onApplySupportSelection={handleApplySupportSelection}
            hoveredNodeId={hoveredNodeId}
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
            analysisResult={displayedResult}
            moveNodeMode={moveNodeMode}
            onMoveNodeModeChange={handleMoveNodeModeChange}
            moveNodeCoordMode={moveNodeCoordMode}
            onMoveNodeCoordModeChange={setMoveNodeCoordMode}
            moveNodeSelectedId={moveNodeSelectedId}
            onMoveNodeSelectId={setMoveNodeSelectedId}
            onMoveNode={handleMoveNode}
            loadCases={loadCases}
            activeLoadCaseId={activeLoadCaseId}
            onActiveLoadCaseChange={setActiveLoadCaseId}
            onReassignLoadCase={handleReassignLoadCase}
            onAddLoadCase={handleAddLoadCase}
            onDeleteLoadCase={handleDeleteLoadCase}
            onPatchLoadCase={handlePatchLoadCase}
            combinations={combinations}
            combinationsEnabled={combinationsEnabled}
            onCombinationsEnabledChange={setCombinationsEnabled}
            combinationMode={combinationMode}
            onCombinationModeChange={setCombinationMode}
            selectedCodePreset={selectedCodePreset}
            onSelectedCodePresetChange={setSelectedCodePreset}
            onAddCombination={handleAddCombination}
            onDeleteCombination={handleDeleteCombination}
            onPatchCombination={handlePatchCombination}
            onGenerateCodeCombinations={handleGenerateCodeCombinations}
            editingCombinationId={editingCombinationId}
            onEditingCombinationIdChange={setEditingCombinationId}
            zeroGammaSectionIds={zeroGammaSectionIds}
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
            forceUnit={unitSettings.force}
            adaptiveView={adaptiveView}
            onMouseMove={handleMouseMove}
            onCanvasClick={handleCanvasClick}
            onSelectItems={handleSelectItems}
            onDeselectItems={handleDeselectItems}
            onClearSelection={handleClearSelection}
            onSelectLoadIds={handleSelectLoadIds}
            selectedLoadId={selectedLoadId}
            selectedLoadIds={selectedLoadIds}
            analysisResult={displayedResult}
            diagramScale={diagramScale}
            invertSFD={invertSFD}
            invertBMD={invertBMD}
            deformationScale={deformationScale}
            showSectionLabels={showSectionLabels}
            showNodeIds={showNodeIds}
            showMemberIds={showMemberIds}
            showLocalAxes={showLocalAxes}
            hoveredNodeId={hoveredNodeId}
            hoveredMemberId={hoveredMemberId}
            hoveredLoadId={hoveredLoadId}
            activeSupportType={activeSupportType}
            loadCases={loadCases}
            loadViewFilter={loadViewFilter === LOAD_VIEW_ALL ? null : loadViewFilter}
            moveNodeMode={moveNodeMode}
            moveNodeSelectedId={moveNodeSelectedId}
            draggingNodeId={draggingNodeId}
            onMoveNode={handleMoveNode}
            onDragNodeStart={handleDragNodeStart}
            onDragNodeEnd={handleDragNodeEnd}
          />
        </main>
      </div>

      {/* Template modals */}
      {templateModal === "beam" && (
        <BeamTemplateModal
          onConfirm={handleTemplateConfirm}
          onClose={() => setTemplateModal(null)}
        />
      )}
      {templateModal === "frame" && (
        <FrameTemplateModal
          onConfirm={handleTemplateConfirm}
          onClose={() => setTemplateModal(null)}
        />
      )}
      {templateModal === "truss" && (
        <TrussTemplateModal
          onConfirm={handleTemplateConfirm}
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
        status={mergedReport.status}
        onStatusClick={() => setIssuesDialogOpen(true)}
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
        shearDeformation={shearDeformation}
        onShearDeformationChange={setShearDeformation}
        onUnitSettingsChange={setUnitSettings}
        onToggleDimensions={() => setShowDimensions(!showDimensions)}
        showSectionLabels={showSectionLabels}
        onToggleSectionLabels={() => setShowSectionLabels(!showSectionLabels)}
        showNodeIds={showNodeIds}
        onToggleNodeIds={() => setShowNodeIds(!showNodeIds)}
        showMemberIds={showMemberIds}
        onToggleMemberIds={() => setShowMemberIds(!showMemberIds)}
        showLocalAxes={showLocalAxes}
        onToggleLocalAxes={() => setShowLocalAxes(!showLocalAxes)}
      />

      <AnalysisIssuesDialog
        open={issuesDialogOpen}
        onClose={() => setIssuesDialogOpen(false)}
        report={mergedReport}
      />
    </div>
  )
}
import { useEffect, useMemo, useRef, useCallback, useState } from "react"
import { ZoomIn, ZoomOut, Undo2, Redo2 } from "lucide-react"
import type { TabType, ToolType } from "@/components/tool-sidebar"
import type { NodeId, MultiSelection, StructureModel, LoadId } from "@/lib/model"
import { caseShortLabel, compareKindPriority, type LoadCaseKind } from "@/lib/load-cases"
import type { AnalysisResult } from "@/lib/solver"
import { memberInternalForces } from "@/lib/solver"
import { isEmptySelection } from "@/lib/model"
import {
  Rect,
  ScreenPoint,
  WorldPoint,
  axisCenter,
  hitTestMember,
  hitTestNode,
  screenToWorld,
  snapWorld,
  worldToScreen,
} from "@/lib/geometry"
import { drawNodeIdTag, drawMemberIdTag } from "@/canvas/id-tags"
import { drawSupportGlyph, hitTestSupportGlyph } from "@/canvas/support-glyph"
import {
  computeBoxSelection,
  computeBoxSelectionWithNodes,
  computeBoxSelectionLoads,
  computeBoxSelectionSupportTool,
  computeBoxSelectionNodesOnly,
  directionFromBox,
  type BoxDirection,
} from "@/canvas/box-selection"
import { local2World, splitByZeroCrossings } from "@/lib/diagram-utils"
import {
  SCALE,
  COLOR_BRAND,
  COLOR_HOVER_GENERIC,
  COLOR_SELECT_GENERIC,
  COLOR_HOVER_DELETE,
  COLOR_SELECT_DELETE,
  COLOR_FILL_HOVER_GEN,
  COLOR_FILL_SELECT_GEN,
  COLOR_FILL_HOVER_DEL,
  COLOR_FILL_SELECT_DEL,
  COLOR_PREVIEW_NODE,
  COLOR_GRID,
  COLOR_AXIS_X,
  COLOR_AXIS_Y,
  COLOR_MEMBER_LABEL,
  COLOR_DIM_LINE,
  COLOR_DIM_TEXT,
  COLOR_CANVAS_BG,
  COLOR_LOAD_FILL,
  COLOR_LOAD_STROKE,
  COLOR_LOAD_STACK_STROKE,
  LOAD_PT_ARROW_LEN_PX,
  LOAD_PT_ARROWHEAD_SIZE_PX,
  LOAD_PT_LINE_WIDTH_PX,
  LOAD_DIST_MAX_ARROW_PX,
  LOAD_DIST_ARROWHEAD_SIZE_PX,
  LOAD_DIST_LINE_WIDTH_PX,
  LOAD_DIST_NUM_ARROWS,
  LOAD_DIST_FILL_ALPHA,
  LOAD_DIST_LABEL_GAP_PX,
  COLOR_LOAD_LABEL,
  COLOR_SFD_POS,
  COLOR_SFD_NEG,
  COLOR_DIAGRAM_STROKE,
  DIAGRAM_LINE_WIDTH,
  DIAGRAM_LABEL_FONT,
  NODE_RADIUS,
  GIZMO_AXIS_LENGTH,
  GIZMO_ARROW_SIZE,
  DIM_OFFSET_CELLS,
  DRAG_THRESHOLD_PX,
  HIT_TOL_NODE,
  HIT_TOL_MEMBER,
  formatValue,
} from "@/lib/constants"

// Resolves the hover/selection palette for the active tool.
// - "generic" (yellow) for MODIFY/MOVE/MODIFY_LOAD style tools
// - "delete"  (red)    for the DELETE tool in either tab
// - "none"             for placement/preview tools (no hover or select tint)
type InteractionKind = "generic" | "delete" | "none"

function interactionKind(activeTab: TabType, activeTool: ToolType): InteractionKind {
  if (activeTool === "DELETE") return "delete"
  if (activeTab === "Model" && (activeTool === "SELECT" || activeTool === "MOVE_NODE" || activeTool === "SUPPORT")) return "generic"
  if (activeTab === "Load"  && (activeTool === "MODIFY_LOAD" || activeTool === "POINT_LOAD" || activeTool === "DISTRIBUTED_LOAD")) return "generic"
  return "none"
}

type DrawState = "hover" | "selected" | "normal"

function strokeFor(kind: InteractionKind, state: DrawState, base: string): string {
  if (state === "normal" || kind === "none") return base
  if (kind === "delete")  return state === "hover" ? COLOR_HOVER_DELETE  : COLOR_SELECT_DELETE
  return state === "hover" ? COLOR_HOVER_GENERIC : COLOR_SELECT_GENERIC
}

function fillFor(kind: InteractionKind, state: DrawState, base: string): string {
  if (state === "normal" || kind === "none") return base
  if (kind === "delete")  return state === "hover" ? COLOR_FILL_HOVER_DEL : COLOR_FILL_SELECT_DEL
  return state === "hover" ? COLOR_FILL_HOVER_GEN : COLOR_FILL_SELECT_GEN
}

// Clamp pan so the viewport never shows outside the ±100 m world bounds.
// When the world is smaller than the viewport in one axis, centre it.
const WORLD_M = 100            // half-world extent in metres
const WORLD_PX = WORLD_M * SCALE  // 8 000 virtual px
const MAX_ZOOM = 3             // maximum zoom-in multiplier

function clampPan(
  px: number, py: number, z: number,
  rect: { width: number; height: number }
): { px: number; py: number } {
  const c        = axisCenter(rect)
  // X axis — world always wider than viewport (minZoom uses max dimension)
  const clampedPx = Math.max(rect.width  - (c.sx + WORLD_PX) * z,
                    Math.min((WORLD_PX - c.sx) * z, px))

  // Y axis
  const clampedPy = Math.max(rect.height - (c.sy + WORLD_PX) * z,
                    Math.min((WORLD_PX - c.sy) * z, py))

  return { px: clampedPx, py: clampedPy }
}

interface StructuralCanvasProps {
  activeTab: TabType
  activeTool: ToolType
  showDimensions: boolean
  model: StructureModel
  selection: MultiSelection
  pendingFrameStart: NodeId | null
  gridSpacing: number
  snapToGrid?: boolean
  snapToNode?: boolean
  lengthUnit?: "m" | "mm"
  forceUnit?: "kN" | "N"
  adaptiveView?: boolean
  onMouseMove: (x: number, y: number) => void
  onCanvasClick?: (worldX: number, worldY: number) => void
  onCanvasMouseDown?: (worldX: number, worldY: number) => void
  onCanvasMouseUp?: (worldX: number, worldY: number) => void
  onSelectItems?: (items: MultiSelection) => void
  onDeselectItems?: (items: MultiSelection) => void
  onClearSelection?: () => void
  onSelectLoadIds?: (loadIds: string[]) => void
  selectedLoadId?: LoadId | null
  selectedLoadIds?: string[]
  analysisResult?: AnalysisResult | null
  diagramScale?: number
  invertSFD?: boolean
  invertBMD?: boolean
  deformationScale?: number
  showSectionLabels?: boolean
  showNodeIds?: boolean
  showMemberIds?: boolean
  showLocalAxes?: boolean
  hoveredNodeId?: NodeId | null
  hoveredMemberId?: string | null
  hoveredLoadId?: LoadId | null
  activeSupportType?: import("@/lib/model").SupportPick
  loadCases?: Record<string, { id: string; name: string; kind: LoadCaseKind }>
  /** When non-null, only loads with this loadCaseId are drawn/hit-tested. */
  loadViewFilter?: string | null

  moveNodeMode?: "coordinates" | "screen"
  moveNodeSelectedId?: NodeId | null
  draggingNodeId?: NodeId | null
  onMoveNode?: (nodeId: NodeId, x: number, y: number) => void
  onDragNodeStart?: (nodeId: NodeId) => void
  onDragNodeEnd?: () => void
  onUndo?: () => void
  onRedo?: () => void
  canUndo?: boolean
  canRedo?: boolean
}

export function StructuralCanvas({
  activeTab,
  activeTool,
  showDimensions,
  model,
  selection,
  pendingFrameStart,
  gridSpacing,
  snapToGrid = true,
  snapToNode = true,
  lengthUnit = "m",
  forceUnit = "kN",
  adaptiveView = true,
  onMouseMove,
  onCanvasClick,
  onCanvasMouseDown,
  onCanvasMouseUp,
  onSelectItems,
  onDeselectItems,
  onClearSelection,
  onSelectLoadIds,
  selectedLoadId,
  selectedLoadIds = [],
  analysisResult,
  diagramScale = 1,
  invertSFD = false,
  invertBMD = false,
  deformationScale = 1,
  showSectionLabels = true,
  showNodeIds = false,
  showMemberIds = false,
  showLocalAxes = false,
  hoveredNodeId,
  hoveredMemberId,
  hoveredLoadId,
  activeSupportType = "pin",
  loadCases,
  loadViewFilter = null,
  moveNodeMode = "coordinates",
  moveNodeSelectedId,
  draggingNodeId,
  onMoveNode,
  onDragNodeStart,
  onDragNodeEnd,
  onUndo,
  onRedo,
  canUndo = false,
  canRedo = false,
}: StructuralCanvasProps) {
  // Display scale for force / moment labels drawn on canvas. Solver stores kN,
  // moment in kN·m; multiply by 1000 when displaying in N or N·m.
  const forceScale = forceUnit === "N" ? 1000 : 1
  const forceLabel = forceUnit
  const momentLabel = `${forceUnit}·m`
  const distLoadLabel = `${forceUnit}/m`
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [snapped, setSnapped] = useState<WorldPoint | null>(null)
  // Cursor position in container-local pixels. Used to position the hover
  // tooltip next to the mouse for loads.
  const [cursorPx, setCursorPx] = useState<{ x: number; y: number } | null>(null)
  const [deformHoverNodeId, setDeformHoverNodeId] = useState<string | null>(null)
  const boxStartRef = useRef<ScreenPoint | null>(null)
  const hasDraggedRef = useRef(false)
  const boxPointerIdRef = useRef<number | null>(null)
  const [boxRect, setBoxRect] = useState<{ x1: number; y1: number; x2: number; y2: number } | null>(null)

  // Viewport: pan in CSS pixels, zoom multiplier
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [zoom, setZoom] = useState(1)
  const panStartRef = useRef<{ mx: number; my: number; basePanX: number; basePanY: number } | null>(null)
  const isPanningRef = useRef(false)
  const [isPanning, setIsPanning] = useState(false)
  const dragNodeRef = useRef<{ nodeId: NodeId } | null>(null)

  // Refs for values needed inside the touch useEffect (which has empty deps and uses stale closure)
  const activeToolRef = useRef(activeTool)
  const moveNodeModeRef = useRef(moveNodeMode)
  const modelRef = useRef(model)
  const snapToGridRef = useRef(snapToGrid)
  const snapToNodeRef = useRef(snapToNode)
  const gridSpacingRef = useRef(gridSpacing)
  const onMoveNodeRef = useRef(onMoveNode)
  const onDragNodeStartRef = useRef(onDragNodeStart)
  const onDragNodeEndRef = useRef(onDragNodeEnd)
  useEffect(() => { activeToolRef.current = activeTool }, [activeTool])
  useEffect(() => { moveNodeModeRef.current = moveNodeMode }, [moveNodeMode])
  useEffect(() => { modelRef.current = model }, [model])
  useEffect(() => { snapToGridRef.current = snapToGrid }, [snapToGrid])
  useEffect(() => { snapToNodeRef.current = snapToNode }, [snapToNode])
  useEffect(() => { gridSpacingRef.current = gridSpacing }, [gridSpacing])
  useEffect(() => { onMoveNodeRef.current = onMoveNode }, [onMoveNode])
  useEffect(() => { onDragNodeStartRef.current = onDragNodeStart }, [onDragNodeStart])
  useEffect(() => { onDragNodeEndRef.current = onDragNodeEnd }, [onDragNodeEnd])
  const [minZoom, setMinZoom] = useState(0.1)
  // Refs always hold the committed values — used inside native event listeners (no stale closure)
  const panXRef = useRef(0)
  const panYRef = useRef(0)
  const zoomRef = useRef(1)
  useEffect(() => { panXRef.current = panX }, [panX])
  useEffect(() => { panYRef.current = panY }, [panY])
  useEffect(() => { zoomRef.current = zoom  }, [zoom])

  // Convert a screen pixel position to virtual canvas space (undoes pan+zoom)
  const toVirtual = useCallback((mx: number, my: number) => ({
    vmx: (mx - panX) / zoom,
    vmy: (my - panY) / zoom,
  }), [panX, panY, zoom])

  // Whether the current tool participates in rectangular box-selection.
  const boxSelectionEnabled = useMemo(() => {
    if (activeTool === "SELECT" || activeTool === "DELETE") return true
    if (activeTab === "Model" && (activeTool === "SUPPORT" || activeTool === "MOVE_NODE")) return true
    if (activeTab === "Load" && (activeTool === "MODIFY_LOAD" || activeTool === "POINT_LOAD" || activeTool === "DISTRIBUTED_LOAD")) return true
    return false
  }, [activeTab, activeTool])

  // Live-preview sets: while dragging the box, every component that would be
  // selected on release is tinted with the tool's hover color. Direction is
  // derived from the box rectangle (world-space sign of x2-x1).
  const boxPreview = useMemo(() => {
    const empty = {
      direction: "window" as BoxDirection,
      nodeIds: new Set<string>(),
      memberIds: new Set<string>(),
      supportNodeIds: new Set<string>(),
      loadIds: new Set<string>(),
    }
    if (!boxRect || !boxSelectionEnabled) return empty
    const container = containerRef.current
    if (!container) return empty
    const rect = container.getBoundingClientRect()
    const dims = { width: rect.width, height: rect.height }
    const { vmx: vx1, vmy: vy1 } = toVirtual(boxRect.x1, boxRect.y1)
    const { vmx: vx2, vmy: vy2 } = toVirtual(boxRect.x2, boxRect.y2)
    const w1 = screenToWorld({ sx: vx1, sy: vy1 }, dims)
    const w2 = screenToWorld({ sx: vx2, sy: vy2 }, dims)
    const direction = directionFromBox(w1.x, w2.x)

    let items: { nodeIds: string[]; memberIds: string[]; supportNodeIds: string[] } = {
      nodeIds: [], memberIds: [], supportNodeIds: [],
    }
    const loadIds: string[] = []

    if (activeTool === "SELECT") {
      items = computeBoxSelection(model, w1.x, w1.y, w2.x, w2.y, direction)
    } else if (activeTool === "DELETE" && activeTab === "Model") {
      items = computeBoxSelectionWithNodes(model, w1.x, w1.y, w2.x, w2.y, direction)
    } else if (activeTool === "SUPPORT" && activeTab === "Model") {
      items = computeBoxSelectionSupportTool(model, w1.x, w1.y, w2.x, w2.y)
    } else if (activeTool === "MOVE_NODE" && activeTab === "Model") {
      items.nodeIds = computeBoxSelectionNodesOnly(model, w1.x, w1.y, w2.x, w2.y)
    } else if (activeTab === "Load") {
      const filter =
        activeTool === "POINT_LOAD" ? { type: "point" as const } :
        activeTool === "DISTRIBUTED_LOAD" ? { type: "distributed" as const } :
        {}
      const raw = computeBoxSelectionLoads(model, w1.x, w1.y, w2.x, w2.y, direction, filter)
      for (const id of raw) {
        if (loadViewFilter && model.loads[id]?.loadCaseId !== loadViewFilter) continue
        loadIds.push(id)
      }
    }
    return {
      direction,
      nodeIds: new Set(items.nodeIds),
      memberIds: new Set(items.memberIds),
      supportNodeIds: new Set(items.supportNodeIds),
      loadIds: new Set(loadIds),
    }
  }, [boxRect, boxSelectionEnabled, activeTab, activeTool, model, loadViewFilter, toVirtual])

  const drawGrid = useCallback((ctx: CanvasRenderingContext2D, width: number, height: number) => {
    const pixelGrid = gridSpacing * SCALE
    // Compute visible virtual bounds (canvas transform is already applied)
    const vLeft   = -panX / zoom
    const vTop    = -panY / zoom
    const vRight  = vLeft + width  / zoom
    const vBottom = vTop  + height / zoom
    // Anchor grid to world origin so a line always passes through (0,0).
    const c = axisCenter({ width, height })
    const phaseX = ((c.sx % pixelGrid) + pixelGrid) % pixelGrid
    const phaseY = ((c.sy % pixelGrid) + pixelGrid) % pixelGrid
    const xStart = Math.floor((vLeft - phaseX) / pixelGrid) * pixelGrid + phaseX
    const yStart = Math.floor((vTop  - phaseY) / pixelGrid) * pixelGrid + phaseY
    ctx.strokeStyle = COLOR_GRID
    ctx.lineWidth = 0.5 / zoom   // keep at ~0.5 screen px regardless of zoom
    for (let x = xStart; x <= vRight + pixelGrid; x += pixelGrid) {
      ctx.beginPath(); ctx.moveTo(x, vTop); ctx.lineTo(x, vBottom); ctx.stroke()
    }
    for (let y = yStart; y <= vBottom + pixelGrid; y += pixelGrid) {
      ctx.beginPath(); ctx.moveTo(vLeft, y); ctx.lineTo(vRight, y); ctx.stroke()
    }
  }, [gridSpacing, panX, panY, zoom])

  const drawGizmo = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      const { sx, sy } = axisCenter(rect)
      const s = adaptiveView ? 1 / zoom : 1
      const axLen = GIZMO_AXIS_LENGTH * s
      const arrowSz = GIZMO_ARROW_SIZE * s

      ctx.strokeStyle = COLOR_AXIS_X
      ctx.lineWidth = 2 * s
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx + axLen, sy)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(sx + axLen, sy)
      ctx.lineTo(sx + axLen - arrowSz, sy - arrowSz / 2)
      ctx.lineTo(sx + axLen - arrowSz, sy + arrowSz / 2)
      ctx.closePath()
      ctx.fillStyle = COLOR_AXIS_X
      ctx.fill()
      ctx.font = `bold ${12 * s}px 'Inter', sans-serif`
      ctx.fillStyle = COLOR_AXIS_X
      ctx.textAlign = "center"
      ctx.textBaseline = "top"
      ctx.fillText("X", sx + axLen + 8 * s, sy - 5 * s)

      ctx.strokeStyle = COLOR_AXIS_Y
      ctx.lineWidth = 2 * s
      ctx.beginPath()
      ctx.moveTo(sx, sy)
      ctx.lineTo(sx, sy - axLen)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(sx, sy - axLen)
      ctx.lineTo(sx - arrowSz / 2, sy - axLen + arrowSz)
      ctx.lineTo(sx + arrowSz / 2, sy - axLen + arrowSz)
      ctx.closePath()
      ctx.fillStyle = COLOR_AXIS_Y
      ctx.fill()
      ctx.fillStyle = COLOR_AXIS_Y
      ctx.textAlign = "right"
      ctx.textBaseline = "middle"
      ctx.fillText("Y", sx - 8 * s, sy - axLen - 2 * s)
    },
    [adaptiveView, zoom]
  )

  const drawMembers = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      const s = adaptiveView ? 1 / zoom : 1
      ctx.lineCap = "round"
      ctx.lineJoin = "round"
      for (const m of Object.values(model.members)) {
        const a = model.nodes[m.a]
        const b = model.nodes[m.b]
        if (!a || !b) continue
        const pa = worldToScreen(a, rect)
        const pb = worldToScreen(b, rect)
        const kind = interactionKind(activeTab, activeTool)
        // Members are eligible for hover under Model SELECT/DELETE and Load DISTRIBUTED_LOAD,
        // and selected under Model SELECT/DELETE.
        const selectionEligible = activeTab === "Model" && (activeTool === "SELECT" || activeTool === "DELETE")
        const hoverEligible = selectionEligible || activeTool === "DISTRIBUTED_LOAD"
        const selected = selectionEligible && selection.memberIds.includes(m.id)
        const inBoxPreview = boxPreview.memberIds.has(m.id)
        const isHovered = !selected && (
          (hoverEligible && m.id === hoveredMemberId) ||
          (inBoxPreview && (selectionEligible || activeTool === "DISTRIBUTED_LOAD"))
        )
        const isTruss = m.memberType === "truss"
        const state: DrawState = selected ? "selected" : isHovered ? "hover" : "normal"
        ctx.strokeStyle = strokeFor(kind, state, COLOR_BRAND)
        ctx.lineWidth = (selected ? 5 : 4) * s
        ctx.beginPath()
        ctx.moveTo(pa.sx, pa.sy)
        ctx.lineTo(pb.sx, pb.sy)
        ctx.stroke()

        // Hinge indicators: small white circles inset from each end of truss members.
        // Offset inward along the member axis so they clear the node circles.
        if (isTruss) {
          const r    = 3.5 * s
          const dx   = pb.sx - pa.sx
          const dy   = pb.sy - pa.sy
          const len  = Math.hypot(dx, dy)
          if (len > 1e-3) {
            const ux   = dx / len          // unit vector a → b (screen)
            const uy   = dy / len
            // Place the hinge-dot centre just past the node circle edge:
            // offset = NODE_RADIUS + r + 2 px gap
            const off  = (NODE_RADIUS + 3.5 + 2) * s   // ≈ 11.5 px base
            const pts  = [
              { sx: pa.sx + ux * off, sy: pa.sy + uy * off },  // near node A
              { sx: pb.sx - ux * off, sy: pb.sy - uy * off },  // near node B
            ]
            for (const p of pts) {
              ctx.beginPath()
              ctx.arc(p.sx, p.sy, r, 0, Math.PI * 2)
              ctx.fillStyle = "#ffffff"
              ctx.fill()
              ctx.strokeStyle = selected ? strokeFor(kind, "selected", COLOR_BRAND) : COLOR_BRAND
              ctx.lineWidth = (selected ? 2 : 1.5) * s
              ctx.stroke()
            }
          }
        }

        const section = model.sections[m.section]
        if (section && showSectionLabels) {
          const midX = (pa.sx + pb.sx) / 2
          const midY = (pa.sy + pb.sy) / 2
          let angle = Math.atan2(pb.sy - pa.sy, pb.sx - pa.sx)
          if (angle > Math.PI / 2) angle -= Math.PI
          if (angle < -Math.PI / 2) angle += Math.PI

          ctx.save()
          ctx.translate(midX, midY)
          ctx.rotate(angle)
          ctx.font = `bold ${11 * s}px 'JetBrains Mono', monospace`
          ctx.fillStyle = COLOR_MEMBER_LABEL
          ctx.textAlign = "center"
          ctx.textBaseline = "bottom"
          ctx.fillText(section.name, 0, -8 * s)
          ctx.restore()
        }
      }
    },
    [model, selection, activeTab, activeTool, hoveredMemberId, showSectionLabels, adaptiveView, zoom, boxPreview]
  )

  const drawNodes = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      const s = adaptiveView ? 1 / zoom : 1
      const kind = interactionKind(activeTab, activeTool)
      for (const n of Object.values(model.nodes)) {
        const p = worldToScreen(n, rect)
        // Nodes are eligible for hover under Model DELETE/MOVE_NODE/SUPPORT and Load POINT_LOAD,
        // and selected under Model DELETE (and MOVE_NODE's target).
        const isDelete = activeTab === "Model" && activeTool === "DELETE"
        const isMove   = activeTab === "Model" && activeTool === "MOVE_NODE"
        const isSupport   = activeTab === "Model" && activeTool === "SUPPORT"
        const isPointLoad = activeTab === "Load"  && activeTool === "POINT_LOAD"
        const supportNodeSelected = isSupport && (
          selection.nodeIds.includes(n.id) || selection.supportNodeIds.includes(n.id)
        )
        const selected = (isDelete && selection.nodeIds.includes(n.id)) || supportNodeSelected
        const isMoveTarget = isMove && (
          moveNodeMode === "screen" ? n.id === draggingNodeId : n.id === moveNodeSelectedId
        )
        const isMoveHover  = isMove && !isMoveTarget && n.id === hoveredNodeId
        const isDelHover   = isDelete && !selected && n.id === hoveredNodeId
        const isPlacementHover = (isSupport || isPointLoad) && !selected && n.id === hoveredNodeId
        const inBoxPreview = boxPreview.nodeIds.has(n.id) && (isDelete || isMove || isSupport)
        let state: DrawState = "normal"
        if (selected || isMoveTarget) state = "selected"
        else if (isMoveHover || isDelHover || isPlacementHover || inBoxPreview) state = "hover"
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, NODE_RADIUS * s, 0, Math.PI * 2)
        ctx.fillStyle = fillFor(kind, state, "#ffffff")
        ctx.fill()
        ctx.strokeStyle = strokeFor(kind, state, COLOR_BRAND)
        ctx.lineWidth = (state === "selected" ? 3 : 2) * s
        ctx.stroke()
      }
    },
    [model, selection, activeTab, activeTool, hoveredNodeId, draggingNodeId, moveNodeMode, moveNodeSelectedId, adaptiveView, zoom, boxPreview]
  )

  const drawSupports = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      const sc = adaptiveView ? 1 / zoom : 1
      const kind = interactionKind(activeTab, activeTool)
      for (const s of Object.values(model.supports)) {
        const n = model.nodes[s.nodeId]
        if (!n) continue
        const { sx, sy } = worldToScreen(n, rect)
        // Supports are eligible for: Model SUPPORT (hover+select), Model DELETE (hover+select),
        // and Model MOVE_NODE (mirror the node's hover/selection state).
        const isSupportTool = activeTab === "Model" && activeTool === "SUPPORT"
        const isDeleteTool = activeTab === "Model" && activeTool === "DELETE"
        const isMoveTool   = activeTab === "Model" && activeTool === "MOVE_NODE"
        const moveSelected = isMoveTool && (
          moveNodeMode === "screen" ? s.nodeId === draggingNodeId : s.nodeId === moveNodeSelectedId
        )
        const selectionTouched = (isSupportTool || isDeleteTool) && selection.supportNodeIds.includes(s.nodeId)
        const isSelected = selectionTouched || moveSelected
        const moveHover   = isMoveTool && !moveSelected && s.nodeId === hoveredNodeId
        const otherHover  = (isSupportTool || isDeleteTool) && !isSelected && s.nodeId === hoveredNodeId
        const inBoxPreview = (
          ((isSupportTool || isDeleteTool) && boxPreview.supportNodeIds.has(s.nodeId)) ||
          (isMoveTool && boxPreview.nodeIds.has(s.nodeId))
        )
        let state: DrawState = "normal"
        if (isSelected) state = "selected"
        else if (moveHover || otherHover || inBoxPreview) state = "hover"
        const overrideColor = state === "normal" ? undefined : strokeFor(kind, state, COLOR_BRAND)
        // Pass `selected = false` so the glyph helper does not paint its built-in red;
        // we drive the body color via `overrideColor` for both hover and selected states.
        drawSupportGlyph(ctx, sx, sy, s.type, false, overrideColor, sc)
      }

      // SUPPORT tool: ghost preview on hovered bare nodes (no support yet).
      // Skip when activeSupportType is "none" — there's no glyph to preview.
      if (
        activeTab === "Model" &&
        activeTool === "SUPPORT" &&
        hoveredNodeId &&
        !model.supports[hoveredNodeId] &&
        activeSupportType !== "none"
      ) {
        const ghostType: import("@/lib/model").SupportType = activeSupportType
        const n = model.nodes[hoveredNodeId]
        if (n) {
          const { sx, sy } = worldToScreen(n, rect)
          ctx.save()
          ctx.globalAlpha = 0.45
          drawSupportGlyph(ctx, sx, sy, ghostType, false, COLOR_HOVER_GENERIC, sc)
          ctx.restore()
        }
      }
    },
    [model, selection, activeTab, activeTool, hoveredNodeId, moveNodeMode, moveNodeSelectedId, draggingNodeId, adaptiveView, zoom, activeSupportType, boxPreview]
  )

  const drawPreview = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!snapped) return
      const p = worldToScreen(snapped, rect)

      if (activeTool === "NODE") {
        ctx.save()
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = COLOR_PREVIEW_NODE
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, NODE_RADIUS + 2, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      } else if (activeTool === "MEMBER") {
        const PREVIEW_COLOR = "#3b82f6"
        const PREVIEW_ALPHA = 0.5
        const s = adaptiveView ? 1 / zoom : 1

        if (pendingFrameStart) {
          const a = model.nodes[pendingFrameStart]
          if (a) {
            const pa = worldToScreen(a, rect)

            // Dashed preview line
            ctx.save()
            ctx.globalAlpha = PREVIEW_ALPHA
            ctx.setLineDash([5, 4])
            ctx.strokeStyle = PREVIEW_COLOR
            ctx.lineWidth = 2 * s
            ctx.beginPath()
            ctx.moveTo(pa.sx, pa.sy)
            ctx.lineTo(p.sx, p.sy)
            ctx.stroke()
            ctx.restore()

            // Live member-length dimension
            const worldLen = Math.hypot(snapped.x - a.x, snapped.y - a.y)
            if (worldLen > 1e-4) {
              const dimVal = lengthUnit === "mm" ? worldLen * 1000 : worldLen
              const dimText = `${dimVal.toFixed(lengthUnit === "mm" ? 0 : 3)} ${lengthUnit}`

              const dx = p.sx - pa.sx, dy = p.sy - pa.sy
              const lenPx = Math.hypot(dx, dy)
              const ux = dx / lenPx, uy = dy / lenPx
              const nx = -uy, ny = ux

              const OFF = 22 * s
              const ax = pa.sx + nx * OFF, ay = pa.sy + ny * OFF
              const bx = p.sx  + nx * OFF, by = p.sy  + ny * OFF

              ctx.save()
              ctx.globalAlpha = PREVIEW_ALPHA
              ctx.strokeStyle = PREVIEW_COLOR
              ctx.fillStyle = PREVIEW_COLOR
              ctx.lineWidth = 1 * s
              ctx.setLineDash([])

              // Extension ticks
              const TICK = 6 * s
              ctx.beginPath()
              ctx.moveTo(pa.sx + nx * (OFF - TICK), pa.sy + ny * (OFF - TICK))
              ctx.lineTo(pa.sx + nx * (OFF + TICK), pa.sy + ny * (OFF + TICK))
              ctx.moveTo(p.sx  + nx * (OFF - TICK), p.sy  + ny * (OFF - TICK))
              ctx.lineTo(p.sx  + nx * (OFF + TICK), p.sy  + ny * (OFF + TICK))
              ctx.stroke()

              // Dimension line
              ctx.beginPath()
              ctx.moveTo(ax, ay)
              ctx.lineTo(bx, by)
              ctx.stroke()

              // Arrowheads
              const ARROW = 5 * s
              const drawHead = (tx: number, ty: number, dirX: number, dirY: number) => {
                ctx.beginPath()
                ctx.moveTo(tx, ty)
                ctx.lineTo(tx + dirX * ARROW - ny * ARROW * 0.4, ty + dirY * ARROW - nx * ARROW * 0.4)
                ctx.moveTo(tx, ty)
                ctx.lineTo(tx + dirX * ARROW + ny * ARROW * 0.4, ty + dirY * ARROW + nx * ARROW * 0.4)
                ctx.stroke()
              }
              drawHead(ax, ay,  ux,  uy)
              drawHead(bx, by, -ux, -uy)

              // Label — knockout then text, both at same alpha
              const midX = (ax + bx) / 2, midY = (ay + by) / 2
              let angle = Math.atan2(dy, dx)
              if (angle > Math.PI / 2)  angle -= Math.PI
              if (angle < -Math.PI / 2) angle += Math.PI

              ctx.font = `600 ${11 * s}px 'JetBrains Mono', monospace`
              const tw = ctx.measureText(dimText).width
              ctx.save()
              ctx.translate(midX, midY)
              ctx.rotate(angle)
              ctx.fillStyle = "#ffffff"
              ctx.fillRect(-tw / 2 - 3 * s, -(8 * s) - 2 * s, tw + 6 * s, 11 * s + 4 * s)
              ctx.fillStyle = PREVIEW_COLOR
              ctx.textAlign = "center"
              ctx.textBaseline = "bottom"
              ctx.fillText(dimText, 0, -2 * s)
              ctx.restore()

              ctx.restore()
            }
          }
        }

        // Ghost node circle at cursor
        ctx.save()
        ctx.globalAlpha = PREVIEW_ALPHA
        ctx.setLineDash([3, 3])
        ctx.strokeStyle = PREVIEW_COLOR
        ctx.lineWidth = 1.5 * s
        ctx.beginPath()
        ctx.arc(p.sx, p.sy, (NODE_RADIUS + 2) * s, 0, Math.PI * 2)
        ctx.stroke()
        ctx.restore()
      }
    },
    [activeTool, snapped, pendingFrameStart, model.nodes, adaptiveView, zoom, lengthUnit]
  )

  const drawDimensions = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      const ns = Object.values(model.nodes)
      if (ns.length < 2) return

      // Round to 2 dp (0.01 m tolerance) to deduplicate near-identical coords
      const r = (v: number) => Math.round(v * 100) / 100

      // Collect unique X and Y values
      const xSet = new Set<number>()
      const ySet = new Set<number>()
      for (const n of ns) {
        xSet.add(r(n.x))
        ySet.add(r(n.y))
      }
      const uniqueX = Array.from(xSet).sort((a, b) => a - b)
      const uniqueY = Array.from(ySet).sort((a, b) => a - b)

      const minX = uniqueX[0]
      const maxY = uniqueY[uniqueY.length - 1]

      // For each unique X, track the topmost (max world Y) node
      const topYAtX = new Map<number, number>()
      // For each unique Y, track the leftmost (min world X) node
      const leftXAtY = new Map<number, number>()
      for (const n of ns) {
        const rx = r(n.x)
        const ry = r(n.y)
        topYAtX.set(rx, Math.max(topYAtX.get(rx) ?? -Infinity, n.y))
        leftXAtY.set(ry, Math.min(leftXAtY.get(ry) ?? Infinity, n.x))
      }

      // Dimension lines sit DIM_OFFSET_CELLS grid spacings outside the outermost nodes
      const DIM_OFFSET = DIM_OFFSET_CELLS * (gridSpacing * SCALE)
      const dimLineY = worldToScreen({ x: 0, y: maxY }, rect).sy - DIM_OFFSET
      const dimLineX = worldToScreen({ x: minX, y: 0 }, rect).sx - DIM_OFFSET

      const s = adaptiveView ? 1 / zoom : 1
      ctx.save()
      ctx.strokeStyle = COLOR_DIM_LINE
      ctx.lineWidth = 1 * s
      ctx.font = `${12 * s}px 'JetBrains Mono', monospace`
      ctx.fillStyle = COLOR_DIM_TEXT

      // ── Horizontal dimensions (per consecutive unique-X pair) ──────────────
      if (uniqueX.length >= 2) {
        for (let i = 0; i < uniqueX.length - 1; i++) {
          const x1 = uniqueX[i]
          const x2 = uniqueX[i + 1]
          const sx1 = worldToScreen({ x: x1, y: 0 }, rect).sx
          const sx2 = worldToScreen({ x: x2, y: 0 }, rect).sx
          // Extension lines start just above the topmost node at each X
          const extSy1 = worldToScreen({ x: x1, y: topYAtX.get(x1) ?? maxY }, rect).sy - 8 * s
          const extSy2 = worldToScreen({ x: x2, y: topYAtX.get(x2) ?? maxY }, rect).sy - 8 * s

          // Dashed extension lines
          ctx.setLineDash([4 * s, 3 * s])
          ctx.beginPath()
          ctx.moveTo(sx1, extSy1)
          ctx.lineTo(sx1, dimLineY + 5 * s)
          ctx.moveTo(sx2, extSy2)
          ctx.lineTo(sx2, dimLineY + 5 * s)
          // Dimension line
          ctx.moveTo(sx1, dimLineY)
          ctx.lineTo(sx2, dimLineY)
          ctx.stroke()

          // Solid tick marks
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(sx1, dimLineY - 5 * s)
          ctx.lineTo(sx1, dimLineY + 5 * s)
          ctx.moveTo(sx2, dimLineY - 5 * s)
          ctx.lineTo(sx2, dimLineY + 5 * s)
          ctx.stroke()

          // Label
          ctx.textAlign = "center"
          ctx.textBaseline = "bottom"
          const hDist = lengthUnit === "mm" ? (x2 - x1) * 1000 : (x2 - x1)
          const hDecimals = lengthUnit === "mm" ? 0 : 2
          ctx.fillText(`${hDist.toFixed(hDecimals)} ${lengthUnit}`, (sx1 + sx2) / 2, dimLineY - 7 * s)
        }
      }

      // ── Vertical dimensions (per consecutive unique-Y pair) ────────────────
      if (uniqueY.length >= 2) {
        for (let i = 0; i < uniqueY.length - 1; i++) {
          const y1 = uniqueY[i]   // lower world Y  → higher screen Y
          const y2 = uniqueY[i + 1] // higher world Y → lower screen Y
          const sy1 = worldToScreen({ x: 0, y: y1 }, rect).sy
          const sy2 = worldToScreen({ x: 0, y: y2 }, rect).sy
          // Extension lines start just left of the leftmost node at each Y
          const extSx1 = worldToScreen({ x: leftXAtY.get(y1) ?? minX, y: y1 }, rect).sx - 8 * s
          const extSx2 = worldToScreen({ x: leftXAtY.get(y2) ?? minX, y: y2 }, rect).sx - 8 * s

          // Dashed extension lines
          ctx.setLineDash([4 * s, 3 * s])
          ctx.beginPath()
          ctx.moveTo(extSx1, sy1)
          ctx.lineTo(dimLineX + 5 * s, sy1)
          ctx.moveTo(extSx2, sy2)
          ctx.lineTo(dimLineX + 5 * s, sy2)
          // Dimension line
          ctx.moveTo(dimLineX, sy1)
          ctx.lineTo(dimLineX, sy2)
          ctx.stroke()

          // Solid tick marks
          ctx.setLineDash([])
          ctx.beginPath()
          ctx.moveTo(dimLineX - 5 * s, sy1)
          ctx.lineTo(dimLineX + 5 * s, sy1)
          ctx.moveTo(dimLineX - 5 * s, sy2)
          ctx.lineTo(dimLineX + 5 * s, sy2)
          ctx.stroke()

          // Label (rotated 90°)
          ctx.textAlign = "center"
          ctx.textBaseline = "bottom"
          ctx.save()
          ctx.translate(dimLineX - 14 * s, (sy1 + sy2) / 2)
          ctx.rotate(-Math.PI / 2)
          const vDist = lengthUnit === "mm" ? (y2 - y1) * 1000 : (y2 - y1)
          const vDecimals = lengthUnit === "mm" ? 0 : 2
          ctx.fillText(`${vDist.toFixed(vDecimals)} ${lengthUnit}`, 0, 0)
          ctx.restore()
        }
      }

      ctx.restore()
    },
    [model, gridSpacing, adaptiveView, zoom, lengthUnit]
  )

  const drawLoads = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      const s = adaptiveView ? 1 / zoom : 1
      const MAX_ARROW_LEN_PT   = LOAD_PT_ARROW_LEN_PX * s
      const MAX_ARROW_LEN_DIST = LOAD_DIST_MAX_ARROW_PX * s

      // Single global max across all load types so point and distributed loads share the same scale
      const loads = Object.values(model.loads)
      let globalMax = 0
      for (const load of loads) {
        if (load.type === "point") {
          const mag = Math.sqrt(load.fx * load.fx + load.fy * load.fy)
          globalMax = Math.max(globalMax, Math.abs(mag))
        } else if (load.type === "distributed") {
          if (load.mode === "local-axis") {
            globalMax = Math.max(globalMax, Math.abs(load.wStart ?? 0), Math.abs(load.wEnd ?? 0))
          } else {
            // Global-axis mode: include both X and Y components
            globalMax = Math.max(globalMax, Math.abs(load.wxStart ?? 0), Math.abs(load.wxEnd ?? 0), Math.abs(load.wyStart ?? 0), Math.abs(load.wyEnd ?? 0))
          }
        }
      }
      if (globalMax < 1e-9) globalMax = 1

      // Draw filled arrowhead pointing in screen direction (sdx, sdy)
      function drawArrowHead(
        ctx: CanvasRenderingContext2D,
        tx: number,
        ty: number,
        sdx: number,
        sdy: number,
        size: number
      ) {
        const px = -sdy, py = sdx  // perpendicular to arrow direction
        ctx.beginPath()
        ctx.moveTo(tx, ty)
        ctx.lineTo(tx - sdx * size + px * size * 0.5, ty - sdy * size + py * size * 0.5)
        ctx.lineTo(tx - sdx * size - px * size * 0.5, ty - sdy * size - py * size * 0.5)
        ctx.closePath()
        ctx.fill()
      }

      // Compute the "positive" perpendicular unit vector for a member in world space.
      const loadKind = interactionKind(activeTab, activeTool)
      // Loads are eligible for hover/selection only under Load MODIFY_LOAD and Load DELETE.
      const loadEligible = activeTab === "Load" && (activeTool === "MODIFY_LOAD" || activeTool === "DELETE")
      // Box-select previews loads under MODIFY_LOAD/DELETE/POINT_LOAD/DISTRIBUTED_LOAD.
      const loadBoxEligible = activeTab === "Load" && (
        activeTool === "MODIFY_LOAD" || activeTool === "DELETE" ||
        activeTool === "POINT_LOAD" || activeTool === "DISTRIBUTED_LOAD"
      )

      // ── Coincidence pre-pass ───────────────────────────────────────────────
      // Group visible loads by anchor so we can detect when two or more cases
      // share the same node/member. When ≥2 land on one anchor, only the
      // highest-priority case's arrow is drawn (dark-green stroke + bracket
      // label like `[D, L]` enumerating all stacked cases).
      const isLoadVisible = (l: typeof model.loads[string]) => {
        const offCase = !!loadViewFilter && l.loadCaseId !== loadViewFilter
        return !offCase
      }
      const kindOf = (loadCaseId: string): LoadCaseKind | null =>
        loadCases?.[loadCaseId]?.kind ?? null
      const groupPoint = new Map<NodeId, string[]>()
      const groupDist = new Map<string, string[]>()
      for (const l of Object.values(model.loads)) {
        if (!isLoadVisible(l)) continue
        if (l.type === "point") {
          const arr = groupPoint.get(l.nodeId) ?? []
          arr.push(l.id)
          groupPoint.set(l.nodeId, arr)
        } else if (l.type === "distributed") {
          const arr = groupDist.get(l.memberId) ?? []
          arr.push(l.id)
          groupDist.set(l.memberId, arr)
        }
      }
      // For each group of size ≥2: pick the winner id (highest priority by
      // kind) and pre-build the bracket label "[D, L, ...]" (sorted by
      // priority, capped at 4 entries with "+N" overflow).
      const stackWinner = new Map<string, true>()   // loadId → is winner
      const stackSkip   = new Map<string, true>()   // loadId → skip (non-winner in a stack)
      const stackLabel  = new Map<string, string>() // loadId (winner) → bracket label
      const buildBracketLabel = (loadIds: string[]): string => {
        const entries = loadIds
          .map((id) => kindOf(model.loads[id]?.loadCaseId ?? ""))
          .filter((k): k is LoadCaseKind => k !== null)
          .sort(compareKindPriority)
        const shorts = entries.map(caseShortLabel)
        const CAP = 4
        if (shorts.length <= CAP) return `[${shorts.join(", ")}]`
        return `[${shorts.slice(0, CAP).join(", ")}, +${shorts.length - CAP}]`
      }
      const processGroup = (loadIds: string[]) => {
        if (loadIds.length < 2) return
        let winnerId = loadIds[0]
        let winnerKind = kindOf(model.loads[winnerId]?.loadCaseId ?? "")
        for (let i = 1; i < loadIds.length; i++) {
          const id = loadIds[i]
          const k = kindOf(model.loads[id]?.loadCaseId ?? "")
          if (!winnerKind || (k && compareKindPriority(k, winnerKind) < 0)) {
            winnerId = id
            winnerKind = k
          }
        }
        for (const id of loadIds) {
          if (id === winnerId) stackWinner.set(id, true)
          else stackSkip.set(id, true)
        }
        stackLabel.set(winnerId, buildBracketLabel(loadIds))
      }
      for (const ids of groupPoint.values()) processGroup(ids)
      for (const ids of groupDist.values()) processGroup(ids)

      // Paint order (later = on top): distributed-single < distributed-stack
      // < point-single < point-stack. Combined loads win over single loads of
      // the same type; point loads win over distributed regardless.
      const zRank = (l: typeof model.loads[string]): number => {
        const isPoint = l.type === "point"
        const isStack = stackWinner.has(l.id)
        if (isPoint && isStack) return 4
        if (isPoint)            return 3
        if (isStack)            return 2
        return 1
      }
      const orderedLoads = Object.values(model.loads)
        .slice()
        .sort((a, b) => zRank(a) - zRank(b))

      for (const load of orderedLoads) {
        const isOffCase = !!loadViewFilter && load.loadCaseId !== loadViewFilter
        if (isOffCase) continue
        // Non-winning stack participants are entirely skipped (the winner
        // draws a single arrow + bracket label that represents them all).
        if (stackSkip.has(load.id)) continue
        const isStackWinner = stackWinner.has(load.id)
        const stackLabelText = isStackWinner ? stackLabel.get(load.id) ?? null : null
        const isSelected = loadEligible && (load.id === selectedLoadId || selectedLoadIds.includes(load.id))
        const inBoxPreview = loadBoxEligible && boxPreview.loadIds.has(load.id)
        const isHovered  = !isSelected && ((loadEligible && load.id === hoveredLoadId) || inBoxPreview)
        const state: DrawState = isSelected ? "selected" : isHovered ? "hover" : "normal"
        const baseStroke = isStackWinner ? COLOR_LOAD_STACK_STROKE : COLOR_LOAD_STROKE
        const strokeColor = strokeFor(loadKind, state, baseStroke)
        const fillColor   = fillFor  (loadKind, state, COLOR_LOAD_FILL)
        const labelColor  = isStackWinner ? COLOR_LOAD_STACK_STROKE : strokeFor(loadKind, state, COLOR_LOAD_LABEL)

        ctx.save()
        ctx.strokeStyle = strokeColor
        ctx.fillStyle   = fillColor
        ctx.lineWidth   = (load.type === "point" ? LOAD_PT_LINE_WIDTH_PX : LOAD_DIST_LINE_WIDTH_PX) * s

        if (load.type === "point") {
          const node = model.nodes[load.nodeId]
          if (!node) { ctx.restore(); continue }
          const { sx, sy } = worldToScreen(node, rect)
          // Global axis components: fx (rightward), fy (upward)
          // In screen space: Y is flipped (positive down)
          const mag = Math.sqrt(load.fx * load.fx + load.fy * load.fy)
          if (mag < 1e-12) { ctx.restore(); continue }
          const sdx = load.fx / mag
          const sdy = -load.fy / mag  // Flip Y for screen space
          const arrowLenPt = (Math.abs(mag) / globalMax) * MAX_ARROW_LEN_PT
          const bx = sx - sdx * arrowLenPt
          const by = sy - sdy * arrowLenPt
          // Draw shaft
          ctx.beginPath()
          ctx.moveTo(bx, by)
          ctx.lineTo(sx, sy)
          ctx.stroke()
          // Draw arrowhead at node (tip)
          ctx.fillStyle = strokeColor
          drawArrowHead(ctx, sx, sy, sdx, sdy, LOAD_PT_ARROWHEAD_SIZE_PX * s)
          // Label
          ctx.fillStyle = labelColor
          ctx.font = `${11 * s}px 'JetBrains Mono', monospace`
          ctx.textAlign = "center"
          ctx.textBaseline = "bottom"
          const labelX = bx
          const labelY = by - 3
          const ptLabelText = stackLabelText ?? `${formatValue(Math.abs(mag) * forceScale)} ${forceLabel}`
          ctx.fillText(ptLabelText, labelX, labelY)

        } else if (load.type === "distributed") {
          const member = model.members[load.memberId]
          if (!member) { ctx.restore(); continue }
          const A = model.nodes[member.a]
          const B = model.nodes[member.b]
          if (!A || !B) { ctx.restore(); continue }

          const PA = worldToScreen(A, rect)
          const PB = worldToScreen(B, rect)
          const { l2x, l2y } = local2World(A.x, A.y, B.x, B.y)
          // In screen space the positive local-2 is (l2x, -l2y) due to Y-flip
          const snx = l2x, sny = -l2y

          const NUM_ARROWS = LOAD_DIST_NUM_ARROWS
          const mode = load.mode ?? "local-axis"

          // Get member direction for detecting parallel loads
          const memberDx = B.x - A.x
          const memberDy = B.y - A.y
          const memberLen = Math.hypot(memberDx, memberDy)
          const memberDx_norm = memberLen > 0 ? memberDx / memberLen : 0
          const memberDy_norm = memberLen > 0 ? memberDy / memberLen : 0

          // Check if load is parallel
          let isParallelLoad = false
          for (let i = 0; i <= NUM_ARROWS; i++) {
            const t = i / NUM_ARROWS

            if (mode !== "local-axis") {
              const wxStart = load.wxStart ?? 0, wxEnd = load.wxEnd ?? 0
              const wyStart = load.wyStart ?? 0, wyEnd = load.wyEnd ?? 0
              const wx = wxStart + t * (wxEnd - wxStart)
              const wy = wyStart + t * (wyEnd - wyStart)
              const mag = Math.hypot(wx, -wy)
              if (mag > 1e-6) {
                const dirX = wx / mag
                const dirY = -wy / mag
                const dotProd = Math.abs(dirX * memberDx_norm + dirY * memberDy_norm)
                if (dotProd > 0.95) { isParallelLoad = true; break }
              }
            }
          }

          // Declare basePts and tipPts in outer scope (used only for perpendicular loads, but needed in label section)
          const basePts: Array<{ x: number; y: number }> = []
          const tipPts: Array<{ x: number; y: number }> = []

          if (isParallelLoad) {
            // PARALLEL LOAD STYLE: Large arrows offset perpendicular to member
            ctx.strokeStyle = strokeColor
            ctx.fillStyle = fillColor

            for (let i = 0; i <= NUM_ARROWS; i++) {
              const t = i / NUM_ARROWS
              const mx = PA.sx + t * (PB.sx - PA.sx)
              const my = PA.sy + t * (PB.sy - PA.sy)

              let dirX: number, dirY: number, mag: number

              if (mode === "local-axis") {
                const w = (load.wStart ?? 0) + t * ((load.wEnd ?? 0) - (load.wStart ?? 0))
                const sign = w >= 0 ? 1 : -1
                dirX = sign * snx
                dirY = sign * sny
              } else {
                const wxStart = load.wxStart ?? 0, wxEnd = load.wxEnd ?? 0
                const wyStart = load.wyStart ?? 0, wyEnd = load.wyEnd ?? 0
                const wx = wxStart + t * (wxEnd - wxStart)
                const wy = wyStart + t * (wyEnd - wyStart)
                mag = Math.hypot(wx, -wy)
                if (mag < 0.001) continue
                dirX = wx / mag
                dirY = -wy / mag
              }

              // Large fixed offset for parallel loads (3x normal offset)
              const offsetPx = 40 * s
              const bx = mx - dirX * offsetPx
              const by = my - dirY * offsetPx

              // Draw arrow shaft
              ctx.beginPath()
              ctx.moveTo(bx, by)
              ctx.lineTo(mx, my)
              ctx.lineWidth = LOAD_DIST_LINE_WIDTH_PX * s
              ctx.stroke()

              // Draw arrowhead
              const dirLen = Math.hypot(dirX, dirY)
              if (dirLen > 0) {
                ctx.fillStyle = strokeColor
                drawArrowHead(ctx, mx, my, dirX / dirLen, dirY / dirLen, (LOAD_DIST_ARROWHEAD_SIZE_PX + 2) * s)
              }
            }

            // Label at center top of member for parallel loads
            const midX = (PA.sx + PB.sx) / 2
            const midY = (PA.sy + PB.sy) / 2
            const LABEL_OFFSET_Y = 20 * s  // pixels above member center
            let labelText = ""

            if (mode === "local-axis") {
              labelText = (load.wStart ?? 0) === (load.wEnd ?? 0)
                ? `${formatValue(Math.abs(load.wStart ?? 0) * forceScale)} ${distLoadLabel}`
                : `${formatValue(Math.abs(load.wStart ?? 0) * forceScale)}–${formatValue(Math.abs(load.wEnd ?? 0) * forceScale)} ${distLoadLabel}`
            } else {
              const wxStart = load.wxStart ?? 0, wxEnd = load.wxEnd ?? 0
              const wyStart = load.wyStart ?? 0, wyEnd = load.wyEnd ?? 0
              const wxMid = wxStart + 0.5 * (wxEnd - wxStart)
              const wyMid = wyStart + 0.5 * (wyEnd - wyStart)
              const magMid = Math.hypot(wxMid, wyMid)
              if (magMid > 0.001) {
                labelText = wxStart === wxEnd && wyStart === wyEnd
                  ? `${formatValue(magMid * forceScale)} ${distLoadLabel}`
                  : `${formatValue(Math.abs(wxStart) * forceScale)}/${formatValue(Math.abs(wyStart) * forceScale)}–${formatValue(Math.abs(wxEnd) * forceScale)}/${formatValue(Math.abs(wyEnd) * forceScale)} ${distLoadLabel}`
              }
            }

            const finalParallelLabel = stackLabelText ?? labelText
            if (finalParallelLabel) {
              ctx.fillStyle = labelColor
              ctx.font = `${11 * s}px 'JetBrains Mono', monospace`
              ctx.textAlign = "center"
              ctx.textBaseline = "bottom"
              ctx.fillText(finalParallelLabel, midX, midY - LABEL_OFFSET_Y)
            }
          } else {
            // PERPENDICULAR LOAD STYLE: Traditional fill region with arrows

            for (let i = 0; i <= NUM_ARROWS; i++) {
              const t = i / NUM_ARROWS
              let dirX: number, dirY: number, mag: number

              if (mode === "local-axis") {
                const w = (load.wStart ?? 0) + t * ((load.wEnd ?? 0) - (load.wStart ?? 0))
                mag = Math.abs(w)
                const sign = w >= 0 ? 1 : -1
                dirX = sign * snx
                dirY = sign * sny
              } else {
                dirX = 0
                dirY = 0
                const wxStart = load.wxStart ?? 0, wxEnd = load.wxEnd ?? 0
                const wyStart = load.wyStart ?? 0, wyEnd = load.wyEnd ?? 0
                const wx = wxStart + t * (wxEnd - wxStart)
                const wy = wyStart + t * (wyEnd - wyStart)
                mag = Math.hypot(wx, -wy)
                if (mag > 1e-6) {
                  dirX = wx / mag
                  dirY = -wy / mag
                }
              }

              const arrowLen = (mag / globalMax) * MAX_ARROW_LEN_DIST
              const mx = PA.sx + t * (PB.sx - PA.sx)
              const my = PA.sy + t * (PB.sy - PA.sy)
              const bx = mx - dirX * arrowLen
              const by = my - dirY * arrowLen
              basePts.push({ x: bx, y: by })
              tipPts.push({ x: mx, y: my })
            }

            // Draw filled region between member and bases
            ctx.save()
            ctx.globalAlpha = LOAD_DIST_FILL_ALPHA
            ctx.fillStyle = fillColor
            ctx.beginPath()
            ctx.moveTo(tipPts[0].x, tipPts[0].y)
            for (let i = 1; i <= NUM_ARROWS; i++) ctx.lineTo(tipPts[i].x, tipPts[i].y)
            for (let i = NUM_ARROWS; i >= 0; i--) ctx.lineTo(basePts[i].x, basePts[i].y)
            ctx.closePath()
            ctx.fill()
            ctx.restore()

            ctx.strokeStyle = strokeColor
            ctx.fillStyle = fillColor

            // Draw connecting baseline
            ctx.beginPath()
            ctx.moveTo(basePts[0].x, basePts[0].y)
            for (let i = 1; i <= NUM_ARROWS; i++) ctx.lineTo(basePts[i].x, basePts[i].y)
            ctx.stroke()

            // Draw end verticals
            ctx.beginPath()
            ctx.moveTo(basePts[0].x, basePts[0].y)
            ctx.lineTo(tipPts[0].x, tipPts[0].y)
            ctx.moveTo(basePts[NUM_ARROWS].x, basePts[NUM_ARROWS].y)
            ctx.lineTo(tipPts[NUM_ARROWS].x, tipPts[NUM_ARROWS].y)
            ctx.stroke()

            // Draw individual arrows (shaft + head)
            for (let i = 0; i <= NUM_ARROWS; i++) {
              const t = i / NUM_ARROWS
              let sdx: number, sdy: number

              if (mode === "local-axis") {
                const w = (load.wStart ?? 0) + t * ((load.wEnd ?? 0) - (load.wStart ?? 0))
                if (Math.abs(w) < 0.001) continue
                const sign = w >= 0 ? 1 : -1
                sdx = sign * snx
                sdy = sign * sny
              } else {
                const wxStart = load.wxStart ?? 0, wxEnd = load.wxEnd ?? 0
                const wyStart = load.wyStart ?? 0, wyEnd = load.wyEnd ?? 0
                const wx = wxStart + t * (wxEnd - wxStart)
                const wy = wyStart + t * (wyEnd - wyStart)
                const mag = Math.hypot(wx, -wy)
                if (mag < 0.001) continue
                sdx = wx / mag
                sdy = -wy / mag
              }

              // Shaft from base to tip
              ctx.beginPath()
              ctx.moveTo(basePts[i].x, basePts[i].y)
              ctx.lineTo(tipPts[i].x, tipPts[i].y)
              ctx.stroke()
              // Arrowhead at member (tip)
              const dirLen = Math.hypot(sdx, sdy)
              if (dirLen > 0) {
                ctx.fillStyle = strokeColor
                drawArrowHead(ctx, tipPts[i].x, tipPts[i].y, sdx / dirLen, sdy / dirLen, LOAD_DIST_ARROWHEAD_SIZE_PX * s)
              }
            }
          }

          // Label at midpoint (perpendicular loads only; parallel loads are unlabeled)
          if (!isParallelLoad && basePts) {
            const midIdx = Math.floor(NUM_ARROWS / 2)
            const midBase = basePts[midIdx]
            if (mode === "local-axis") {
              const wMid = (load.wStart ?? 0) + 0.5 * ((load.wEnd ?? 0) - (load.wStart ?? 0))
              const signMid = wMid >= 0 ? 1 : -1
              const LABEL_GAP = LOAD_DIST_LABEL_GAP_PX
              const labelX = midBase.x - signMid * snx * LABEL_GAP
              const labelY = midBase.y - signMid * sny * LABEL_GAP
              const magnitudeLabel = (load.wStart ?? 0) === (load.wEnd ?? 0)
                ? `${formatValue(Math.abs(load.wStart ?? 0) * forceScale)} ${distLoadLabel}`
                : `${formatValue(Math.abs(load.wStart ?? 0) * forceScale)}–${formatValue(Math.abs(load.wEnd ?? 0) * forceScale)} ${distLoadLabel}`
              const labelText = stackLabelText ?? magnitudeLabel
              ctx.fillStyle = labelColor
              ctx.font = `${11 * s}px 'JetBrains Mono', monospace`
              ctx.textAlign = "center"
              ctx.textBaseline = "middle"
              ctx.fillText(labelText, labelX, labelY)
            } else {
              const wxStart = load.wxStart ?? 0, wxEnd = load.wxEnd ?? 0
              const wyStart = load.wyStart ?? 0, wyEnd = load.wyEnd ?? 0
              const wxMid = wxStart + 0.5 * (wxEnd - wxStart)
              const wyMid = wyStart + 0.5 * (wyEnd - wyStart)
              const magMid = Math.hypot(wxMid, wyMid)
              if (magMid > 0.001) {
                const dirXMid = wxMid / magMid, dirYMid = wyMid / magMid
                const LABEL_GAP = LOAD_DIST_LABEL_GAP_PX
                const labelX = midBase.x - dirXMid * LABEL_GAP
                const labelY = midBase.y + dirYMid * LABEL_GAP  // flip back for screen
                const magnitudeLabel = wxStart === wxEnd && wyStart === wyEnd
                  ? `${formatValue(magMid * forceScale)} ${distLoadLabel}`
                  : `${formatValue(Math.abs(wxStart) * forceScale)}/${formatValue(Math.abs(wyStart) * forceScale)}–${formatValue(Math.abs(wxEnd) * forceScale)}/${formatValue(Math.abs(wyEnd) * forceScale)} ${distLoadLabel}`
                const labelText = stackLabelText ?? magnitudeLabel
                ctx.fillStyle = labelColor
                ctx.font = `${10 * s}px 'JetBrains Mono', monospace`
                ctx.textAlign = "center"
                ctx.textBaseline = "middle"
                ctx.fillText(labelText, labelX, labelY)
              }
            }
          }
        }

        ctx.restore()
      }
    },
    [model, selectedLoadId, selectedLoadIds, hoveredLoadId, activeTab, activeTool, adaptiveView, zoom, loadViewFilter, loadCases]
  )

  const drawAxialDiagram = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!analysisResult) return
      const s = adaptiveView ? 1 / zoom : 1
      const N_PTS = 60
      // Auto-fit: peak |N| sampled across all members at TARGET_PX (1 grid cell) at scale 1.0×.
      const TARGET_PX = 80
      let peakN = 0
      for (const m of Object.values(model.members)) {
        const ef = analysisResult.memberEndForces[m.id]
        const nA = model.nodes[m.a], nB = model.nodes[m.b]
        if (!ef || !nA || !nB) continue
        const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
        if (L < 1e-9) continue
        for (let i = 0; i <= N_PTS; i++) {
          const { N } = memberInternalForces(ef, (i / N_PTS) * L, L)
          if (Math.abs(N) > peakN) peakN = Math.abs(N)
        }
      }
      // Use HALF of the conventional BASE so the mirrored (±) band reaches TARGET_PX overall.
      const BASE = peakN > 1e-9 ? (TARGET_PX / peakN) * diagramScale * 0.5 : 0

      for (const member of Object.values(model.members)) {
        const ef = analysisResult.memberEndForces[member.id]
        const nA = model.nodes[member.a]
        const nB = model.nodes[member.b]
        if (!ef || !nA || !nB) continue

        const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
        if (L < 1e-9) continue

        const PA = worldToScreen(nA, rect)
        const PB = worldToScreen(nB, rect)
        const { l2x, l2y } = local2World(nA.x, nA.y, nB.x, nB.y)
        const spx = l2x, spy = -l2y


        // Sample N(x) at N_PTS+1 points. Mirrored about the member axis (no side-bias).
        const pts: Array<{ mx: number; my: number; dpx: number; dpy: number; N: number }> = []
        for (let i = 0; i <= N_PTS; i++) {
          const t = i / N_PTS
          const x = t * L
          const { N } = memberInternalForces(ef, x, L)
          const mx = PA.sx + t * (PB.sx - PA.sx)
          const my = PA.sy + t * (PB.sy - PA.sy)
          pts.push({ mx, my, dpx: N * BASE * spx, dpy: N * BASE * spy, N })
        }

        // Find peak |N| for interior label
        let maxN = 0, maxIdx = 0
        pts.forEach((p, i) => { if (Math.abs(p.N) > Math.abs(maxN)) { maxN = p.N; maxIdx = i } })

        ctx.save()

        const segments = splitByZeroCrossings(pts, (p) => p.N)

        // Fill each segment on BOTH sides of the member axis (mirrored).
        for (const seg of segments) {
          if (seg.member.length < 2) continue
          const color = seg.positive ? COLOR_SFD_POS : COLOR_SFD_NEG

          // +side polygon: member edge → +diagram edge
          ctx.beginPath()
          ctx.moveTo(seg.member[0][0], seg.member[0][1])
          for (let i = 1; i < seg.member.length; i++) ctx.lineTo(seg.member[i][0], seg.member[i][1])
          for (let i = seg.diagram.length - 1; i >= 0; i--) ctx.lineTo(seg.diagram[i][0], seg.diagram[i][1])
          ctx.closePath()
          ctx.globalAlpha = 0.35
          ctx.fillStyle = color
          ctx.fill()

          // −side polygon: member edge → mirrored diagram edge (reflected across the axis)
          ctx.beginPath()
          ctx.moveTo(seg.member[0][0], seg.member[0][1])
          for (let i = 1; i < seg.member.length; i++) ctx.lineTo(seg.member[i][0], seg.member[i][1])
          for (let i = seg.diagram.length - 1; i >= 0; i--) {
            const [dx, dy] = seg.diagram[i]
            const [mx, my] = seg.member[i]
            ctx.lineTo(2 * mx - dx, 2 * my - dy)
          }
          ctx.closePath()
          ctx.globalAlpha = 0.35
          ctx.fillStyle = color
          ctx.fill()

          // Outlines on both edges
          ctx.globalAlpha = 1
          ctx.strokeStyle = color
          ctx.lineWidth = DIAGRAM_LINE_WIDTH
          ctx.beginPath()
          ctx.moveTo(seg.diagram[0][0], seg.diagram[0][1])
          for (let i = 1; i < seg.diagram.length; i++) ctx.lineTo(seg.diagram[i][0], seg.diagram[i][1])
          ctx.stroke()
          ctx.beginPath()
          for (let i = 0; i < seg.diagram.length; i++) {
            const [dx, dy] = seg.diagram[i]
            const [mx, my] = seg.member[i]
            const x = 2 * mx - dx, y = 2 * my - dy
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y)
          }
          ctx.stroke()
        }

        // Labels — anchored to the outer edge of the diagram tip on the +side.
        ctx.font = adaptiveView ? `500 ${11 * s}px 'JetBrains Mono', monospace` : DIAGRAM_LABEL_FONT
        ctx.fillStyle = COLOR_DIAGRAM_STROKE
        ctx.globalAlpha = 1

        const Lscr = Math.hypot(PB.sx - PA.sx, PB.sy - PA.sy)
        const alx = Lscr > 0.5 ? (PB.sx - PA.sx) / Lscr : 0
        const aly = Lscr > 0.5 ? (PB.sy - PA.sy) / Lscr : 0

        const labelPt = (p: typeof pts[0], val: number, alongSign = 0) => {
          const PERP_GAP = 5 * s, ALONG_GAP = 16 * s
          const dlen = Math.hypot(p.dpx, p.dpy)
          const ux = dlen > 0.5 ? p.dpx / dlen : spx * (val >= 0 ? 1 : -1)
          const uy = dlen > 0.5 ? p.dpy / dlen : spy * (val >= 0 ? 1 : -1)
          const ox = ux * PERP_GAP + alx * alongSign * ALONG_GAP
          const oy = uy * PERP_GAP + aly * alongSign * ALONG_GAP
          const lx = p.mx + p.dpx + ox
          const ly = p.my + p.dpy + oy
          if (Math.abs(ox) >= Math.abs(oy)) {
            ctx.textAlign = ox > 0 ? "left" : "right"
            ctx.textBaseline = "middle"
          } else {
            ctx.textAlign = "center"
            ctx.textBaseline = oy > 0 ? "top" : "bottom"
          }
          const prefix = val >= 0 ? "+" : ""
          ctx.fillText(`${prefix}${formatValue(val * forceScale)} ${forceLabel}`, lx, ly)
        }

        const p0 = pts[0], pN = pts[pts.length - 1]
        const n1 = ef.N1
        const n2 = ef.N2

        if (member.memberType === "truss") {
          // Truss: N is constant along the member only for purely-joint-loaded
          // cases. Under axial distributed load (e.g. gravity component along a
          // diagonal under selfweight) N varies linearly. When |N1 − N2| is
          // appreciable, render two stacked lines "i = ... kN" / "j = ... kN";
          // otherwise keep the single centered label.
          const VARY_TOL = 0.01  // kN
          const varies = Math.abs(n2 - n1) > VARY_TOL
          const Nref = Math.abs(n1) >= Math.abs(n2) ? n1 : n2  // larger |N| for offset

          if (varies) {
            // Two-line label: anchored at member midpoint, rotated parallel to
            // the member, on the +local-2 side past the (widest) diagram edge.
            const edge = Math.abs(Nref * BASE)
            const PERP_GAP = 10 * s
            const LINE_HEIGHT = 13 * s
            const mxC = (PA.sx + PB.sx) / 2
            const myC = (PA.sy + PB.sy) / 2
            const dist = edge + PERP_GAP
            const lx = mxC + spx * dist
            const ly = myC + spy * dist
            const angle = Math.atan2(PB.sy - PA.sy, PB.sx - PA.sx)
            ctx.save()
            ctx.translate(lx, ly)
            ctx.rotate(angle)
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            const fmt = (v: number) =>
              `${v >= 0 ? "+" : ""}${formatValue(v * forceScale)} ${forceLabel}`
            // Stack perpendicular to the (now-rotated) member axis. After
            // ctx.rotate(angle), the member runs along local +x; "above" the
            // diagram is local −y, so first line goes slightly more negative
            // than the second.
            ctx.fillText(`i = ${fmt(n1)}`, 0, -LINE_HEIGHT / 2)
            ctx.fillText(`j = ${fmt(n2)}`,  0, +LINE_HEIGHT / 2)
            ctx.restore()
          } else if (Math.abs(n1) > 0.01) {
            const edge = Math.abs(n1 * BASE)
            const PERP_GAP = 10 * s
            const mxC = (PA.sx + PB.sx) / 2
            const myC = (PA.sy + PB.sy) / 2
            const dist = edge + PERP_GAP
            const lx = mxC + spx * dist
            const ly = myC + spy * dist
            const angle = Math.atan2(PB.sy - PA.sy, PB.sx - PA.sx)
            ctx.save()
            ctx.translate(lx, ly)
            ctx.rotate(angle)
            ctx.textAlign = "center"
            ctx.textBaseline = "middle"
            const prefix = n1 >= 0 ? "+" : ""
            ctx.fillText(`${prefix}${formatValue(n1 * forceScale)} ${forceLabel}`, 0, 0)
            ctx.restore()
          }
        } else {
          // Frame: keep the existing end-label scheme (varying N along the member).
          if (Math.abs(n1) > 0.01) labelPt(p0, n1, -1)
          if (Math.abs(n2) > 0.01 && Math.abs(n2 - n1) > 0.01) labelPt(pN, n2, +1)
          if (maxIdx > 0 && maxIdx < N_PTS && Math.abs(maxN) > 0.01 &&
              Math.abs(maxN - n1) > 0.01 && Math.abs(maxN - n2) > 0.01) {
            labelPt(pts[maxIdx], maxN, 0)
          }
        }

        ctx.restore()
      }
    },
    [model, analysisResult, diagramScale, adaptiveView, zoom]
  )

  const drawShearDiagram = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!analysisResult) return
      const s = adaptiveView ? 1 / zoom : 1
      const N_PTS = 60
      // Auto-fit: peak |V| sampled across all members renders at TARGET_PX at scale 1.0×
      const TARGET_PX = 80
      let peakV = 0
      for (const m of Object.values(model.members)) {
        const ef = analysisResult.memberEndForces[m.id]
        const nA = model.nodes[m.a], nB = model.nodes[m.b]
        if (!ef || !nA || !nB) continue
        const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
        if (L < 1e-9) continue
        for (let i = 0; i <= N_PTS; i++) {
          const { V } = memberInternalForces(ef, (i / N_PTS) * L, L)
          if (Math.abs(V) > peakV) peakV = Math.abs(V)
        }
      }
      const BASE = peakV > 1e-9 ? (TARGET_PX / peakV) * diagramScale : 0

      for (const member of Object.values(model.members)) {
        const ef = analysisResult.memberEndForces[member.id]
        const nA = model.nodes[member.a]
        const nB = model.nodes[member.b]
        if (!ef || !nA || !nB) continue

        const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
        if (L < 1e-9) continue

        const PA = worldToScreen(nA, rect)
        const PB = worldToScreen(nB, rect)


        const { l2x, l2y } = local2World(nA.x, nA.y, nB.x, nB.y)
        // screen local-2: l2x unchanged, l2y flipped (world Y-up → screen Y-down)
        let spx = l2x, spy = -l2y
        if (invertSFD) { spx = -spx; spy = -spy }

        // Sample V at N_PTS+1 points
        const pts: Array<{ mx: number; my: number; dpx: number; dpy: number; V: number }> = []
        for (let i = 0; i <= N_PTS; i++) {
          const t = i / N_PTS
          const x = t * L
          const { V } = memberInternalForces(ef, x, L)
          const mx = PA.sx + t * (PB.sx - PA.sx)
          const my = PA.sy + t * (PB.sy - PA.sy)
          pts.push({ mx, my, dpx: V * BASE * spx, dpy: V * BASE * spy, V })
        }

        // Find max |V| for label
        let maxV = 0, maxIdx = 0
        pts.forEach((p, i) => { if (Math.abs(p.V) > Math.abs(maxV)) { maxV = p.V; maxIdx = i } })

        // Draw filled segments (split at sign changes) then outline
        ctx.save()

        const segments = splitByZeroCrossings(pts, (p) => p.V)

        // Fill each segment
        for (const seg of segments) {
          if (seg.member.length < 2) continue
          ctx.beginPath()
          ctx.moveTo(seg.member[0][0], seg.member[0][1])
          for (let i = 1; i < seg.member.length; i++) ctx.lineTo(seg.member[i][0], seg.member[i][1])
          for (let i = seg.diagram.length - 1; i >= 0; i--) ctx.lineTo(seg.diagram[i][0], seg.diagram[i][1])
          ctx.closePath()
          ctx.globalAlpha = 0.35
          const posColor = invertSFD ? COLOR_SFD_NEG : COLOR_SFD_POS
          const negColor = invertSFD ? COLOR_SFD_POS : COLOR_SFD_NEG
          ctx.fillStyle = seg.positive ? posColor : negColor
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.strokeStyle = seg.positive ? posColor : negColor
          ctx.lineWidth = DIAGRAM_LINE_WIDTH
          ctx.beginPath()
          ctx.moveTo(seg.diagram[0][0], seg.diagram[0][1])
          for (let i = 1; i < seg.diagram.length; i++) ctx.lineTo(seg.diagram[i][0], seg.diagram[i][1])
          ctx.stroke()
        }

        // Labels — anchored to the outer edge of the diagram tip so text never
        // bleeds back into the filled polygon. End-point labels also get an
        // along-member nudge so they clear the node and sit beside the diagram.
        ctx.font = adaptiveView ? `500 ${11 * s}px 'JetBrains Mono', monospace` : DIAGRAM_LABEL_FONT
        ctx.fillStyle = COLOR_DIAGRAM_STROKE
        ctx.globalAlpha = 1

        // Along-member unit vector in screen space (A → B)
        const Lscr = Math.hypot(PB.sx - PA.sx, PB.sy - PA.sy)
        const alx = Lscr > 0.5 ? (PB.sx - PA.sx) / Lscr : 0
        const aly = Lscr > 0.5 ? (PB.sy - PA.sy) / Lscr : 0

        // alongSign: -1 = toward A (p0), +1 = toward B (pN), 0 = interior peak
        const labelPt = (p: typeof pts[0], val: number, alongSign = 0) => {
          const PERP_GAP = 5 * s, ALONG_GAP = 16 * s
          const dlen = Math.hypot(p.dpx, p.dpy)
          const ux = dlen > 0.5 ? p.dpx / dlen : spx * (val >= 0 ? 1 : -1)
          const uy = dlen > 0.5 ? p.dpy / dlen : spy * (val >= 0 ? 1 : -1)
          // Combined offset: perp gap + along-member nudge for end labels
          // alongSign=-1 → toward A (p0); +1 → toward B (pN)
          const ox = ux * PERP_GAP + alx * alongSign * ALONG_GAP
          const oy = uy * PERP_GAP + aly * alongSign * ALONG_GAP
          const lx = p.mx + p.dpx + ox
          const ly = p.my + p.dpy + oy
          // Anchor to the outer edge based on dominant combined direction
          if (Math.abs(ox) >= Math.abs(oy)) {
            ctx.textAlign = ox > 0 ? "left" : "right"
            ctx.textBaseline = "middle"
          } else {
            ctx.textAlign = "center"
            ctx.textBaseline = oy > 0 ? "top" : "bottom"
          }
          const prefix = val >= 0 ? "+" : ""
          ctx.fillText(`${prefix}${formatValue(val * forceScale)} ${forceLabel}`, lx, ly)
        }

        // Label end points (with invert sign adjustment)
        const sfdSign = invertSFD ? -1 : 1
        const p0 = pts[0], pN = pts[pts.length - 1]
        const v1 = sfdSign * ef.V1
        const v2 = sfdSign * ef.V2
        const maxVDisplay = sfdSign * maxV
        if (Math.abs(v1) > 0.01) labelPt(p0, v1, -1)
        if (Math.abs(v2) > 0.01 && Math.abs(v2 - v1) > 0.01) labelPt(pN, v2, +1)
        // Label max if different from ends
        if (maxIdx > 0 && maxIdx < N_PTS && Math.abs(maxVDisplay) > 0.01) {
          labelPt(pts[maxIdx], maxVDisplay, 0)
        }

        ctx.restore()
      }
    },
    [model, analysisResult, diagramScale, invertSFD, adaptiveView, zoom]
  )

  const drawMomentDiagram = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!analysisResult) return
      const s = adaptiveView ? 1 / zoom : 1
      const N_PTS = 60
      // Auto-fit: peak |M| sampled across all members renders at TARGET_PX at scale 1.0×
      const TARGET_PX = 80
      let peakM_all = 0
      for (const m of Object.values(model.members)) {
        const ef = analysisResult.memberEndForces[m.id]
        const nA = model.nodes[m.a], nB = model.nodes[m.b]
        if (!ef || !nA || !nB) continue
        const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
        if (L < 1e-9) continue
        for (let i = 0; i <= N_PTS; i++) {
          const { M } = memberInternalForces(ef, (i / N_PTS) * L, L)
          if (Math.abs(M) > peakM_all) peakM_all = Math.abs(M)
        }
      }
      const BASE = peakM_all > 1e-9 ? (TARGET_PX / peakM_all) * diagramScale : 0

      for (const member of Object.values(model.members)) {
        const ef = analysisResult.memberEndForces[member.id]
        const nA = model.nodes[member.a]
        const nB = model.nodes[member.b]
        if (!ef || !nA || !nB) continue

        const L = Math.hypot(nB.x - nA.x, nB.y - nA.y)
        if (L < 1e-9) continue

        const PA = worldToScreen(nA, rect)
        const PB = worldToScreen(nB, rect)


        const { l2x, l2y } = local2World(nA.x, nA.y, nB.x, nB.y)
        let spx = l2x, spy = -l2y
        if (invertBMD) { spx = -spx; spy = -spy }

        // Positive M (sagging) draws on −local-2 side (tension fiber).
        // offset = -M * BASE * (spx, spy)  → positive M goes in -local-2 direction
        const pts: Array<{ mx: number; my: number; dpx: number; dpy: number; M: number }> = []
        for (let i = 0; i <= N_PTS; i++) {
          const t = i / N_PTS
          const x = t * L
          const { M } = memberInternalForces(ef, x, L)
          const mx = PA.sx + t * (PB.sx - PA.sx)
          const my = PA.sy + t * (PB.sy - PA.sy)
          pts.push({ mx, my, dpx: -M * BASE * spx, dpy: -M * BASE * spy, M })
        }

        // Find peak M for label
        let peakM = 0, peakIdx = 0
        pts.forEach((p, i) => { if (Math.abs(p.M) > Math.abs(peakM)) { peakM = p.M; peakIdx = i } })

        ctx.save()

        const segments = splitByZeroCrossings(pts, (p) => p.M)

        // Fill and outline each segment
        for (const seg of segments) {
          if (seg.member.length < 2) continue
          ctx.beginPath()
          ctx.moveTo(seg.member[0][0], seg.member[0][1])
          for (let i = 1; i < seg.member.length; i++) ctx.lineTo(seg.member[i][0], seg.member[i][1])
          for (let i = seg.diagram.length - 1; i >= 0; i--) ctx.lineTo(seg.diagram[i][0], seg.diagram[i][1])
          ctx.closePath()
          ctx.globalAlpha = 0.35
          const posColor = invertBMD ? COLOR_SFD_NEG : COLOR_SFD_POS
          const negColor = invertBMD ? COLOR_SFD_POS : COLOR_SFD_NEG
          ctx.fillStyle = seg.positive ? posColor : negColor
          ctx.fill()
          ctx.globalAlpha = 1
          ctx.strokeStyle = seg.positive ? posColor : negColor
          ctx.lineWidth = DIAGRAM_LINE_WIDTH
          ctx.beginPath()
          ctx.moveTo(seg.diagram[0][0], seg.diagram[0][1])
          for (let i = 1; i < seg.diagram.length; i++) ctx.lineTo(seg.diagram[i][0], seg.diagram[i][1])
          ctx.stroke()
        }

        // Labels — anchored to the outer edge of the diagram tip.
        // End-point labels get an along-member nudge to clear the node.
        ctx.font = adaptiveView ? `500 ${11 * s}px 'JetBrains Mono', monospace` : DIAGRAM_LABEL_FONT
        ctx.fillStyle = COLOR_DIAGRAM_STROKE
        ctx.globalAlpha = 1

        const Lscr = Math.hypot(PB.sx - PA.sx, PB.sy - PA.sy)
        const alx = Lscr > 0.5 ? (PB.sx - PA.sx) / Lscr : 0
        const aly = Lscr > 0.5 ? (PB.sy - PA.sy) / Lscr : 0

        const labelPt = (p: typeof pts[0], val: number, alongSign = 0) => {
          const PERP_GAP = 5 * s, ALONG_GAP = 16 * s
          const dlen = Math.hypot(p.dpx, p.dpy)
          const ux = dlen > 0.5 ? p.dpx / dlen : -spx * (val >= 0 ? 1 : -1)
          const uy = dlen > 0.5 ? p.dpy / dlen : -spy * (val >= 0 ? 1 : -1)
          const ox = ux * PERP_GAP + alx * alongSign * ALONG_GAP
          const oy = uy * PERP_GAP + aly * alongSign * ALONG_GAP
          const lx = p.mx + p.dpx + ox
          const ly = p.my + p.dpy + oy
          if (Math.abs(ox) >= Math.abs(oy)) {
            ctx.textAlign = ox > 0 ? "left" : "right"
            ctx.textBaseline = "middle"
          } else {
            ctx.textAlign = "center"
            ctx.textBaseline = oy > 0 ? "top" : "bottom"
          }
          ctx.fillText(`${formatValue(val * forceScale)} ${momentLabel}`, lx, ly)
        }

        const bmdSign = invertBMD ? -1 : 1
        const p0 = pts[0], pN = pts[pts.length - 1]
        const m1 = bmdSign * ef.M1
        const m2 = bmdSign * ef.M2
        const peakMDisplay = bmdSign * peakM
        if (Math.abs(m1) > 0.01) labelPt(p0, m1, -1)
        if (Math.abs(m2) > 0.01) labelPt(pN, m2, +1)
        if (Math.abs(peakMDisplay) > 0.01 && peakIdx > 0 && peakIdx < N_PTS) labelPt(pts[peakIdx], peakMDisplay, 0)

        ctx.restore()
      }
    },
    [model, analysisResult, diagramScale, invertBMD, adaptiveView, zoom]
  )

  const drawDeformedShape = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!analysisResult) return
      const N_PTS = 40
      const COLOR = "#7c3aed"
      const s = adaptiveView ? 1 / zoom : 1
      // Auto-fit: peak displacement magnitude *along the member line* (not just at
      // nodes) renders at TARGET_M in world space at scale 1.0×. Sampling along
      // the cubic-Hermite spline captures mid-span sag — critical for simply-
      // supported beams where end nodes have ~0 transverse displacement.
      const TARGET_M = 1

      type RawPt = { xi: number; dispX: number; dispY: number; nA: { x: number; y: number }; dx: number; dy: number }
      type MemberRaw = { memberId: string; pts: RawPt[] }

      // Pass 1: compute raw displacements along each member's spline (no k applied yet)
      const memberRaws: MemberRaw[] = []
      let peakDisp = 0
      for (const member of Object.values(model.members)) {
        const nA = model.nodes[member.a]
        const nB = model.nodes[member.b]
        if (!nA || !nB) continue
        const dA = analysisResult.nodeDisplacements[member.a]
        const dB = analysisResult.nodeDisplacements[member.b]
        if (!dA || !dB) continue
        const dx = nB.x - nA.x, dy = nB.y - nA.y
        const L = Math.hypot(dx, dy)
        if (L < 1e-9) continue
        const c = dx / L, s = dy / L
        const u1 =  c * dA.u + s * dA.v, v1 = -s * dA.u + c * dA.v, th1 = dA.theta
        const u2 =  c * dB.u + s * dB.v, v2 = -s * dB.u + c * dB.v, th2 = dB.theta

        const pts: RawPt[] = []
        for (let i = 0; i <= N_PTS; i++) {
          const xi = i / N_PTS
          const uLoc = (1 - xi) * u1 + xi * u2
          const H1 = 1 - 3*xi*xi + 2*xi*xi*xi
          const H2 = L * xi * (1 - xi) * (1 - xi)
          const H3 = 3*xi*xi - 2*xi*xi*xi
          const H4 = L * xi*xi * (xi - 1)
          const vLoc = H1*v1 + H2*th1 + H3*v2 + H4*th2
          const dispX = c * uLoc - s * vLoc
          const dispY = s * uLoc + c * vLoc
          const mag = Math.hypot(dispX, dispY)
          if (mag > peakDisp) peakDisp = mag
          pts.push({ xi, dispX, dispY, nA, dx, dy })
        }
        memberRaws.push({ memberId: member.id, pts })
      }

      const k = peakDisp > 1e-12 ? (TARGET_M / peakDisp) * deformationScale : 0

      type MemberSpline = {
        memberId: string
        pts: { sx: number; sy: number; dispX: number; dispY: number; mag: number }[]
      }

      // Pass 2: apply k and project to screen coords
      const memberSplines: MemberSpline[] = memberRaws.map(({ memberId, pts }) => ({
        memberId,
        pts: pts.map(p => {
          const wx = p.nA.x + p.xi * p.dx + k * p.dispX
          const wy = p.nA.y + p.xi * p.dy + k * p.dispY
          const { sx, sy } = worldToScreen({ x: wx, y: wy }, rect)
          return { sx, sy, dispX: p.dispX, dispY: p.dispY, mag: Math.hypot(p.dispX, p.dispY) }
        }),
      }))

      // Pass 2: draw splines
      for (const { pts } of memberSplines) {
        ctx.save()
        ctx.strokeStyle = COLOR
        ctx.lineWidth = 2 * s
        ctx.setLineDash([])
        ctx.beginPath()
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.sx, p.sy) : ctx.lineTo(p.sx, p.sy))
        ctx.stroke()
        ctx.restore()
      }

      // Pass 2b: roller supports drawn at their deformed node positions
      for (const sup of Object.values(model.supports)) {
        if (sup.type !== "roller") continue
        const node = model.nodes[sup.nodeId]
        const d    = analysisResult.nodeDisplacements[sup.nodeId]
        if (!node || !d) continue
        const wx = node.x + k * d.u
        const wy = node.y + k * d.v
        const { sx, sy } = worldToScreen({ x: wx, y: wy }, rect)
        drawSupportGlyph(ctx, sx, sy, "roller", false, COLOR, s)
      }

    },
    [model, analysisResult, deformationScale, adaptiveView, zoom]
  )

  const drawDeformHover = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!deformHoverNodeId || !analysisResult) return
      const node = model.nodes[deformHoverNodeId]
      const d = analysisResult.nodeDisplacements[deformHoverNodeId]
      if (!node || !d) return

      const COLOR = "#7c3aed"
      const s = adaptiveView ? 1 / zoom : 1
      const pad = 5 * s
      const lineH = 13 * s
      // Match drawDeformedShape's auto-fit (peak along the member spline, not just nodes)
      const TARGET_M = 1
      const N_PTS = 40
      let peakDisp = 0
      for (const member of Object.values(model.members)) {
        const nA = model.nodes[member.a]
        const nB = model.nodes[member.b]
        if (!nA || !nB) continue
        const dA = analysisResult.nodeDisplacements[member.a]
        const dB = analysisResult.nodeDisplacements[member.b]
        if (!dA || !dB) continue
        const dx = nB.x - nA.x, dy = nB.y - nA.y
        const L = Math.hypot(dx, dy)
        if (L < 1e-9) continue
        const c = dx / L, sn = dy / L
        const u1 =  c * dA.u + sn * dA.v, v1 = -sn * dA.u + c * dA.v, th1 = dA.theta
        const u2 =  c * dB.u + sn * dB.v, v2 = -sn * dB.u + c * dB.v, th2 = dB.theta
        for (let i = 0; i <= N_PTS; i++) {
          const xi = i / N_PTS
          const uLoc = (1 - xi) * u1 + xi * u2
          const H1 = 1 - 3*xi*xi + 2*xi*xi*xi
          const H2 = L * xi * (1 - xi) * (1 - xi)
          const H3 = 3*xi*xi - 2*xi*xi*xi
          const H4 = L * xi*xi * (xi - 1)
          const vLoc = H1*v1 + H2*th1 + H3*v2 + H4*th2
          const dispX = c * uLoc - sn * vLoc
          const dispY = sn * uLoc + c * vLoc
          const mag = Math.hypot(dispX, dispY)
          if (mag > peakDisp) peakDisp = mag
        }
      }
      const k = peakDisp > 1e-12 ? (TARGET_M / peakDisp) * deformationScale : 0
      const wx = node.x + k * d.u
      const wy = node.y + k * d.v
      const { sx, sy } = worldToScreen({ x: wx, y: wy }, rect)

      const lines = [
        `Node ${deformHoverNodeId}`,
        `x = ${(lengthUnit === "mm" ? d.u * 1000 : d.u).toFixed(3)} ${lengthUnit}`,
        `y = ${(lengthUnit === "mm" ? d.v * 1000 : d.v).toFixed(3)} ${lengthUnit}`,
        `θ = ${(lengthUnit === "mm" ? d.theta * 1000 : d.theta).toFixed(3)} ${lengthUnit === "mm" ? "mrad" : "rad"}`,
      ]

      ctx.save()
      ctx.font = adaptiveView ? `500 ${11 * s}px 'JetBrains Mono', monospace` : DIAGRAM_LABEL_FONT
      const boxW = Math.max(...lines.map(l => ctx.measureText(l).width)) + pad * 2
      const boxH = lines.length * lineH + pad * 2

      // Prefer placing above-right of the node dot
      const bx = sx + 10 * s
      const by = sy - boxH - 6 * s

      ctx.fillStyle = "rgba(255,255,255,0.96)"
      ctx.strokeStyle = COLOR
      ctx.lineWidth = 1.5 * s
      ctx.beginPath()
      ctx.roundRect(bx, by, boxW, boxH, 4 * s)
      ctx.fill()
      ctx.stroke()

      // Header line (node ID) in bold
      ctx.fillStyle = COLOR
      ctx.textAlign = "left"
      ctx.textBaseline = "top"
      ctx.font = adaptiveView ? `bold ${11 * s}px 'JetBrains Mono', monospace` : `bold ${DIAGRAM_LABEL_FONT}`
      ctx.fillText(lines[0], bx + pad, by + pad)
      ctx.font = adaptiveView ? `500 ${11 * s}px 'JetBrains Mono', monospace` : DIAGRAM_LABEL_FONT
      lines.slice(1).forEach((line, i) =>
        ctx.fillText(line, bx + pad, by + pad + (i + 1) * lineH)
      )

      // Dot on the deformed node
      ctx.beginPath()
      ctx.arc(sx, sy, 4 * s, 0, Math.PI * 2)
      ctx.fillStyle = COLOR
      ctx.fill()
      ctx.restore()
    },
    [model, analysisResult, deformationScale, deformHoverNodeId, adaptiveView, zoom]
  )

  const drawReactions = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!analysisResult) return
      const s = adaptiveView ? 1 / zoom : 1
      const SHAFT  = 40 * s
      const HEAD   = 12 * s
      const ARC_R  = 20 * s
      const OFFSET = 40 * s   // clears deepest support glyph (roller ~35px)
      const C_POS  = "#2563eb"   // blue  — positive reaction
      const C_NEG  = "#ef4444"   // red   — negative reaction
      const C_ZERO = "#94a3b8"   // gray  — zero reaction
      const colorFor = (v: number, zero: boolean) => zero ? C_ZERO : v >= 0 ? C_POS : C_NEG

      for (const [nodeId, r] of Object.entries(analysisResult.reactions)) {
        const node = model.nodes[nodeId]
        if (!node) continue
        const { sx, sy } = worldToScreen(node, rect)

        ctx.save()
        ctx.font = adaptiveView ? `500 ${11 * s}px 'JetBrains Mono', monospace` : DIAGRAM_LABEL_FONT

        // Draws arrow with tip AT (tx,ty), shaft starting at (ox,oy).
        // zero=true → dashed shaft, small circle instead of arrowhead.
        // labelOffsetX/Y allow custom label positioning per reaction type
        const arrow = (ox: number, oy: number, tx: number, ty: number, label: string, zero: boolean, color: string, labelOffsetX = 0, labelOffsetY = 0) => {
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = 1.5 * s
          ctx.globalAlpha = zero ? 0.5 : 1
          ctx.setLineDash(zero ? [3, 3] : [])
          ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(tx, ty); ctx.stroke()
          ctx.setLineDash([])
          if (zero) {
            ctx.beginPath(); ctx.arc(tx, ty, 3 * s, 0, Math.PI * 2); ctx.fill()
          } else {
            const ang = Math.atan2(ty - oy, tx - ox)
            ctx.beginPath()
            ctx.moveTo(tx, ty)
            ctx.lineTo(tx - HEAD * Math.cos(ang - 0.4), ty - HEAD * Math.sin(ang - 0.4))
            ctx.lineTo(tx - HEAD * Math.cos(ang + 0.4), ty - HEAD * Math.sin(ang + 0.4))
            ctx.closePath(); ctx.fill()
          }
          ctx.globalAlpha = 1
          ctx.fillStyle = color
          ctx.textAlign = "center"; ctx.textBaseline = "middle"
          // Label position: midpoint plus explicit offsets
          ctx.fillText(label, (ox + tx) / 2 + labelOffsetX, (oy + ty) / 2 + labelOffsetY)
        }

        // Ry — vertical. Arrow always originates from below.
        // Positive (upward): tip points toward node. Negative (downward): tip points away.
        if (Math.abs(r.Ry) >= 0.005) {
          const zero = false
          const base = r.Ry >= 0 ? sy + (SHAFT + OFFSET) : sy + OFFSET
          const tip  = r.Ry >= 0 ? sy + OFFSET           : sy + (SHAFT + OFFSET)
          arrow(sx, base, sx, tip, `${formatValue(r.Ry * forceScale)} ${forceLabel}`, zero, colorFor(r.Ry, zero), 0, SHAFT)
        }

        // Rx — horizontal. Label positioned next to arrow tail.
        if (Math.abs(r.Rx) >= 0.005) {
          const zero = false
          const sign = r.Rx >= 0 ? -1 : 1   // positive → shaft goes left, tip points right
          arrow(sx + sign * (SHAFT + OFFSET), sy, sx + sign * OFFSET, sy, `${formatValue(r.Rx * forceScale)} ${forceLabel}`, zero, colorFor(r.Rx, zero), sign * 60, 0)
        }

        // Mz — moment arc. Positive = CCW (structural) = CW on screen (Y-flipped).
        if (Math.abs(r.Mz) >= 0.005) {
          const zero = false
          const color = colorFor(r.Mz, zero)
          const cw = r.Mz >= 0   // CW on screen for positive Mz (standard structural sign convention)
          ctx.strokeStyle = color
          ctx.fillStyle = color
          ctx.lineWidth = 1.5 * s

          // 3/4 arc (270°) explicit for each direction
          if (cw) {
            // Positive Mz: CW from 0° clockwise 270° (right → down → left → up, ends at top)
            ctx.beginPath()
            ctx.arc(sx, sy, ARC_R, 0, -3*Math.PI/2, true)  // true = counterclockwise on standard axes, but clockwise on screen (Y-flipped)
            ctx.stroke()
            const endAngle = Math.PI/2  // Ends at top (90°)
            const ex = sx + ARC_R * Math.cos(endAngle)
            const ey = sy + ARC_R * Math.sin(endAngle)
            const arrowDir = Math.PI + Math.PI/12  // 30° up (blue tension, flipped 180°)
            ctx.beginPath()
            ctx.moveTo(ex, ey)
            ctx.lineTo(ex + HEAD * Math.cos(arrowDir - 0.4), ey + HEAD * Math.sin(arrowDir - 0.4))
            ctx.lineTo(ex + HEAD * Math.cos(arrowDir + 0.4), ey + HEAD * Math.sin(arrowDir + 0.4))
            ctx.closePath(); ctx.fill()
          } else {
            // Negative Mz: CCW from 0° counterclockwise 270° (right → up → left → down, ends at bottom)
            ctx.beginPath()
            ctx.arc(sx, sy, ARC_R, 0, 3*Math.PI/2, false)  // false = clockwise on standard axes, but counterclockwise on screen
            ctx.stroke()
            const endAngle = -Math.PI/2  // Ends at bottom (270°)
            const ex = sx + ARC_R * Math.cos(endAngle)
            const ey = sy + ARC_R * Math.sin(endAngle)
            const arrowDir = Math.PI - Math.PI/12  // 30° down (red compression, flipped 180°)
            ctx.beginPath()
            ctx.moveTo(ex, ey)
            ctx.lineTo(ex + HEAD * Math.cos(arrowDir - 0.4), ey + HEAD * Math.sin(arrowDir - 0.4))
            ctx.lineTo(ex + HEAD * Math.cos(arrowDir + 0.4), ey + HEAD * Math.sin(arrowDir + 0.4))
            ctx.closePath(); ctx.fill()
          }

          ctx.fillStyle = color
          ctx.textAlign = "left"; ctx.textBaseline = "middle"
          ctx.fillText(`${formatValue(r.Mz * forceScale)} ${momentLabel}`, sx + ARC_R + 6 * s, sy - ARC_R - 2 * s)
        }

        ctx.restore()
      }
    },
    [model, analysisResult, adaptiveView, zoom]
  )

  const drawIdPills = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      const s = adaptiveView ? 1 / zoom : 1
      if (showNodeIds) {
        for (const node of Object.values(model.nodes)) {
          const { sx, sy } = worldToScreen(node, rect)
          drawNodeIdTag(ctx, sx, sy - 20 * s, node.id, s)
        }
      }
      if (showMemberIds) {
        for (const member of Object.values(model.members)) {
          const nA = model.nodes[member.a]
          const nB = model.nodes[member.b]
          if (!nA || !nB) continue
          const PA = worldToScreen(nA, rect)
          const PB = worldToScreen(nB, rect)
          const mx = (PA.sx + PB.sx) / 2
          const my = (PA.sy + PB.sy) / 2
          let angle = Math.atan2(PB.sy - PA.sy, PB.sx - PA.sx)
          if (angle >  Math.PI / 2) angle -= Math.PI
          if (angle < -Math.PI / 2) angle += Math.PI
          const off = 16 * s
          const px = -Math.sin(angle) * off
          const py =  Math.cos(angle) * off
          drawMemberIdTag(ctx, mx + px, my + py, member.id, angle, s)
        }
      }
    },
    [model, showNodeIds, showMemberIds, adaptiveView, zoom]
  )

  const drawLocalAxes = useCallback(
    (ctx: CanvasRenderingContext2D, rect: Rect) => {
      if (!showLocalAxes) return
      const s = adaptiveView ? 1 / zoom : 1
      const ARROW_LEN = 35 * s     // px, screen-space length of each axis arrow
      const HEAD = 12 * s
      const LABEL_OFF = 10 * s
      const LINE_WIDTH = 3 * s   // stroke weight for axis arrows
      const MID_OFFSET = 10 * s     // perpendicular offset from member midpoint (along +local-2; negative = opposite side)
      const FONT = `bold ${10 * s}px 'JetBrains Mono', monospace`
      const COLOR_1 = "#dc2626"   // red — local-1 (axial)
      const COLOR_2 = "#16a34a"   // green — local-2 (transverse)
      const COLOR_3 = "#1d4ed8"   // blue — local-3 (out of screen)

      const drawArrow = (x0: number, y0: number, dx: number, dy: number, color: string) => {
        ctx.save()
        ctx.strokeStyle = color
        ctx.fillStyle = color
        ctx.lineWidth = LINE_WIDTH
        ctx.lineCap = "round"
        ctx.beginPath()
        ctx.moveTo(x0, y0)
        ctx.lineTo(x0 + dx, y0 + dy)
        ctx.stroke()
        // arrowhead
        const len = Math.hypot(dx, dy)
        const ux = dx / len, uy = dy / len
        const nx = -uy, ny = ux
        const tipX = x0 + dx, tipY = y0 + dy
        ctx.beginPath()
        ctx.moveTo(tipX, tipY)
        ctx.lineTo(tipX - ux * HEAD - nx * (HEAD * 0.55), tipY - uy * HEAD - ny * (HEAD * 0.55))
        ctx.lineTo(tipX - ux * HEAD + nx * (HEAD * 0.55), tipY - uy * HEAD + ny * (HEAD * 0.55))
        ctx.closePath()
        ctx.fill()
        ctx.restore()
      }

      ctx.save()
      ctx.font = FONT
      ctx.textAlign = "center"
      ctx.textBaseline = "middle"

      for (const member of Object.values(model.members)) {
        const nA = model.nodes[member.a]
        const nB = model.nodes[member.b]
        if (!nA || !nB) continue
        const PA = worldToScreen(nA, rect)
        const PB = worldToScreen(nB, rect)
        const dx = PB.sx - PA.sx
        const dy = PB.sy - PA.sy
        const L = Math.hypot(dx, dy)
        if (L < 1e-6) continue

        // Local-1 in screen space: unit vector i→j
        const u1x = dx / L, u1y = dy / L
        // Local-2 in screen space: world +90° CCW becomes screen −90° CW (Y-flip)
        //   world (l2x, l2y) = (-dy_world/L, dx_world/L)
        //   screen mapping flips Y → (l2x, -l2y) → in screen-pixel terms: (u1y, -u1x)
        const u2x = u1y, u2y = -u1x

        // Member midpoint, shifted along +local-2 by MID_OFFSET
        const mx = (PA.sx + PB.sx) / 2 + u2x * MID_OFFSET
        const my = (PA.sy + PB.sy) / 2 + u2y * MID_OFFSET

        // Local-1 arrow (red)
        drawArrow(mx, my, u1x * ARROW_LEN, u1y * ARROW_LEN, COLOR_1)
        // Local-2 arrow (green)
        drawArrow(mx, my, u2x * ARROW_LEN, u2y * ARROW_LEN, COLOR_2)

        // Labels at arrow tips, nudged outward
        ctx.fillStyle = COLOR_1
        ctx.fillText("1",
          mx + u1x * (ARROW_LEN + LABEL_OFF),
          my + u1y * (ARROW_LEN + LABEL_OFF))
        ctx.fillStyle = COLOR_2
        ctx.fillText("2",
          mx + u2x * (ARROW_LEN + LABEL_OFF),
          my + u2y * (ARROW_LEN + LABEL_OFF))

        // Local-3 (out of screen): small ⊙ glyph at the origin
        const R3 = 4 * s
        ctx.save()
        ctx.strokeStyle = COLOR_3
        ctx.fillStyle = COLOR_3
        ctx.lineWidth = 1.2 * s
        ctx.beginPath()
        ctx.arc(mx, my, R3, 0, Math.PI * 2)
        ctx.stroke()
        ctx.beginPath()
        ctx.arc(mx, my, 1.2 * s, 0, Math.PI * 2)
        ctx.fill()
        ctx.restore()
      }

      ctx.restore()
    },
    [model, showLocalAxes, adaptiveView, zoom]
  )

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const ctx = canvas.getContext("2d")
    if (!ctx) return

    const dpr = window.devicePixelRatio || 1
    const rect = container.getBoundingClientRect()

    canvas.width = rect.width * dpr
    canvas.height = rect.height * dpr
    canvas.style.width = `${rect.width}px`
    canvas.style.height = `${rect.height}px`

    ctx.setTransform(1, 0, 0, 1, 0, 0)
    ctx.scale(dpr, dpr)

    ctx.fillStyle = COLOR_CANVAS_BG
    ctx.fillRect(0, 0, rect.width, rect.height)

    // Apply viewport transform (pan + zoom) for all structural drawing
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(zoom, zoom)

    drawGrid(ctx, rect.width, rect.height)
    drawMembers(ctx, rect)
    drawSupports(ctx, rect)
    drawNodes(ctx, rect)
    drawGizmo(ctx, rect)

    if (showDimensions) drawDimensions(ctx, rect)
    drawIdPills(ctx, rect)
    drawLocalAxes(ctx, rect)
    if (activeTab === "Model") drawPreview(ctx, rect)
    if (activeTab === "Load") drawLoads(ctx, rect)
    if (activeTab === "Analyze" && analysisResult) {
      if (activeTool === "REACTION")    drawReactions(ctx, rect)
      if (activeTool === "AXIAL")       drawAxialDiagram(ctx, rect)
      if (activeTool === "SHEAR")       drawShearDiagram(ctx, rect)
      if (activeTool === "MOMENT")      drawMomentDiagram(ctx, rect)
      if (activeTool === "DEFORMATION") {
        drawDeformedShape(ctx, rect)
        drawDeformHover(ctx, rect)
      }
    }

    ctx.restore()

    // Box selection rubber-band: drawn in screen space (no viewport transform)
    if (boxRect) {
      const { x1, y1, x2, y2 } = boxRect
      const rx = Math.min(x1, x2)
      const ry = Math.min(y1, y2)
      const rw = Math.abs(x2 - x1)
      const rh = Math.abs(y2 - y1)
      ctx.save()
      ctx.strokeStyle = strokeFor(interactionKind(activeTab, activeTool), "selected", COLOR_SELECT_GENERIC)
      ctx.lineWidth = 1
      ctx.setLineDash([4, 3])
      ctx.strokeRect(rx, ry, rw, rh)
      ctx.fillStyle = "rgba(37, 99, 235, 0.06)"
      ctx.fillRect(rx, ry, rw, rh)
      ctx.restore()
    }
  }, [
    activeTab,
    activeTool,
    showDimensions,
    boxRect,
    analysisResult,
    panX, panY, zoom,
    drawGrid,
    drawMembers,
    drawNodes,
    drawSupports,
    drawGizmo,
    drawDimensions,
    drawIdPills,
    drawLocalAxes,
    drawPreview,
    drawLoads,
    drawAxialDiagram,
    drawShearDiagram,
    drawMomentDiagram,
    drawDeformedShape,
    drawDeformHover,
    drawReactions,
  ])

  useEffect(() => {
    draw()
    const handleResize = () => draw()
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [draw])


  const toWorldCoords = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const container = containerRef.current
    if (!container) return null
    const rect = container.getBoundingClientRect()
    const { sx, sy } = axisCenter(rect)
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { vmx, vmy } = toVirtual(mx, my)
    return {
      x: parseFloat(((vmx - sx) / SCALE).toFixed(3)),
      y: parseFloat(((sy - vmy) / SCALE).toFixed(3)),
    }
  }

  // Wheel → zoom centered on cursor
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      const factor   = e.deltaY < 0 ? 1.1 : 1 / 1.1
      const curZoom  = zoomRef.current
      const curPanX  = panXRef.current
      const curPanY  = panYRef.current
      const container = containerRef.current
      if (!container) return
      const rect  = container.getBoundingClientRect()
      const mx    = e.clientX - rect.left
      const my    = e.clientY - rect.top
      const minZoom  = 0.1
      setMinZoom(minZoom)
      let newZoom  = Math.max(minZoom, Math.min(MAX_ZOOM, curZoom * factor))
      // Snap wheel zoom to marked values when passing through them
      const WHEEL_SNAP = [0.25, 0.5, 1, 2]
      for (const sv of WHEEL_SNAP) {
        if (Math.abs(newZoom - sv) / sv < 0.08) { newZoom = sv; break }
      }
      const rawPanX  = mx - (mx - curPanX) * (newZoom / curZoom)
      const rawPanY  = my - (my - curPanY) * (newZoom / curZoom)
      const clamped  = clampPan(rawPanX, rawPanY, newZoom, rect)
      // Update refs immediately so rapid wheel events accumulate correctly
      zoomRef.current = newZoom
      panXRef.current = clamped.px
      panYRef.current = clamped.py
      setZoom(newZoom)
      setPanX(clamped.px)
      setPanY(clamped.py)
    }
    canvas.addEventListener("wheel", onWheel, { passive: false })
    return () => canvas.removeEventListener("wheel", onWheel)
  }, [])

  // Touch: single-finger pan + two-finger pinch-to-zoom (integrated with slider state)
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    // Track touch state in refs to avoid stale closures
    const touchState = {
      singleStart: null as { tx: number; ty: number; basePanX: number; basePanY: number } | null,
      pinchDist: null as number | null,
      pinchMidX: 0,
      pinchMidY: 0,
      hasPanned: false,  // true only after finger moved beyond drag threshold
    }

    const getTouchDist = (t1: Touch, t2: Touch) =>
      Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY)

    const getTouchMid = (t1: Touch, t2: Touch, rect: DOMRect) => ({
      mx: (t1.clientX + t2.clientX) / 2 - rect.left,
      my: (t1.clientY + t2.clientY) / 2 - rect.top,
    })

    const touchClientToWorld = (clientX: number, clientY: number, rect: DOMRect) => {
      const { sx, sy } = axisCenter(rect)
      const mx = clientX - rect.left
      const my = clientY - rect.top
      const vmx = (mx - panXRef.current) / zoomRef.current
      const vmy = (my - panYRef.current) / zoomRef.current
      return {
        x: parseFloat(((vmx - sx) / SCALE).toFixed(3)),
        y: parseFloat(((sy - vmy) / SCALE).toFixed(3)),
      }
    }

    const onTouchStart = (e: TouchEvent) => {
      // Two-finger: prevent default immediately to suppress browser pinch-zoom on the page.
      // Single-finger: do NOT prevent default here — the browser needs this to fire a
      // synthetic click after a stationary tap so handleClick can run.
      if (e.touches.length === 2) e.preventDefault()
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()

      // MOVE_NODE screen drag — intercept single-finger touch on a node
      if (e.touches.length === 1 && activeToolRef.current === "MOVE_NODE" && moveNodeModeRef.current === "screen") {
        const w = touchClientToWorld(e.touches[0].clientX, e.touches[0].clientY, rect)
        const nodeId = hitTestNode(modelRef.current, w, HIT_TOL_NODE)
        if (nodeId) {
          dragNodeRef.current = { nodeId }
          onDragNodeStartRef.current?.(nodeId)
          e.preventDefault()
          return
        }
      }

      if (e.touches.length === 1) {
        touchState.singleStart = {
          tx: e.touches[0].clientX,
          ty: e.touches[0].clientY,
          basePanX: panXRef.current,
          basePanY: panYRef.current,
        }
        touchState.pinchDist = null
        touchState.hasPanned = false
      } else if (e.touches.length === 2) {
        touchState.singleStart = null
        touchState.pinchDist = getTouchDist(e.touches[0], e.touches[1])
        const mid = getTouchMid(e.touches[0], e.touches[1], rect)
        touchState.pinchMidX = mid.mx
        touchState.pinchMidY = mid.my
      }
    }

    const onTouchMove = (e: TouchEvent) => {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()

      // MOVE_NODE screen drag — move node live with snap
      if (dragNodeRef.current && e.touches.length === 1) {
        e.preventDefault()
        const w = touchClientToWorld(e.touches[0].clientX, e.touches[0].clientY, rect)
        let target = w
        if (snapToNodeRef.current) {
          const nearNode = hitTestNode(modelRef.current, w, HIT_TOL_NODE)
          if (nearNode && nearNode !== dragNodeRef.current.nodeId) {
            target = modelRef.current.nodes[nearNode]
          } else if (snapToGridRef.current) {
            target = snapWorld(w, gridSpacingRef.current)
          }
        } else if (snapToGridRef.current) {
          target = snapWorld(w, gridSpacingRef.current)
        }
        onMoveNodeRef.current?.(dragNodeRef.current.nodeId, target.x, target.y)
        return
      }

      e.preventDefault()

      if (e.touches.length === 1 && touchState.singleStart) {
        // Single-finger pan
        const dx = e.touches[0].clientX - touchState.singleStart.tx
        const dy = e.touches[0].clientY - touchState.singleStart.ty
        if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
          // Prevent default here (first time past threshold) so the browser won't fire
          // a synthetic click after this gesture ends. Before this point we must not
          // prevent default, otherwise stationary taps lose their synthetic click.
          if (!touchState.hasPanned) e.preventDefault()
          touchState.hasPanned = true
          isPanningRef.current = true
          setIsPanning(true)
          const rawPx = touchState.singleStart.basePanX + dx
          const rawPy = touchState.singleStart.basePanY + dy
          const clamped = clampPan(rawPx, rawPy, zoomRef.current, rect)
          panXRef.current = clamped.px
          panYRef.current = clamped.py
          setPanX(clamped.px)
          setPanY(clamped.py)
        }
      } else if (e.touches.length === 2 && touchState.pinchDist !== null) {
        // Two-finger pinch-to-zoom — anchored to midpoint
        const newDist = getTouchDist(e.touches[0], e.touches[1])
        const factor = newDist / touchState.pinchDist
        touchState.pinchDist = newDist

        const curZoom = zoomRef.current
        const curPanX = panXRef.current
        const curPanY = panYRef.current
        const minZoom = 0.1
        const newZoom = Math.max(minZoom, Math.min(MAX_ZOOM, curZoom * factor))

        // Update midpoint to current finger positions
        const mid = getTouchMid(e.touches[0], e.touches[1], rect)
        const mx = mid.mx
        const my = mid.my

        const rawPanX = mx - (mx - curPanX) * (newZoom / curZoom)
        const rawPanY = my - (my - curPanY) * (newZoom / curZoom)
        const clamped = clampPan(rawPanX, rawPanY, newZoom, rect)

        zoomRef.current = newZoom
        panXRef.current = clamped.px
        panYRef.current = clamped.py
        setZoom(newZoom)
        setPanX(clamped.px)
        setPanY(clamped.py)
      }
    }

    const onTouchEnd = (e: TouchEvent) => {
      // MOVE_NODE screen drag — release
      if (dragNodeRef.current && e.touches.length === 0) {
        dragNodeRef.current = null
        onDragNodeEndRef.current?.()
        e.preventDefault()
        return
      }

      if (e.touches.length === 0) {
        const wasPanOrPinch = touchState.hasPanned || touchState.pinchDist !== null
        touchState.singleStart = null
        touchState.pinchDist = null
        touchState.hasPanned = false
        if (wasPanOrPinch) {
          // Suppress the synthetic click that would follow this touch sequence
          e.preventDefault()
          isPanningRef.current = true
          setIsPanning(true)
          setTimeout(() => {
            isPanningRef.current = false
            setIsPanning(false)
          }, 50)
        } else {
          // Stationary tap — let browser fire the synthetic click so handleClick runs
          isPanningRef.current = false
          setIsPanning(false)
        }
      } else if (e.touches.length === 1) {
        // One finger lifted during pinch — switch to single-finger pan
        e.preventDefault()
        touchState.pinchDist = null
        touchState.hasPanned = false
        touchState.singleStart = {
          tx: e.touches[0].clientX,
          ty: e.touches[0].clientY,
          basePanX: panXRef.current,
          basePanY: panYRef.current,
        }
      }
    }

    canvas.addEventListener("touchstart", onTouchStart, { passive: false })
    canvas.addEventListener("touchmove", onTouchMove, { passive: false })
    canvas.addEventListener("touchend", onTouchEnd, { passive: false })
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart)
      canvas.removeEventListener("touchmove", onTouchMove)
      canvas.removeEventListener("touchend", onTouchEnd)
    }
  }, [])

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Container-local cursor coords for the hover tooltip overlay.
    const containerRect = containerRef.current?.getBoundingClientRect()
    if (containerRect) {
      setCursorPx({ x: e.clientX - containerRect.left, y: e.clientY - containerRect.top })
    }
    // MOVE_NODE screen drag — move node live with snap
    if (dragNodeRef.current) {
      const w = toWorldCoords(e)
      if (w) {
        let target: WorldPoint = w
        if (snapToNode) {
          const nearNode = hitTestNode(model, w, HIT_TOL_NODE)
          if (nearNode && nearNode !== dragNodeRef.current.nodeId) {
            target = model.nodes[nearNode]
          } else if (snapToGrid) {
            target = snapWorld(w, gridSpacing)
          }
        } else if (snapToGrid) {
          target = snapWorld(w, gridSpacing)
        }
        onMoveNode?.(dragNodeRef.current.nodeId, target.x, target.y)
      }
      return
    }

    // Pan if dragging
    if (panStartRef.current) {
      const dx = e.clientX - panStartRef.current.mx
      const dy = e.clientY - panStartRef.current.my
      if (Math.hypot(dx, dy) > DRAG_THRESHOLD_PX) {
        isPanningRef.current = true
        setIsPanning(true)
        const container = containerRef.current
        if (container) {
          const rect    = container.getBoundingClientRect()
          const z       = zoomRef.current
          const rawPx   = panStartRef.current.basePanX + dx
          const rawPy   = panStartRef.current.basePanY + dy
          const clamped = clampPan(rawPx, rawPy, z, rect)
          setPanX(clamped.px)
          setPanY(clamped.py)
        }
      }
      if (isPanningRef.current) return
    }

    const w = toWorldCoords(e)
    if (!w) return
    const nodeHit = snapToNode ? hitTestNode(model, w, HIT_TOL_NODE) : null
    const ws = nodeHit ? model.nodes[nodeHit] : (snapToGrid ? snapWorld(w, gridSpacing) : w)
    onMouseMove(ws.x, ws.y)
    if (activeTab === "Model" && (activeTool === "NODE" || activeTool === "MEMBER")) {
      setSnapped(ws)
    } else if (snapped) {
      setSnapped(null)
    }
    if (activeTab === "Analyze" && activeTool === "DEFORMATION") {
      const hit = hitTestNode(model, w, 0.3)
      setDeformHoverNodeId(hit ?? null)
    } else if (deformHoverNodeId) {
      setDeformHoverNodeId(null)
    }

    // Update box selection rubber-band
    if ((activeTool === "SELECT" || activeTool === "DELETE" || (activeTab === "Model" && activeTool === "SUPPORT") || (activeTab === "Load" && activeTool === "MODIFY_LOAD")) && boxStartRef.current) {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      const sx = e.clientX - rect.left
      const sy = e.clientY - rect.top
      if (Math.hypot(sx - boxStartRef.current.sx, sy - boxStartRef.current.sy) > DRAG_THRESHOLD_PX) {
        hasDraggedRef.current = true
        setBoxRect({ x1: boxStartRef.current.sx, y1: boxStartRef.current.sy, x2: sx, y2: sy })
      }
    }
  }

  const handleMouseLeave = () => {
    if (snapped) setSnapped(null)
    if (deformHoverNodeId) setDeformHoverNodeId(null)
    setCursorPx(null)
    if (panStartRef.current) {
      panStartRef.current = null
      isPanningRef.current = false
      setIsPanning(false)
    }
  }

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // MOVE_NODE screen drag — intercept before pan logic
    if (activeTool === "MOVE_NODE" && moveNodeMode === "screen" && e.button === 0) {
      const w = toWorldCoords(e)
      if (w) {
        const nodeId = hitTestNode(model, w, HIT_TOL_NODE)
        if (nodeId) {
          dragNodeRef.current = { nodeId }
          return
        }
      }
    }

    // Middle mouse or left-drag when not using SELECT/DELETE/MODIFY_LOAD box — start pan tracking
    const isMiddle = e.button === 1
    const isLoadModify = activeTab === "Load" && activeTool === "MODIFY_LOAD"
    const isModelSupport = activeTab === "Model" && activeTool === "SUPPORT"
    const isLeftNonSelect = e.button === 0 && activeTool !== "SELECT" && activeTool !== "DELETE" && !isLoadModify && !isModelSupport
    if (isMiddle || isLeftNonSelect) {
      panStartRef.current = { mx: e.clientX, my: e.clientY, basePanX: panX, basePanY: panY }
      isPanningRef.current = false
      setIsPanning(false)
      if (isMiddle) e.preventDefault()
    }

    if (e.button !== 0) return
    const w = toWorldCoords(e)
    if (w) onCanvasMouseDown?.(w.x, w.y)

    if (activeTool === "SELECT" || activeTool === "DELETE" || isLoadModify || isModelSupport) {
      const container = containerRef.current
      if (!container) return
      const rect = container.getBoundingClientRect()
      boxStartRef.current = { sx: e.clientX - rect.left, sy: e.clientY - rect.top }
      hasDraggedRef.current = false
    }
  }

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (dragNodeRef.current) {
      dragNodeRef.current = null
      return
    }

    panStartRef.current = null

    if (e.button !== 0) return
    const w = toWorldCoords(e)
    if (w) onCanvasMouseUp?.(w.x, w.y)

    if ((activeTool === "SELECT" || (activeTab === "Model" && activeTool === "DELETE")) && hasDraggedRef.current && boxRect) {
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const dims = { width: rect.width, height: rect.height }
        // Convert box screen coords to virtual canvas coords before world conversion
        const { vmx: vx1, vmy: vy1 } = toVirtual(boxRect.x1, boxRect.y1)
        const { vmx: vx2, vmy: vy2 } = toVirtual(boxRect.x2, boxRect.y2)
        const wx1 = screenToWorld({ sx: vx1, sy: vy1 }, dims)
        const wx2 = screenToWorld({ sx: vx2, sy: vy2 }, dims)
        const items = activeTool === "DELETE"
          ? computeBoxSelectionWithNodes(model, wx1.x, wx1.y, wx2.x, wx2.y)
          : computeBoxSelection(model, wx1.x, wx1.y, wx2.x, wx2.y)
        if (!isEmptySelection(items)) onSelectItems?.(items)
      }
    }

    // Handle Model tab SUPPORT tool box selection
    if (activeTab === "Model" && activeTool === "SUPPORT" && hasDraggedRef.current && boxRect) {
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const dims = { width: rect.width, height: rect.height }
        const { vmx: vx1, vmy: vy1 } = toVirtual(boxRect.x1, boxRect.y1)
        const { vmx: vx2, vmy: vy2 } = toVirtual(boxRect.x2, boxRect.y2)
        const wx1 = screenToWorld({ sx: vx1, sy: vy1 }, dims)
        const wx2 = screenToWorld({ sx: vx2, sy: vy2 }, dims)
        const items = computeBoxSelectionSupportTool(model, wx1.x, wx1.y, wx2.x, wx2.y)
        if (!isEmptySelection(items)) onSelectItems?.(items)
      }
    }

    // Handle Load tab DELETE/MODIFY_LOAD tool box selection
    if (activeTab === "Load" && (activeTool === "DELETE" || activeTool === "MODIFY_LOAD") && hasDraggedRef.current && boxRect) {
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const dims = { width: rect.width, height: rect.height }
        // Convert box screen coords to virtual canvas coords before world conversion
        const { vmx: vx1, vmy: vy1 } = toVirtual(boxRect.x1, boxRect.y1)
        const { vmx: vx2, vmy: vy2 } = toVirtual(boxRect.x2, boxRect.y2)
        const wx1 = screenToWorld({ sx: vx1, sy: vy1 }, dims)
        const wx2 = screenToWorld({ sx: vx2, sy: vy2 }, dims)
        const rawLoadIds = computeBoxSelectionLoads(model, wx1.x, wx1.y, wx2.x, wx2.y)
        const loadIds = loadViewFilter
          ? rawLoadIds.filter((id) => model.loads[id]?.loadCaseId === loadViewFilter)
          : rawLoadIds
        if (loadIds.length > 0) {
          onSelectLoadIds?.(loadIds)
        }
      }
    }

    // Always clear box rect, whether box selection was performed or not
    if (boxRect) setBoxRect(null)

    boxStartRef.current = null
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    // Suppress click if we were panning
    if (isPanningRef.current) {
      isPanningRef.current = false
      setIsPanning(false)
      return
    }

    // Suppress click after box drag for Load tab DELETE/MODIFY_LOAD — mouseup already handled load selection
    if (activeTab === "Load" && (activeTool === "DELETE" || activeTool === "MODIFY_LOAD") && hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }

    // Suppress click after box drag for Model SUPPORT — mouseup already handled selection
    if (activeTab === "Model" && activeTool === "SUPPORT" && hasDraggedRef.current) {
      hasDraggedRef.current = false
      return
    }

    if (activeTool === "SELECT" || (activeTab === "Model" && activeTool === "DELETE")) {
      // Suppress click after box drag — mouseup already handled it
      if (hasDraggedRef.current) {
        hasDraggedRef.current = false
        return
      }
      const w = toWorldCoords(e)
      if (!w) return

      const nodeId = hitTestNode(model, w, HIT_TOL_NODE)
      if (nodeId) {
        if (activeTool === "SELECT") {
          // MODIFY SECTION does not operate on nodes/supports — fall through to member hit.
        } else {
          const item: MultiSelection = { nodeIds: [nodeId], memberIds: [], supportNodeIds: [] }
          if (selection.nodeIds.includes(nodeId)) onDeselectItems?.(item)
          else onSelectItems?.(item)
          return
        }
      }

      const memberId = hitTestMember(model, w, HIT_TOL_MEMBER)
      if (memberId) {
        const item: MultiSelection = { nodeIds: [], memberIds: [memberId], supportNodeIds: [] }
        if (selection.memberIds.includes(memberId)) onDeselectItems?.(item)
        else onSelectItems?.(item)
        return
      }
      const container = containerRef.current
      if (container) {
        const rect = container.getBoundingClientRect()
        const dims = { width: rect.width, height: rect.height }
        // Use virtual coords for support glyph hit test
        const { vmx, vmy } = toVirtual(e.clientX - rect.left, e.clientY - rect.top)
        const supportId = hitTestSupportGlyph(model, vmx, vmy, dims)
        if (supportId) {
          const item: MultiSelection = { nodeIds: [], memberIds: [], supportNodeIds: [supportId] }
          if (selection.supportNodeIds.includes(supportId)) onDeselectItems?.(item)
          else onSelectItems?.(item)
          return
        }
      }
      onClearSelection?.()
      return
    }

    const w = toWorldCoords(e)
    if (w) onCanvasClick?.(w.x, w.y)
  }

  // Log-scale mapping between slider [0,1] and zoom [minZoom, MAX_ZOOM]
  // slider=0 → minZoom (zoomed out), slider=0.5 → 1×, slider=1 → MAX_ZOOM (zoomed in)
  const zoomToSlider = (z: number, mn: number) => {
    const lo = Math.log(mn), hi = Math.log(MAX_ZOOM)
    return (Math.log(Math.max(mn, Math.min(MAX_ZOOM, z))) - lo) / (hi - lo)
  }

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const sliderVal = parseFloat(e.target.value)
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const mn = 0.1
    setMinZoom(mn)
    const lo = Math.log(mn), hi = Math.log(MAX_ZOOM)
    let newZoom = Math.exp(lo + sliderVal * (hi - lo))
    // Snap to each marked value when within 6% of its slider position
    const SNAP_POINTS = [0.25, 0.5, 1, 2]
    for (const sv of SNAP_POINTS) {
      const sp = (Math.log(sv) - lo) / (hi - lo)
      if (Math.abs(sliderVal - sp) < 0.06) { newZoom = sv; break }
    }
    const cx = rect.width / 2
    const cy = rect.height / 2
    const rawPanX = cx - (cx - panX) * (newZoom / zoom)
    const rawPanY = cy - (cy - panY) * (newZoom / zoom)
    const clamped = clampPan(rawPanX, rawPanY, newZoom, rect)
    zoomRef.current = newZoom
    panXRef.current = clamped.px
    panYRef.current = clamped.py
    setZoom(newZoom)
    setPanX(clamped.px)
    setPanY(clamped.py)
  }, [panX, panY, zoom])

  const cursorClass = isPanning
    ? "cursor-grabbing"
    : dragNodeRef.current
    ? "cursor-grabbing"
    : activeTool === "MOVE_NODE" && moveNodeMode === "screen"
    ? (hoveredNodeId ? "cursor-grab" : "cursor-default")
    : activeTool === "NODE" || activeTool === "MEMBER" || activeTool === "POINT_LOAD" || activeTool === "DISTRIBUTED_LOAD"
    ? "cursor-crosshair"
    : activeTool === "SELECT" || activeTool === "DELETE" || activeTool === "SUPPORT" || activeTool === "MODIFY_LOAD" || activeTool === null
    ? "cursor-pointer"
    : "cursor-default"

  // Hover tooltip data for the currently-hovered load — shows the case name so
  // users can identify which case a load belongs to without opening Modify Load.
  const hoveredLoadTooltip = (() => {
    if (!hoveredLoadId || !cursorPx || !loadCases) return null
    const load = model.loads[hoveredLoadId]
    if (!load) return null
    const c = loadCases[load.loadCaseId]
    if (!c) return null
    return { name: c.name, x: cursorPx.x, y: cursorPx.y }
  })()

  return (
    <div ref={containerRef} className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className={`w-full h-full ${cursorClass}`}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
        onMouseDown={handleMouseDown}
        onMouseUp={handleMouseUp}
        // Prevent context menu on middle-click
        onContextMenu={(e) => e.button === 1 && e.preventDefault()}
      />
      {hoveredLoadTooltip && (
        <div
          className="absolute z-30 pointer-events-none bg-white shadow-md rounded-md border border-gray-200 px-2 py-1"
          style={{
            left: hoveredLoadTooltip.x + 12,
            top: hoveredLoadTooltip.y + 12,
          }}
        >
          <span className="text-[11px] text-gray-700 whitespace-nowrap">
            {hoveredLoadTooltip.name}
          </span>
        </div>
      )}
      {/* Zoom slider + Adaptive View overlay — top-right of canvas */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5 border rounded-lg px-3 py-2 shadow-sm select-none pointer-events-auto opacity-100 bg-background/90 border-border">
        <div className="flex items-center gap-2">
          <ZoomOut className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          {/* Slider + snap tick marks */}
          <div className="relative flex flex-col items-start">
            <input
              type="range"
              min={0} max={1} step={0.001}
              value={zoomToSlider(zoom, minZoom)}
              onChange={handleSliderChange}
              className="w-24 cursor-pointer"
              style={{ height: "4px", accentColor: "#1a2f5e" }}
            />
            {/* Triangle ticks at snap positions. Each dims when thumb is at that value. */}
            {([0.25, 0.5, 1, 2] as const).map(sv => {
              const lo = Math.log(0.1), hi = Math.log(MAX_ZOOM)
              const pct = ((Math.log(sv) - lo) / (hi - lo)) * 100
              const isAt = Math.abs(zoom - sv) < 0.01
              return (
                <div
                  key={sv}
                  className="absolute pointer-events-none"
                  style={{
                    left: `${pct}%`,
                    top: "100%",
                    transform: "translateX(-50%)",
                    opacity: isAt ? 0.2 : 0.55,
                    transition: "opacity 0.15s",
                  }}
                >
                  <div style={{
                    width: 0, height: 0,
                    borderLeft: "2.5px solid transparent",
                    borderRight: "2.5px solid transparent",
                    borderBottom: "3.5px solid #1a2f5e",
                  }} />
                </div>
              )
            })}
          </div>
          <ZoomIn className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground w-10 text-right tabular-nums">
            {zoom === 1 ? "1x" : `${zoom.toFixed(2)}x`}
          </span>
        </div>
      </div>

      {/* Undo / Redo overlay — directly below the zoom card */}
      <div className="absolute top-14 right-3 z-10 flex items-center gap-1 border rounded-lg px-1.5 py-1 shadow-sm select-none pointer-events-auto bg-background/90 border-border">
        <button
          type="button"
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
          onClick={() => onUndo?.()}
          disabled={!canUndo}
          className={
            "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 " +
            (canUndo
              ? "text-[#1a2f5e] hover:bg-muted hover:scale-105 active:scale-95"
              : "opacity-40 pointer-events-none text-muted-foreground")
          }
        >
          <Undo2 className="w-4 h-4" />
        </button>
        <button
          type="button"
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
          onClick={() => onRedo?.()}
          disabled={!canRedo}
          className={
            "flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150 " +
            (canRedo
              ? "text-[#1a2f5e] hover:bg-muted hover:scale-105 active:scale-95"
              : "opacity-40 pointer-events-none text-muted-foreground")
          }
        >
          <Redo2 className="w-4 h-4" />
        </button>
      </div>
    </div>
  )
}
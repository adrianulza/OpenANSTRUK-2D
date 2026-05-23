/**
 * Shared constants for OpenANSTRUK-2D.
 *
 * Coordinate conventions:
 *  - World space:  metres, Y-axis points up (right-hand).
 *  - Screen space: pixels, Y-axis points down, origin at canvas top-left.
 *  - worldToScreen / screenToWorld (lib/geometry) perform the Y-flip and scaling.
 */

// ── Coordinate system ────────────────────────────────────────────────────────
export const SCALE = 80   // pixels per metre
export const GRID  = 40   // pixels per grid cell  (SCALE / 2 → 0.5 m cell)
export const SNAP  = 0.5  // metres per grid cell  (one snap step)

// ── Hit-test tolerances (world metres) ───────────────────────────────────────
export const HIT_TOL_NODE      = 0.2   // click-selection radius for nodes
export const HIT_TOL_MEMBER    = 0.15  // perpendicular distance for member hit
export const HIT_TOL_NODE_SNAP = 0.05  // exact-match radius used by findNodeAt

// ── Member endpoint exclusion (parametric t along segment) ───────────────────
// Prevents a click near a shared node from also registering as a member hit.
export const MEMBER_T_MIN = 0.02
export const MEMBER_T_MAX = 0.98

// ── Pointer / drag interaction ────────────────────────────────────────────────
// Below this screen-pixel distance a mousedown→mouseup is treated as a click.
export const DRAG_THRESHOLD_PX = 4

// ── Canvas gizmo (axis indicator) ────────────────────────────────────────────
export const GIZMO_AXIS_LENGTH = 50  // px
export const GIZMO_ARROW_SIZE  = 8   // px

// ── Canvas node and support glyphs ────────────────────────────────────────────
export const NODE_RADIUS   = 6   // px — node circle radius
export const SUPPORT_SIZE  = 20  // px — support glyph width

// ── Dimension overlay ─────────────────────────────────────────────────────────
// Clearance (in grid cells) between outermost nodes and dimension lines.
export const DIM_OFFSET_CELLS = 2

// ── Canvas drawing palette ────────────────────────────────────────────────────
// These are 2D-context hex values. Tailwind-side colours stay in class strings.
export const COLOR_BRAND         = "#1a2f5e"  // structural element default (dark navy)
export const COLOR_ACCENT        = "#ef4444"  // tool preview rubber-bands (NODE/FRAME ghosts)

// ── Interaction state palette (per-tool hover/selection) ─────────────────────
// Generic = MODIFY / MOVE / MODIFY_LOAD (yellow). Delete = DELETE tool (red).
export const COLOR_HOVER_GENERIC   = "#fcd34d"  // yellow-300 — generic hover stroke
export const COLOR_SELECT_GENERIC  = "#eab308"  // yellow-500 — generic selected stroke
export const COLOR_HOVER_DELETE    = "#fca5a5"  // red-300 — DELETE hover stroke
export const COLOR_SELECT_DELETE   = "#ef4444"  // red-500 — DELETE selected stroke
export const COLOR_FILL_HOVER_GEN  = "#fef9c3"  // yellow-100 — fill on generic hover
export const COLOR_FILL_SELECT_GEN = "#fef08a"  // yellow-200 — fill on generic selection
export const COLOR_FILL_HOVER_DEL  = "#fee2e2"  // red-100   — fill on DELETE hover
export const COLOR_FILL_SELECT_DEL = "#FFD6D6"  // red-200ish — fill on DELETE selection
export const COLOR_PREVIEW_NODE  = "#ef4444"  // ghost circle when placing a node
export const COLOR_PREVIEW_FRAME = "#ef4444"  // ghost line + circle when drawing a frame member
export const COLOR_GRID          = "#d1d5db"  // grid lines
export const COLOR_AXIS_X        = "#ef4444"  // gizmo X axis (red)
export const COLOR_AXIS_Y        = "#22c55e"  // gizmo Y axis (green)
export const COLOR_MEMBER_LABEL  = "#6b7280"  // mid-span section name label
export const COLOR_DIM_LINE      = "rgb(37, 99, 235)"  // dimension extension and witness lines
export const COLOR_DIM_TEXT      = "#1e293b"  // dimension annotation text
export const COLOR_SUPPORT_HATCH = "#94a3b8"  // support ground-line hatch
export const COLOR_CANVAS_BG     = "#F0F2F5"  // canvas background fill

// ── Load visualisation (Load-tab static render) ───────────────────────────────
export const COLOR_LOAD_FILL      = "#D7FDEB"  // distributed load fill (soft pastel green)
export const COLOR_LOAD_FILL_SEL  = "#FFD6D6"  // distributed load fill when selected (soft pastel red)
export const COLOR_LOAD_FILL_HVR  = "#FFFFCC"  // distributed load fill when hovered (soft pastel yellow)
export const COLOR_LOAD_STROKE    = "#0BE77E"  // distributed load stroke (green)
export const COLOR_LOAD_LABEL     = "#107343"  // load magnitude label text
export const LOAD_PT_ARROW_LEN_PX      = 50   // point load max shaft length in pixels
export const LOAD_PT_ARROWHEAD_SIZE_PX = 13   // point load arrowhead triangle size in pixels
export const LOAD_PT_LINE_WIDTH_PX     = 4    // point load shaft stroke width in pixels

export const LOAD_DIST_MAX_ARROW_PX      = 40  // distributed load max arrow length in pixels
export const LOAD_DIST_ARROWHEAD_SIZE_PX = 7   // distributed load arrowhead triangle size in pixels
export const LOAD_DIST_LINE_WIDTH_PX     = 2   // distributed load stroke width in pixels
export const LOAD_DIST_NUM_ARROWS        = 6   // number of arrows drawn along a distributed load
export const LOAD_DIST_FILL_ALPHA        = 0.5 // opacity of the distributed load fill region
export const LOAD_DIST_LABEL_GAP_PX     = 10   // px gap between baseline and label

// ── Diagram rendering (Analyze tab) ──────────────────────────────────────────
export const DIAGRAM_BASE_PX_PER_KN  = 4    // pixels per kN at scale=50 (SFD)
export const DIAGRAM_BASE_PX_PER_KNM = 4    // pixels per kN·m at scale=50 (BMD)
export const COLOR_SFD_POS           = "#3b82f6"  // positive shear fill (blue)
export const COLOR_SFD_NEG           = "#ef4444"  // negative shear fill (red)
export const COLOR_BMD_FILL          = "#f97316"  // moment diagram fill (orange)
export const COLOR_DIAGRAM_STROKE    = "#1e293b"  // diagram outline and label
export const DIAGRAM_LINE_WIDTH      = 1.5

// ── Number formatting utility ───────────────────────────────────────────────────
/**
 * Format a number for display:
 * - If the value is a round number (integer), display without decimals (e.g., "10")
 * - Otherwise, display with 3 decimal places (e.g., "10.567")
 */
export function formatValue(value: number): string {
  const rounded = Math.round(value)
  if (Math.abs(value - rounded) < 1e-9) {
    return rounded.toString()
  }
  return value.toFixed(3)
}
export const DIAGRAM_LABEL_FONT      = "500 11px 'JetBrains Mono'"

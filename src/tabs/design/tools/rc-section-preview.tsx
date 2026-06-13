import { barDia } from "@/lib/design/rebar"
import { buildBarLayout } from "@/lib/design/bar-layout"
import type { RebarArrangement } from "@/lib/design/types"

// Mirrors the Model-tab ShapePreview: fixed square frame, fixed viewBox, auto-fit
// scale (longer side → constant on-screen length), CAD dimension lines with a
// constant font. Changing b/h only re-proportions the rectangle — the footprint,
// label size, and label position stay put.
const STROKE = "#1a2f5e"
const FILL = "#1a2f5e15"
const BAR = "#1a2f5e"
const SIDE_BAR = "#1a2f5e"
const STIRRUP = "#5a6f96"
const DIM = "#1a2f5e"

// Fixed-proportion frame (VIEW_W : VIEW_H, full width). The section is auto-fit
// into the available area at its true b:h ratio, then scaled by SECTION_SIZE_PCT
// and centered — so the section (with its bars) gets smaller/larger as a whole
// while the frame, dimension lines, and label text stay constant.
export const VIEW_W = 150
export const VIEW_H = 118 // frame proportion — fixed shape
export const MARGIN_TOP = 14 // reserved for the b dimension line + label
export const MARGIN_LEFT = 14 // reserved for the h dimension line + label
export const MARGIN_RIGHT = 7
export const MARGIN_BOTTOM = 7
const SECTION_SIZE_PCT = 100 // ← overall section size within the frame;
export const DIM_OFFSET = 6 // gap from section edge to its dimension line

interface Props {
  /** Section width, mm */
  b: number
  /** Section height, mm */
  h: number
  /** Clear cover to stirrup, mm */
  cover: number
  arrangement: RebarArrangement
}

function safe(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1
}

/** ViewBox width — exported so the Advanced Report chart can convert the
 *  preview's viewBox-unit scale into on-screen pixels. */
export const PREVIEW_VIEW_W = VIEW_W

/**
 * Section auto-fit scale (viewBox units per mm) — the exact sizing rule this
 * preview uses. Shared with the Advanced Report chart so both sketches draw
 * the section at the same on-screen size.
 */
export function sectionFitScale(b: number, h: number): number {
  const availW = VIEW_W - MARGIN_LEFT - MARGIN_RIGHT
  const availH = VIEW_H - MARGIN_TOP - MARGIN_BOTTOM
  return (Math.min(availW / safe(b), availH / safe(h)) * SECTION_SIZE_PCT) / 100
}

// ── CAD dimension-line primitives (same style/sizes as ShapePreview) ─────────
const DIM_STROKE = 0.5
const EXT_GAP = 1.5
const EXT_OVER = 2.5
const ARROW_LEN = 3
const ARROW_HALF = 1.2
const LABEL_FONT = 5
const LABEL_PAD_X = 1.6
const LABEL_PAD_Y = 0.4

/** Horizontal dimension between x1 and x2 at y = yDim. Feature edge at yShape. */
export function HDim({
  x1,
  x2,
  yDim,
  yShape,
  label,
}: {
  x1: number
  x2: number
  yDim: number
  yShape: number
  label: string
}) {
  const dir = Math.sign(yDim - yShape) || -1
  const extStart = yShape + dir * EXT_GAP
  const extEnd = yDim + dir * EXT_OVER
  const labelW = label.length * (LABEL_FONT * 0.55) + LABEL_PAD_X * 2
  const labelH = LABEL_FONT + LABEL_PAD_Y * 2
  const labelCx = (x1 + x2) / 2
  return (
    <g stroke={DIM} fill="none" strokeWidth={DIM_STROKE}>
      <line x1={x1} y1={extStart} x2={x1} y2={extEnd} />
      <line x1={x2} y1={extStart} x2={x2} y2={extEnd} />
      <line x1={x1} y1={yDim} x2={x2} y2={yDim} />
      <polygon
        points={`${x1},${yDim} ${x1 + ARROW_LEN},${yDim - ARROW_HALF} ${x1 + ARROW_LEN},${yDim + ARROW_HALF}`}
        fill={DIM}
        stroke="none"
      />
      <polygon
        points={`${x2},${yDim} ${x2 - ARROW_LEN},${yDim - ARROW_HALF} ${x2 - ARROW_LEN},${yDim + ARROW_HALF}`}
        fill={DIM}
        stroke="none"
      />
      <rect
        x={labelCx - labelW / 2}
        y={yDim - labelH / 2}
        width={labelW}
        height={labelH}
        fill="white"
        stroke="none"
      />
      <text
        x={labelCx}
        y={yDim}
        fontSize={LABEL_FONT}
        fill={DIM}
        textAnchor="middle"
        dominantBaseline="central"
        stroke="none"
      >
        {label}
      </text>
    </g>
  )
}

/** Vertical dimension between y1 and y2 at x = xDim. Feature edge at xShape. */
export function VDim({
  y1,
  y2,
  xDim,
  xShape,
  label,
}: {
  y1: number
  y2: number
  xDim: number
  xShape: number
  label: string
}) {
  const dir = Math.sign(xDim - xShape) || -1
  const extStart = xShape + dir * EXT_GAP
  const extEnd = xDim + dir * EXT_OVER
  const labelW = label.length * (LABEL_FONT * 0.55) + LABEL_PAD_X * 2
  const labelH = LABEL_FONT + LABEL_PAD_Y * 2
  const labelCy = (y1 + y2) / 2
  return (
    <g stroke={DIM} fill="none" strokeWidth={DIM_STROKE}>
      <line x1={extStart} y1={y1} x2={extEnd} y2={y1} />
      <line x1={extStart} y1={y2} x2={extEnd} y2={y2} />
      <line x1={xDim} y1={y1} x2={xDim} y2={y2} />
      <polygon
        points={`${xDim},${y1} ${xDim - ARROW_HALF},${y1 + ARROW_LEN} ${xDim + ARROW_HALF},${y1 + ARROW_LEN}`}
        fill={DIM}
        stroke="none"
      />
      <polygon
        points={`${xDim},${y2} ${xDim - ARROW_HALF},${y2 - ARROW_LEN} ${xDim + ARROW_HALF},${y2 - ARROW_LEN}`}
        fill={DIM}
        stroke="none"
      />
      {/* rotate the label so it reads bottom-to-top along the dimension line */}
      <g transform={`rotate(-90 ${xDim} ${labelCy})`}>
        <rect
          x={xDim - labelW / 2}
          y={labelCy - labelH / 2}
          width={labelW}
          height={labelH}
          fill="white"
          stroke="none"
        />
        <text
          x={xDim}
          y={labelCy}
          fontSize={LABEL_FONT}
          fill={DIM}
          textAnchor="middle"
          dominantBaseline="central"
          stroke="none"
        >
          {label}
        </text>
      </g>
    </g>
  )
}

export function RcSectionPreview({ b, h, cover, arrangement }: Props) {
  b = safe(b)
  h = safe(h)
  // Auto-fit the section into the available area (frame minus margins) at its
  // true b:h ratio, then scale by SECTION_SIZE_PCT and centre it.
  const availW = VIEW_W - MARGIN_LEFT - MARGIN_RIGHT
  const availH = VIEW_H - MARGIN_TOP - MARGIN_BOTTOM
  const scale = sectionFitScale(b, h)
  const w = b * scale
  const ht = h * scale
  const x = MARGIN_LEFT + (availW - w) / 2
  const y = MARGIN_TOP + (availH - ht) / 2

  const cv = Math.max(0, cover) * scale
  const dbS = barDia(arrangement.stirrup.size) * scale
  // Stirrup centerline inset = cover + half stirrup diameter
  const sx = x + cv
  const sy = y + cv
  const sw = Math.max(2, w - 2 * cv)
  const sh = Math.max(2, ht - 2 * cv)

  // Bar positions come from the SAME layout module the design math uses —
  // auto-overflow into a 2nd layer @ 50 mm clear, side bars evenly distributed
  // between the innermost top and bottom rows.
  const layout = buildBarLayout(b, h, Math.max(0, cover), arrangement)

  const yDimTop = y - DIM_OFFSET
  const xDimLeft = x - DIM_OFFSET

  return (
    <div
      className="rounded border bg-gray-50 flex items-center justify-center"
      style={{ width: "100%", aspectRatio: `${VIEW_W} / ${VIEW_H}`, borderColor: "#e5e7eb" }}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {/* concrete outline */}
        <rect x={x} y={y} width={w} height={ht} fill={FILL} stroke={STROKE} strokeWidth={1.2} />
        {/* stirrup */}
        <rect
          x={sx}
          y={sy}
          width={sw}
          height={sh}
          rx={Math.min(4, dbS * 2 + 1.5)}
          fill="none"
          stroke={STIRRUP}
          strokeWidth={Math.max(0.8, dbS)}
          opacity={0.85}
        />
        {/* bars (top/bottom incl. layer 2, side) — from the shared layout */}
        {layout.bars.map((p, i) => (
          <circle
            key={i}
            cx={x + p.x * scale}
            cy={y + p.y * scale}
            r={Math.max(1.0, (p.db / 2) * scale)}
            fill={p.role === "side" ? SIDE_BAR : BAR}
          />
        ))}
        {/* dimension lines — fixed size, fixed position in the PAD margin */}
        <HDim x1={x} x2={x + w} yDim={yDimTop} yShape={y} label={`b = ${Math.round(b)}`} />
        <VDim y1={y} y2={y + ht} xDim={xDimLeft} xShape={x} label={`h = ${Math.round(h)}`} />
      </svg>
    </div>
  )
}

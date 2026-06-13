import { barDia } from "@/lib/design/rebar"
import { buildColumnBarLayout } from "@/lib/design/column-layout"
import type { ColumnArrangement } from "@/lib/design/types"
import {
  DIM_OFFSET,
  HDim,
  MARGIN_BOTTOM,
  MARGIN_LEFT,
  MARGIN_RIGHT,
  MARGIN_TOP,
  sectionFitScale,
  VDim,
  VIEW_H,
  VIEW_W,
} from "./rc-section-preview"

/**
 * Live RC column cross-section: an nx × ny perimeter bar grid with the tie,
 * drawn at the same on-screen size and CAD style as RcSectionPreview (shared
 * fit scale + dimension primitives). Bars come from the SAME layout module the
 * P–M interaction math uses, so drawing and analysis can never disagree.
 */

const STROKE = "#1a2f5e"
const FILL = "#1a2f5e15"
const BAR = "#1a2f5e"
const TIE = "#5a6f96"

interface Props {
  /** Section width, mm */
  b: number
  /** Section height, mm */
  h: number
  /** Clear cover to tie, mm */
  cover: number
  arrangement: ColumnArrangement
}

function safe(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1
}

export function RcColumnPreview({ b, h, cover, arrangement }: Props) {
  b = safe(b)
  h = safe(h)
  const availW = VIEW_W - MARGIN_LEFT - MARGIN_RIGHT
  const availH = VIEW_H - MARGIN_TOP - MARGIN_BOTTOM
  const scale = sectionFitScale(b, h)
  const w = b * scale
  const ht = h * scale
  const x = MARGIN_LEFT + (availW - w) / 2
  const y = MARGIN_TOP + (availH - ht) / 2

  const cv = Math.max(0, cover) * scale
  const sx = x + cv
  const sy = y + cv
  const sw = Math.max(2, w - 2 * cv)
  const sh = Math.max(2, ht - 2 * cv)

  const layout = buildColumnBarLayout(b, h, Math.max(0, cover), arrangement)
  const tieW = Math.max(0.8, barDia(arrangement.tie.size) * scale)

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
        {/* tie */}
        <rect
          x={sx} y={sy} width={sw} height={sh}
          rx={3} fill="none" stroke={TIE} strokeWidth={tieW} opacity={0.85}
        />
        {/* perimeter bars from the shared layout */}
        {layout.bars.map((p, i) => (
          <circle
            key={i}
            cx={x + p.x * scale}
            cy={y + p.y * scale}
            r={Math.max(1.0, (p.db / 2) * scale)}
            fill={BAR}
          />
        ))}
        {/* dimension lines */}
        <HDim x1={x} x2={x + w} yDim={yDimTop} yShape={y} label={`b = ${Math.round(b)}`} />
        <VDim y1={y} y2={y + ht} xDim={xDimLeft} xShape={x} label={`h = ${Math.round(h)}`} />
      </svg>
    </div>
  )
}

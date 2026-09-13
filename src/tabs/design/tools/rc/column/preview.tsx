import { barDia } from "@/lib/design/rc/shared/rebar"
import { buildColumnBarLayout } from "@/lib/design/rc/shared/column-grid"
import type { ColumnGeom } from "@/lib/design/rc/shared/types"
import { isCircle, type ColumnArrangement } from "@/lib/design/rc/types"
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
} from "../beam/preview"

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

  const circle = isCircle(arrangement)
  const geom: ColumnGeom = circle ? { kind: "circle", D: h } : { kind: "rect", b, h }
  const layout = buildColumnBarLayout(geom, Math.max(0, cover), arrangement)
  const tieW = Math.max(0.8, barDia(arrangement.tie.size) * scale)

  // Circle centre + radii (screen), used for the outline + tie/spiral ring.
  const cxC = x + w / 2
  const cyC = y + ht / 2
  const rOuter = Math.min(w, ht) / 2
  const rCore = Math.max(2, rOuter - cv)

  const yDimTop = y - DIM_OFFSET
  const xDimLeft = x - DIM_OFFSET

  return (
    <div
      className="rounded border bg-gray-50 flex items-center justify-center"
      style={{ width: "100%", aspectRatio: `${VIEW_W} / ${VIEW_H}`, borderColor: "#e5e7eb" }}
    >
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {circle ? (
          <>
            {/* concrete outline */}
            <circle cx={cxC} cy={cyC} r={rOuter} fill={FILL} stroke={STROKE} strokeWidth={1.2} />
            {/* transverse reinforcement: single ring (spiral or circular hoop) */}
            <circle cx={cxC} cy={cyC} r={rCore} fill="none" stroke={TIE} strokeWidth={tieW} opacity={0.85} />
          </>
        ) : (
          <>
            {/* concrete outline */}
            <rect x={x} y={y} width={w} height={ht} fill={FILL} stroke={STROKE} strokeWidth={1.2} />
            {/* rectangular tie */}
            <rect x={sx} y={sy} width={sw} height={sh} rx={3} fill="none" stroke={TIE} strokeWidth={tieW} opacity={0.85} />
          </>
        )}
        {/* bars from the shared layout */}
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
        {circle ? (
          <HDim x1={x} x2={x + w} yDim={yDimTop} yShape={y} label={`D = ${Math.round(h)}`} />
        ) : (
          <>
            <HDim x1={x} x2={x + w} yDim={yDimTop} yShape={y} label={`b = ${Math.round(b)}`} />
            <VDim y1={y} y2={y + ht} xDim={xDimLeft} xShape={x} label={`h = ${Math.round(h)}`} />
          </>
        )}
      </svg>
    </div>
  )
}

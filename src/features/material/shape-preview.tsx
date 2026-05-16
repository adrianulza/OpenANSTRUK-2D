import * as React from "react"
import type { SectionShape } from "@/lib/model"

const STROKE = "#1a2f5e"
const FILL   = "#1a2f5e22"
const DIM    = "#1a2f5e"   // dimension lines + arrows + extension lines

const VIEW = 100
const PAD  = 22            // leaves room for dim lines around the shape

interface Props {
  kind: SectionShape
  dims: Record<string, number>
}

export function ShapePreview({ kind, dims }: Props) {
  let svg: React.ReactNode = null
  if (kind === "rect")   svg = <RectSVG b={dims.b} h={dims.h} />
  if (kind === "circle") svg = <CircleSVG d={dims.d} />
  if (kind === "iwf")    svg = <IwfSVG b={dims.b} h={dims.h} tf={dims.tf} tw={dims.tw} />

  return (
    <div
      className="rounded border bg-gray-50 flex items-center justify-center"
      style={{ width: "100%", aspectRatio: "1 / 1", borderColor: "#e5e7eb" }}
    >
      <svg viewBox={`0 0 ${VIEW} ${VIEW}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
        {svg}
      </svg>
    </div>
  )
}

function safe(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 1
}

// ── Dimension-line primitives ────────────────────────────────────────────────
// CAD-style: thin extension lines from the feature, perpendicular dimension
// line with filled-triangle arrowheads pointing inward, label centered in a
// small white pill that breaks the line for legibility.

const DIM_STROKE  = 0.5
const EXT_GAP     = 1.5   // gap from shape to start of extension line
const EXT_OVER    = 2.5   // extension line overshoots dimension line by this
const ARROW_LEN   = 3
const ARROW_HALF  = 1.2
const LABEL_FONT  = 5
const LABEL_PAD_X = 1.6
const LABEL_PAD_Y = 0.4

/** Horizontal dimension between x1 and x2 at y = yDim. Feature edge at yShape. */
function HDim({
  x1, x2, yDim, yShape, label,
}: { x1: number; x2: number; yDim: number; yShape: number; label: string }) {
  // Extension direction: from shape edge toward dim line
  const dir = Math.sign(yDim - yShape) || -1
  const extStart = yShape + dir * EXT_GAP
  const extEnd   = yDim + dir * EXT_OVER
  const labelW   = label.length * (LABEL_FONT * 0.55) + LABEL_PAD_X * 2
  const labelH   = LABEL_FONT + LABEL_PAD_Y * 2
  const labelCx  = (x1 + x2) / 2
  return (
    <g stroke={DIM} fill="none" strokeWidth={DIM_STROKE}>
      {/* extension lines */}
      <line x1={x1} y1={extStart} x2={x1} y2={extEnd} />
      <line x1={x2} y1={extStart} x2={x2} y2={extEnd} />
      {/* dimension line */}
      <line x1={x1} y1={yDim} x2={x2} y2={yDim} />
      {/* arrowheads — filled triangles pointing inward */}
      <polygon points={`${x1},${yDim} ${x1 + ARROW_LEN},${yDim - ARROW_HALF} ${x1 + ARROW_LEN},${yDim + ARROW_HALF}`} fill={DIM} stroke="none" />
      <polygon points={`${x2},${yDim} ${x2 - ARROW_LEN},${yDim - ARROW_HALF} ${x2 - ARROW_LEN},${yDim + ARROW_HALF}`} fill={DIM} stroke="none" />
      {/* label pill */}
      <rect x={labelCx - labelW / 2} y={yDim - labelH / 2} width={labelW} height={labelH} fill="white" stroke="none" />
      <text x={labelCx} y={yDim} fontSize={LABEL_FONT} fill={DIM} textAnchor="middle" dominantBaseline="central" stroke="none">
        {label}
      </text>
    </g>
  )
}

/** Vertical dimension between y1 and y2 at x = xDim. Feature edge at xShape. */
function VDim({
  y1, y2, xDim, xShape, label,
}: { y1: number; y2: number; xDim: number; xShape: number; label: string }) {
  const dir = Math.sign(xDim - xShape) || -1
  const extStart = xShape + dir * EXT_GAP
  const extEnd   = xDim + dir * EXT_OVER
  const labelW   = label.length * (LABEL_FONT * 0.55) + LABEL_PAD_X * 2
  const labelH   = LABEL_FONT + LABEL_PAD_Y * 2
  const labelCy  = (y1 + y2) / 2
  return (
    <g stroke={DIM} fill="none" strokeWidth={DIM_STROKE}>
      <line x1={extStart} y1={y1} x2={extEnd} y2={y1} />
      <line x1={extStart} y1={y2} x2={extEnd} y2={y2} />
      <line x1={xDim} y1={y1} x2={xDim} y2={y2} />
      <polygon points={`${xDim},${y1} ${xDim - ARROW_HALF},${y1 + ARROW_LEN} ${xDim + ARROW_HALF},${y1 + ARROW_LEN}`} fill={DIM} stroke="none" />
      <polygon points={`${xDim},${y2} ${xDim - ARROW_HALF},${y2 - ARROW_LEN} ${xDim + ARROW_HALF},${y2 - ARROW_LEN}`} fill={DIM} stroke="none" />
      <rect x={xDim - labelW / 2} y={labelCy - labelH / 2} width={labelW} height={labelH} fill="white" stroke="none" />
      <text x={xDim} y={labelCy} fontSize={LABEL_FONT} fill={DIM} textAnchor="middle" dominantBaseline="central" stroke="none">
        {label}
      </text>
    </g>
  )
}

function RectSVG({ b, h }: { b: number; h: number }) {
  b = safe(b); h = safe(h)
  const maxDim = Math.max(b, h)
  const scale = (VIEW - 2 * PAD) / maxDim
  const w = b * scale, ht = h * scale
  const x = (VIEW - w) / 2, y = (VIEW - ht) / 2
  // Dimension-line offsets sit half-way through the outer padding
  const yDimTop  = y - PAD / 2
  const xDimLeft = x - PAD / 2
  return (
    <g>
      <rect x={x} y={y} width={w} height={ht} fill={FILL} stroke={STROKE} strokeWidth={1.2} />
      <HDim x1={x} x2={x + w} yDim={yDimTop}  yShape={y}        label="b" />
      <VDim y1={y} y2={y + ht} xDim={xDimLeft} xShape={x}        label="h" />
    </g>
  )
}

function CircleSVG({ d }: { d: number }) {
  d = safe(d)
  const scale = (VIEW - 2 * PAD) / d
  const r = (d * scale) / 2
  const cx = VIEW / 2, cy = VIEW / 2
  const left  = cx - r, right = cx + r
  const top   = cy - r
  const yDim  = top - PAD / 2
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill={FILL} stroke={STROKE} strokeWidth={1.2} />
      <HDim x1={left} x2={right} yDim={yDim} yShape={top} label="d" />
    </g>
  )
}

/**
 * Leader line: points from a target (xT, yT) inside/at a feature, out to a
 * label position (xL, yL). Arrowhead sits at the target end. Used for thin
 * features (tf, tw) where a full dimension line would not fit.
 */
function Leader({
  xT, yT, xL, yL, label,
}: { xT: number; yT: number; xL: number; yL: number; label: string }) {
  // Arrowhead orientation: along the leader, pointing at the target.
  const dx = xT - xL, dy = yT - yL
  const len = Math.hypot(dx, dy) || 1
  const ux = dx / len, uy = dy / len
  // Perpendicular for the arrow's base width
  const px = -uy, py = ux
  const baseX = xT - ux * ARROW_LEN
  const baseY = yT - uy * ARROW_LEN
  const ax = baseX + px * ARROW_HALF, ay = baseY + py * ARROW_HALF
  const bx = baseX - px * ARROW_HALF, by = baseY - py * ARROW_HALF
  const labelW = label.length * (LABEL_FONT * 0.55) + LABEL_PAD_X * 2
  const labelH = LABEL_FONT + LABEL_PAD_Y * 2
  return (
    <g stroke={DIM} fill="none" strokeWidth={DIM_STROKE}>
      <line x1={xL} y1={yL} x2={xT} y2={yT} />
      <polygon points={`${xT},${yT} ${ax},${ay} ${bx},${by}`} fill={DIM} stroke="none" />
      <rect x={xL - labelW / 2} y={yL - labelH / 2} width={labelW} height={labelH} fill="white" stroke="none" />
      <text x={xL} y={yL} fontSize={LABEL_FONT} fill={DIM} textAnchor="middle" dominantBaseline="central" stroke="none">
        {label}
      </text>
    </g>
  )
}

function IwfSVG({ b, h, tf, tw }: { b: number; h: number; tf: number; tw: number }) {
  b = safe(b); h = safe(h); tf = safe(tf); tw = safe(tw)
  const maxDim = Math.max(b, h)
  const scale = (VIEW - 2 * PAD) / maxDim
  const W = b * scale, H = h * scale
  const TF = tf * scale, TW = tw * scale
  const x = (VIEW - W) / 2, y = (VIEW - H) / 2
  const cx = x + W / 2

  const yDimTop  = y - PAD / 2
  const xDimLeft = x - PAD / 2

  // Leader targets: tf points at mid-thickness of top flange, on its right edge.
  // tw points at mid-thickness of the web, just below the top flange.
  const tfTargetX = x + W
  const tfTargetY = y + TF / 2
  const tfLabelX  = x + W + PAD / 2
  const tfLabelY  = y + TF / 2

  const twTargetX = cx + TW / 2
  const twTargetY = y + TF + (H - 2 * TF) * 0.25  // upper quarter of web
  const twLabelX  = cx + W / 2 * 0.55             // pulled outward to the right
  const twLabelY  = twTargetY - PAD * 0.25

  return (
    <g>
      {/* top flange */}
      <rect x={x} y={y} width={W} height={TF} fill={FILL} stroke={STROKE} strokeWidth={1.2} />
      {/* web */}
      <rect x={cx - TW / 2} y={y + TF} width={TW} height={H - 2 * TF} fill={FILL} stroke={STROKE} strokeWidth={1.2} />
      {/* bottom flange */}
      <rect x={x} y={y + H - TF} width={W} height={TF} fill={FILL} stroke={STROKE} strokeWidth={1.2} />

      <HDim   x1={x} x2={x + W} yDim={yDimTop}  yShape={y}        label="b" />
      <VDim   y1={y} y2={y + H} xDim={xDimLeft} xShape={x}        label="h" />
      <Leader xT={tfTargetX} yT={tfTargetY} xL={tfLabelX} yL={tfLabelY} label="tf" />
      <Leader xT={twTargetX} yT={twTargetY} xL={twLabelX} yL={twLabelY} label="tw" />
    </g>
  )
}

/**
 * Live cross-section preview for the STEEL design tool — IWF, RHS, CHS, tee and
 * single angle.
 *
 * Pure geometry: it reads `section.shape.dims` and nothing else, so it renders
 * identically before and after a design run. Dimension lines reuse `HDim`/`VDim`
 * and the auto-fit rule from the RC beam preview — those are material-agnostic
 * SVG primitives, and sharing them is what keeps the two tools' sections drawn
 * at the same on-screen size.
 *
 * THE ANGLE GETS ONE EXTRA LAYER: its principal axes, drawn rotated by α. That
 * is the single most useful thing this preview can show, because it makes the
 * engine's most surprising result self-explanatory — the solver bends the member
 * about the geometric 3-axis, but the section resists about w and z, so ONE
 * moment produces TWO components (`Mw = M33·cos α`, `Mz = −M33·sin α`) and with
 * `Iz ≈ Iw/4` the minor one usually dominates. See DESIGN_STEEL.md §S3.1.
 */

import type { Section } from "@/lib/model"
import {
  DIM_OFFSET, HDim, MARGIN_BOTTOM, MARGIN_LEFT, MARGIN_RIGHT, MARGIN_TOP,
  VDim, VIEW_H, VIEW_W, sectionFitScale,
} from "../rc/beam/preview"

const NAVY = "#1a2f5e"
const STEEL_FILL = "#dbe3f0"
const STEEL_STROKE = "#1a2f5e"
const AXIS_W = "#0ea5e9" // major principal
const AXIS_Z = "#f97316" // minor principal

/** Outline polygon (mm, origin bottom-left) + overall bounding box per shape. */
interface Outline {
  /** Closed polygon points in mm, y measured UP from the section's base. */
  pts: [number, number][]
  /** Circle instead of a polygon (CHS): outer/inner radii + centre. */
  circle?: { r: number; ri: number }
  w: number
  h: number
  /** Dimension labels: [horizontal, vertical]. */
  labels: [string, string]
}

function outlineOf(kind: string, d: Record<string, number>): Outline | null {
  const n = (v: number | undefined) => (Number.isFinite(v) && (v as number) > 0 ? (v as number) : 0)
  switch (kind) {
    case "iwf": {
      const b = n(d.b), h = n(d.h), tf = n(d.tf), tw = n(d.tw)
      if (!(b && h && tf && tw) || 2 * tf >= h || tw >= b) return null
      const x0 = (b - tw) / 2
      return {
        w: b, h,
        labels: [`b ${b}`, `h ${h}`],
        pts: [
          [0, 0], [b, 0], [b, tf], [x0 + tw, tf], [x0 + tw, h - tf], [b, h - tf],
          [b, h], [0, h], [0, h - tf], [x0, h - tf], [x0, tf], [0, tf],
        ],
      }
    }
    case "rhs": {
      const b = n(d.b), h = n(d.h), t = n(d.t)
      if (!(b && h && t) || 2 * t >= Math.min(b, h)) return null
      return {
        w: b, h,
        labels: [`b ${b}`, `h ${h}`],
        // Outer ring then inner ring reversed — evenodd fill leaves the void.
        pts: [
          [0, 0], [b, 0], [b, h], [0, h], [0, 0],
          [t, t], [t, h - t], [b - t, h - t], [b - t, t], [t, t],
        ],
      }
    }
    case "chs": {
      const D = n(d.d ?? d.D), t = n(d.t)
      if (!(D && t) || 2 * t >= D) return null
      return { w: D, h: D, labels: [`D ${D}`, `D ${D}`], circle: { r: D / 2, ri: D / 2 - t }, pts: [] }
    }
    case "tee": {
      // Flange on TOP — the convention `sections/shapes/tee.ts` pins, and the
      // one the F9 sign branches are written against.
      const bf = n(d.bf), tf = n(d.tf), bw = n(d.bw), h = n(d.h)
      if (!(bf && tf && bw && h) || tf >= h || bw >= bf) return null
      const x0 = (bf - bw) / 2
      return {
        w: bf, h,
        labels: [`bf ${bf}`, `h ${h}`],
        pts: [
          [x0, 0], [x0 + bw, 0], [x0 + bw, h - tf], [bf, h - tf],
          [bf, h], [0, h], [0, h - tf], [x0, h - tf],
        ],
      }
    }
    case "angle": {
      // Heel at the origin; horizontal leg b along +x, vertical leg d along +y.
      const b = n(d.b), t = n(d.t)
      const dd = n(d.d) || b // back-compat: saved {b,t} sections are equal-leg
      if (!(b && dd && t) || t >= Math.min(b, dd)) return null
      return {
        w: b, h: dd,
        labels: [`b ${b}`, `d ${dd}`],
        pts: [[0, 0], [b, 0], [b, t], [t, t], [t, dd], [0, dd]],
      }
    }
    default:
      return null
  }
}

export function SteelSectionPreview({ section }: { section: Section }) {
  const shape = section.shape
  const out = shape ? outlineOf(shape.kind, shape.dims) : null

  if (!out) {
    return (
      <div className="rounded border border-gray-200 bg-gray-50 px-2 py-3">
        <p className="text-[10px] text-gray-500 leading-snug">
          No preview: this section has no parametric shape, or its dimensions are
          not a buildable cross-section.
        </p>
      </div>
    )
  }

  const s = sectionFitScale(out.w, out.h)
  const availW = VIEW_W - MARGIN_LEFT - MARGIN_RIGHT
  const availH = VIEW_H - MARGIN_TOP - MARGIN_BOTTOM
  const drawW = out.w * s
  const drawH = out.h * s
  const ox = MARGIN_LEFT + (availW - drawW) / 2
  const oyBase = MARGIN_TOP + (availH - drawH) / 2 + drawH // y of the section base

  // mm (y-up, from the base) → viewBox (y-down).
  const X = (mm: number) => ox + mm * s
  const Y = (mm: number) => oyBase - mm * s

  const poly = out.pts.map(([x, y]) => `${X(x).toFixed(2)},${Y(y).toFixed(2)}`).join(" ")

  // Principal axes — angle only. `alpha` is CCW from geometric axis 3 in world
  // terms; the SVG y-axis points DOWN, so the drawn angle is negated.
  const pr = section.derived?.principal
  const axes = pr && shape?.kind === "angle" ? (() => {
    const cx = X(centroidX(shape.dims))
    const cy = Y(centroidY(shape.dims))
    const len = Math.min(drawW, drawH) * 0.72
    const ca = Math.cos(pr.alpha), sa = Math.sin(pr.alpha)
    return {
      cx, cy,
      w: { dx: ca * len, dy: -sa * len },
      z: { dx: -sa * len, dy: -ca * len },
      deg: (pr.alpha * 180) / Math.PI,
    }
  })() : null

  return (
    <div className="rounded border border-gray-200 bg-white">
      <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="block w-full h-auto">
        {out.circle ? (
          <>
            <circle
              cx={X(out.w / 2)} cy={Y(out.h / 2)} r={out.circle.r * s}
              fill={STEEL_FILL} stroke={STEEL_STROKE} strokeWidth={0.7}
            />
            <circle
              cx={X(out.w / 2)} cy={Y(out.h / 2)} r={out.circle.ri * s}
              fill="#fff" stroke={STEEL_STROKE} strokeWidth={0.7}
            />
          </>
        ) : (
          <polygon
            points={poly} fill={STEEL_FILL} stroke={STEEL_STROKE}
            strokeWidth={0.7} fillRule="evenodd" strokeLinejoin="round"
          />
        )}

        {axes && (
          <g>
            <line
              x1={axes.cx - axes.w.dx} y1={axes.cy - axes.w.dy}
              x2={axes.cx + axes.w.dx} y2={axes.cy + axes.w.dy}
              stroke={AXIS_W} strokeWidth={0.7} strokeDasharray="4 2"
            />
            <line
              x1={axes.cx - axes.z.dx} y1={axes.cy - axes.z.dy}
              x2={axes.cx + axes.z.dx} y2={axes.cy + axes.z.dy}
              stroke={AXIS_Z} strokeWidth={0.7} strokeDasharray="4 2"
            />
            <text
              x={axes.cx + axes.w.dx} y={axes.cy + axes.w.dy - 1.5}
              fontSize={5} fill={AXIS_W} textAnchor="middle" className="font-mono"
            >w</text>
            <text
              x={axes.cx + axes.z.dx} y={axes.cy + axes.z.dy - 1.5}
              fontSize={5} fill={AXIS_Z} textAnchor="middle" className="font-mono"
            >z</text>
          </g>
        )}

        <HDim
          x1={X(0)} x2={X(out.w)}
          yDim={MARGIN_TOP - DIM_OFFSET} yShape={Y(out.h)}
          label={out.labels[0]}
        />
        <VDim
          y1={Y(out.h)} y2={Y(0)}
          xDim={MARGIN_LEFT - DIM_OFFSET} xShape={X(0)}
          label={out.labels[1]}
        />
      </svg>
      {axes && (
        <p className="px-2 pb-1.5 text-[9px] leading-snug text-gray-500">
          Principal axes at <span className="font-mono" style={{ color: NAVY }}>
            α = {axes.deg.toFixed(1)}°
          </span> to the geometric axes. Bending about the geometric 3-axis
          therefore acts on <span style={{ color: AXIS_W }}>w</span> and
          {" "}<span style={{ color: AXIS_Z }}>z</span> at once.
        </p>
      )}
    </div>
  )
}

/** Angle centroid, mm from the heel — matches `sections/shapes/angle.ts`. */
function centroidX(d: Record<string, number>): number {
  const b = d.b, t = d.t, dd = d.d ?? d.b
  const a1 = b * t, a2 = t * (dd - t)
  return (a1 * (b / 2) + a2 * (t / 2)) / (a1 + a2)
}
function centroidY(d: Record<string, number>): number {
  const b = d.b, t = d.t, dd = d.d ?? d.b
  const a1 = b * t, a2 = t * (dd - t)
  return (a1 * (t / 2) + a2 * ((t + dd) / 2)) / (a1 + a2)
}

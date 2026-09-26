import type { Section, StructureModel } from "@/lib/model"
import type { AnalysisResult } from "@/lib/solver"

/** How the deformed shape is coloured: off, |u|, or a signed component. */
export type DeformColor = "off" | "total" | "ux" | "uy"

/** The Deformation view's display state, owned by App. */
export interface DeformViewState {
  color: DeformColor
  /** Members drawn at their real section depth instead of as centrelines. */
  extrude: boolean
  playing: boolean
  /** Playback speed multiplier: 0.5, 1 or 2. */
  speed: number
}

export const DEFAULT_DEFORM_VIEW: DeformViewState = {
  color: "total",
  extrude: false,
  playing: false,
  speed: 1,
}

/** Model-wide peaks of a displacement field: |u| and the two signed components. */
export interface DeformationPeaks {
  total: number
  ux: number
  uy: number
}

/**
 * Cubic-Hermite deflected shape of one member at station xi ∈ [0, 1]: the
 * global displacement (dx, dy) of the point, from the end displacements.
 */
export function memberDisplacementAt(
  a: { x: number; y: number },
  b: { x: number; y: number },
  dA: { u: number; v: number; theta: number },
  dB: { u: number; v: number; theta: number },
  xi: number,
): { dx: number; dy: number } {
  const ex = b.x - a.x, ey = b.y - a.y
  const L = Math.hypot(ex, ey)
  const c = ex / L, sn = ey / L
  const u1 = c * dA.u + sn * dA.v, v1 = -sn * dA.u + c * dA.v
  const u2 = c * dB.u + sn * dB.v, v2 = -sn * dB.u + c * dB.v
  const uLoc = (1 - xi) * u1 + xi * u2
  const H1 = 1 - 3*xi*xi + 2*xi*xi*xi
  const H2 = L * xi * (1 - xi) * (1 - xi)
  const H3 = 3*xi*xi - 2*xi*xi*xi
  const H4 = L * xi*xi * (xi - 1)
  const vLoc = H1*v1 + H2*dA.theta + H3*v2 + H4*dB.theta
  return { dx: c * uLoc - sn * vLoc, dy: sn * uLoc + c * vLoc }
}

/** |u|, |ux| and |uy| peaks along every member's deflected shape. */
export function deformationPeaks(
  model: StructureModel,
  result: AnalysisResult | null,
): DeformationPeaks {
  const out = { total: 0, ux: 0, uy: 0 }
  if (!result) return out
  const N_PTS = 40
  for (const m of Object.values(model.members)) {
    const a = model.nodes[m.a], b = model.nodes[m.b]
    const dA = result.nodeDisplacements[m.a], dB = result.nodeDisplacements[m.b]
    if (!a || !b || !dA || !dB) continue
    if (Math.hypot(b.x - a.x, b.y - a.y) < 1e-9) continue
    for (let i = 0; i <= N_PTS; i++) {
      const { dx, dy } = memberDisplacementAt(a, b, dA, dB, i / N_PTS)
      out.total = Math.max(out.total, Math.hypot(dx, dy))
      out.ux = Math.max(out.ux, Math.abs(dx))
      out.uy = Math.max(out.uy, Math.abs(dy))
    }
  }
  return out
}

/**
 * A section's extent along member local-2 (its in-plane depth), measured from
 * the centroid in metres, plus the lines worth drawing inside the band
 * (flange faces, hollow walls). Sections without a parametric shape use the
 * depth of the equivalent rectangle, h = √(12·I/A).
 */
export interface SectionElevation {
  bottom: number
  top: number
  /** Offsets from the centroid, m, of inner lines (flange / wall faces). */
  lines: number[]
}

export function sectionElevation(sec: Section): SectionElevation {
  const MM = 1e-3
  const d = sec.shape?.dims ?? {}
  let depth: number
  let lines: number[] = []
  switch (sec.shape?.kind) {
    case "rect":
      depth = d.h
      break
    case "circle":
      depth = d.d
      break
    case "chs":
      depth = d.d
      lines = [d.t, d.d - d.t]
      break
    case "rhs":
      depth = d.h
      lines = [d.t, d.h - d.t]
      break
    case "iwf":
      depth = d.h
      lines = [d.tf, d.h - d.tf]
      break
    case "tee":
      depth = d.h
      lines = [d.h - d.tf]
      break
    case "angle":
      depth = d.d ?? d.b
      lines = [d.t]
      break
    default:
      depth = sec.A > 0 && sec.I33 > 0 ? Math.sqrt((12 * sec.I33) / sec.A) : 0
  }
  if (!(depth > 0)) return { bottom: 0, top: 0, lines: [] }
  const yBar = sec.derived?.yBar ?? depth / 2
  return {
    bottom: -yBar * MM,
    top: (depth - yBar) * MM,
    lines: lines.filter((y) => y > 0 && y < depth).map((y) => (y - yBar) * MM),
  }
}

/**
 * Peak displacement magnitude of a result, sampled along each member's
 * cubic-Hermite deflected shape (not only at the nodes), so mid-span sag
 * counts. The canvas scales the deformed shape to this peak; the Deformation
 * tool reports the amplification it implies.
 */
export function peakDeformation(model: StructureModel, result: AnalysisResult | null): number {
  return deformationPeaks(model, result).total
}

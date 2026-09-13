/**
 * Shared RC design contract types — code-agnostic. Geometry (shared/) and the
 * per-code strategies (codes/) both depend on these; the types never carry any
 * code-specific math, only the shapes that cross the layer boundary.
 */

/** A reinforcing bar reduced to (depth from the compression fibre, area). */
export interface ColumnBar {
  /** Depth from the extreme COMPRESSION fibre, mm. */
  d: number
  /** Bar area, mm². */
  area: number
}

/** Column cross-section geometry — the shape discriminator threaded through the
 *  interaction + detailing engine. Rectangular b×h or circular diameter D. */
export type ColumnGeom =
  | { kind: "rect"; b: number; h: number }
  | { kind: "circle"; D: number }

/** Section depth in the bending direction (h, or D for a circle), mm. */
export function geomH(g: ColumnGeom): number {
  return g.kind === "circle" ? g.D : g.h
}

/** Gross area Ag, mm². */
export function geomAg(g: ColumnGeom): number {
  return g.kind === "circle" ? (Math.PI * g.D * g.D) / 4 : g.b * g.h
}

/** Gross second moment Ig about the bending axis, mm⁴. */
export function geomIg(g: ColumnGeom): number {
  return g.kind === "circle" ? (Math.PI * g.D ** 4) / 64 : (g.b * g.h ** 3) / 12
}

/** Least cross-sectional dimension (min(b,h), or D for a circle), mm. */
export function geomLeastDim(g: ColumnGeom): number {
  return g.kind === "circle" ? g.D : Math.min(g.b, g.h)
}

/** Confined core area Ach inside the tie/spiral, mm² (cover = clear cover to tie). */
export function geomAch(g: ColumnGeom, cover: number): number {
  if (g.kind === "circle") {
    const dch = g.D - 2 * cover // core diameter to outside of spiral/tie
    return (Math.PI * dch * dch) / 4
  }
  return (g.b - 2 * cover) * (g.h - 2 * cover)
}

/** One-way shear width + effective depth. Rect: bw = b, d = deepest bar. Circle:
 *  bw = D, d = 0.8·D (ACI 22.5.2.2 for circular sections). */
export function geomShear(g: ColumnGeom, dMaxBar: number): { bw: number; d: number } {
  return g.kind === "circle" ? { bw: g.D, d: 0.8 * g.D } : { bw: g.b, d: dMaxBar }
}

/** One detailing-check verdict (produced by a code module, rendered by the UI). */
export interface ArrangementCheck {
  status: "pass" | "warn" | "fail"
  text: string
  clause: string
}

export interface TransverseChecks {
  checks: ArrangementCheck[]
  /** Trailing advisory notes (placement along the span isn't modelled). */
  notes: string[]
}

import type { ShapeDef, SectionProperties } from "./types"

/**
 * Equal-leg angle (L-section).
 *
 * Dims (all in mm):
 *   b  — leg width  (both legs equal)
 *   t  — leg thickness
 *
 * Reference: centroid from outer corner of the longer leg (yBar from bottom,
 * xBar from left — equal for equal-leg angle: yBar = xBar).
 *
 * Strong-axis bending (axis 3) is about the centroidal axis parallel to the
 * horizontal leg. For an equal-leg angle the principal axes are at 45°, but
 * the section moduli here are given about the geometric centroidal axes (u-u
 * and v-v coincide at 45° for equal-leg angles; values below are about the
 * x-x / y-y centroidal axes).
 */
function compute(dims: Record<string, number>): SectionProperties {
  const { b, t } = dims

  const A = t * (2 * b - t)

  // Centroid from the base (bottom of horizontal leg / left of vertical leg)
  const yBar = (b * t * (t / 2) + (b - t) * t * (t + (b - t) / 2)) / A

  // Strong-axis (I33) — about horizontal centroidal axis
  const I33_h = (b * t ** 3) / 12 + b * t * (yBar - t / 2) ** 2
  const I33_v = (t * (b - t) ** 3) / 12 + t * (b - t) * (t + (b - t) / 2 - yBar) ** 2
  const I33   = I33_h + I33_v

  // Weak-axis (I22) — about vertical centroidal axis (same as I33 for equal-leg)
  const xBar = yBar  // equal-leg → symmetric
  const I22_h = (t * b ** 3) / 12 + b * t * (b / 2 - xBar) ** 2
  const I22_v = ((b - t) * t ** 3) / 12 + t * (b - t) * (t / 2 - xBar) ** 2
  const I22   = I22_h + I22_v

  // Section moduli — asymmetric about both axes
  const yTop  = b - yBar       // distance to top fibre (outer tip of vertical leg)
  const S33b  = I33 / yBar     // bottom (toe), governing (larger y)
  const S33t  = I33 / yTop     // top

  const xRight = b - xBar
  const S22L   = I22 / xBar    // left (toe)
  const S22R   = I22 / xRight  // right

  // Plastic section moduli (approximate — each leg treated as rectangle)
  const halfA = A / 2
  // PNA for strong axis: scan from bottom
  let Z33: number
  if (halfA <= b * t) {
    // PNA is in horizontal leg
    const yPNA = halfA / b
    Z33 = b * yPNA ** 2 / 2 + b * (t - yPNA) ** 2 / 2
          + t * (b - t) * (t + (b - t) / 2 - yPNA)
  } else {
    const legH = halfA - b * t
    const yPNA = t + legH / t
    Z33 = b * t * (yPNA - t / 2)
          + t * (yPNA - t) ** 2 / 2
          + t * (b - yPNA) ** 2 / 2
  }
  // Weak-axis: symmetric to Z33 for equal-leg
  const Z22 = Z33

  // Shear areas (Timoshenko — each leg)
  const Aκ2 = t * b            // horizontal leg carries in-plane vertical shear
  const Aκ3 = t * b            // vertical leg carries out-of-plane horizontal shear

  const r33 = Math.sqrt(I33 / A)
  const r22 = Math.sqrt(I22 / A)

  return { A, I33, I22, S33b, S33t, S22L, S22R, Z33, Z22, "Aκ2": Aκ2, "Aκ3": Aκ3, r33, r22, yBar }
}

export const lsection: ShapeDef = {
  kind: "lsection",
  label: "L-Section",
  dimKeys: ["b", "t"] as const,
  defaults: { b: 100, t: 10 },
  validate: ({ b, t }) => {
    if (!(b > 0 && t > 0))
      return { ok: false, reason: "All dimensions must be > 0" }
    if (t >= b)
      return { ok: false, reason: "Leg thickness must be less than leg width (t < b)" }
    return { ok: true }
  },
  compute,
}

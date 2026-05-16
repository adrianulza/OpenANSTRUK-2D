import type { ShapeDef, SectionProperties } from "./types"

/**
 * Concrete T-section (inverted-T / slab-beam).
 *
 * Dims (all in mm):
 *   bf — effective flange width  (top)
 *   tf — flange thickness        (slab depth)
 *   bw — web width
 *   h  — total depth             (flange + web)
 *
 * Used for both concrete and steel T-sections.
 * ACI 318-19 §6.3.2 isolated T-beam guideline: bf ≤ 4·bw (concrete only, not enforced here).
 *
 * Centroid measured from the bottom fibre (yBar).
 * Strong-axis bending (axis 3) is about the horizontal centroidal axis.
 */
function compute(dims: Record<string, number>): SectionProperties {
  const { bf, tf, bw, h } = dims
  const hw = h - tf          // web height (below flange)

  // Areas of sub-regions
  const Af = bf * tf         // flange
  const Aw = bw * hw         // web
  const A  = Af + Aw

  // Centroid from bottom fibre
  const yBar = (Af * (h - tf / 2) + Aw * (hw / 2)) / A

  // Strong-axis (I33) — parallel-axis theorem from bottom
  const I33_f = (bf * tf ** 3) / 12 + Af * (h - tf / 2 - yBar) ** 2
  const I33_w = (bw * hw ** 3) / 12 + Aw * (hw / 2    - yBar) ** 2
  const I33   = I33_f + I33_w

  // Weak-axis (I22) — symmetric about vertical centroidal axis
  const I22_f = (tf * bf ** 3) / 12
  const I22_w = (hw * bw ** 3) / 12
  const I22   = I22_f + I22_w

  // Elastic section moduli
  // T-section is asymmetric: bottom fibre (yBar) is farther from centroid than top.
  // S33 = governing (smaller) value, i.e. bottom fibre.
  const yTop = h - yBar
  const S33b = I33 / yBar      // bottom fibre (larger distance → smaller S, governing)
  const S33t = I33 / yTop      // top fibre
  const S22L = (2 * I22) / bf  // symmetric about vertical axis
  const S22R = S22L

  // Plastic section moduli (approximate — treats each sub-region as rectangle)
  // Strong axis: locate plastic neutral axis (PNA) from bottom
  //   area above PNA = A/2.  Web contributes bw·hw, flange bf·tf.
  const halfA  = A / 2
  let Z33: number
  if (halfA <= Aw) {
    // PNA is in the web
    const yPNA = halfA / bw
    Z33 = bw * yPNA ** 2 / 2 + bw * (hw - yPNA) ** 2 / 2
          + Af * (h - tf / 2 - yPNA)
  } else {
    // PNA is in the flange
    const webContrib = bw * hw        // area below flange
    const flangeNeed = halfA - webContrib
    const yPNA_f = flangeNeed / bf    // depth into flange from bottom of flange
    const yPNA   = hw + yPNA_f        // from bottom of section
    Z33 = bw * hw * (yPNA - hw / 2)
          + bf * yPNA_f * (yPNA_f / 2)
          + bf * (tf - yPNA_f) * (tf - yPNA_f) / 2
          + bw * 0                    // web above flange: none
  }

  // Weak-axis plastic modulus (symmetric, exact for T-web)
  const Z22_f = (tf * bf ** 2) / 4
  const Z22_w = (hw * bw ** 2) / 4
  const Z22   = Z22_f + Z22_w

  // Shear areas (Timoshenko)
  const Aκ2 = bw * h       // in-plane (vertical) shear carried by web
  const Aκ3 = (5 / 6) * bf * tf  // out-of-plane shear carried by flange

  const r33 = Math.sqrt(I33 / A)
  const r22 = Math.sqrt(I22 / A)

  return { A, I33, I22, S33b, S33t, S22L, S22R, Z33, Z22, "Aκ2": Aκ2, "Aκ3": Aκ3, r33, r22, yBar }
}

export const tsection: ShapeDef = {
  kind: "tsection",
  label: "T-Section",
  dimKeys: ["bf", "tf", "bw", "h"] as const,
  defaults: { bf: 1000, tf: 100, bw: 300, h: 600 },
  validate: ({ bf, tf, bw, h }) => {
    if (!(bf > 0 && tf > 0 && bw > 0 && h > 0))
      return { ok: false, reason: "All dimensions must be > 0" }
    if (tf >= h)
      return { ok: false, reason: "Flange thickness must be less than total depth (tf < h)" }
    if (bw >= bf)
      return { ok: false, reason: "Web width must be less than flange width (bw < bf)" }
    return { ok: true }
  },
  compute,
}

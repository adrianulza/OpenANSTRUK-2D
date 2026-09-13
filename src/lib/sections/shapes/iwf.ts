import type { ShapeDef, SectionProperties } from "./types"
import { torsionStrip } from "./principal"

function compute(dims: Record<string, number>): SectionProperties {
  const { b, h, tf, tw } = dims
  const hw = h - 2 * tf
  const A   = 2 * b * tf + hw * tw
  const I33 = (b * h ** 3 - (b - tw) * hw ** 3) / 12
  const I22 = 2 * (tf * b ** 3) / 12 + (hw * tw ** 3) / 12
  const S33b = (2 * I33) / h  // symmetric — top == bottom
  const S33t = S33b
  const S22L = (2 * I22) / b  // symmetric
  const S22R = S22L
  const Z33 = b * tf * (h - tf) + (tw * hw ** 2) / 4
  const Z22 = 2 * (tf * b ** 2) / 4 + (hw * tw ** 2) / 4
  const Aκ2 = tw * h                  // along the web — in-plane (strong-axis) shear
  const Aκ3 = (5 / 3) * b * tf        // along the flanges — out-of-plane shear
  const r33 = Math.sqrt(I33 / A)
  const r22 = Math.sqrt(I22 / A)

  // ── Torsional / warping properties (AISC 360-16 steel design) ──────────────
  // Doubly-symmetric I-shape, fillets ignored — matches the "built-up wide
  // flange" idealisation CSI uses in its own verification hand calcs.
  //   ho  = h − tf              (distance between flange centroids)
  //   Cw  = I22·ho²/4           (AISC F2-4 / Table for doubly-symmetric shapes)
  //   rts = √(√(I22·Cw)/S33)    (AISC F2-7)
  //
  // J uses the per-strip finite-aspect-ratio correction — see `torsionStrip` in
  // ./principal.ts, which is shared with the angle and tee so there is exactly
  // one definition of it. Verified against SAP2000's own section-property
  // calculator: J = 343 907 mm⁴ for a 400x200x13x8 shape, matching to 6
  // significant figures.
  const J = 2 * torsionStrip(b, tf) + torsionStrip(hw, tw)
  const ho = h - tf
  const Cw = (I22 * ho ** 2) / 4
  const rts = Math.sqrt(Math.sqrt(I22 * Cw) / S33b)

  return {
    A, I33, I22, S33b, S33t, S22L, S22R, Z33, Z22,
    "Aκ2": Aκ2, "Aκ3": Aκ3, r33, r22, yBar: h / 2,
    J, Cw, rts, ho,
  }
}

export const iwf: ShapeDef = {
  kind: "iwf",
  label: "IWF",
  dimKeys: ["b", "h", "tf", "tw"] as const,
  defaults: { b: 100, h: 200, tf: 8, tw: 5.5 },
  validate: ({ b, h, tf, tw }) => {
    if (!(b > 0 && h > 0 && tf > 0 && tw > 0))
      return { ok: false, reason: "All dimensions must be > 0" }
    if (h <= 2 * tf)
      return { ok: false, reason: "Depth must exceed twice the flange thickness (h > 2·tf)" }
    if (tw >= b)
      return { ok: false, reason: "Web thickness must be less than flange width (tw < b)" }
    return { ok: true }
  },
  compute,
}

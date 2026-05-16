import type { ShapeDef, SectionProperties } from "./types"

function compute(dims: Record<string, number>): SectionProperties {
  const { b, h, t } = dims
  const bi = b - 2 * t
  const hi = h - 2 * t

  const A   = b * h - bi * hi
  const I33 = (b * h ** 3 - bi * hi ** 3) / 12
  const I22 = (h * b ** 3 - hi * bi ** 3) / 12
  const S33 = I33 / (h / 2)
  const S22 = I22 / (b / 2)
  // Plastic section modulus (rectangular hollow): Z = (b·h²/4) - (bi·hi²/4)
  const Z33 = (b * h ** 2 - bi * hi ** 2) / 4
  const Z22 = (h * b ** 2 - hi * bi ** 2) / 4
  // Shear area: two webs carry in-plane shear
  const Aκ2 = 2 * h * t
  const Aκ3 = 2 * b * t
  const r33 = Math.sqrt(I33 / A)
  const r22 = Math.sqrt(I22 / A)

  return {
    A, I33, I22,
    S33b: S33, S33t: S33, S22L: S22, S22R: S22,
    Z33, Z22,
    "Aκ2": Aκ2, "Aκ3": Aκ3,
    r33, r22,
    yBar: h / 2,
  }
}

// Default: 100×50 RHS, wall thickness 4 mm (common light structural tube)
export const rhs: ShapeDef = {
  kind: "rhs",
  label: "Rect. Hollow (RHS)",
  dimKeys: ["b", "h", "t"] as const,
  defaults: { b: 100, h: 50, t: 4 },
  validate: ({ b, h, t }) => {
    if (!(b > 0)) return { ok: false, reason: "Width b must be > 0" }
    if (!(h > 0)) return { ok: false, reason: "Height h must be > 0" }
    if (!(t > 0)) return { ok: false, reason: "Wall thickness t must be > 0" }
    if (2 * t >= b) return { ok: false, reason: "Wall thickness must be < b/2" }
    if (2 * t >= h) return { ok: false, reason: "Wall thickness must be < h/2" }
    return { ok: true }
  },
  compute,
}

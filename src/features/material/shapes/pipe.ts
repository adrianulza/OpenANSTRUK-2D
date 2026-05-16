import type { ShapeDef, SectionProperties } from "./types"

function compute(dims: Record<string, number>): SectionProperties {
  const { d, t } = dims
  const di   = d - 2 * t
  const A    = (Math.PI / 4) * (d ** 2 - di ** 2)
  const I33  = (Math.PI / 64) * (d ** 4 - di ** 4)
  const S33  = I33 / (d / 2)
  const Z33  = (d ** 3 - di ** 3) / 6
  // Shear area for hollow circular tube (Timoshenko): κ = 0.5 for thin-walled pipe
  const Aκ   = 0.5 * A
  const r    = Math.sqrt(I33 / A)
  return {
    A, I33, I22: I33, S33b: S33, S33t: S33, S22L: S33, S22R: S33, Z33, Z22: Z33,
    "Aκ2": Aκ, "Aκ3": Aκ, r33: r, r22: r, yBar: d / 2,
  }
}

// 6-inch Schedule 40 pipe: OD = 168.3 mm, wall = 7.11 mm
export const pipe: ShapeDef = {
  kind: "pipe",
  label: "Circular Pipe",
  dimKeys: ["d", "t"] as const,
  defaults: { d: 168.3, t: 7.11 },
  validate: ({ d, t }) => {
    if (!(d > 0)) return { ok: false, reason: "Outer diameter must be > 0" }
    if (!(t > 0)) return { ok: false, reason: "Wall thickness must be > 0" }
    if (2 * t >= d) return { ok: false, reason: "Wall thickness must be < d/2" }
    return { ok: true }
  },
  compute,
}

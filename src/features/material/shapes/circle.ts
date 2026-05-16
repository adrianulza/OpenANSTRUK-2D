import type { ShapeDef, SectionProperties } from "./types"

function compute(dims: Record<string, number>): SectionProperties {
  const { d } = dims
  const A   = (Math.PI * d ** 2) / 4
  const I33 = (Math.PI * d ** 4) / 64
  const S33 = (Math.PI * d ** 3) / 32
  const Z33 = d ** 3 / 6
  const Aκ  = (9 / 10) * A
  const r   = Math.sqrt(I33 / A)  // = d/4
  // Circle is rotationally symmetric: weak-axis equals strong-axis
  return {
    A, I33, I22: I33, S33b: S33, S33t: S33, S22L: S33, S22R: S33, Z33, Z22: Z33,
    "Aκ2": Aκ, "Aκ3": Aκ, r33: r, r22: r, yBar: d / 2,
  }
}

export const circle: ShapeDef = {
  kind: "circle",
  label: "Circle",
  dimKeys: ["d"] as const,
  defaults: { d: 400 },
  validate: ({ d }) =>
    d > 0 ? { ok: true } : { ok: false, reason: "Diameter must be > 0" },
  compute,
}

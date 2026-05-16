import type { ShapeDef, SectionProperties } from "./types"

function compute(dims: Record<string, number>): SectionProperties {
  const { b, h } = dims
  const A   = b * h
  const I33 = (b * h ** 3) / 12
  const I22 = (h * b ** 3) / 12
  const S33b = (b * h ** 2) / 6
  const S33t = S33b  // symmetric
  const S22L = (h * b ** 2) / 6  // symmetric
  const S22R = S22L
  const Z33 = (b * h ** 2) / 4
  const Z22 = (h * b ** 2) / 4
  const Aκ2 = (5 / 6) * A
  const Aκ3 = (5 / 6) * A
  const r33 = Math.sqrt(I33 / A)
  const r22 = Math.sqrt(I22 / A)
  return { A, I33, I22, S33b, S33t, S22L, S22R, Z33, Z22, "Aκ2": Aκ2, "Aκ3": Aκ3, r33, r22, yBar: h / 2 }
}

export const rectangle: ShapeDef = {
  kind: "rect",
  label: "Rectangle",
  dimKeys: ["b", "h"] as const,
  defaults: { b: 300, h: 500 },
  validate: ({ b, h }) =>
    b > 0 && h > 0
      ? { ok: true }
      : { ok: false, reason: "All dimensions must be > 0" },
  compute,
}

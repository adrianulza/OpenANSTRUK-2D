import type { MaterialDef } from "./types"

export const concrete: MaterialDef = {
  kind: "concrete",
  label: "Concrete",
  allowedShapes: ["rect", "circle", "tee"] as const,
  defaults: { fc: 25 },
  validate: ({ fc }) =>
    fc !== undefined && fc > 0
      ? { ok: true }
      : { ok: false, reason: "f'c must be > 0" },
  compute: ({ fc }) => {
    const fcSafe = fc && fc > 0 ? fc : 25
    return {
      E: 4700 * Math.sqrt(fcSafe),
      nu: 0.20,
      gamma: 24,
    }
  },
}

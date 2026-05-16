import type { MaterialDef } from "./types"

export const steel: MaterialDef = {
  kind: "steel",
  label: "Steel",
  allowedShapes: ["rhs", "pipe", "lsection", "iwf", "tsection"] as const,
  shapeDimDefaults: {
    tsection: { bf: 100, tf: 8, bw: 5.5, h: 100 },
    lsection: { b: 100, t: 10 },
  },
  defaults: { fy: 240, fu: 400, E: 200000 },
  validate: ({ fy, fu, E }) => {
    if (!(fy !== undefined && fy > 0)) return { ok: false, reason: "fy must be > 0" }
    if (!(fu !== undefined && fu > 0)) return { ok: false, reason: "fu must be > 0" }
    if (!(E  !== undefined && E  > 0)) return { ok: false, reason: "E must be > 0"  }
    if (fu < fy) return { ok: false, reason: "fu must be ≥ fy" }
    return { ok: true }
  },
  compute: ({ E }) => ({
    E: E && E > 0 ? E : 200000,
    nu: 0.30,
    gamma: 78.5,
  }),
}

import { describe, it, expect } from "vitest"
import type { StructureModel, Section, Member, SupportType } from "@/lib/model"
import { analyze, type AnalysisResult } from "@/lib/solver"
import {
  buildLiveSystem,
  evaluateLive,
  equilibriumResidual,
  memberPointDisplacement,
  getUnitResponse,
  LIVE_P_MAX,
  LIVE_SPLINE_PTS,
  type LiveSystem,
} from "@/lib/live-solver"

// E = 200 GPa, I = 1e8 mm⁴ (1e-4 m⁴), A = 1e4 mm² (1e-2 m²) → EI = 2e4 kN·m², EA = 2e6 kN
const SEC: Section = { id: "s", name: "test", E: 200_000, I33: 1e8, A: 1e4, nu: 0.3, "Aκ2": 5_000 }
const EI = 2e4

type Build = {
  nodes: Array<[string, number, number]>
  members: Array<[string, string, string, Member["memberType"]?]>
  supports: Array<[string, SupportType]>
}

function makeModel({ nodes, members, supports }: Build): StructureModel {
  const m: StructureModel = { nodes: {}, members: {}, supports: {}, sections: { s: SEC }, loads: {} }
  for (const [id, x, y] of nodes) m.nodes[id] = { id, x, y }
  for (const [id, a, b, memberType] of members) m.members[id] = { id, a, b, section: "s", memberType }
  for (const [nodeId, type] of supports) m.supports[nodeId] = { nodeId, type }
  return m
}

function mustBuild(model: StructureModel, shearDeformation = false): LiveSystem {
  const sys = buildLiveSystem(model, { shearDeformation })
  if (!sys.ok) throw new Error(sys.reason)
  return sys
}

function mustEval(sys: LiveSystem, node: string, px: number, py: number): AnalysisResult {
  const r = evaluateLive(sys, node, px, py)
  if (!r) throw new Error("no result")
  return r
}

/** analyze() on the same geometry with one point load and no other loads. */
function reference(model: StructureModel, node: string, fx: number, fy: number, shearDeformation = false) {
  const loaded: StructureModel = {
    ...model,
    loads: { p: { id: "p", type: "point", nodeId: node, loadCaseId: "live", fx, fy } },
  }
  const r = analyze(loaded, { shearDeformation })
  if (!r.ok) throw new Error(r.reason)
  return r
}

function expectClose(actual: number, expected: number, scale: number) {
  expect(Math.abs(actual - expected)).toBeLessThanOrEqual(1e-9 * Math.max(scale, 1e-12))
}

function expectParity(model: StructureModel, node: string, px: number, py: number, shear = false) {
  const live = mustEval(mustBuild(model, shear), node, px, py)
  const ref = reference(model, node, px, py, shear)

  const dScale = Math.max(...Object.values(ref.nodeDisplacements).flatMap(d => [Math.abs(d.u), Math.abs(d.v), Math.abs(d.theta)]))
  for (const [id, d] of Object.entries(ref.nodeDisplacements)) {
    expectClose(live.nodeDisplacements[id].u, d.u, dScale)
    expectClose(live.nodeDisplacements[id].v, d.v, dScale)
    expectClose(live.nodeDisplacements[id].theta, d.theta, dScale)
  }
  const fScale = Math.max(Math.abs(px), Math.abs(py))
  for (const [id, f] of Object.entries(ref.memberEndForces)) {
    const l = live.memberEndForces[id]
    for (const k of ["N1", "V1", "M1", "N2", "V2", "M2"] as const) expectClose(l[k], f[k], fScale * 10)
  }
  for (const [id, r] of Object.entries(ref.reactions)) {
    const l = live.reactions[id]
    expectClose(l.Rx, r.Rx, fScale * 10)
    expectClose(l.Ry, r.Ry, fScale * 10)
    expectClose(l.Mz, r.Mz, fScale * 10)
  }
}

const cantilever = makeModel({
  nodes: [["a", 0, 0], ["b", 4, 0]],
  members: [["m1", "a", "b"]],
  supports: [["a", "fixed"]],
})

const simpleBeam = makeModel({
  nodes: [["a", 0, 0], ["c", 3, 0], ["b", 6, 0]],
  members: [["m1", "a", "c"], ["m2", "c", "b"]],
  supports: [["a", "pin"], ["b", "roller"]],
})

const portal = makeModel({
  nodes: [["a", 0, 0], ["b", 0, 3], ["c", 5, 3], ["d", 5, 0]],
  members: [["m1", "a", "b"], ["m2", "b", "c"], ["m3", "c", "d"]],
  supports: [["a", "fixed"], ["d", "pin"]],
})

const truss = makeModel({
  nodes: [["a", 0, 0], ["b", 3, 0], ["c", 6, 0], ["d", 1.5, 2], ["e", 4.5, 2]],
  members: [
    ["t1", "a", "b", "truss"], ["t2", "b", "c", "truss"],
    ["t3", "a", "d", "truss"], ["t4", "d", "b", "truss"],
    ["t5", "b", "e", "truss"], ["t6", "e", "c", "truss"],
    ["t7", "d", "e", "truss"],
  ],
  supports: [["a", "pin"], ["c", "roller"]],
})

const mixed = makeModel({
  nodes: [["a", 0, 0], ["b", 0, 4], ["c", 4, 4], ["d", 4, 0]],
  members: [["m1", "a", "b"], ["m2", "b", "c"], ["m3", "c", "d"], ["br", "a", "c", "truss"]],
  supports: [["a", "pin"], ["d", "pin"]],
})

describe("live solver: hand formulas", () => {
  it("cantilever tip load gives PL³/3EI, base moment PL and full reaction", () => {
    const P = 10, L = 4
    const r = mustEval(mustBuild(cantilever), "b", 0, -P)
    expect(r.nodeDisplacements.b.v).toBeCloseTo(-P * L ** 3 / (3 * EI), 12)
    expect(r.reactions.a.Ry).toBeCloseTo(P, 9)
    expect(Math.abs(r.reactions.a.Mz)).toBeCloseTo(P * L, 9)
    expect(Math.abs(r.memberEndForces.m1.M1)).toBeCloseTo(P * L, 9)
  })

  it("simply supported beam, midspan load: PL³/48EI, M = PL/4, R = P/2", () => {
    const P = 20, L = 6
    const r = mustEval(mustBuild(simpleBeam), "c", 0, -P)
    expect(r.nodeDisplacements.c.v).toBeCloseTo(-P * L ** 3 / (48 * EI), 12)
    expect(r.reactions.a.Ry).toBeCloseTo(P / 2, 9)
    expect(r.reactions.b.Ry).toBeCloseTo(P / 2, 9)
    expect(Math.abs(r.memberEndForces.m1.M2)).toBeCloseTo(P * L / 4, 9)
  })

  it("a load on a roller's restrained direction goes straight into its reaction", () => {
    const r = mustEval(mustBuild(simpleBeam), "b", 0, -30)
    expect(r.nodeDisplacements.b.v).toBe(0)
    expect(r.nodeDisplacements.c.v).toBe(0)
    expect(r.reactions.b.Ry).toBeCloseTo(30, 12)
    expect(r.reactions.a.Ry).toBeCloseTo(0, 12)
  })
})

describe("live solver: parity with analyze()", () => {
  const cases: Array<[string, StructureModel, string]> = [
    ["cantilever", cantilever, "b"],
    ["simple beam", simpleBeam, "c"],
    ["roller node of simple beam", simpleBeam, "b"],
    ["portal frame, beam-column joint", portal, "b"],
    ["portal frame, far joint", portal, "c"],
    ["pure truss, top chord", truss, "e"],
    ["pure truss, roller", truss, "c"],
    ["frame with truss brace", mixed, "c"],
  ]
  const loads: Array<[number, number]> = [[37, -64], [-80, 12.5], [0, 100], [55.5, 0]]

  for (const [name, model, node] of cases) {
    it(`${name} (Euler)`, () => {
      for (const [px, py] of loads) expectParity(model, node, px, py, false)
    })
    it(`${name} (Timoshenko)`, () => {
      for (const [px, py] of loads) expectParity(model, node, px, py, true)
    })
  }
})

describe("live solver: grabbing and stability", () => {
  it("pin and fixed supports cannot be grabbed; rollers and free nodes can", () => {
    const sys = mustBuild(portal)
    expect(sys.grabbable.has("a")).toBe(false)
    expect(sys.grabbable.has("d")).toBe(false)
    expect(sys.grabbable.has("b")).toBe(true)
    expect(mustBuild(simpleBeam).grabbable.has("b")).toBe(true)
  })

  it("a mechanism reports the free node instead of crashing", () => {
    const mech = makeModel({
      nodes: [["a", 0, 0], ["b", 0, 3], ["c", 4, 3], ["d", 4, 0]],
      members: [["m1", "a", "b", "truss"], ["m2", "b", "c", "truss"], ["m3", "c", "d", "truss"]],
      supports: [["a", "pin"], ["d", "pin"]],
    })
    const r = buildLiveSystem(mech)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(["b", "c"]).toContain(r.nodeId)
  })

  it("too few reactions or an empty model is refused", () => {
    const r = buildLiveSystem(makeModel({ nodes: [["a", 0, 0], ["b", 1, 0]], members: [["m", "a", "b"]], supports: [["a", "roller"]] }))
    expect(r.ok).toBe(false)
    expect(buildLiveSystem(makeModel({ nodes: [], members: [], supports: [] })).ok).toBe(false)
  })

  it("global equilibrium holds for any pull", () => {
    for (const [model, node] of [[portal, "c"], [truss, "d"], [mixed, "b"]] as const) {
      const sys = mustBuild(model)
      const r = mustEval(sys, node, -42, 71)
      const e = equilibriumResidual(model, r, node, -42, 71)
      expect(Math.abs(e.Fx)).toBeLessThan(1e-8)
      expect(Math.abs(e.Fy)).toBeLessThan(1e-8)
      expect(Math.abs(e.M)).toBeLessThan(1e-7)
    }
  })

  it("rope cap is a quarter of the model extent, at least 1 m", () => {
    expect(mustBuild(portal).ropeCap).toBeCloseTo(1.25, 12)
    expect(mustBuild(cantilever).ropeCap).toBeCloseTo(1, 12)
  })
})

describe("live solver: frozen reference scales", () => {
  // Brute force over 360 rope directions must agree with the closed form.
  for (const [name, model] of [["portal", portal], ["truss", truss], ["mixed", mixed]] as const) {
    it(`${name}: closed-form peaks match an angle sweep`, () => {
      const sys = mustBuild(model)
      let disp = 0, N = 0, V = 0, M = 0, R = 0
      for (const id of sys.grabbable) {
        for (let deg = 0; deg < 360; deg += 1) {
          const a = (deg * Math.PI) / 180
          const r = mustEval(sys, id, LIVE_P_MAX * Math.cos(a), LIVE_P_MAX * Math.sin(a))
          for (const m of sys.members) {
            const dA = r.nodeDisplacements[m.a], dB = r.nodeDisplacements[m.b]
            for (let p = 0; p <= LIVE_SPLINE_PTS; p++) {
              const d = memberPointDisplacement(m.L, m.c, m.s, m.isTruss, dA, dB, p / LIVE_SPLINE_PTS)
              disp = Math.max(disp, Math.hypot(d.dx, d.dy))
            }
            const f = r.memberEndForces[m.id]
            N = Math.max(N, Math.abs(f.N1), Math.abs(f.N2))
            V = Math.max(V, Math.abs(f.V1), Math.abs(f.V2))
            M = Math.max(M, Math.abs(f.M1), Math.abs(f.M2))
          }
          for (const rc of Object.values(r.reactions)) R = Math.max(R, Math.abs(rc.Rx), Math.abs(rc.Ry), Math.abs(rc.Mz))
        }
      }
      // A 1° sweep misses the true peak by at most 1 − cos(0.5°) ≈ 4e-5.
      const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(b, 1e-12)
      expect(rel(disp, sys.refs.disp)).toBeLessThan(1e-4)
      expect(rel(N, sys.refs.N)).toBeLessThan(1e-4)
      expect(rel(V, sys.refs.V)).toBeLessThan(1e-4)
      if (sys.refs.M > 1e-9) expect(rel(M, sys.refs.M)).toBeLessThan(1e-4)
      expect(rel(R, sys.refs.R)).toBeLessThan(1e-4)
    })
  }

  it("unit responses are cached per node", () => {
    const sys = mustBuild(portal)
    expect(getUnitResponse(sys, "b")).toBe(getUnitResponse(sys, "b"))
  })
})

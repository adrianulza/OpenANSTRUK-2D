/**
 * Closed-form verification of the analysis engine: static regression, modal,
 * static equivalent (ELF), response spectrum (MRS), linear time history (LTH)
 * and the document format.
 *
 *   npm run verify:dynamics            run every benchmark
 *   npm run verify:dynamics -- --update  rewrite the static baseline fixture
 *
 * ⚠ EVERY REFERENCE IS INDEPENDENT. Closed-form eigenvalues, the hand ELF from
 * the code tables, CQC, the design spectrum and the per-mode Newmark recurrence
 * are all written out here from their formulas; the app's output is compared
 * against them and never used as its own reference. Descriptions and
 * tolerances: docs/VALIDATION_DYNAMICS.md.
 */

import { readFileSync, writeFileSync } from "node:fs"
import { isDeepStrictEqual } from "node:util"
import { analyze, memberInternalForces, recoverResults } from "@/lib/solver"
import type { Section, StructureModel } from "@/lib/model"
import * as templates from "@/templates/examples"
import { buildFrameModel } from "@/templates/frame-builder"
import { DEFAULT_COMBINATIONS, DEFAULT_LOAD_CASES, type LoadCase } from "@/lib/load-cases"
import { defaultSeismicDefinition, type SeismicDefinition } from "@/lib/seismic/definition"
import { prepareSeismic, type SeismicContext } from "@/lib/seismic/solve"
import { solveAllCases } from "@/lib/analysis-pipeline"
import { EL_CENTRO_NS } from "@/lib/seismic/records/elcentro"
import { parseDocument, serializeDocument } from "@/lib/document"
import { defaultDesignCriteria } from "@/lib/design/core/criteria"

const G = 9.80665
const FIXTURE = new URL("./fixtures/static-baseline.json", import.meta.url)
const UPDATE = process.argv.includes("--update")

let failures = 0
function check(name: string, got: number, want: number, relTol: number, absTol = 0): void {
  const err = Math.abs(got - want)
  const ok = err <= Math.max(relTol * Math.abs(want), absTol)
  if (!ok) failures++
  const rel = want !== 0 ? err / Math.abs(want) : err
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}: got ${fmt(got)}, want ${fmt(want)} (rel err ${rel.toExponential(1)})`,
  )
}
function checkTrue(name: string, ok: boolean, detail = ""): void {
  if (!ok) failures++
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `: ${detail}` : ""}`)
}
const fmt = (v: number) =>
  Math.abs(v) >= 1e-3 && Math.abs(v) < 1e5 ? v.toPrecision(8) : v.toExponential(6)
const section = (id: string, E: number, I33: number, A: number): Section => ({
  id,
  name: id,
  E,
  I33,
  A,
  gamma: 0,
})

// ── Model builders ───────────────────────────────────────────────────────────

/** Vertical cantilever, fixed at the base, weight W at the tip. */
function cantilever(W: number): StructureModel {
  const sec = section("col", 30000, 8e9, 3e5)
  return {
    nodes: { a: { id: "a", x: 0, y: 0 }, b: { id: "b", x: 0, y: 4 } },
    members: { m: { id: "m", a: "a", b: "b", section: "col" } },
    supports: { a: { nodeId: "a", type: "fixed" } },
    sections: { col: sec },
    loads: { p: { id: "p", type: "point", nodeId: "b", loadCaseId: "dead", fx: 0, fy: -W } },
  }
}

/**
 * Two-storey, one-bay shear building: fixed bases, axially rigid columns and
 * practically rigid beams, so each storey is a pure shear spring
 * k = 2·12·EI/h³ and each floor a lumped mass. Weight W per node.
 */
const SB = { h: 3, bay: 6, E: 200000, I: 2e8, W: 500 }
/**
 * Default: near-rigid beams and axially rigid columns, the closed-form shear
 * building. `realistic` gives ordinary beams and columns instead: no closed
 * form, but a well-conditioned stiffness matrix for comparisons that need
 * agreement to round-off (the rigid version's 1e11 stiffness spread costs
 * about seven digits).
 */
function shearBuilding(realistic = false): StructureModel {
  const col = section("col", SB.E, SB.I, realistic ? 1e5 : 1e9)
  const beam = section("beam", SB.E, realistic ? SB.I : 1e16, realistic ? 1e5 : 1e9)
  const n = (id: string, x: number, y: number) => ({ id, x, y })
  const nodes = {
    b0: n("b0", 0, 0),
    b1: n("b1", SB.bay, 0),
    f1a: n("f1a", 0, SB.h),
    f1b: n("f1b", SB.bay, SB.h),
    f2a: n("f2a", 0, 2 * SB.h),
    f2b: n("f2b", SB.bay, 2 * SB.h),
  }
  const mem = (id: string, a: string, b: string, s: string) => ({ id, a, b, section: s })
  const members = {
    c1a: mem("c1a", "b0", "f1a", "col"),
    c1b: mem("c1b", "b1", "f1b", "col"),
    c2a: mem("c2a", "f1a", "f2a", "col"),
    c2b: mem("c2b", "f1b", "f2b", "col"),
    g1: mem("g1", "f1a", "f1b", "beam"),
    g2: mem("g2", "f2a", "f2b", "beam"),
  }
  const loads: StructureModel["loads"] = {}
  for (const id of ["f1a", "f1b", "f2a", "f2b"]) {
    loads[`p_${id}`] = {
      id: `p_${id}`,
      type: "point",
      nodeId: id,
      loadCaseId: "dead",
      fx: 0,
      fy: -SB.W,
    }
  }
  return {
    nodes,
    members,
    loads,
    supports: { b0: { nodeId: "b0", type: "fixed" }, b1: { nodeId: "b1", type: "fixed" } },
    sections: { col, beam },
  }
}

function withSeismic(def: Partial<SeismicDefinition>, modalOn = true): Record<string, LoadCase> {
  const cases = DEFAULT_LOAD_CASES()
  cases.modal.enabled = modalOn
  cases.eq = {
    id: "eq",
    name: "EQ",
    kind: "Seismic",
    enabled: true,
    seismic: { ...defaultSeismicDefinition(), ...def },
  }
  return cases
}

// ── Independent references ───────────────────────────────────────────────────

/** Design spectrum, ASCE 7-16 §11.4.6 / SNI 1726:2019 §6.4 — written out here. */
function sa(T: number, SDS: number, SD1: number, TL: number): number {
  const Ts = SD1 / SDS,
    T0 = 0.2 * Ts
  if (T < T0) return SDS * (0.4 + (0.6 * T) / T0)
  if (T <= Ts) return SDS
  if (T <= TL) return SD1 / T
  return (SD1 * TL) / (T * T)
}

/** Der Kiureghian's CQC, written out here. */
function cqc(values: number[], omegas: number[], z: number): number {
  let s = 0
  for (let i = 0; i < values.length; i++) {
    for (let j = 0; j < values.length; j++) {
      const r = omegas[i] / omegas[j]
      const rho =
        (8 * z * z * (1 + r) * r ** 1.5) / ((1 - r * r) ** 2 + 4 * z * z * r * (1 + r) ** 2)
      s += rho * values[i] * values[j]
    }
  }
  return Math.sqrt(s)
}

/** Chopra's incremental average-acceleration Newmark for one SDOF (Table 5.4.2). */
function sdofNewmark(
  w: number,
  zeta: number,
  p: (i: number) => number,
  n: number,
  dt: number,
): Float64Array {
  const k = w * w,
    c = 2 * zeta * w
  const u = new Float64Array(n)
  let v = 0,
    a = p(0)
  const kh = k + (2 * c) / dt + 4 / (dt * dt)
  for (let i = 1; i < n; i++) {
    const dph = p(i) - p(i - 1) + (4 / dt + 2 * c) * v + 2 * a
    const du = dph / kh
    const dv = (2 * du) / dt - 2 * v
    const da = (4 * du) / (dt * dt) - (4 * v) / dt - 2 * a
    u[i] = u[i - 1] + du
    v += dv
    a += da
  }
  return u
}

const modalOf = (ctx: SeismicContext) => {
  if (!ctx.modal?.ok)
    throw new Error(`modal failed: ${ctx.modal && !ctx.modal.ok ? ctx.modal.reason : "none"}`)
  return ctx.modal
}

// ── 1. Static regression ─────────────────────────────────────────────────────
console.log("\n1. Static regression (templates 1–5 and a braced frame, Euler and Timoshenko)")
{
  const out: Record<string, unknown> = {}
  for (const [k, fn] of Object.entries(templates)) {
    if (typeof fn !== "function") continue
    const m = (fn as () => StructureModel)()
    out[k] = analyze(m)
    out[k + "_sd"] = analyze(m, { shearDeformation: true })
  }
  const first = Object.keys((templates.template3Portal() as StructureModel).sections)[0]
  out.frame = analyze(buildFrameModel(3, 2, 3.5, 5, first, "fixed", "x"))
  const now = JSON.parse(JSON.stringify(out))
  if (UPDATE) {
    writeFileSync(FIXTURE, JSON.stringify(now))
    console.log("      baseline fixture rewritten")
  } else {
    const base = JSON.parse(readFileSync(FIXTURE, "utf8"))
    checkTrue("static results identical to the committed baseline", isDeepStrictEqual(now, base))
  }
}

// ── 2. Modal: cantilever with a tip mass ─────────────────────────────────────
console.log("\n2. Modal: cantilever with tip weight, T = 2π·√(m·L³ / 3EI)")
{
  const W = 100
  const model = cantilever(W)
  const cases = DEFAULT_LOAD_CASES()
  cases.modal.enabled = true
  const ctx = prepareSeismic(model, cases)
  const modal = modalOf(ctx)
  const EI = 30000e3 * 8e9 * 1e-12
  const T = 2 * Math.PI * Math.sqrt(W / G / ((3 * EI) / 4 ** 3))
  check("T1", modal.modes[0].T, T, 1e-9)
  check("Σ X participation", modal.modes[modal.modes.length - 1].cumX, 1, 1e-12)
}

// ── 3. Modal: two-storey shear building ──────────────────────────────────────
console.log("\n3. Modal: two-storey shear building vs the closed-form 2×2 eigenproblem")
const sbModel = shearBuilding()
const k = (2 * 12 * SB.E * 1e3 * SB.I * 1e-12) / SB.h ** 3
const m = (2 * SB.W) / G
// det([[2k − λm, −k], [−k, k − λm]]) = 0  →  λ = (k/m)·(3 ∓ √5)/2
const w1 = Math.sqrt((k / m) * ((3 - Math.sqrt(5)) / 2))
const w2 = Math.sqrt((k / m) * ((3 + Math.sqrt(5)) / 2))
{
  const ctx = prepareSeismic(sbModel, withSeismic({}, true))
  const modal = modalOf(ctx)
  const lateral = modal.modes.filter((md) => md.ratioX > 1e-6)
  check("T1", lateral[0].T, (2 * Math.PI) / w1, 1e-5)
  check("T2", lateral[1].T, (2 * Math.PI) / w2, 1e-5)
  // Mode 1 shape: φ2/φ1 = (1 + √5)/2 for equal k and m.
  const { nodeIdx } = modal.system
  const shape = lateral[0].phi[3 * nodeIdx.f2a] / lateral[0].phi[3 * nodeIdx.f1a]
  check("mode 1 shape φ2/φ1", shape, (1 + Math.sqrt(5)) / 2, 1e-5)
  check("Σ X participation (all modes)", modal.modes[modal.modes.length - 1].cumX, 1, 1e-12)
}

// ── 4. ELF hand calculation ──────────────────────────────────────────────────
console.log("\n4. Static equivalent: SNI 1726:2019, Ss 1.0, S1 0.4, site SD, R 8, empirical period")
{
  const def = { code: "SNI1726-2019" as const, periodMode: "approximate" as const }
  const ctx = prepareSeismic(sbModel, withSeismic(def, false))
  const run = ctx.runs.eq.elf!
  // SNI Tabel 6 / 7, site SD: Fa(Ss = 1.0) = 1.1, Fv(S1 = 0.4) = 1.9.
  const SDS = (2 / 3) * 1.1 * 1.0
  const SD1 = (2 / 3) * 1.9 * 0.4
  const Ta = 0.0466 * (2 * SB.h) ** 0.9 // concrete moment frame, hn in m
  const R = 8,
    Ie = 1
  const Cs = Math.max(Math.min(SDS / (R / Ie), SD1 / (Ta * (R / Ie))), 0.044 * SDS * Ie, 0.01)
  const W = 4 * SB.W
  const V = Cs * W
  const kExp = Ta <= 0.5 ? 1 : Ta >= 2.5 ? 2 : 1 + (Ta - 0.5) / 2
  const sumWh = 2 * SB.W * (SB.h ** kExp + (2 * SB.h) ** kExp)
  check("SDS", run.ladder.SDS, SDS, 1e-12)
  check("SD1", run.ladder.SD1, SD1, 1e-12)
  check("Ta", run.ladder.T, Ta, 1e-12)
  check("Cs", run.ladder.Cs, Cs, 1e-12)
  check("W", run.W, W, 1e-12)
  check("V = Cs·W", run.V, V, 1e-12)
  const f1 = run.forces.find((f) => f.nodeId === "f1a")!.Fx
  const f2 = run.forces.find((f) => f.nodeId === "f2a")!.Fx
  check("Fx at floor 1 node", f1, (V * SB.W * SB.h ** kExp) / sumWh, 1e-12)
  check("Fx at floor 2 node", f2, (V * SB.W * (2 * SB.h) ** kExp) / sumWh, 1e-12)
  const res = solveAllCases(sbModel, withSeismic(def, false), undefined, ctx)
  const r = res.eq
  const sumRx = r.ok ? Object.values(r.reactions).reduce((s, x) => s + x.Rx, 0) : NaN
  check("Σ base reactions = −V", sumRx, -V, 1e-9)
}

// ── 5. MRS ───────────────────────────────────────────────────────────────────
console.log("\n5. Response spectrum")
{
  // 5a. Single mode: V = Γ²·Sa·g·Ie/R.
  const cm = cantilever(100)
  const ctx = prepareSeismic(cm, withSeismic({ analysis: "mrs" }))
  const modal = modalOf(ctx)
  const run = ctx.runs.eq.mrs!
  const l = run.elf.ladder
  const md = modal.modes.find((x) => x.ratioX > 0.5)!
  check(
    "5a cantilever V_MRS = Γ²·Sa·g/R",
    run.unscaledV,
    (md.gammaX ** 2 * sa(md.T, l.SDS, l.SD1, 8) * G) / 8,
    1e-9,
  )
}
{
  // 5b. Two modes: base shear by an independent CQC, and the ELF scale factor.
  const ctx = prepareSeismic(sbModel, withSeismic({ analysis: "mrs" }))
  const modal = modalOf(ctx)
  const run = ctx.runs.eq.mrs!
  const l = run.elf.ladder
  const used = modal.modes.filter((md) => md.ratioX > 1e-10)
  const Vi = used.map((md) => (md.gammaX ** 2 * sa(md.T, l.SDS, l.SD1, 8) * G) / 8)
  const Vcqc = cqc(
    Vi,
    used.map((md) => md.omega),
    0.05,
  )
  check("5b two-storey V_MRS (CQC, ζ = 5 %)", run.unscaledV, Vcqc, 1e-9)
  // ELF at the computed period, capped at Cu·Ta (§12.8.2); SF = max(1, V_ELF / V_MRS).
  const Ta = 0.0466 * (2 * SB.h) ** 0.9
  const Cu =
    l.SD1 >= 0.4 ? 1.4 : l.SD1 >= 0.3 ? 1.4 : l.SD1 >= 0.2 ? 1.5 : l.SD1 >= 0.15 ? 1.6 : 1.7
  const T = Math.min(used[0].T, Cu * Ta)
  const Cs = Math.max(Math.min(l.SDS / 8, l.SD1 / (T * 8)), 0.044 * l.SDS, 0.01)
  const Velf = Cs * 4 * SB.W
  check("5b scale factor max(1, V_ELF/V_MRS)", run.scaleFactor, Math.max(1, Velf / Vcqc), 1e-9)

  // 5c. Station-wise CQC along every member equals an independent CQC.
  const res = solveAllCases(sbModel, withSeismic({ analysis: "mrs" }), undefined, ctx)
  const rs = res.eq
  let worst = 0
  if (rs.ok) {
    const perMode = used.map((md) => {
      const A = (sa(md.T, l.SDS, l.SD1, 8) * G) / 8
      return md.phi.map((p) => (p * md.gammaX * A) / md.omega ** 2)
    })
    const modeRes = perMode.map((d) => recoverResults(sbModel, modal.system, d))
    for (const id of Object.keys(sbModel.members)) {
      const mb = sbModel.members[id],
        a = sbModel.nodes[mb.a],
        b = sbModel.nodes[mb.b]
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      // Errors are measured against the member's peak, not the local value:
      // near an inflection point the local value tends to zero.
      const want: number[] = [],
        got: number[] = []
      for (let s = 0; s <= 20; s++) {
        const x = (s * L) / 20
        want.push(
          cqc(
            modeRes.map((r) => memberInternalForces(r.memberEndForces[id], x, L).M),
            used.map((md) => md.omega),
            0.05,
          ) * run.scaleFactor,
        )
        got.push(Math.abs(memberInternalForces(rs.memberEndForces[id], x, L).M))
      }
      const peak = Math.max(...want, 1e-9)
      for (let s = 0; s <= 20; s++) worst = Math.max(worst, Math.abs(got[s] - want[s]) / peak)
    }
  }
  checkTrue(
    "5c station-wise moment = independent CQC at 21 stations",
    worst < 1e-9,
    `max rel err ${worst.toExponential(1)}`,
  )
}

// ── 6. LTH ───────────────────────────────────────────────────────────────────
console.log("\n6. Linear time history, El Centro 1940 NS")
{
  // 6a. SDOF: the cantilever against Chopra's recurrence at ζ = 5 % on mode 1.
  const ctx = prepareSeismic(cantilever(100), withSeismic({ analysis: "lth" }))
  const modal = modalOf(ctx)
  const run = ctx.runs.eq.lth!
  const w = modal.modes[0].omega
  const ag = EL_CENTRO_NS.values.map((v) => v * G)
  const u = sdofNewmark(w, 0.05, (i) => -ag[i], ag.length, 0.02)
  let peak = 0
  for (const x of u) if (Math.abs(x) > Math.abs(peak)) peak = x
  check("6a cantilever peak roof u vs SDOF recurrence", run.peakRoof.value, peak, 1e-9)
}
{
  // 6b. Two-storey: direct integration vs independent modal superposition with
  // the same Rayleigh coefficients (exact for classical damping). Run on the
  // realistic frame (flexible beams, finite axial stiffness): four massed DOFs,
  // all coupled, so every mode and the vertical ones take part.
  const ctx = prepareSeismic(shearBuilding(true), withSeismic({ analysis: "lth" }))
  const modal = modalOf(ctx)
  const run = ctx.runs.eq.lth!
  const ag = EL_CENTRO_NS.values.map((v) => v * G)
  const roofDof = 3 * modal.system.nodeIdx[run.roofNodeId]
  const hist = new Float64Array(ag.length)
  for (const md of modal.modes) {
    if (Math.abs(md.gammaX) < 1e-12) continue
    const zeta = run.alpha / (2 * md.omega) + (run.betaR * md.omega) / 2
    const q = sdofNewmark(md.omega, zeta, (i) => -md.gammaX * ag[i], ag.length, 0.02)
    for (let i = 0; i < ag.length; i++) hist[i] += md.phi[roofDof] * q[i]
  }
  let maxDiff = 0,
    maxAbs = 0
  for (let i = 0; i < hist.length; i++) {
    maxDiff = Math.max(maxDiff, Math.abs(hist[i] - run.roofU[i]))
    maxAbs = Math.max(maxAbs, Math.abs(hist[i]))
  }
  checkTrue(
    "6b roof u(t), every step, vs modal superposition",
    maxDiff / maxAbs < 1e-10,
    `max rel diff ${(maxDiff / maxAbs).toExponential(1)}`,
  )
  // 6c. Rayleigh ζ is the target at both fit modes.
  const [i1, i2] = run.fitModes
  for (const idx of [i1, i2]) {
    const md = modal.modes[idx - 1]
    check(
      `6c ζ at fit mode ${idx}`,
      run.alpha / (2 * md.omega) + (run.betaR * md.omega) / 2,
      0.05,
      1e-12,
    )
  }
}

// ── 7. Document format ───────────────────────────────────────────────────────
console.log("\n7. Document format")
{
  const cases = withSeismic({ analysis: "lth", userT: 0.8 })
  cases.modal.modal = {
    terms: { selfweight: { factor: 1, include: false }, dead: { factor: 0.9, include: true } },
  }
  const state = {
    model: sbModel,
    loadCases: cases,
    combinations: DEFAULT_COMBINATIONS(),
    combinationSettings: { enabled: true, mode: "code" as const, preset: "SNI 1726:2019" as const },
    groundMotions: [
      { id: "rec", name: "Rec", dt: 0.01, unit: "g" as const, values: [0, 0.1, 0], source: "test" },
    ],
    design: { criteria: defaultDesignCriteria(), sectionInputs: {} },
  }
  const back = parseDocument(serializeDocument(state))
  checkTrue(
    "v2 round trip restores every part",
    back.ok && !back.legacy && isDeepStrictEqual(back.state, JSON.parse(JSON.stringify(state))),
  )
  const legacy = parseDocument(JSON.stringify(sbModel))
  checkTrue("a legacy model-only file still opens", legacy.ok && legacy.legacy)
}

console.log(failures === 0 ? "\nAll checks passed." : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)

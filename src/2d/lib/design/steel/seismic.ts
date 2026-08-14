/**
 * AISC 341-16 seismic provisions — member ductility (D1.1), lateral bracing
 * (D1.2) and strong-column-weak-beam (E3.4a). Pure domain module: no React.
 *
 * ─── SCOPE ──────────────────────────────────────────────────────────────────
 * MOMENT frames only, in three classes:
 *
 *   OMF / RMB (Biasa)      §E1  no ductility requirement — AISC 360 alone
 *   IMF / RMM (Menengah)   §E2  moderately ductile members
 *   SMF / RMK (Khusus)     §E3  highly ductile members + SCWB
 *
 * Braced-frame systems (OCBF/SCBF/EBF/BRBF) are deliberately absent: they need
 * brace mechanism analyses (F2.3) this engine cannot run.
 *
 * Load-side seismic parameters — `R`, `Ωo`, `Cd` — are NOT modelled. That rules
 * out the amplified column demands of D1.4a, which need overstrength load
 * combinations. Everything here is a DETAILING check on the section and the
 * frame: it asks "can this member hinge, and will the mechanism form in the
 * beams?", not "what force does the earthquake deliver?".
 *
 * ─── ⚠ COEFFICIENT PROVENANCE ───────────────────────────────────────────────
 * **The numeric limits below are transcribed from working knowledge of AISC
 * 341-16 Table D1.1 and §D1.2, NOT from the standard text — no copy of AISC 341
 * or SNI 7860 is present in this repository.** Every such constant is tagged
 * `@unverified` at its definition.
 *
 * Structure (which branch applies, the `Ca` breakpoint, the floor value, that
 * λhd < λmd) is asserted in `validation/steel_seismic.mts` and is independent of
 * the exact numbers. **Before relying on these results for real design, check
 * each `@unverified` constant against Table D1.1 and correct it here.** They are
 * isolated in `D1_1` / `D1_2` below precisely so that is a single-file edit.
 */

import type { FrameType } from "../core/types"
import type { SteelGeom } from "./rules"

// ── Ductility level required by the framing type ─────────────────────────────

export type DuctilityLevel = "none" | "moderate" | "high"

/**
 * AISC 341 §E1 / §E2.5a / §E3.5a — the ductility a moment-frame member must
 * achieve. Beams and columns carry the same requirement in a moment frame, so
 * this does not depend on the member's role.
 */
export function requiredDuctility(frameType: FrameType): DuctilityLevel {
  switch (frameType) {
    case "SMF": return "high"
    case "IMF": return "moderate"
    default: return "none"
  }
}

export function ductilityLabel(level: DuctilityLevel): string {
  return level === "high" ? "Highly ductile"
    : level === "moderate" ? "Moderately ductile"
      : "Not required"
}

// ── Expected yield strength Ry (A3.2) ────────────────────────────────────────

/**
 * Expected-yield-stress factor `Ry`, used wherever 341 needs the strength the
 * steel will ACTUALLY deliver rather than its specified minimum.
 *
 * @unverified A3.2 tabulates `Ry` **by ASTM designation**, and this engine has
 * no grade field — only `Fy`. The mapping below infers the grade from `Fy`
 * (≈250 MPa ⇒ A36, above ⇒ A992/Gr.50) and is therefore an **engineering
 * convention of this program, not a code provision**. It is surfaced in the
 * result so it is never silently applied.
 */
export function expectedRy(Fy: number): number {
  return Fy <= 260 ? 1.5 : 1.1
}

// ── Table D1.1 — width-to-thickness limits ───────────────────────────────────

/**
 * @unverified Every coefficient in this block. See the module header.
 *
 * Limits are expressed against `√(E/(Ry·Fy))` (or `E/(Ry·Fy)` for round HSS),
 * matching Table D1.1's form. `Ca = Pu/(φc·Py)` enters only the I-shape web,
 * which is the sole element whose limit depends on axial load.
 */
const D1_1 = {
  /** I-shape / tee flange, λ = b/2tf. */
  flange: { high: 0.32, moderate: 0.40 },
  /** Rectangular HSS wall, λ = b/t. */
  hssWall: { high: 0.65, moderate: 1.18 },
  /** Round HSS, λ = D/t — a plain E/(RyFy) multiple, not a square root. */
  roundWall: { high: 0.038, moderate: 0.062 },
  /** Angle leg, λ = b/t. */
  angleLeg: { high: 0.30, moderate: 0.40 },
  /** Tee stem, λ = d/tw. */
  teeStem: { high: 0.30, moderate: 0.40 },
  /**
   * I-shape web — two branches in `Ca`, with a common floor.
   *
   * ⚠ **KNOWN SUSPECT TRANSCRIPTION.** AISC writes the two branches to MEET at
   * `caBreak`. The `moderate` set closes to 5 decimal places:
   *     3.96·(1 − 3.04·0.114) = 2.58762   vs   1.29·(2.12 − 0.114) = 2.58774
   * The `high` set leaves ~0.3%:
   *     2.57·(1 − 1.04·0.114) = 2.26530   vs   0.88·(2.68 − 0.114) = 2.25808
   * so **at least one of the four `high` constants is wrong.** The residual is
   * small and the limit remains conservative-ish either side, but it must be
   * resolved against Table D1.1 before this is trusted. Measured and bounded by
   * `validation/steel_seismic.mts` §D, which will report if it drifts.
   */
  web: {
    /** Branch point in Ca. */
    caBreak: 0.114,
    /** Floor applied to the high-Ca branch. */
    floor: 1.57,
    high: { lowA: 2.57, lowB: 1.04, hiA: 0.88, hiB: 2.68 },
    moderate: { lowA: 3.96, lowB: 3.04, hiA: 1.29, hiB: 2.12 },
  },
} as const

/**
 * @unverified §D1.2a (moderately ductile) and §D1.2b (highly ductile) —
 * `Lb ≤ coefficient · E·ry/(Ry·Fy)`.
 */
const D1_2 = { high: 0.095, moderate: 0.19 } as const

/** I-shape web limit, Table D1.1 — the only `Ca`-dependent row. */
function webLimit(level: "high" | "moderate", Ca: number, sq: number): number {
  const c = D1_1.web[level]
  if (Ca <= D1_1.web.caBreak) {
    return c.lowA * sq * (1 - c.lowB * Ca)
  }
  return Math.max(c.hiA * sq * (c.hiB - Ca), D1_1.web.floor * sq)
}

// ── Results ──────────────────────────────────────────────────────────────────

export interface SeismicElementCheck {
  /** "flange" | "web" | "wall" | "stem" | "leg-b" | "leg-d" */
  name: string
  /** Width-to-thickness ratio actually present. */
  lambda: number
  /** Table D1.1 limit for the required level. */
  limit: number
  pass: boolean
}

export interface SeismicBracingCheck {
  /** Unbraced length used, m — always the full member length here. */
  Lb: number
  /** D1.2 limit, m. */
  LbMax: number
  pass: boolean
}

export interface SeismicChecks {
  frameType: FrameType
  level: DuctilityLevel
  /** Expected-yield factor applied (see `expectedRy`). */
  Ry: number
  /** Axial ratio Pu/(φc·Py) driving the web limit. */
  Ca: number
  elements: SeismicElementCheck[]
  /** True when every element meets its Table D1.1 limit. */
  ductilityPass: boolean
  /** D1.2 lateral bracing. Advisory — see `notes`. */
  bracing?: SeismicBracingCheck
  /** Everything the user must know to read these results correctly. */
  notes: string[]
}

export interface SeismicInput {
  frameType: FrameType
  g: SteelGeom
  Fy: number
  E: number
  /** Gross area, mm². */
  Ag: number
  /** Required axial COMPRESSION strength, kN (tension or zero ⇒ Ca = 0). */
  Pu: number
  /** φc from the criteria, for Ca = Pu/(φc·Py). */
  phiC: number
  /** Unbraced length, m — the full member length (see strategy.ts). */
  Lb: number
  /** Weak-axis radius of gyration, mm, for D1.2. */
  ry: number
  /** Only beams get the D1.2 bracing check. */
  isBeam: boolean
}

/**
 * Run the AISC 341 detailing checks for one member. Returns `undefined` for
 * OMF/RMB, where no seismic requirement applies and the member is governed by
 * AISC 360 alone — so an OMF run is byte-identical to a pre-seismic run.
 */
export function checkSeismic(inp: SeismicInput): SeismicChecks | undefined {
  const level = requiredDuctility(inp.frameType)
  if (level === "none") return undefined

  const { g, Fy, E, Ag, Pu, phiC, Lb, ry, isBeam } = inp
  const Ry = expectedRy(Fy)
  const RyFy = Ry * Fy
  const sq = Math.sqrt(E / RyFy)

  // Ca = Pu / (φc·Py), Py = Ry·Fy·Ag (LRFD, D1.1). Tension contributes nothing.
  const Py = (RyFy * Ag) / 1000 // N -> kN
  const Ca = Py > 0 ? Math.max(0, Pu) / (phiC * Py) : 0

  const elements: SeismicElementCheck[] = []
  const add = (name: string, lambda: number, limit: number) =>
    elements.push({ name, lambda, limit, pass: lambda <= limit + 1e-9 })

  switch (g.kind) {
    case "iwf":
      add("flange", g.b / (2 * g.tf), D1_1.flange[level] * sq)
      add("web", g.hw / g.tw, webLimit(level, Ca, sq))
      break
    case "rhs":
      add("flange", g.b / g.tf, D1_1.hssWall[level] * sq)
      add("web", g.hw / g.tw, D1_1.hssWall[level] * sq)
      break
    case "chs":
      add("wall", (g.D ?? g.h) / g.tf, (D1_1.roundWall[level] * E) / RyFy)
      break
    case "tee":
      add("flange", g.b / (2 * g.tf), D1_1.flange[level] * sq)
      add("stem", g.hw / g.tw, D1_1.teeStem[level] * sq)
      break
    case "angle":
      add("leg-b", g.b / g.tf, D1_1.angleLeg[level] * sq)
      add("leg-d", g.hw / g.tw, D1_1.angleLeg[level] * sq)
      break
  }

  const notes: string[] = [
    `Ry = ${Ry.toFixed(2)} inferred from Fy (no steel-grade field) — a program ` +
    `convention, not a code provision.`,
    "Table D1.1 limits are unverified against the standard text — see seismic.ts.",
  ]

  // D1.2 applies to BEAMS of moderately/highly ductile moment frames.
  let bracing: SeismicBracingCheck | undefined
  if (isBeam && ry > 0) {
    const LbMax = (D1_2[level] * E * ry) / RyFy / 1000 // mm -> m
    bracing = { Lb, LbMax, pass: Lb <= LbMax + 1e-9 }
    if (!bracing.pass) {
      notes.push(
        `D1.2 uses the FULL modelled member length (Lb = ${Lb.toFixed(2)} m), ` +
        `because bracing is an out-of-plane restraint a 2D model cannot express. ` +
        `Subdivide the member at its real brace points before treating this as a ` +
        `design deficiency.`,
      )
    }
  }

  return {
    frameType: inp.frameType,
    level,
    Ry,
    Ca,
    elements,
    ductilityPass: elements.every((e) => e.pass),
    bracing,
    notes,
  }
}

// ── E3.4a — strong-column-weak-beam ──────────────────────────────────────────

export interface ScwbColumn {
  /** Plastic modulus about the bending axis, mm³. */
  Z33: number
  Fy: number
  /** Gross area, mm². */
  Ag: number
  /** Required axial compression, kN (tension ⇒ no reduction). */
  Pu: number
}

export interface ScwbBeam {
  Z33: number
  Fy: number
}

export interface ScwbResult {
  /** ΣM*pc, kN·m. */
  sumMpc: number
  /** ΣM*pb, kN·m. */
  sumMpb: number
  /** ΣM*pc / ΣM*pb — must exceed 1.0. */
  ratio: number
  pass: boolean
}

/**
 * AISC 341-16 §E3.4a — the moment ratio that keeps hinging in the beams:
 *
 *     ΣM*pc / ΣM*pb  >  1.0
 *     M*pc = Σ Zc·(Fyc − Pu/Ag)        columns above and below the joint
 *     M*pb = Σ 1.1·Ry·Mp,beam          beams either side
 *
 * **SMF only** — §E2 (IMF) and §E1 (OMF) impose no moment ratio.
 *
 * ⚠ `Muv` is omitted from `M*pb`. The code adds the moment produced by the beam
 * shear acting over the distance from the plastic hinge to the column
 * centreline, which needs a hinge location — a property of the CONNECTION, and
 * this engine has no connection model. Omitting it makes `ΣM*pb` smaller and the
 * ratio therefore **optimistic**; a joint that is marginal here may not comply.
 * Reported to the user rather than silently absorbed.
 */
export function checkScwb(
  columns: ScwbColumn[], beams: ScwbBeam[],
): ScwbResult | undefined {
  if (columns.length === 0 || beams.length === 0) return undefined

  const NMM_TO_KNM = 1e-6
  const sumMpc = columns.reduce((acc, c) => {
    const Pn = c.Ag > 0 ? Math.max(0, c.Pu) * 1000 / c.Ag : 0 // kN -> N, MPa
    return acc + c.Z33 * Math.max(0, c.Fy - Pn) * NMM_TO_KNM
  }, 0)

  const sumMpb = beams.reduce(
    (acc, b) => acc + 1.1 * expectedRy(b.Fy) * b.Z33 * b.Fy * NMM_TO_KNM, 0,
  )

  const ratio = sumMpb > 0 ? sumMpc / sumMpb : Infinity
  return { sumMpc, sumMpb, ratio, pass: ratio > 1.0 }
}

/**
 * Section capacity report — per-level strain-compatibility detail for the
 * Advanced Report deck (Design tab, "As checked" mode).
 *
 * Reproduces the EXACT mechanics of `phiMnBars` (flexure.ts) — same εcu, fs
 * clamp, displaced-concrete correction, bisection, and φ ramp — but groups the
 * bars into depth *levels* and exposes per-level εs / fs / force so the
 * Section–Strain–Stress–Compatibility chart and the report table can render
 * the full derivation. Pure domain module: no React imports.
 *
 * Direction: "pos" = sagging (compression at the TOP fibre), "neg" = hogging
 * (compression at the BOTTOM fibre). For "neg" the bar depths are mirrored
 * (d = h − y) and the same solver runs unchanged.
 */

import { buildBarLayout, type BarLayout, type LayoutBar } from "./bar-layout"
import { barArea } from "./rebar"
import { beta1, EPS_CU, EPS_T_MIN } from "./flexure"
import { avSProvided, vc, phiVnProvided } from "./shear"
import type { RcCriteria } from "./criteria"
import type { RebarArrangement } from "./types"

export type BendingDirection = "pos" | "neg"

/** Density of reinforcing steel, kg/m³ (for the steel-weight summary). */
const STEEL_DENSITY = 7850

/** Engineering summary ratios — tension steel actually counted in capacity. */
export interface SectionSummary {
  /** Bottom longitudinal steel area (both layers), mm². */
  AsBot: number
  /** Top longitudinal steel area (both layers), mm². */
  AsTop: number
  /** Effective depth to the bottom-steel centroid, mm (bottom in tension). */
  dBot: number
  /** Effective depth to the top-steel centroid, mm (top in tension). */
  dTop: number
  /** Bottom reinforcement ratio ρ_bot = As,bot / (b·d_bot). */
  rhoBot: number
  /** Top reinforcement ratio ρ_top = As,top / (b·d_top). */
  rhoTop: number
  /** All longitudinal steel (top + side + bottom), mm². */
  AsTotal: number
  /** Minimum ratio ρ_min = max(0.25√f'c, 1.4)/fy (9.6.1.2). */
  rhoMin: number
  /** Tension-controlled singly-reinforced max ratio ρ_max (εt = 0.005). */
  rhoMax: number
  /** Gross steel ratio ρ_gross = As,total / (b·h). */
  rhoGross: number
  /** Steel mass per metre of beam (longitudinal bars only), kg/m. */
  steelWeight: number
  /** Neutral-axis ratio c/d (ductility indicator). */
  cOverD: number
}

export interface ReportLevel {
  /** Level label per the locked notation: t1, t2 (top layers), s1…sn (side
   *  levels top→bottom), b2, b1 (bottom layer 2 then layer 1). */
  label: string
  role: "top" | "side" | "bottom"
  /** Depth from the extreme COMPRESSION fibre, mm (direction-aware). */
  d: number
  /** Physical depth from the TOP of the section, mm (for drawing). */
  y: number
  /** Bars at this level (side levels count both faces). */
  count: number
  /** Total steel area at this level, mm². */
  As: number
  /** Strain (compression positive). */
  epsS: number
  /** Stress, MPa (clamped ±fy). */
  fs: number
  /** Force, kN, compression positive (incl. displaced-concrete correction). */
  force: number
  /** |εs| ≥ fy/Es */
  yielded: boolean
}

export interface SectionCapacityReport {
  direction: BendingDirection
  /** Neutral-axis depth from the compression fibre, mm. */
  c: number
  /** Whitney block depth a = β₁·c, mm (capped at h). */
  a: number
  beta1: number
  /** Concrete block force 0.85·f'c·b·a, kN. */
  Cc: number
  /** Net tensile strain at the extreme tension level. */
  epsT: number
  phi: number
  phiClass: "tension" | "transition" | "compression"
  /** kN·m */
  Mn: number
  phiMn: number
  /** Ordered top of section → bottom (physical y ascending). */
  levels: ReportLevel[]
  /** Engineering summary ratios for this direction. */
  summary: SectionSummary
  /** True when the arrangement does not fit (2-layer cap exceeded). */
  fits: boolean
  /** Shear capacities; Vc zeroed in SMF end (support) zones per 18.6.5.2. */
  shear: {
    /** Effective depth used (tension-group centroid for this direction), mm. */
    d: number
    /** Provided transverse steel Av/s, mm²/m. */
    avS: number
    Vc: number
    Vs: number
    Vn: number
    phiVn: number
    phi: number
    vcZeroed: boolean
  }
}

/** Group physical bars into distinct depth levels with report labels. */
function buildLevels(layout: BarLayout, arr: RebarArrangement): Omit<
  ReportLevel,
  "d" | "epsS" | "fs" | "force" | "yielded"
>[] {
  const levels: Omit<ReportLevel, "d" | "epsS" | "fs" | "force" | "yielded">[] = []

  const faceLevels = (
    role: "top" | "bottom",
    bars: LayoutBar[],
    areaPerBar: number,
  ) => {
    const byLayer = new Map<1 | 2, LayoutBar[]>()
    for (const p of bars) {
      const list = byLayer.get(p.layer) ?? []
      list.push(p)
      byLayer.set(p.layer, list)
    }
    const prefix = role === "top" ? "t" : "b"
    return [1, 2]
      .filter((l) => byLayer.has(l as 1 | 2))
      .map((l) => {
        const list = byLayer.get(l as 1 | 2)!
        return {
          label: `${prefix}${l}`,
          role,
          y: list[0].y,
          count: list.length,
          As: list.length * areaPerBar,
        }
      })
  }

  const topBars = layout.bars.filter((p) => p.role === "top")
  const botBars = layout.bars.filter((p) => p.role === "bottom")
  levels.push(...faceLevels("top", topBars, barArea(arr.top.size)))

  // Side levels: one per distinct y (both faces summed), top→bottom.
  const sideArea = barArea(arr.side.size)
  layout.side.ys.forEach((y, i) => {
    levels.push({ label: `s${i + 1}`, role: "side", y, count: 2, As: 2 * sideArea })
  })

  levels.push(...faceLevels("bottom", botBars, barArea(arr.bottom.size)))

  // Physical order top → bottom.
  levels.sort((p, q) => p.y - q.y)
  return levels
}

/**
 * Full strain-compatibility capacity report for one bending direction + zone.
 * Numerically identical to `phiMnBars` over the same bar set (validated by
 * `validation/section_report_check.mts`).
 */
export function buildSectionCapacityReport(
  b: number,
  h: number,
  cover: number,
  arr: RebarArrangement,
  fc: number,
  cr: RcCriteria,
  direction: BendingDirection,
  zone: "support" | "midspan",
): SectionCapacityReport {
  const { Es, fy } = cr
  const layout = buildBarLayout(b, h, cover, arr)
  const base = buildLevels(layout, arr)

  // Depth from the compression fibre (direction-aware).
  const depth = (y: number) => (direction === "pos" ? y : h - y)
  const active = base.filter((p) => p.As > 0)
  const b1 = beta1(fc)
  const dt = active.length > 0 ? Math.max(...active.map((p) => depth(p.y))) : 0

  // Signed level force (N, compression +) at neutral-axis depth c — identical
  // mechanics to phiMnBars::barForce.
  const levelForceN = (As: number, d: number, c: number, a: number): number => {
    const fs = Math.max(-fy, Math.min(fy, Es * EPS_CU * ((c - d) / c)))
    const displaced = fs > 0 && d <= a ? 0.85 * fc : 0
    return As * (fs - displaced)
  }

  const balance = (c: number): number => {
    const a = Math.min(b1 * c, h)
    let net = 0.85 * fc * b * a
    for (const p of active) net += levelForceN(p.As, depth(p.y), c, a)
    return net
  }

  let c = 0
  if (active.length > 0) {
    let lo = 1e-6
    let hi = h
    if (balance(hi) < 0) lo = hi // pathological: huge As — treat as c = h
    for (let i = 0; i < 100; i++) {
      const mid = 0.5 * (lo + hi)
      if (balance(mid) >= 0) hi = mid
      else lo = mid
    }
    c = 0.5 * (lo + hi)
  }
  const a = Math.min(b1 * c, h)
  const Cc_N = 0.85 * fc * b * a

  // Moments about the compression fibre (ΣF = 0 ⇒ Mn directly).
  let Mn_Nmm = -Cc_N * (a / 2)
  const levels: ReportLevel[] = base.map((p) => {
    const d = depth(p.y)
    if (p.As <= 0 || c <= 0) {
      return { ...p, d, epsS: 0, fs: 0, force: 0, yielded: false }
    }
    const epsS = EPS_CU * ((c - d) / c)
    const fs = Math.max(-fy, Math.min(fy, Es * epsS))
    const forceN = levelForceN(p.As, d, c, a)
    Mn_Nmm -= forceN * d
    return {
      ...p,
      d,
      epsS,
      fs,
      force: forceN / 1e3,
      yielded: Math.abs(epsS) >= fy / Es,
    }
  })

  const epsT = c > 0 ? EPS_CU * ((dt - c) / c) : Infinity
  const epsTy = fy / Es
  const t = (epsT - epsTy) / (EPS_T_MIN - epsTy)
  const phi =
    active.length === 0
      ? cr.phiTension
      : Math.min(
          cr.phiTension,
          Math.max(cr.phiCompression, cr.phiCompression + (cr.phiTension - cr.phiCompression) * t),
        )
  const phiClass: SectionCapacityReport["phiClass"] =
    epsT >= EPS_T_MIN ? "tension" : epsT <= epsTy ? "compression" : "transition"

  const Mn = Math.max(0, Mn_Nmm) / 1e6

  // ── Summary ratios: report BOTH faces transparently from the actual layout ──
  // ρ_bot and ρ_top use each face's own steel area (across both layers, exactly
  // as drawn in the preview) over its effective depth to that face's centroid.
  // d_bot = depth from top fibre to the bottom-steel centroid (bottom in
  // tension); d_top = h − top-steel centroid (top in tension). Both are
  // direction-independent — they describe the section, not the current ±M case.
  const AsBot = layout.bottom.area
  const AsTop = layout.top.area
  const dBot = layout.bottom.centroid
  const dTop = h - layout.top.centroid
  const rhoBot = dBot > 0 ? AsBot / (b * dBot) : 0
  const rhoTop = dTop > 0 ? AsTop / (b * dTop) : 0
  const AsTotal = levels.reduce((s, l) => s + l.As, 0)
  const rhoMin = Math.max(0.25 * Math.sqrt(fc), 1.4) / fy
  const rhoMax = ((0.85 * b1 * fc) / fy) * (EPS_CU / (EPS_CU + EPS_T_MIN))
  const rhoGross = AsTotal / (b * h)
  const steelWeight = (AsTotal * STEEL_DENSITY) / 1e6 // mm²·kg/m³ → kg/m
  // c/d ductility for the current bending direction: tension face is bottom for
  // +M, top for −M.
  const dTension = direction === "pos" ? dBot : dTop
  const cOverD = dTension > 0 ? c / dTension : 0
  const summary: SectionSummary = {
    AsBot,
    AsTop,
    dBot,
    dTop,
    rhoBot,
    rhoTop,
    AsTotal,
    rhoMin,
    rhoMax,
    rhoGross,
    steelWeight,
    cOverD,
  }

  // ── Shear: d = tension-group centroid for this direction (22.5) ────────────
  const dShear =
    direction === "pos" ? layout.bottom.centroid : h - layout.top.centroid
  const vcZeroed = cr.frameType === "SMF" && zone === "support"
  const VcRaw = vc(cr.lambda, fc, b, dShear)
  const VcUsed = vcZeroed ? 0 : VcRaw
  const avS = avSProvided(cr.stirrupLegs, arr.stirrup.size, arr.stirrup.spacing)
  const Vs = ((avS / 1000) * cr.fyt * dShear) / 1e3 // kN
  const Vn = VcUsed + Vs

  return {
    direction,
    c,
    a,
    beta1: b1,
    Cc: Cc_N / 1e3,
    epsT,
    phi,
    phiClass,
    Mn,
    phiMn: phi * Mn,
    levels,
    summary,
    fits: layout.fits,
    shear: {
      d: dShear,
      avS,
      Vc: VcUsed,
      Vs,
      Vn,
      phiVn: phiVnProvided(VcUsed, avS, cr.fyt, dShear, cr),
      phi: cr.phiShear,
      vcZeroed,
    },
  }
}

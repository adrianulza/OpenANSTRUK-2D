/**
 * RC member design strategy (ACI 318-14 / SNI 2847:2019). Given one member's
 * demand context (per-combo end forces + enveloped zone demands), designs it as
 * a beam (flexure + shear per zone) or column (P–M interaction).
 *
 * Element resolution: explicit beam/column wins; `auto` picks by orientation,
 * promoted to column when the axial compression reaches the beam gate
 * Pu ≥ 0.1·f'c·Ag. Flexure runs before shear because IMF/SMF capacity-design
 * shear (Ve) needs the flexural steel.
 *
 * Pure domain module: no React imports. The orchestrator in core/run-design.ts
 * builds the demand context and dispatches here by section material.
 */

import type { MemberId } from "@/lib/model"
import type { LoadComboId } from "@/lib/load-cases"
import type { MemberEndForces } from "@/lib/solver"
import { memberInternalForces } from "@/lib/solver"
import type {
  ColumnDesignResult,
  ColumnShearResult,
  DetailingCheck,
  DetailingGroup,
  MemberDesignResult,
  ZoneFlexureResult,
  ZoneId,
  ZoneShearResult,
} from "../core/types"
import type { ArrangementCheck } from "./shared/types"
import type { ColumnBar, ColumnGeom } from "./shared/types"
import { geomH, geomAg, geomIg, geomShear } from "./shared/types"
import type { RebarSize } from "./shared/rebar"
import { ZONE_IDS } from "../core/types"
import {
  applyFrameMomentMinimums,
  collectPMPairs,
  type MemberZoneDemands,
} from "../core/demands"
import type { RcCriteria } from "./criteria"
import type { RcSectionInput, RebarArrangement, ColumnArrangement } from "./types"
import { getRcCode, type RcCodeModule } from "./codes"
import type { ColumnInteractionCurve, BarPoint, FlexureGeometry } from "./codes/aci318-25"
import {
  buildColumnBarLayout,
  layoutToColumnBars,
  representativeColumnBars,
} from "./shared/column-grid"
import { buildBarLayout, type BarLayout } from "./shared/bar-geometry"
import { barArea, barDia } from "./shared/rebar"
import { resolveElementType } from "../core/element-type"

// "As required" mode no longer asks for assumed bars — these defaults drive the
// SMF hinge-zone spacing cap (6·db) and the stirrup-size suggestion only.
const REQUIRED_MAIN_BAR = "D19" as const
const REQUIRED_STIRRUP_BAR = "D10" as const

// Per-sign effective depths. "Bottom" = −local-2 fibre (tension under sagging
// MuPos), "top" = +local-2. For vertical/inclined members this is the local
// frame, not gravity-up — same sides the diagrams use.
interface MemberGeometry {
  b: number
  h: number
  fc: number
  dPos: number // tension steel = bottom bars
  dPrimePos: number // compression steel = top bars
  dNeg: number // tension steel = top bars
  dPrimeNeg: number // compression steel = bottom bars
  AsTop: number // provided, mm² (checked mode; 0 in required mode)
  AsBottom: number
  /** Full bar layout (checked mode only) — drives strain-compatibility flexure. */
  layout?: BarLayout
}

/** Bar depths measured from the +local-2 ("top") fibre → positive bending
 *  (bottom tension, top compression). */
function barsCompressionTop(layout: BarLayout): BarPoint[] {
  return layout.bars.map((p) => ({ d: p.y, area: p.area }))
}
/** Mirrored depths for negative bending (top tension, bottom compression). */
function barsCompressionBottom(layout: BarLayout, h: number): BarPoint[] {
  return layout.bars.map((p) => ({ d: h - p.y, area: p.area }))
}

function geometryFor(
  bMm: number,
  hMm: number,
  fc: number,
  input: RcSectionInput,
  arr: RebarArrangement,
): MemberGeometry {
  if (input.mode === "required") {
    return {
      b: bMm, h: hMm, fc,
      dPos: hMm - input.dPrime, dPrimePos: input.dPrime,
      dNeg: hMm - input.dPrime, dPrimeNeg: input.dPrime,
      AsTop: 0, AsBottom: 0,
    }
  }
  // Checked mode: layout resolves layering (auto-overflow @ 50 mm clear), and
  // effective depths use the tension-group CENTROID per the 2.2/22.5 definition
  // of d (shear uses these; flexure goes per-bar via strain compatibility).
  const layout = buildBarLayout(bMm, hMm, input.cover, arr)
  return {
    b: bMm, h: hMm, fc,
    dPos: layout.bottom.centroid,
    dPrimePos: layout.top.centroid,
    dNeg: hMm - layout.top.centroid,
    dPrimeNeg: hMm - layout.bottom.centroid,
    AsTop: arr.top.count * barArea(arr.top.size),
    AsBottom: arr.bottom.count * barArea(arr.bottom.size),
    layout,
  }
}

function flexGeomPos(g: MemberGeometry): FlexureGeometry {
  return { b: g.b, d: g.dPos, dPrimeC: g.dPrimePos, fc: g.fc }
}
function flexGeomNeg(g: MemberGeometry): FlexureGeometry {
  return { b: g.b, d: g.dNeg, dPrimeC: g.dPrimeNeg, fc: g.fc }
}

/**
 * Slenderness verdict, read off the magnifier.
 *
 * `slendernessMagnifier` returns δns = 99 when `1 − Pu/(0.75·Pc) ≤ 0`: the
 * member buckles before it yields, and no amount of steel fixes that. Treating
 * "≥ 99" rather than "exactly 99" as the failure is deliberate — a legitimately
 * computed 99× amplification is just as unbuildable as the sentinel, so the
 * threshold does not depend on telling the two apart.
 *
 * A short column (δns = 1 via the 6.2.5 gate) and a slender-but-stable one both
 * pass; their amplified moments are already inside the interaction D/C, so this
 * answers only "does the column stand up", not "is it big enough".
 */
const DELTA_NS_RUNAWAY = 99

function slendernessStable(deltaNs: number | undefined): boolean {
  return deltaNs === undefined || deltaNs < DELTA_NS_RUNAWAY
}

/** Tag a code module's detailing verdicts with the group the UI names them by. */
function tagged(
  group: DetailingGroup,
  checks: ArrangementCheck[],
  where?: string,
): DetailingCheck[] {
  return checks.map((c) => ({ group, where, status: c.status, text: c.text, clause: c.clause }))
}

// ── Flexure per zone ─────────────────────────────────────────────────────────

function designZoneFlexure(
  MuPos: number,
  MuNeg: number,
  g: MemberGeometry,
  input: RcSectionInput,
  cr: RcCriteria,
): ZoneFlexureResult {
  const code = getRcCode(cr.code)
  if (input.mode === "required") {
    const bot = code.requiredAs(MuPos, flexGeomPos(g), cr)
    const top = code.requiredAs(Math.abs(MuNeg), flexGeomNeg(g), cr)
    const adequate = bot.adequate && top.adequate
    return {
      MuPos, MuNeg,
      AsReqBottom: bot.As,
      AsReqTop: top.As,
      AsPrimeReq: Math.max(bot.AsPrime, top.AsPrime),
      // Mode-independent view of the same steel — see ZoneFlexureResult.AsTop.
      AsTop: top.As,
      AsBottom: bot.As,
      rhoTop: g.dNeg > 0 ? top.As / (g.b * g.dNeg) : 0,
      rhoBottom: g.dPos > 0 ? bot.As / (g.b * g.dPos) : 0,
      dc: adequate ? 0 : Infinity,
      adequate,
    }
  }

  // Checked: per-bar strain compatibility over the full layout (top + bottom +
  // side bars — skin steel counts per 9.7.2.3), both bending signs.
  const layout = g.layout!
  if (!layout.fits) {
    // Bars don't fit in 2 layers (25.2.1) — arrangement is unbuildable. The bar
    // areas are still reported: the user asked for those bars, and a report that
    // blanked here would hide what makes the arrangement fail.
    return {
      MuPos, MuNeg, dcPos: Infinity, dcNeg: Infinity, dc: Infinity, adequate: false,
      AsTop: g.AsTop, AsBottom: g.AsBottom,
    }
  }
  const pos = code.phiMnBars(barsCompressionTop(layout), g.b, g.h, g.fc, cr)
  const neg = code.phiMnBars(barsCompressionBottom(layout, g.h), g.b, g.h, g.fc, cr)
  const dcPos = MuPos > 0 ? (pos.phiMn > 0 ? MuPos / pos.phiMn : Infinity) : 0
  const dcNeg = MuNeg < 0 ? (neg.phiMn > 0 ? Math.abs(MuNeg) / neg.phiMn : Infinity) : 0
  const dc = Math.max(dcPos, dcNeg)
  return {
    MuPos, MuNeg,
    phiMnPos: pos.phiMn, phiMnNeg: neg.phiMn,
    dcPos, dcNeg, dc,
    AsTop: g.AsTop,
    AsBottom: g.AsBottom,
    rhoTop: g.dNeg > 0 ? g.AsTop / (g.b * g.dNeg) : 0,
    rhoBottom: g.dPos > 0 ? g.AsBottom / (g.b * g.dPos) : 0,
    adequate: dc <= 1,
  }
}

// ── Capacity-design end moments (Mn for IMF, Mpr for SMF) ────────────────────

interface EndMoments {
  pos: number // bottom bars in tension, kN·m (φ = 1)
  neg: number // top bars in tension, kN·m (φ = 1)
}

function capacityEndMoments(
  g: MemberGeometry,
  zone: ZoneFlexureResult,
  input: RcSectionInput,
  cr: RcCriteria,
  fyFactor: number, // 1.0 for Mn (IMF), 1.25 for Mpr (SMF)
): EndMoments {
  const code = getRcCode(cr.code)
  const fyOver = fyFactor * cr.fy
  if (input.mode === "checked" && g.layout) {
    // Same strain-compatibility solver as the capacity check (all bars).
    return {
      pos: code.phiMnBars(barsCompressionTop(g.layout), g.b, g.h, g.fc, cr, fyOver).Mn,
      neg: code.phiMnBars(barsCompressionBottom(g.layout, g.h), g.b, g.h, g.fc, cr, fyOver).Mn,
    }
  }
  // Required mode — book/SAP convention: tension steel only (AsPrime = 0).
  return {
    pos: code.phiMnProvided(zone.AsReqBottom ?? 0, 0, flexGeomPos(g), cr, fyOver).Mn,
    neg: code.phiMnProvided(zone.AsReqTop ?? 0, 0, flexGeomNeg(g), cr, fyOver).Mn,
  }
}

// ── Shear per zone ───────────────────────────────────────────────────────────

/**
 * Governing max stirrup/hoop spacing for a zone (mm):
 * - SMF hinge → min(d/4, 6db,long, 150)            [18.6.4.4]
 * - IMF hinge → min(d/4, 8db,long, 24db,hoop, 300) [18.4.2.5]
 * - elsewhere → min(d/2, 600), tightening to min(d/4, 300) when
 *   Vs > 0.33√f'c·bw·d                              [9.7.6.2.2]
 */
function governingSpacingMax(
  cr: RcCriteria,
  isEndZone: boolean,
  d: number,
  dbLong: number,
  dbHoop: number,
  VsReq: number, // kN — required steel shear Vu/φ − Vc
  fc: number,
  bw: number,
): number {
  const code = getRcCode(cr.code)
  if (cr.frameType === "SMF" && isEndZone) return code.smfEndZoneSpacingMax(d, dbLong)
  if (cr.frameType === "IMF" && isEndZone) return code.imfEndZoneSpacingMax(d, dbLong, dbHoop)
  return code.generalSpacingMax(d, VsReq > code.vsSpacingThreshold(fc, bw, d))
}

function designZoneShear(
  zoneId: ZoneId,
  Vu: number,
  Ve: number | undefined,
  g: MemberGeometry,
  input: RcSectionInput,
  arr: RebarArrangement,
  cr: RcCriteria,
  /** Longitudinal tension steel for ρw in the ACI 318-25 no-stirrup Vc (formula
   *  c). Checked = provided; required = required-flexure As. mm². */
  tensionAs: number,
): ZoneShearResult {
  const code = getRcCode(cr.code)
  const d = Math.min(g.dPos, g.dNeg)
  const isEndZone = zoneId !== "midspan"
  const Vdesign = Math.max(Vu, Ve ?? 0)

  // Vc size-effect (ACI 318-25 §22.5.5.1.3) applies the formula-(c) penalty to
  // members WITHOUT at least minimum shear reinforcement; SNI/318-14 ignores it.
  // Checked mode reads the provided stirrup; required mode provides stirrups
  // wherever Vu > ½φVc, so the penalty only ever affects low-shear regions that
  // don't govern. ρw = the longitudinal tension reinforcement ratio.
  const rhoW = d > 0 ? tensionAs / (g.b * d) : 0
  const VcWithReinf = code.vc(cr.lambda, g.fc, g.b, d, true)
  let hasMinShearReinf: boolean
  if (input.mode === "checked") {
    const avSprov = code.avSProvided(cr.stirrupLegs, arr.stirrup.size, arr.stirrup.spacing)
    hasMinShearReinf = avSprov >= code.avMinPerS(g.fc, cr.fyt, g.b) * 1000 - 1e-9
  } else {
    hasMinShearReinf = Vdesign > 0.5 * cr.phiShear * VcWithReinf
  }
  const VcFull = code.vc(cr.lambda, g.fc, g.b, d, hasMinShearReinf, rhoW)
  // SMF: ignore concrete shear capacity in the hinge (end) zones — 18.6.5.2.
  const VcZone = cr.frameType === "SMF" && isEndZone ? 0 : VcFull
  const phiVc = cr.phiShear * VcZone
  const phiVmax = cr.phiShear * code.vMaxLimit(VcZone, g.fc, g.b, d)
  const crossSectionOk = Vdesign <= phiVmax

  // Required steel shear Vs = Vu/φ − Vc drives the 9.7.6.2.2 spacing tightening.
  const VsReq = Math.max(0, Vdesign / cr.phiShear - VcZone)
  // 18.6.4.4(b) / 18.4.2.5(b): 6db / 8db of the SMALLEST primary flexural bar.
  const dbLong =
    input.mode === "checked"
      ? Math.min(barDia(arr.top.size), barDia(arr.bottom.size))
      : barDia(REQUIRED_MAIN_BAR)
  const dbHoop = input.mode === "checked" ? barDia(arr.stirrup.size) : barDia(REQUIRED_STIRRUP_BAR)
  const sMaxGov = governingSpacingMax(cr, isEndZone, d, dbLong, dbHoop, VsReq, g.fc, g.b)

  if (input.mode === "required") {
    const AvSReq = code.avSRequired(Vdesign, phiVc, cr.fyt, d, cr, g.fc, g.b)
    const suggested = code.suggestStirrup(AvSReq, cr.stirrupLegs, REQUIRED_STIRRUP_BAR, sMaxGov)
    return {
      Vu, Ve, Vdesign, phiVc, phiVmax,
      AvSReq, suggested, AvS: AvSReq,
      pass: crossSectionOk,
      crossSectionOk,
    }
  }

  // Checked mode
  const avS = code.avSProvided(cr.stirrupLegs, arr.stirrup.size, arr.stirrup.spacing)
  const phiVn = code.phiVnProvided(VcZone, avS, cr.fyt, d, cr)
  const dc = Vdesign > 0 ? (phiVn > 0 ? Vdesign / phiVn : Infinity) : 0
  // Minimum stirrups required where Vu > ½φVc (9.6.3.1).
  const stirrupsRequired = Vdesign > 0.5 * phiVc
  const avMinOk = !stirrupsRequired || avS >= code.avMinPerS(g.fc, cr.fyt, g.b) * 1000 - 1e-9
  // Spacing limit: seismic hinge zones (SMF/IMF) always apply their detailing
  // cap; elsewhere the general 9.7.6.2.2 cap applies where stirrups are required.
  const seismicHinge = isEndZone && cr.frameType !== "OMF"
  let spacingCheck: ZoneShearResult["spacingCheck"]
  if (seismicHinge || stirrupsRequired) {
    spacingCheck = { sMax: sMaxGov, pass: arr.stirrup.spacing <= sMaxGov + 1e-9 }
  }
  const pass = dc <= 1 && crossSectionOk && avMinOk && (spacingCheck?.pass ?? true)
  return {
    Vu, Ve, Vdesign, phiVc, phiVmax,
    phiVn, dc, AvS: avS,
    pass, crossSectionOk, spacingCheck,
  }
}

// ── Column (P–M interaction) ──────────────────────────────────────────────────

/**
 * Worst radial interaction D/C over every combo × candidate (P,M) station. When
 * `slender` is given, each combo's station moments are magnified by the in-plane
 * non-sway δns (6.6.4) computed from that combo's end moments + axial; the
 * governing δns/slenderness is reported back.
 */
function worstInteraction(
  code: RcCodeModule,
  curve: ColumnInteractionCurve,
  efByCombo: Record<LoadComboId, MemberEndForces>,
  L: number,
  slender?: { Ec: number; Ig: number; Ag: number },
): {
  worstDC: number
  governing?: { combo: LoadComboId; Pu: number; Mu: number }
  pairs: { P: number; M: number; combo: LoadComboId }[]
  deltaNs: number
  slenderness: number
} {
  let worstDC = 0
  let governing: { combo: LoadComboId; Pu: number; Mu: number } | undefined
  let deltaNs = 1
  let slenderness = 0
  const pairs: { P: number; M: number; combo: LoadComboId }[] = []
  for (const [comboId, ef] of Object.entries(efByCombo)) {
    const stations = collectPMPairs(ef, L)
    // Per-combo non-sway magnifier from the end moments + max compression.
    let delta = 1
    if (slender) {
      const Mi = memberInternalForces(ef, 0, L).M
      const Mj = memberInternalForces(ef, L, L).M
      const M2 = Math.abs(Mi) >= Math.abs(Mj) ? Mi : Mj
      const M1 = Math.abs(Mi) >= Math.abs(Mj) ? Mj : Mi
      const PuComp = stations.reduce((m, p) => Math.max(m, -p.P), 0)
      const sl = code.slendernessMagnifier(PuComp, M1, M2, L, slender.Ec, slender.Ig, slender.Ag)
      delta = sl.delta
      if (sl.delta > deltaNs) deltaNs = sl.delta
      if (sl.slenderness > slenderness) slenderness = sl.slenderness
    }
    for (const p of stations) {
      const Mu = p.M * delta
      pairs.push({ P: p.P, M: Mu, combo: comboId })
      const { dc } = code.interactionDC(curve, p.P, Mu)
      if (dc > worstDC) {
        worstDC = dc
        governing = { combo: comboId, Pu: p.P, Mu }
      }
    }
  }
  return { worstDC, governing, pairs, deltaNs, slenderness }
}

/**
 * Column capacity-design shear (kN). Ve from the column flexural strength
 * developed at the acting axial: IMF/SRPMM uses Mn (1.0fy, 18.4.3.1), SMF/SRPMK
 * uses Mpr (1.25fy, 18.7.6.1), assuming hinges at both ends → Ve = 2·M/lu. OMF
 * designs for the factored Vu only. SMF zeroes Vc in the confinement zone when
 * the axial is low (Pu < Ag·f'c/20, 18.7.6.2.1). Reuses the beam shear helpers.
 */
function designColumnShear(
  bars: ColumnBar[],
  geom: ColumnGeom,
  fc: number,
  L: number,
  cr: RcCriteria,
  PuComp: number, // kN, compression +
  Vu: number, // kN
  mode: RcSectionInput["mode"],
  dbLong: number,
  tie: { size: RebarSize; spacing: number },
): ColumnShearResult {
  const code = getRcCode(cr.code)
  const Ag = geomAg(geom)
  const dMaxBar = bars.length > 0 ? Math.max(...bars.map((p) => p.d)) : geomH(geom) - 65
  const { bw, d } = geomShear(geom, dMaxBar)
  const dbHoop = barDia(tie.size)

  // Capacity-design shear demand Ve (IMF: Mn; SMF: Mpr). PuComp (compression +) →
  // tension-positive axial = −PuComp for the interaction solver.
  let Ve: number | undefined
  if (cr.frameType !== "OMF") {
    const fyFactor = cr.frameType === "SMF" ? 1.25 : 1.0
    const M = code.columnFlexuralStrengthAtP(bars, geom, fc, cr, -PuComp, fyFactor)
    Ve = L > 0 ? (2 * M) / L : 0
  }
  const Vdesign = Math.max(Vu, Ve ?? 0)

  // SMF/SRPMK: Vc = 0 in the confinement region when Pu < Ag·f'c/20 (18.7.6.2.1).
  const lowAxial = PuComp < (Ag * fc) / 20 / 1e3
  const vcZeroed = cr.frameType === "SMF" && lowAxial
  const VcFull = code.columnShearVc(cr.lambda, fc, bw, d, PuComp, Ag, true)
  const VcZone = vcZeroed ? 0 : VcFull
  const phiVc = cr.phiShear * VcZone
  const phiVmax = cr.phiShear * code.vMaxLimit(VcZone, fc, bw, d)
  const crossSectionOk = Vdesign <= phiVmax

  // Hoop/tie spacing cap: SMF hinge min(d/4, 6db, 150); IMF min(d/4, 8db,long,
  // 24db,hoop, 300); OMF general 25.7/9.7.6.2.2.
  const VsReq = Math.max(0, Vdesign / cr.phiShear - VcZone)
  const sMax =
    cr.frameType === "SMF"
      ? code.smfEndZoneSpacingMax(d, dbLong)
      : cr.frameType === "IMF"
        ? code.imfEndZoneSpacingMax(d, dbLong, dbHoop)
        : code.generalSpacingMax(d, VsReq > code.vsSpacingThreshold(fc, bw, d))

  if (mode === "required") {
    const AvSReq = code.avSRequired(Vdesign, phiVc, cr.fyt, d, cr, fc, bw)
    const suggested = code.suggestStirrup(AvSReq, cr.stirrupLegs, tie.size, sMax)
    return {
      Vu, Ve, Vdesign, phiVc, phiVmax, vcZeroed,
      AvSReq, suggested, AvS: AvSReq,
      pass: crossSectionOk, crossSectionOk,
      spacingMax: sMax,
    }
  }

  const avS = code.avSProvided(cr.stirrupLegs, tie.size, tie.spacing)
  const phiVn = code.phiVnProvided(VcZone, avS, cr.fyt, d, cr)
  const dc = Vdesign > 0 ? (phiVn > 0 ? Vdesign / phiVn : Infinity) : 0
  const spacingPass = tie.spacing <= sMax + 1e-9
  return {
    Vu, Ve, Vdesign, phiVc, phiVmax, vcZeroed,
    phiVn, dc, AvS: avS,
    spacingMax: sMax, spacingPass,
    pass: dc <= 1 && crossSectionOk && spacingPass, crossSectionOk,
  }
}

/**
 * Column design by P–M interaction. Checked mode tests the user's nx×ny grid;
 * required mode bisects the longitudinal ratio ρg ∈ [1%, 8%] (D/C decreases
 * monotonically with ρg) on a representative symmetric ring.
 */
function designColumn(
  memberId: MemberId,
  geom: ColumnGeom,
  fc: number,
  L: number,
  di: RcSectionInput,
  cr: RcCriteria,
  efByCombo: Record<LoadComboId, MemberEndForces>,
  Pu: number,
  Vu: number,
): MemberDesignResult {
  const code = getRcCode(cr.code)
  const Ag = geomAg(geom)
  // In-plane non-sway slenderness inputs (k = 1.0 braced). Ec ≈ 4700√f'c.
  const slender = { Ec: 4700 * Math.sqrt(fc), Ig: geomIg(geom), Ag }

  if (di.mode === "checked") {
    const layout = buildColumnBarLayout(geom, di.cover, di.column.checked)
    const bars = layoutToColumnBars(layout)
    const spiral = di.column.checked.confinement === "spiral"
    const curve = code.buildInteractionCurve(bars, geom, fc, cr, spiral)
    const { worstDC, governing, pairs, deltaNs, slenderness } = worstInteraction(
      code, curve, efByCombo, L, slender,
    )
    const rhoG = Ag > 0 ? layout.Ast / Ag : 0
    const shear = designColumnShear(
      bars, geom, fc, L, cr, Pu, Vu, "checked",
      barDia(di.column.checked.size), di.column.checked.tie,
    )
    const confinement = code.columnConfinement(
      geom, di.cover, di.column.checked, fc, cr, cr.frameType, Pu, L, cr.stirrupLegs,
    )
    const Mn = code.columnFlexuralStrengthAtP(bars, geom, fc, cr, -Pu, 1.0)
    const confinementLegs = code.requiredConfinementLegs(
      geom, di.cover, di.column.checked, fc, cr, cr.stirrupLegs, Pu, layout.bars.length,
    )
    const column: ColumnDesignResult = {
      rhoG, Ast: layout.Ast, worstDC, governing, pmPairs: pairs, adequate: worstDC <= 1,
      shear, confinement, confinementLegs,
      deltaNs, slenderness, slendernessOk: slendernessStable(deltaNs), Mn,
      rhoGMax: code.RHO_G_MAX,
    }
    // Member colour = worst of interaction + shear D/C; forced to fail (Infinity)
    // on a cross-section / confinement failure. SCWB is folded in the run-design
    // post-pass (joint-level). col.worstDC stays the pure interaction D/C for the
    // pill text + report. designColorForDC consumes worstFlexureDC unchanged.
    const confinementFails = confinement.some((c) => c.status === "fail")
    const colourDC =
      !shear.crossSectionOk || confinementFails
        ? Infinity
        : Math.max(worstDC, shear.dc ?? 0)
    return {
      memberId, status: "designed", material: "rc", kind: "column", mode: "checked", Pu,
      column, worstFlexureDC: colourDC,
      worstShearPass: shear.pass,
      rhoUtil: code.RHO_G_MAX > 0 ? rhoG / code.RHO_G_MAX : undefined,
      detailing: [
        ...tagged("Confinement", confinement),
        ...tagged(
          "Bar Detailing",
          code.checkColumnArrangement(geom, di.cover, di.column.checked, { frameType: cr.frameType }),
        ),
      ],
    }
  }

  // Required: smallest ρg bringing the worst demand onto the curve.
  const ringBars = (rhoG: number): ColumnBar[] =>
    representativeColumnBars(geom, di.cover, rhoG * Ag, {
      barSize: di.column.required.barSize,
      tieSize: di.column.required.tieSize,
    })
  const dcAt = (rhoG: number): number =>
    worstInteraction(code, code.buildInteractionCurve(ringBars(rhoG), geom, fc, cr), efByCombo, L, slender)
      .worstDC
  let rhoGRequired: number | undefined
  if (dcAt(code.RHO_G_MAX) > 1) rhoGRequired = undefined // even 8% can't carry it
  else if (dcAt(code.RHO_G_MIN) <= 1) rhoGRequired = code.RHO_G_MIN
  else {
    let lo = code.RHO_G_MIN
    let hi = code.RHO_G_MAX
    for (let i = 0; i < 40; i++) {
      const mid = 0.5 * (lo + hi)
      if (dcAt(mid) <= 1) hi = mid
      else lo = mid
    }
    rhoGRequired = hi
  }
  const adequate = rhoGRequired !== undefined
  const rhoG = rhoGRequired ?? code.RHO_G_MAX
  const shear = designColumnShear(
    ringBars(rhoG), geom, fc, L, cr, Pu, Vu, "required",
    barDia(di.column.required.barSize),
    { size: di.column.required.tieSize, spacing: 0 },
  )
  const reqArr: ColumnArrangement =
    geom.kind === "circle"
      ? {
          shape: "circle", n: 8,
          size: di.column.required.barSize,
          confinement: di.column.checked.confinement ?? "spiral",
          tie: { size: di.column.required.tieSize, spacing: 0 },
        }
      : {
          shape: "rect", nx: 3, ny: 3,
          size: di.column.required.barSize,
          confinement: "tied",
          tie: { size: di.column.required.tieSize, spacing: 0 },
        }
  const confinement = code.columnConfinement(
    geom, di.cover, reqArr, fc, cr, cr.frameType, Pu, L, cr.stirrupLegs,
  )
  const finalEval = worstInteraction(
    code, code.buildInteractionCurve(ringBars(rhoG), geom, fc, cr), efByCombo, L, slender,
  )
  const Mn = code.columnFlexuralStrengthAtP(ringBars(rhoG), geom, fc, cr, -Pu, 1.0)
  const column: ColumnDesignResult = {
    rhoG, Ast: rhoG * Ag, rhoGRequired,
    worstDC: adequate ? 1 : dcAt(code.RHO_G_MAX), adequate,
    shear, confinement,
    confinementLegs: code.requiredConfinementLegs(
      geom, di.cover, reqArr, fc, cr, cr.stirrupLegs, Pu, ringBars(rhoG).length,
    ),
    deltaNs: finalEval.deltaNs, slenderness: finalEval.slenderness,
    slendernessOk: slendernessStable(finalEval.deltaNs), Mn,
    rhoGMax: code.RHO_G_MAX,
  }
  // Binary colouring (like beam required): fail on inadequate ρg, cross-section,
  // or a confinement failure. SCWB folded in the run-design post-pass.
  const reqConfinementFails = confinement.some((c) => c.status === "fail")
  return {
    memberId, status: "designed", material: "rc", kind: "column", mode: "required", Pu,
    column,
    worstFlexureDC: adequate && !reqConfinementFails ? 0 : Infinity,
    worstShearPass: shear.crossSectionOk,
    rhoUtil: code.RHO_G_MAX > 0 ? rhoG / code.RHO_G_MAX : undefined,
    // The bar grid is representative, not the user's, so only confinement — a
    // property of the tie the user DID specify — is reported as detailing.
    detailing: tagged("Confinement", confinement),
  }
}

// ── Member entry ──────────────────────────────────────────────────────────────

export interface RcMemberInput {
  memberId: MemberId
  b: number
  h: number
  /** Section shape. Circular columns carry their diameter in `h` (b unused). */
  shape: "rect" | "circle"
  fc: number
  L: number
  di: RcSectionInput
  cr: RcCriteria
  efByCombo: Record<LoadComboId, MemberEndForces>
  /** Internal 1.2D+1.0L gravity end forces for this member (Vg in IMF/SMF Ve). */
  gravityEf: MemberEndForces | null
  /** Enveloped zone demands (before frame-type minimums). */
  raw: MemberZoneDemands
  /** Governing axial compression, kN (positive = compression). */
  Pu: number
  isVertical: boolean
}

/** Design one RC member (beam or column). */
export function designMemberRc(inp: RcMemberInput): MemberDesignResult {
  const { memberId, b: bMm, h: hMm, shape, fc, L, di, cr, efByCombo, gravityEf, raw, Pu, isVertical } = inp
  const geom: ColumnGeom = shape === "circle" ? { kind: "circle", D: hMm } : { kind: "rect", b: bMm, h: hMm }
  const PuLimit = (0.1 * fc * geomAg(geom)) / 1e3 // kN (beam axial gate, Pers. 5-2)

  // Circular sections are column-only (no circular-beam strategy): always design
  // as a column regardless of orientation or the element-type selector.
  if (shape === "circle" || resolveElementType(di.elementType, isVertical, Pu, PuLimit) === "column") {
    // Column shear demand Vu = worst zone |V| (already enveloped across combos).
    const colVu = Math.max(
      raw.zones["end-i"].Vu,
      raw.zones["midspan"].Vu,
      raw.zones["end-j"].Vu,
    )
    return designColumn(memberId, geom, fc, L, di, cr, efByCombo, Pu, colVu)
  }

  // ── Beam path ──
  // A forced beam carrying appreciable axial is out of beam scope.
  if (Pu >= PuLimit) {
    return { memberId, status: "axial-exceeded", Pu }
  }
  const demands = applyFrameMomentMinimums(raw, cr.frameType)

  // Flexure per zone (support arrangement at end zones, midspan in between).
  const arrFor = (z: ZoneId): RebarArrangement => (z === "midspan" ? di.midspan : di.support)
  const geomFor = (z: ZoneId): MemberGeometry => geometryFor(bMm, hMm, fc, di, arrFor(z))

  // SMF dimensional limits (18.6.2.1). Ln = node-to-node length (m → mm).
  const code = getRcCode(cr.code)
  const dimensionChecks = code.checkBeamDimensions(bMm, hMm, geomFor("midspan").dPos, L * 1000, cr.frameType)
  const flexure = {} as Record<ZoneId, ZoneFlexureResult>
  for (const z of ZONE_IDS) {
    const zd = demands.zones[z]
    flexure[z] = designZoneFlexure(zd.MuPos, zd.MuNeg, geomFor(z), di, cr)
  }

  // Capacity-design shear demand Ve (IMF: Mn, SMF: Mpr) + gravity shear Vg.
  let Ve: number | undefined
  if (cr.frameType !== "OMF") {
    const fyFactor = cr.frameType === "SMF" ? 1.25 : 1.0
    const mi = capacityEndMoments(geomFor("end-i"), flexure["end-i"], di, cr, fyFactor)
    const mj = capacityEndMoments(geomFor("end-j"), flexure["end-j"], di, cr, fyFactor)
    let Vg = 0
    if (gravityEf) {
      const Vgi = memberInternalForces(gravityEf, 0, L).V
      const Vgj = memberInternalForces(gravityEf, L, L).V
      Vg = Math.max(Math.abs(Vgi), Math.abs(Vgj))
    }
    // Both sway directions (Gambar 5-17); take the larger.
    const Ve1 = (mi.neg + mj.pos) / L + Vg
    const Ve2 = (mi.pos + mj.neg) / L + Vg
    Ve = Math.max(Ve1, Ve2)
  }

  // Longitudinal tension steel per zone → ρw for the ACI 318-25 no-stirrup Vc.
  // Checked: the provided top/bottom steel; required: the required-flexure As.
  const tensionAsFor = (z: ZoneId): number => {
    if (di.mode === "checked") {
      const gz = geomFor(z)
      return Math.max(gz.AsTop, gz.AsBottom)
    }
    const fz = flexure[z]
    return Math.max(fz.AsReqTop ?? 0, fz.AsReqBottom ?? 0)
  }

  const shear = {} as Record<ZoneId, ZoneShearResult>
  for (const z of ZONE_IDS) {
    shear[z] = designZoneShear(z, demands.zones[z].Vu, Ve, geomFor(z), di, arrFor(z), cr, tensionAsFor(z))
  }

  // Aggregates for canvas colouring/labels.
  let worstFlexureDC = 0
  let worstShearPass = true
  for (const z of ZONE_IDS) {
    worstFlexureDC = Math.max(worstFlexureDC, flexure[z].dc)
    if (!flexure[z].adequate) worstFlexureDC = Infinity
    if (!shear[z].pass) worstShearPass = false
  }

  // Detailing. Computed here — not only in the flyout, as it used to be — so the
  // canvas can say "Insufficient Detailing" without recomputing a clause, and so
  // a member whose bars simply do not fit is flagged wherever it is looked at.
  // Bar and stirrup rules exist only in "checked" mode: "required" mode has no
  // user arrangement to check.
  const detailing: DetailingCheck[] = tagged("Section Limits", dimensionChecks)
  if (di.mode === "checked") {
    const fcVal = fc
    for (const zoneName of ["support", "midspan"] as const) {
      const arr = zoneName === "support" ? di.support : di.midspan
      detailing.push(
        ...tagged(
          "Bar Detailing",
          code.checkArrangement(bMm, hMm, di.cover, arr, { fy: cr.fy, frameType: cr.frameType }),
          zoneName,
        ),
        ...tagged(
          "Stirrup Detailing",
          code.checkTransverse(bMm, hMm, di.cover, arr, zoneName, {
            frameType: cr.frameType, fyt: cr.fyt, fc: fcVal, legs: cr.stirrupLegs,
          }).checks,
          zoneName,
        ),
      )
    }
  }

  // ρ used / ρ max — the utilisation that exists in both modes (see
  // MemberDesignResult.rhoUtil). Worst face across zones, against the
  // tension-controlled ceiling, so it answers "how much room is left".
  const rhoMax = code.rhoTensionControlled(fc, cr)
  let rhoWorst = 0
  for (const z of ZONE_IDS) {
    rhoWorst = Math.max(rhoWorst, flexure[z].rhoTop ?? 0, flexure[z].rhoBottom ?? 0)
  }
  const rhoUtil = rhoMax > 0 ? rhoWorst / rhoMax : undefined

  // Beam nominal flexural strength at the joints (Mn, 1.0fy) for SCWB ΣMnb.
  const mnI = capacityEndMoments(geomFor("end-i"), flexure["end-i"], di, cr, 1.0)
  const mnJ = capacityEndMoments(geomFor("end-j"), flexure["end-j"], di, cr, 1.0)
  const beamMn = Math.max(mnI.pos, mnI.neg, mnJ.pos, mnJ.neg)

  return {
    memberId,
    status: "designed",
    material: "rc",
    kind: "beam",
    mode: di.mode,
    Pu,
    zones: {
      "end-i": { flexure: flexure["end-i"], shear: shear["end-i"] },
      midspan: { flexure: flexure["midspan"], shear: shear["midspan"] },
      "end-j": { flexure: flexure["end-j"], shear: shear["end-j"] },
    },
    dimensionChecks,
    detailing,
    worstFlexureDC,
    worstShearPass,
    rhoUtil,
    beamMn,
    governing: {
      "end-i": demands.zones["end-i"].governing,
      midspan: demands.zones["midspan"].governing,
      "end-j": demands.zones["end-j"].governing,
    },
  }
}

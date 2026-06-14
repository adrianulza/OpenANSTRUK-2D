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
  ElementType,
  MemberDesignResult,
  ZoneFlexureResult,
  ZoneId,
  ZoneShearResult,
} from "../core/types"
import { ZONE_IDS } from "../core/types"
import {
  applyFrameMomentMinimums,
  collectPMPairs,
  type MemberZoneDemands,
} from "../core/demands"
import type { RcCriteria } from "./criteria"
import type { RcSectionInput, RebarArrangement } from "./types"
import { getRcCode, type RcCodeModule } from "./codes"
import type { ColumnInteractionCurve, BarPoint, FlexureGeometry } from "./codes/aci318-25"
import {
  buildColumnBarLayout,
  layoutToColumnBars,
  representativeColumnBars,
} from "./shared/column-grid"
import { buildBarLayout, type BarLayout } from "./shared/bar-geometry"
import { barArea, barDia } from "./shared/rebar"

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
    // Bars don't fit in 2 layers (25.2.1) — arrangement is unbuildable.
    return { MuPos, MuNeg, dcPos: Infinity, dcNeg: Infinity, dc: Infinity, adequate: false }
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
): ZoneShearResult {
  const code = getRcCode(cr.code)
  const d = Math.min(g.dPos, g.dNeg)
  const isEndZone = zoneId !== "midspan"
  const VcFull = code.vc(cr.lambda, g.fc, g.b, d)
  // SMF: ignore concrete shear capacity in the hinge (end) zones — 18.6.5.2.
  const VcZone = cr.frameType === "SMF" && isEndZone ? 0 : VcFull
  const phiVc = cr.phiShear * VcZone
  const phiVmax = cr.phiShear * code.vMaxLimit(VcZone, g.fc, g.b, d)
  const Vdesign = Math.max(Vu, Ve ?? 0)
  const crossSectionOk = Vdesign <= phiVmax

  // Required steel shear Vs = Vu/φ − Vc drives the 9.7.6.2.2 spacing tightening.
  const VsReq = Math.max(0, Vdesign / cr.phiShear - VcZone)
  const dbLong =
    input.mode === "checked"
      ? Math.max(barDia(arr.top.size), barDia(arr.bottom.size))
      : barDia(REQUIRED_MAIN_BAR)
  const dbHoop = input.mode === "checked" ? barDia(arr.stirrup.size) : barDia(REQUIRED_STIRRUP_BAR)
  const sMaxGov = governingSpacingMax(cr, isEndZone, d, dbLong, dbHoop, VsReq, g.fc, g.b)

  if (input.mode === "required") {
    const AvSReq = code.avSRequired(Vdesign, phiVc, cr.fyt, d, cr, g.fc, g.b)
    const suggested = code.suggestStirrup(AvSReq, cr.stirrupLegs, REQUIRED_STIRRUP_BAR, sMaxGov)
    return {
      Vu, Ve, Vdesign, phiVc, phiVmax,
      AvSReq, suggested,
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
    phiVn, dc,
    pass, crossSectionOk, spacingCheck,
  }
}

// ── Element-type resolution ───────────────────────────────────────────────────

/**
 * Resolve a section's element-type setting for one member. Explicit beam/column
 * is honoured; `auto` picks by orientation (vertical → column, horizontal →
 * beam) but is promoted to column whenever the axial compression reaches the
 * beam gate Pu ≥ 0.1·f'c·Ag.
 */
function resolveElementType(
  et: ElementType,
  isVertical: boolean,
  Pu: number,
  PuLimit: number,
): "beam" | "column" {
  if (et === "beam") return "beam"
  if (et === "column") return "column"
  if (Pu >= PuLimit) return "column"
  return isVertical ? "column" : "beam"
}

// ── Column (P–M interaction) ──────────────────────────────────────────────────

/** Worst radial interaction D/C over every combo × candidate (P,M) station. */
function worstInteraction(
  code: RcCodeModule,
  curve: ColumnInteractionCurve,
  efByCombo: Record<LoadComboId, MemberEndForces>,
  L: number,
): {
  worstDC: number
  governing?: { combo: LoadComboId; Pu: number; Mu: number }
  pairs: { P: number; M: number; combo: LoadComboId }[]
} {
  let worstDC = 0
  let governing: { combo: LoadComboId; Pu: number; Mu: number } | undefined
  const pairs: { P: number; M: number; combo: LoadComboId }[] = []
  for (const [comboId, ef] of Object.entries(efByCombo)) {
    for (const p of collectPMPairs(ef, L)) {
      pairs.push({ P: p.P, M: p.M, combo: comboId })
      const { dc } = code.interactionDC(curve, p.P, p.M)
      if (dc > worstDC) {
        worstDC = dc
        governing = { combo: comboId, Pu: p.P, Mu: p.M }
      }
    }
  }
  return { worstDC, governing, pairs }
}

/**
 * Column design by P–M interaction. Checked mode tests the user's nx×ny grid;
 * required mode bisects the longitudinal ratio ρg ∈ [1%, 8%] (D/C decreases
 * monotonically with ρg) on a representative symmetric ring.
 */
function designColumn(
  memberId: MemberId,
  bMm: number,
  hMm: number,
  fc: number,
  L: number,
  di: RcSectionInput,
  cr: RcCriteria,
  efByCombo: Record<LoadComboId, MemberEndForces>,
  Pu: number,
): MemberDesignResult {
  const code = getRcCode(cr.code)
  const Ag = bMm * hMm

  if (di.mode === "checked") {
    const layout = buildColumnBarLayout(bMm, hMm, di.cover, di.column.checked)
    const curve = code.buildInteractionCurve(layoutToColumnBars(layout), bMm, hMm, fc, cr)
    const { worstDC, governing, pairs } = worstInteraction(code, curve, efByCombo, L)
    const rhoG = Ag > 0 ? layout.Ast / Ag : 0
    const column: ColumnDesignResult = {
      rhoG, Ast: layout.Ast, worstDC, governing, pmPairs: pairs, adequate: worstDC <= 1,
    }
    return {
      memberId, status: "designed", material: "rc", kind: "column", mode: "checked", Pu,
      column, worstFlexureDC: worstDC, // continuous colouring via designColorForDC
    }
  }

  // Required: smallest ρg bringing the worst demand onto the curve.
  const dcAt = (rhoG: number): number => {
    const bars = representativeColumnBars(bMm, hMm, di.cover, rhoG * Ag, {
      barSize: di.column.required.barSize,
      tieSize: di.column.required.tieSize,
    })
    return worstInteraction(code, code.buildInteractionCurve(bars, bMm, hMm, fc, cr), efByCombo, L)
      .worstDC
  }
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
  const column: ColumnDesignResult = {
    rhoG, Ast: rhoG * Ag, rhoGRequired,
    worstDC: adequate ? 1 : dcAt(code.RHO_G_MAX), adequate,
  }
  return {
    memberId, status: "designed", material: "rc", kind: "column", mode: "required", Pu,
    column, worstFlexureDC: adequate ? 0 : Infinity, // binary colouring like beam required
  }
}

// ── Member entry ──────────────────────────────────────────────────────────────

export interface RcMemberInput {
  memberId: MemberId
  b: number
  h: number
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
  const { memberId, b: bMm, h: hMm, fc, L, di, cr, efByCombo, gravityEf, raw, Pu, isVertical } = inp
  const PuLimit = (0.1 * fc * bMm * hMm) / 1e3 // kN (beam axial gate, Pers. 5-2)

  if (resolveElementType(di.elementType, isVertical, Pu, PuLimit) === "column") {
    return designColumn(memberId, bMm, hMm, fc, L, di, cr, efByCombo, Pu)
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

  const shear = {} as Record<ZoneId, ZoneShearResult>
  for (const z of ZONE_IDS) {
    shear[z] = designZoneShear(z, demands.zones[z].Vu, Ve, geomFor(z), di, arrFor(z), cr)
  }

  // Aggregates for canvas colouring/labels.
  let worstFlexureDC = 0
  let worstShearPass = true
  for (const z of ZONE_IDS) {
    worstFlexureDC = Math.max(worstFlexureDC, flexure[z].dc)
    if (!flexure[z].adequate) worstFlexureDC = Infinity
    if (!shear[z].pass) worstShearPass = false
  }

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
    worstFlexureDC,
    worstShearPass,
    governing: {
      "end-i": demands.zones["end-i"].governing,
      midspan: demands.zones["midspan"].governing,
      "end-j": demands.zones["end-j"].governing,
    },
  }
}

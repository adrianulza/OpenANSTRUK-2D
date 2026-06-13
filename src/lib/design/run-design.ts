/**
 * Design-run orchestrator. Solves all load cases itself (the Analyze tab's
 * memo is empty unless that tab is active), combines per enabled combination,
 * envelopes per zone, then runs flexure → shear per member.
 *
 * Flexure runs before shear because IMF/SMF capacity-design shear (Ve) needs
 * the flexural steel: provided bars in "checked" mode, required As in
 * "required" mode.
 */

import type { StructureModel, MemberId, SectionId } from "@/lib/model"
import type { LoadCase, LoadCaseId, LoadCombination, LoadComboId } from "@/lib/load-cases"
import { combineResults, solveAllCases } from "@/lib/analysis-pipeline"
import type { MemberEndForces } from "@/lib/solver"
import { memberInternalForces } from "@/lib/solver"
import {
  applyFrameMomentMinimums,
  buildGravityCombo,
  collectPMPairs,
  envelopeMemberDemands,
  type MemberZoneDemands,
} from "./demands"
import { buildInteractionCurve, interactionDC, type ColumnInteractionCurve } from "./column"
import {
  buildColumnBarLayout,
  layoutToColumnBars,
  representativeColumnBars,
  RHO_G_MAX,
  RHO_G_MIN,
} from "./column-layout"
import { phiMnBars, phiMnProvided, requiredAs, type BarPoint, type FlexureGeometry } from "./flexure"
import { buildBarLayout, type BarLayout } from "./bar-layout"
import {
  avMinPerS,
  avSProvided,
  avSRequired,
  generalSpacingMax,
  imfEndZoneSpacingMax,
  phiVnProvided,
  smfEndZoneSpacingMax,
  suggestStirrup,
  vc,
  vMaxLimit,
  vsSpacingThreshold,
} from "./shear"
import { barArea, barDia } from "./rebar"
import {
  defaultSectionDesignInput,
  isSectionDesignable,
  ZONE_IDS,
  type ColumnDesignResult,
  type DesignCriteria,
  type DesignRunResult,
  type ElementType,
  type MemberDesignResult,
  type RebarArrangement,
  type SectionDesignInput,
  type SectionDesignInputs,
  type ZoneFlexureResult,
  type ZoneId,
  type ZoneShearResult,
} from "./types"

// "As required" mode no longer asks for assumed bars — these defaults drive the
// SMF hinge-zone spacing cap (6·db) and the stirrup-size suggestion only.
const REQUIRED_MAIN_BAR = "D19" as const
const REQUIRED_STIRRUP_BAR = "D10" as const

export interface DesignRunInput {
  model: StructureModel
  loadCases: Record<LoadCaseId, LoadCase>
  combinations: Record<LoadComboId, LoadCombination>
  criteria: DesignCriteria
  inputs: SectionDesignInputs
  shearDeformation: boolean
}

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

function memberLength(model: StructureModel, memberId: MemberId): number {
  const m = model.members[memberId]
  const a = model.nodes[m.a]
  const b = model.nodes[m.b]
  return Math.hypot(b.x - a.x, b.y - a.y)
}

function geometryFor(
  bMm: number,
  hMm: number,
  fc: number,
  input: SectionDesignInput,
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
  input: SectionDesignInput,
  cr: DesignCriteria,
): ZoneFlexureResult {
  if (input.mode === "required") {
    const bot = requiredAs(MuPos, flexGeomPos(g), cr)
    const top = requiredAs(Math.abs(MuNeg), flexGeomNeg(g), cr)
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
  const pos = phiMnBars(barsCompressionTop(layout), g.b, g.h, g.fc, cr)
  const neg = phiMnBars(barsCompressionBottom(layout, g.h), g.b, g.h, g.fc, cr)
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
  input: SectionDesignInput,
  cr: DesignCriteria,
  fyFactor: number, // 1.0 for Mn (IMF), 1.25 for Mpr (SMF)
): EndMoments {
  const fyOver = fyFactor * cr.fy
  if (input.mode === "checked" && g.layout) {
    // Same strain-compatibility solver as the capacity check (all bars).
    return {
      pos: phiMnBars(barsCompressionTop(g.layout), g.b, g.h, g.fc, cr, fyOver).Mn,
      neg: phiMnBars(barsCompressionBottom(g.layout, g.h), g.b, g.h, g.fc, cr, fyOver).Mn,
    }
  }
  // Required mode — book/SAP convention: tension steel only (AsPrime = 0).
  return {
    pos: phiMnProvided(zone.AsReqBottom ?? 0, 0, flexGeomPos(g), cr, fyOver).Mn,
    neg: phiMnProvided(zone.AsReqTop ?? 0, 0, flexGeomNeg(g), cr, fyOver).Mn,
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
  cr: DesignCriteria,
  isEndZone: boolean,
  d: number,
  dbLong: number,
  dbHoop: number,
  VsReq: number, // kN — required steel shear Vu/φ − Vc
  fc: number,
  bw: number,
): number {
  if (cr.frameType === "SMF" && isEndZone) return smfEndZoneSpacingMax(d, dbLong)
  if (cr.frameType === "IMF" && isEndZone) return imfEndZoneSpacingMax(d, dbLong, dbHoop)
  return generalSpacingMax(d, VsReq > vsSpacingThreshold(fc, bw, d))
}

function designZoneShear(
  zoneId: ZoneId,
  Vu: number,
  Ve: number | undefined,
  g: MemberGeometry,
  input: SectionDesignInput,
  arr: RebarArrangement,
  cr: DesignCriteria,
): ZoneShearResult {
  const d = Math.min(g.dPos, g.dNeg)
  const isEndZone = zoneId !== "midspan"
  const VcFull = vc(cr.lambda, g.fc, g.b, d)
  // SMF: ignore concrete shear capacity in the hinge (end) zones — 18.6.5.2.
  const VcZone = cr.frameType === "SMF" && isEndZone ? 0 : VcFull
  const phiVc = cr.phiShear * VcZone
  const phiVmax = cr.phiShear * vMaxLimit(VcZone, g.fc, g.b, d)
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
    const AvSReq = avSRequired(Vdesign, phiVc, cr.fyt, d, cr, g.fc, g.b)
    const suggested = suggestStirrup(AvSReq, cr.stirrupLegs, REQUIRED_STIRRUP_BAR, sMaxGov)
    return {
      Vu, Ve, Vdesign, phiVc, phiVmax,
      AvSReq, suggested,
      pass: crossSectionOk,
      crossSectionOk,
    }
  }

  // Checked mode
  const avS = avSProvided(cr.stirrupLegs, arr.stirrup.size, arr.stirrup.spacing)
  const phiVn = phiVnProvided(VcZone, avS, cr.fyt, d, cr)
  const dc = Vdesign > 0 ? (phiVn > 0 ? Vdesign / phiVn : Infinity) : 0
  // Minimum stirrups required where Vu > ½φVc (9.6.3.1).
  const stirrupsRequired = Vdesign > 0.5 * phiVc
  const avMinOk = !stirrupsRequired || avS >= avMinPerS(g.fc, cr.fyt, g.b) * 1000 - 1e-9
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
      const { dc } = interactionDC(curve, p.P, p.M)
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
  di: SectionDesignInput,
  cr: DesignCriteria,
  efByCombo: Record<LoadComboId, MemberEndForces>,
  Pu: number,
): MemberDesignResult {
  const Ag = bMm * hMm

  if (di.mode === "checked") {
    const layout = buildColumnBarLayout(bMm, hMm, di.cover, di.column.checked)
    const curve = buildInteractionCurve(layoutToColumnBars(layout), bMm, hMm, fc, cr)
    const { worstDC, governing, pairs } = worstInteraction(curve, efByCombo, L)
    const rhoG = Ag > 0 ? layout.Ast / Ag : 0
    const column: ColumnDesignResult = {
      rhoG, Ast: layout.Ast, worstDC, governing, pmPairs: pairs, adequate: worstDC <= 1,
    }
    return {
      memberId, status: "designed", kind: "column", mode: "checked", Pu,
      column, worstFlexureDC: worstDC, // continuous colouring via designColorForDC
    }
  }

  // Required: smallest ρg bringing the worst demand onto the curve.
  const dcAt = (rhoG: number): number => {
    const bars = representativeColumnBars(bMm, hMm, di.cover, rhoG * Ag, {
      barSize: di.column.required.barSize,
      tieSize: di.column.required.tieSize,
    })
    return worstInteraction(buildInteractionCurve(bars, bMm, hMm, fc, cr), efByCombo, L).worstDC
  }
  let rhoGRequired: number | undefined
  if (dcAt(RHO_G_MAX) > 1) rhoGRequired = undefined // even 8% can't carry it
  else if (dcAt(RHO_G_MIN) <= 1) rhoGRequired = RHO_G_MIN
  else {
    let lo = RHO_G_MIN
    let hi = RHO_G_MAX
    for (let i = 0; i < 40; i++) {
      const mid = 0.5 * (lo + hi)
      if (dcAt(mid) <= 1) hi = mid
      else lo = mid
    }
    rhoGRequired = hi
  }
  const adequate = rhoGRequired !== undefined
  const rhoG = rhoGRequired ?? RHO_G_MAX
  const column: ColumnDesignResult = {
    rhoG, Ast: rhoG * Ag, rhoGRequired,
    worstDC: adequate ? 1 : dcAt(RHO_G_MAX), adequate,
  }
  return {
    memberId, status: "designed", kind: "column", mode: "required", Pu,
    column, worstFlexureDC: adequate ? 0 : Infinity, // binary colouring like beam required
  }
}

// ── Main entry ───────────────────────────────────────────────────────────────

export function runDesign(input: DesignRunInput): DesignRunResult {
  const { model, loadCases, combinations, criteria, inputs } = input
  const issues: string[] = []
  const members: Record<MemberId, MemberDesignResult> = {}

  const enabledCombos = Object.values(combinations).filter((c) => c.enabled !== false)
  if (enabledCombos.length === 0) {
    return {
      ok: false,
      issues: ["No enabled load combinations — define combinations in the Load tab first."],
      members: {},
    }
  }

  // Solve every enabled case once, then combine.
  const caseResults = solveAllCases(model, loadCases, {
    shearDeformation: input.shearDeformation,
  })
  for (const [id, r] of Object.entries(caseResults)) {
    if (!r.ok) issues.push(`Load case "${loadCases[id]?.name ?? id}" failed to solve: ${r.reason}`)
  }

  const perCombo: Record<LoadComboId, Record<MemberId, MemberEndForces>> = {}
  for (const combo of enabledCombos) {
    const r = combineResults(caseResults, combo)
    if (!r) {
      issues.push(`Combination "${combo.name}" skipped — none of its load cases produced results.`)
      continue
    }
    perCombo[combo.id] = r.memberEndForces
  }
  if (Object.keys(perCombo).length === 0) {
    return { ok: false, issues: [...issues, "No combination produced results — design aborted."], members: {} }
  }

  // Internal gravity combo for Vg (IMF/SMF capacity-design shear).
  let gravityEf: Record<MemberId, MemberEndForces> | null = null
  if (criteria.frameType !== "OMF") {
    const gr = combineResults(caseResults, buildGravityCombo(loadCases))
    if (gr) gravityEf = gr.memberEndForces
    else issues.push("Gravity combo (1.2D + 1.0L) unavailable — Ve computed without Vg.")
  }

  for (const m of Object.values(model.members)) {
    const sec = model.sections[m.section]
    if (!isSectionDesignable(sec)) {
      members[m.id] = { memberId: m.id, status: "not-designable" }
      continue
    }
    const bMm = sec!.shape!.dims.b
    const hMm = sec!.shape!.dims.h
    const fc = sec!.strength!.fc!
    const L = memberLength(model, m.id)
    if (!(L > 0)) {
      members[m.id] = { memberId: m.id, status: "not-designable" }
      continue
    }
    const di = inputs[m.section as SectionId] ?? defaultSectionDesignInput(m.section)

    // Per-member, per-combo end forces → envelope per zone → frame minimums.
    const efByCombo: Record<LoadComboId, MemberEndForces> = {}
    for (const [comboId, all] of Object.entries(perCombo)) {
      const ef = all[m.id]
      if (ef) efByCombo[comboId] = ef
    }
    if (Object.keys(efByCombo).length === 0) {
      members[m.id] = { memberId: m.id, status: "no-result" }
      continue
    }
    const raw: MemberZoneDemands = envelopeMemberDemands(efByCombo, L, hMm)
    const Pu = raw.PuMaxCompression
    const PuLimit = (0.1 * fc * bMm * hMm) / 1e3 // kN (beam axial gate, Pers. 5-2)

    // Resolve beam vs column for this member (auto = orientation + axial gate).
    const na = model.nodes[m.a]
    const nb = model.nodes[m.b]
    const isVertical = Math.abs(nb.y - na.y) > Math.abs(nb.x - na.x)
    if (resolveElementType(di.elementType, isVertical, Pu, PuLimit) === "column") {
      members[m.id] = designColumn(m.id, bMm, hMm, fc, L, di, criteria, efByCombo, Pu)
      continue
    }

    // ── Beam path ──
    // A forced beam carrying appreciable axial is out of beam scope.
    if (Pu >= PuLimit) {
      members[m.id] = { memberId: m.id, status: "axial-exceeded", Pu }
      continue
    }
    const demands = applyFrameMomentMinimums(raw, criteria.frameType)

    // Flexure per zone (support arrangement at end zones, midspan in between).
    const arrFor = (z: ZoneId): RebarArrangement => (z === "midspan" ? di.midspan : di.support)
    const geomFor = (z: ZoneId): MemberGeometry => geometryFor(bMm, hMm, fc, di, arrFor(z))
    const flexure = {} as Record<ZoneId, ZoneFlexureResult>
    for (const z of ZONE_IDS) {
      const zd = demands.zones[z]
      flexure[z] = designZoneFlexure(zd.MuPos, zd.MuNeg, geomFor(z), di, criteria)
    }

    // Capacity-design shear demand Ve (IMF: Mn, SMF: Mpr) + gravity shear Vg.
    let Ve: number | undefined
    if (criteria.frameType !== "OMF") {
      const fyFactor = criteria.frameType === "SMF" ? 1.25 : 1.0
      const mi = capacityEndMoments(geomFor("end-i"), flexure["end-i"], di, criteria, fyFactor)
      const mj = capacityEndMoments(geomFor("end-j"), flexure["end-j"], di, criteria, fyFactor)
      let Vg = 0
      const gef = gravityEf?.[m.id]
      if (gef) {
        const Vgi = memberInternalForces(gef, 0, L).V
        const Vgj = memberInternalForces(gef, L, L).V
        Vg = Math.max(Math.abs(Vgi), Math.abs(Vgj))
      }
      // Both sway directions (Gambar 5-17); take the larger.
      const Ve1 = (mi.neg + mj.pos) / L + Vg
      const Ve2 = (mi.pos + mj.neg) / L + Vg
      Ve = Math.max(Ve1, Ve2)
    }

    const shear = {} as Record<ZoneId, ZoneShearResult>
    for (const z of ZONE_IDS) {
      shear[z] = designZoneShear(z, demands.zones[z].Vu, Ve, geomFor(z), di, arrFor(z), criteria)
    }

    // Aggregates for canvas colouring/labels.
    let worstFlexureDC = 0
    let worstShearPass = true
    for (const z of ZONE_IDS) {
      worstFlexureDC = Math.max(worstFlexureDC, flexure[z].dc)
      if (!flexure[z].adequate) worstFlexureDC = Infinity
      if (!shear[z].pass) worstShearPass = false
    }

    members[m.id] = {
      memberId: m.id,
      status: "designed",
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

  const anyDesigned = Object.values(members).some((r) => r.status === "designed")
  if (!anyDesigned) {
    issues.push("No designable members found — RC design requires concrete rectangular sections.")
  }

  return { ok: true, issues, members }
}

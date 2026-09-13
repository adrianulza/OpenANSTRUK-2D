/**
 * Shared, material-agnostic design types (RC + Steel).
 *
 * Pure domain module: no React imports. Design state (criteria + per-section
 * inputs) lives in App state like loadCases/combinations — it is NOT part of
 * StructureModel and is not persisted by Save/Load (v1.1 limitation).
 *
 * Material-specific types live beside their strategy:
 *   - RC:    `../rc/criteria.ts`, `../rc/types.ts`
 *   - Steel: `../steel/criteria.ts`, `../steel/types.ts`
 * The criteria wrapper + per-section input union live in `./criteria.ts` and
 * `./section-input.ts`.
 */

import type { MemberId } from "@/lib/model"
import type { LoadComboId } from "@/lib/load-cases"
import type { ArrangementCheck } from "../rc/shared/types"
import type { SteelMemberRole } from "../steel/member-role"
import type { SeismicChecks } from "../steel/seismic"

// ── Material family ───────────────────────────────────────────────────────────

export type DesignMaterial = "rc" | "steel"

export const DESIGN_MATERIALS: { id: DesignMaterial; label: string }[] = [
  { id: "rc", label: "Reinforced Concrete" },
  { id: "steel", label: "Steel" },
]

// ── Frame (seismic detailing) type — shared by both materials ─────────────────

export type FrameType = "OMF" | "IMF" | "SMF"

export const FRAME_TYPES: { id: FrameType; label: string }[] = [
  { id: "OMF", label: "Ordinary Moment Frame (OMF)" },
  { id: "IMF", label: "Intermediate Moment Frame (IMF)" },
  { id: "SMF", label: "Special Moment Frame (SMF)" },
]

// ── Element type (beam vs column) ────────────────────────────────────────────

/** How a member's section is designed. `auto` resolves per member: vertical →
 *  column, horizontal → beam, promoted to column when the axial gate is met. */
export type ElementType = "auto" | "beam" | "column"

export const ELEMENT_TYPES: { id: ElementType; label: string }[] = [
  { id: "auto", label: "Auto (by orientation)" },
  { id: "beam", label: "Beam" },
  { id: "column", label: "Column" },
]

export type DesignMode = "required" | "checked"

// ── Zones ─────────────────────────────────────────────────────────────────────

export type ZoneId = "end-i" | "midspan" | "end-j"
export const ZONE_IDS: ZoneId[] = ["end-i", "midspan", "end-j"]

// ── Results (RC payload today; steel payload added in a later pass) ───────────

export interface ZoneFlexureResult {
  /** Design moments after frame-type minimums. MuPos = sagging, MuNeg ≤ 0 = hogging. kN·m */
  MuPos: number
  MuNeg: number
  // "As required" mode outputs (mm², incl. As,min floor):
  AsReqBottom?: number
  AsReqTop?: number
  AsPrimeReq?: number
  // "As checked" mode outputs:
  phiMnPos?: number // kN·m, bottom bars in tension
  phiMnNeg?: number // kN·m, top bars in tension
  dcPos?: number
  dcNeg?: number
  /** Reinforcement ratio As/(b·d) per face (fraction, not %). Required mode = required
   *  steel; checked mode = provided steel. Top uses dNeg, bottom uses dPos. */
  rhoTop?: number
  rhoBottom?: number
  /**
   * The longitudinal bar area at each face, mm² — **the actual bars**, whichever
   * mode produced them: the area the zone NEEDS in "required", the area the
   * user's arrangement PROVIDES in "checked".
   *
   * One field for both modes on purpose. The blended reports print what the
   * steel *is*, so a renderer that had to ask `mode` first would be re-deriving
   * a distinction the engine has already resolved. `AsReqTop/Bottom` above stay
   * as the required-mode-only outputs the capacity path consumes.
   */
  AsTop?: number
  AsBottom?: number
  /** Governing D/C for colouring. Required mode: 0 when adequate, Infinity when not. */
  dc: number
  /** Required mode: section can physically carry Mu (incl. doubly-reinforced path). */
  adequate: boolean
}

export interface ZoneShearResult {
  /** Envelope |V| in zone, kN */
  Vu: number
  /** Capacity-design shear (IMF: Mn-based; SMF: Mpr-based), kN */
  Ve?: number
  /** max(Vu, Ve) — the demand actually designed for, kN */
  Vdesign: number
  phiVc: number // kN
  phiVmax: number // kN — φ(Vc + 0.66√f'c·bw·d) cross-section limit
  // "As required" mode:
  AvSReq?: number // mm²/m, incl. Av,min floor
  suggested?: { size: string; legs: number; spacing: number }
  // "As checked" mode:
  phiVn?: number // kN
  dc?: number
  /** Transverse bar area, mm²/m — required in "required" mode, provided in
   *  "checked". Same both-modes contract as `AsTop`/`AsBottom` above. */
  AvS?: number
  /** Overall pass (checked: Vdesign ≤ φVn; both modes: false when cross-section fails). */
  pass: boolean
  crossSectionOk: boolean
  /** Stirrup spacing check (checked mode): SMF end zones use min(d/4, 6db, 150),
   *  elsewhere the general min(d/2, 600) cap where stirrups are required. */
  spacingCheck?: { sMax: number; pass: boolean }
}

export type MemberDesignStatus =
  | "designed"
  | "not-designable"
  | "not-implemented"
  | "axial-exceeded"
  | "no-result"

// ── Detailing ────────────────────────────────────────────────────────────────

/**
 * Which family of detailing rule a verdict belongs to. This is the vocabulary
 * the canvas prints on a member's failure label, so it is deliberately short
 * and material-spanning: RC "Confinement" and steel "Ductility" are different
 * clauses answering the same question — can this section actually be built and
 * still behave the way the capacity equations assumed?
 */
export type DetailingGroup =
  | "Bar Detailing"     // RC longitudinal: fit, clear + crack-control spacing, cover
  | "Stirrup Detailing" // RC transverse: spacing caps, Av,min, hoop size
  | "Section Limits"    // RC SMF beam dimensional limits (18.6.2.1)
  | "Confinement"       // RC column Ash / ties / spiral
  | "Ductility"         // Steel AISC 341 Table D1.1 width-to-thickness
  | "Bracing"           // Steel AISC 341 D1.2 (advisory — Lb ≡ L in a 2D model)
  | "SCWB"              // Strong-column-weak-beam, either material

/**
 * One detailing verdict, carried on the member result so the canvas and the
 * schedule can state WHY a member is flagged without recomputing any clause.
 * Structurally a `ArrangementCheck` (rc/shared/types) plus its group.
 */
export interface DetailingCheck {
  group: DetailingGroup
  status: "pass" | "warn" | "fail"
  text: string
  clause: string
  /** Where it was evaluated — a zone name, or absent for member-wide checks. */
  where?: string
}

export interface ColumnShearResult {
  /** Envelope factored shear |Vu|, kN. */
  Vu: number
  /** Capacity-design shear (IMF: Mn-based; SMF: Mpr-based), kN. */
  Ve?: number
  /** max(Vu, Ve) — the demand actually designed for, kN. */
  Vdesign: number
  phiVc: number // kN
  phiVmax: number // kN — cross-section ceiling
  /** SMF: concrete shear set to 0 in the confinement zone (Pu < Ag·f'c/20, 18.7.6.2.1). */
  vcZeroed: boolean
  // "As required" mode:
  AvSReq?: number // mm²/m, incl. min-tie floor
  suggested?: { size: string; legs: number; spacing: number }
  // "As checked" mode:
  phiVn?: number // kN
  dc?: number
  /** Transverse bar area, mm²/m — required or provided, per mode. */
  AvS?: number
  /** Governing hoop/tie spacing cap (mm) + pass for the provided tie. */
  spacingMax?: number
  spacingPass?: boolean
  /** Overall pass (cross-section + capacity + spacing). */
  pass: boolean
  crossSectionOk: boolean
}

export interface ColumnDesignResult {
  /** Provided (checked) or representative (required) longitudinal ratio ρg. */
  rhoG: number
  /** Provided steel (checked) or required steel (required), mm². */
  Ast: number
  /** "As required": ρg needed to satisfy the worst demand; undefined in checked mode. */
  rhoGRequired?: number
  /** Code ceiling on ρg (10.6.1.1, 8 %) — the denominator of `rhoUtil`. */
  rhoGMax?: number
  /** Worst radial interaction D/C across combos × candidate stations. */
  worstDC: number
  governing?: { combo: LoadComboId; Pu: number; Mu: number }
  /** All checked combo (P,M) candidate pairs — drives the report's demand markers. */
  pmPairs?: { P: number; M: number; combo: LoadComboId }[]
  /** Checked: arrangement is buildable + ρg within limits. */
  adequate: boolean
  /** Capacity-design shear (IMF/SMF) + tie check. */
  shear?: ColumnShearResult
  /** Transverse confinement (SMF Ash / IMF ties / OMF ties) detailing verdicts. */
  confinement?: ArrangementCheck[]
  /**
   * Confinement in the one number a detailer acts on: how many tie legs the Ash
   * equation demands, against how many the bar grid can actually engage.
   *
   * `max` is not a preference — 18.7.5.2 supports every corner bar and alternate
   * bars with a hoop corner or crosstie, so a leg needs a longitudinal bar to
   * hold. Beyond that the requirement is unbuildable at this bar count, which is
   * a *detailing* failure (resize or add bars), not a strength one.
   */
  confinementLegs?: {
    required: number
    provided: number
    /** Legs the longitudinal grid can engage across the confined direction. */
    max: number
    buildable: boolean
  }
  /** Slenderness: governing non-sway magnifier δns and klu/r (in-plane). */
  deltaNs?: number
  slenderness?: number
  /**
   * Slenderness verdict. False only when `Pu ≥ 0.75·Pc` — the 6.6.4.5.2 denominator
   * goes non-positive and δns runs away, i.e. the member buckles before it yields.
   * A short column (6.2.5 gate, no magnification) and a slender-but-stable one
   * both read as satisfied; the amplified moments are already inside `worstDC`.
   */
  slendernessOk?: boolean
  /** SMF strong-column-weak-beam: false when a joint this column frames into fails. */
  scwbPass?: boolean
  /** Column nominal flexural strength at the design axial (kN·m) — feeds SCWB ΣMnc. */
  Mn?: number
}

/** Steel member check result (AISC 360-16). One station governs each channel. */
export interface SteelDesignResult {
  /** Section classification: "Compact" | "NonCompact" | "Slender". */
  sectionClass: string
  /** Classification for axial only (Table B4.1a) — can differ from flexure. */
  axialClass: string
  /** Governing combined-force ratio and which AISC equation produced it. */
  ratio: number
  equation: string
  governing?: { combo: LoadComboId; x: number; Pr: number; Mr: number }
  /** Available strengths, kN / kN·m (φ already applied). */
  PcComp: number
  PcTens: number
  Mc33: number
  Vc: number
  /** Nominal values before φ, for the report deck. */
  Pn: number
  Mn: number
  Mp: number
  Vn: number
  /** LTB parameters in METRES (undefined for shapes with no LTB limit state). */
  Lp?: number
  Lr?: number
  Lb?: number
  Cb?: number
  /** Which flexural limit state governed. */
  flexureLimit: string
  /** Compression diagnostics. */
  Fe?: number
  Fcr?: number
  Ae?: number
  slenderness?: number
  slendernessAxis?: "33" | "22"
  /** Shear channel. */
  Vr: number
  shearRatio: number
  /** Peak demands driving the governing ratio. */
  PrMax: number
  MrMax: number
  /** Overall pass (interaction AND shear within the D/C limit). */
  pass: boolean
  /** Non-fatal advisories, e.g. KL/r > 200. */
  warnings: string[]

  // ── AISC E4 (torsional / flexural-torsional buckling) ──────────────────────
  /** Pure torsional buckling stress Fez, MPa. Undefined for closed sections. */
  Fez?: number
  /** Which compression limit state set Fe. */
  bucklingMode?: "flexural" | "flexural-torsional"

  // ── Single angle (AISC F10 / H2) ───────────────────────────────────────────
  /** φMn about the MAJOR and MINOR principal axes, kN·m. */
  McW?: number
  McZ?: number
  /** Principal-axis rotation from geometric axis 3, radians. */
  alphaPrincipal?: number
  /** Monosymmetry property βw, mm (exactly 0 for an equal-leg angle). */
  betaW?: number
  /**
   * The governing station's geometric M33 resolved onto the principal axes,
   * kN·m — `Mw = M33·cos α`, `Mz = −M33·sin α`. Reported so the UI can show WHY
   * a bending angle carries a high D/C: `Iz ≈ Iw/4`, so the minor-principal
   * term usually dominates. See DESIGN_STEEL.md §S3.1.
   */
  MrW?: number
  MrZ?: number

  // ── Tee (AISC F9) ──────────────────────────────────────────────────────────
  /** The governing station had the stem in compression (hogging). */
  stemInCompression?: boolean
  /**
   * Both sign branches of a tee's capacity, kN·m (φ applied). A tee is the only
   * shape whose strength depends on the sign of the moment, and showing one
   * number hides that — `MnPos` is stem-in-tension (sagging), `MnNeg` is
   * stem-in-compression (hogging).
   */
  McPos?: number
  McNeg?: number

  // ── Interaction-surface inputs (report decks) ───────────────────────────────
  /**
   * Every (Pr, Mr) pair actually checked, across combinations × stations. The
   * interaction envelope is only meaningful with the demands that produced it,
   * and P and M must be the ones acting TOGETHER — the same reason the strategy
   * never envelopes them independently.
   */
  pmPairs?: { P: number; M: number; combo: LoadComboId }[]
  /**
   * Geometric role, inferred from the member's orientation alone. Reported for
   * the schedule and to pick a report deck — it does NOT change the check. See
   * `steel/member-role.ts`.
   */
  role?: SteelMemberRole
  /**
   * AISC 341 detailing checks. **Absent for OMF/RMB**, where no seismic
   * requirement applies and the member is governed by AISC 360 alone.
   */
  seismic?: SeismicChecks
  /**
   * AISC 341 E3.4a strong-column-weak-beam: false when a joint this column
   * frames into fails. Set by the run-design post-pass, mirroring the RC
   * `ColumnDesignResult.scwbPass` — the member result must be self-contained,
   * because the canvas verdict is a pure function of it.
   */
  scwbPass?: boolean
}

export interface MemberDesignResult {
  memberId: MemberId
  status: MemberDesignStatus
  /** Design material family (set when designed). */
  material?: DesignMaterial
  /**
   * Member kind (set when designed). RC emits only `beam` / `column` — its two
   * genuinely different formulations. Steel additionally emits `brace`, which is
   * purely a label: see `steel/member-role.ts`.
   */
  kind?: SteelMemberRole
  /**
   * Why a member was refused, for `not-designable` / `not-implemented`. Surfaced
   * as a run issue so a refusal is never silent — a member that simply vanishes
   * from the results reads as a bug to the user.
   */
  note?: string
  mode?: DesignMode
  /** Governing axial compression, kN (positive = compression). */
  Pu?: number
  zones?: Record<ZoneId, { flexure: ZoneFlexureResult; shear: ZoneShearResult }>
  /** SMF beam dimensional-limit checks (18.6.2.1); [] for OMF/IMF. */
  dimensionChecks?: ArrangementCheck[]
  /**
   * Every detailing verdict for this member, grouped. Populated by the strategy
   * so the canvas never has to recompute a clause to say "Insufficient
   * Detailing" — and so a rule that fails can name itself.
   *
   * RC bar/stirrup checks exist only in "checked" mode: "required" mode has no
   * user-defined arrangement to check. Column confinement runs in both.
   */
  detailing?: DetailingCheck[]
  /** Column interaction result (when kind === "column"). */
  column?: ColumnDesignResult
  /** Steel member result (when material === "steel"). */
  steel?: SteelDesignResult
  /** Worst flexural D/C across zones (beam) or interaction D/C (column) — drives
   *  member colour via designColorForDC. */
  worstFlexureDC?: number
  /**
   * ρ used / ρ max — the one utilisation that exists in BOTH modes.
   *
   * "As required" has no capacity D/C: it sizes the steel to exactly meet the
   * demand, so any ratio would read 1.00 on every adequate member and say
   * nothing. How close the needed steel is to the code's maximum ratio does
   * answer the question the D/C is asked for — is this section comfortable, or
   * nearly out of room? Beams take the worst face across zones against the
   * tension-controlled limit; columns take ρg against 10.6.1.1's 8 %.
   */
  rhoUtil?: number
  /** All zones pass shear (incl. cross-section limit + SMF spacing). */
  worstShearPass?: boolean
  /** Beam nominal flexural strength at the joint (kN·m) — feeds SCWB ΣMnb. */
  beamMn?: number
  governing?: Partial<Record<ZoneId, { M: LoadComboId; V: LoadComboId }>>
}

/** SMF/SRPMK strong-column-weak-beam verdict at one joint (18.7.3.2). */
/**
 * Strong-column-weak-beam at one joint. Shared by both materials; the ratio's
 * DEFINITION differs, so `material` says which rule produced it:
 *
 *   rc     ACI 18.7.3.2   ratio = ΣMnc / (1.2·ΣMnb),  pass at ≥ 1  (6/5 rule)
 *   steel  AISC E3.4a     ratio = ΣM*pc / ΣM*pb,      pass at > 1
 */
export interface JointCheckResult {
  nodeId: string
  /** RC: Σ column Mn. Steel: ΣM*pc. kN·m. */
  sumMnc: number
  /** RC: Σ beam Mn. Steel: ΣM*pb. kN·m. */
  sumMnb: number
  /** The code ratio — see the table above. Unity is the threshold either way. */
  ratio: number
  pass: boolean
  /** Column member ids framing into this joint. */
  columnIds: string[]
  /** Which rule produced `ratio`. Absent ⇒ RC, for back-compat. */
  material?: DesignMaterial
}

export interface DesignRunResult {
  ok: boolean
  issues: string[]
  members: Record<MemberId, MemberDesignResult>
  /** SMF strong-column-weak-beam joint checks (empty for OMF/IMF). */
  joints?: JointCheckResult[]
}

// ── Canvas report selection (SAP2000/ETABS-style overlay dropdown) ────────────

/**
 * Which per-member quantity the Design-tab canvas overlays. Reports are mode-
 * scoped: `req-*` render only on members whose section is in "required" mode,
 * `chk-*` only on "checked" mode. Mode-mismatched members render nothing for the
 * selected report (member colour still reflects flexural D/C). `default` keeps
 * the original worst-zone F/V summary labels and renders for every mode.
 */
export type DesignReport =
  | "default"
  // ── RC, blended ────────────────────────────────────────────────────────────
  // One report per QUANTITY, not per element × mode. A beam and a column both
  // have longitudinal bars; "as required" and "as checked" both end in an area.
  // Splitting on those axes made four names for one question and left half the
  // menu painting nothing, so each of these renders on every RC member and
  // reads the mode-independent field (`AsTop`/`AsBottom`, `AvS`, `rho*`).
  | "rc-long" // longitudinal bar area, per face per zone (mm²) / column Ast
  | "rc-rho" // reinforcement ratio (%) — per face per zone / column ρg
  | "rc-trans" // transverse bar area (mm²/m) — stirrups / ties
  // Column-only. Kept out of the blend because they have no beam meaning at
  // all, and scoped per item so they vanish on a model with no columns.
  | "col-confine" // confinement as TIE LEGS: required vs what the grid engages
  | "col-slender" // slenderness verdict (satisfied / buckling) + δns
  | "col-scwb" // strong-column-weak-beam ratio at joints (node badges)
  // Steel (AISC 360-16). Scoped to steel members exactly as req-*/chk-* are
  // scoped by RC mode: an RC member renders nothing under a stl-* report.
  | "stl-dc" // combined-force D/C + governing AISC equation
  | "stl-shear-dc" // shear D/C (Chapter G)
  | "stl-capacity" // available strengths φPn / φMn / φVn
  | "stl-limit" // governing flexural limit state + section classification
  | "stl-slender" // KL/r and which buckling mode set Fe (E3 vs E4)
  | "stl-ductility" // AISC 341 Table D1.1 ductility (blank for OMF/RMB)
  | "stl-scwb" // AISC 341 E3.4a moment ratio at joints (node badges, SMF only)

/**
 * One offered report.
 *
 * `scope` lives on the ITEM, not the group. It used to sit on the group, which
 * forced the catalogue to mirror its own scoping: beam-required, beam-checked
 * and column became three menu sections for what is really three quantities
 * asked four ways. Per-item scope lets one blended RC section list every RC
 * report and drop only the entries that genuinely cannot render — the
 * column-only ones, on a model with no columns.
 *
 * Scope is not decoration: choosing a report no member matches produces a blank
 * canvas, which reads as a broken tool rather than as an empty set.
 */
export interface DesignReportItem {
  id: DesignReport
  label: string
  /** Which members render under it. Absent field ⇒ that axis is unrestricted. */
  scope?: { kind?: "beam" | "column"; mode?: DesignMode }
}

export interface DesignReportGroup {
  group: "General" | "Concrete" | "Steel"
  /** Which material's members this group describes; `both` = the summary. */
  material: DesignMaterial | "both"
  items: DesignReportItem[]
}

export const DESIGN_REPORTS: DesignReportGroup[] = [
  { group: "General", material: "both", items: [{ id: "default", label: "Design Summary" }] },
  {
    material: "rc",
    group: "Concrete",
    items: [
      // Blended: beam and column, required and checked, one entry each. What a
      // reader wants from a bar report is the bar — the area that is there, or
      // the area that must be — not a ratio that only one mode can produce.
      { id: "rc-long", label: "Longitudinal bar" },
      { id: "rc-rho", label: "Reinforcement ratio" },
      { id: "rc-trans", label: "Transverse bar" },
      // Column-only: no beam analogue exists, so these are scoped rather than
      // blended, and disappear entirely on a beam-only model.
      { id: "col-confine", label: "Confinement (tie legs)", scope: { kind: "column" } },
      { id: "col-slender", label: "Slenderness", scope: { kind: "column" } },
      { id: "col-scwb", label: "Strong-column-weak-beam", scope: { kind: "column" } },
    ],
  },
  {
    material: "steel",
    group: "Steel",
    items: [
      { id: "stl-dc", label: "Combined D/C + equation" },
      { id: "stl-shear-dc", label: "Shear D/C" },
      { id: "stl-capacity", label: "Capacities φPn / φMn / φVn" },
      { id: "stl-limit", label: "Limit state + classification" },
      { id: "stl-slender", label: "Slenderness KL/r + mode" },
      { id: "stl-ductility", label: "Seismic ductility (AISC 341)" },
      { id: "stl-scwb", label: "Strong-column-weak-beam (E3.4a)" },
    ],
  },
]

/** One group as offered to the user: the catalogue entry, items already filtered. */
export interface AvailableReportGroup extends DesignReportGroup {
  /** What the optgroup shows. */
  label: string
}

/**
 * The reports worth offering for THIS model, filtered per ITEM.
 *
 * Choosing a report no member matches paints a blank canvas, which reads as a
 * bug rather than as an empty set — so an entry appears only when some designed
 * member would actually render under it. With per-item scope this is now the
 * only filtering rule; the mode-narrowed group labels ("Beam — As checked")
 * are gone with the groups that needed them, because a blended report renders
 * in every mode and has nothing to narrow.
 */
export function availableDesignReports(
  members: Record<MemberId, MemberDesignResult>,
  material: DesignMaterial | null,
): AvailableReportGroup[] {
  const designed = Object.values(members).filter((r) => r.status === "designed")

  const matches = (
    g: DesignReportGroup,
    item: DesignReportItem,
    r: MemberDesignResult,
  ): boolean => {
    if (g.material !== "both" && r.material !== g.material) return false
    if (item.scope?.kind && r.kind !== item.scope.kind) return false
    if (item.scope?.mode && r.mode !== item.scope.mode) return false
    return true
  }

  const out: AvailableReportGroup[] = []
  for (const g of DESIGN_REPORTS) {
    // Material view wins over availability: an RC report on a steel view would
    // draw nothing even if RC members exist.
    if (material !== null && g.material !== "both" && g.material !== material) continue
    if (g.group === "General") {
      out.push({ ...g, label: g.group })
      continue
    }
    const items = g.items.filter((it) => designed.some((r) => matches(g, it, r)))
    if (items.length === 0) continue
    out.push({ ...g, items, label: g.group })
  }
  return out
}


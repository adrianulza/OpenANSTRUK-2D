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

export interface ColumnDesignResult {
  /** Provided (checked) or representative (required) longitudinal ratio ρg. */
  rhoG: number
  /** Provided steel (checked) or required steel (required), mm². */
  Ast: number
  /** "As required": ρg needed to satisfy the worst demand; undefined in checked mode. */
  rhoGRequired?: number
  /** Worst radial interaction D/C across combos × candidate stations. */
  worstDC: number
  governing?: { combo: LoadComboId; Pu: number; Mu: number }
  /** All checked combo (P,M) candidate pairs — drives the report's demand markers. */
  pmPairs?: { P: number; M: number; combo: LoadComboId }[]
  /** Checked: arrangement is buildable + ρg within limits. */
  adequate: boolean
}

export interface MemberDesignResult {
  memberId: MemberId
  status: MemberDesignStatus
  /** Design material family (set when designed). */
  material?: DesignMaterial
  /** Beam vs column (set when designed). */
  kind?: "beam" | "column"
  mode?: DesignMode
  /** Governing axial compression, kN (positive = compression). */
  Pu?: number
  zones?: Record<ZoneId, { flexure: ZoneFlexureResult; shear: ZoneShearResult }>
  /** SMF beam dimensional-limit checks (18.6.2.1); [] for OMF/IMF. */
  dimensionChecks?: ArrangementCheck[]
  /** Column interaction result (when kind === "column"). */
  column?: ColumnDesignResult
  /** Worst flexural D/C across zones (beam) or interaction D/C (column) — drives
   *  member colour via designColorForDC. */
  worstFlexureDC?: number
  /** All zones pass shear (incl. cross-section limit + SMF spacing). */
  worstShearPass?: boolean
  governing?: Partial<Record<ZoneId, { M: LoadComboId; V: LoadComboId }>>
}

export interface DesignRunResult {
  ok: boolean
  issues: string[]
  members: Record<MemberId, MemberDesignResult>
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
  | "req-long" // As required, top/bottom per zone (mm²)
  | "req-rho" // ρ required, top/bottom per zone (%)
  | "req-shear" // Av/s required per zone (mm²/m)
  | "chk-long-dc" // longitudinal D/C, top/bottom per zone
  | "chk-rho" // ρ provided, top/bottom per zone (%)
  | "chk-shear-dc" // shear D/C per zone
  | "col-dc" // column interaction D/C (per member)

export const DESIGN_REPORTS: {
  group: "General" | "As required" | "As checked" | "Columns"
  items: { id: DesignReport; label: string }[]
}[] = [
  { group: "General", items: [{ id: "default", label: "Design summary (D/C)" }] },
  {
    group: "As required",
    items: [
      { id: "req-long", label: "Longitudinal As (top/bottom)" },
      { id: "req-rho", label: "Reinforcement ratio ρ" },
      { id: "req-shear", label: "Shear Av/s" },
    ],
  },
  {
    group: "As checked",
    items: [
      { id: "chk-long-dc", label: "Longitudinal D/C (top/bottom)" },
      { id: "chk-rho", label: "Reinforcement ratio ρ" },
      { id: "chk-shear-dc", label: "Shear D/C" },
    ],
  },
  {
    group: "Columns",
    items: [{ id: "col-dc", label: "Interaction D/C" }],
  },
]

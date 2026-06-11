/**
 * RC beam design — shared types (ACI 318-14 / SNI 2847:2019).
 *
 * Pure domain module: no React imports. Design state (criteria + per-section
 * rebar inputs) lives in App state like loadCases/combinations — it is NOT part
 * of StructureModel and is not persisted by Save/Load (v1.1 limitation).
 */

import type { Section, SectionId, MemberId } from "@/lib/model"
import type { LoadComboId } from "@/lib/load-cases"
import type { RebarSize } from "./rebar"

// ── Criteria (global, SAP2000-Preferences-like) ──────────────────────────────

export type FrameType = "OMF" | "IMF" | "SMF"

export const FRAME_TYPES: { id: FrameType; label: string }[] = [
  { id: "OMF", label: "Ordinary Moment Frame (OMF)" },
  { id: "IMF", label: "Intermediate Moment Frame (IMF)" },
  { id: "SMF", label: "Special Moment Frame (SMF)" },
]

export type DesignCode = "ACI318-14_SNI2847-2019"

export interface DesignCriteria {
  code: DesignCode
  frameType: FrameType
  /** Main (longitudinal) bar yield strength, MPa */
  fy: number
  /** Transverse (stirrup) bar yield strength, MPa */
  fyt: number
  /** Steel elastic modulus, MPa */
  Es: number
  /** φ, tension-controlled flexure (21.2.1) */
  phiTension: number
  /** φ, shear (21.2.1) */
  phiShear: number
  /** φ, compression-controlled (tied) — lower bound of the flexure ramp */
  phiCompression: number
  /** Lightweight-concrete modification factor (normal-weight = 1.0) */
  lambda: number
  /** Stirrup legs crossing the shear plane */
  stirrupLegs: number
}

export function defaultDesignCriteria(): DesignCriteria {
  return {
    code: "ACI318-14_SNI2847-2019",
    frameType: "OMF",
    fy: 420,
    fyt: 420,
    Es: 200000,
    phiTension: 0.9,
    phiShear: 0.75,
    phiCompression: 0.65,
    lambda: 1.0,
    stirrupLegs: 2,
  }
}

// ── Per-section reinforcement input ──────────────────────────────────────────

export type DesignMode = "required" | "checked"

export interface BarLayer {
  count: number
  size: RebarSize
}

export interface RebarArrangement {
  top: BarLayer
  bottom: BarLayer
  /** Skin bars on each face — included in flexural capacity via the per-bar
   *  strain-compatibility solver (permitted by 9.7.2.3). */
  side: BarLayer
  stirrup: { size: RebarSize; spacing: number /* mm */ }
}

export interface SectionDesignInput {
  sectionId: SectionId
  mode: DesignMode
  /** Clear cover to stirrup, mm ("As checked" mode). */
  cover: number
  /** Cover to rebar centroid, mm ("As required" mode): d = h − dPrime. */
  dPrime: number
  /** End-zone (support, 2h) arrangement — "As checked" mode. */
  support: RebarArrangement
  /** Midspan arrangement — "As checked" mode. */
  midspan: RebarArrangement
}

export type SectionDesignInputs = Record<SectionId, SectionDesignInput>

function defaultArrangement(): RebarArrangement {
  return {
    top: { count: 3, size: "D19" },
    bottom: { count: 2, size: "D19" },
    side: { count: 0, size: "D13" },
    stirrup: { size: "D10", spacing: 150 },
  }
}

export function defaultSectionDesignInput(sectionId: SectionId): SectionDesignInput {
  return {
    sectionId,
    mode: "required",
    cover: 40,
    dPrime: 50,
    support: defaultArrangement(),
    midspan: defaultArrangement(),
  }
}

/** RC beam design supports rectangular concrete sections with f'c > 0 only. */
export function isSectionDesignable(s: Section | undefined): boolean {
  return (
    !!s &&
    s.materialClass === "concrete" &&
    s.shape?.kind === "rect" &&
    (s.strength?.fc ?? 0) > 0 &&
    (s.shape.dims.b ?? 0) > 0 &&
    (s.shape.dims.h ?? 0) > 0
  )
}

// ── Results ──────────────────────────────────────────────────────────────────

export type ZoneId = "end-i" | "midspan" | "end-j"
export const ZONE_IDS: ZoneId[] = ["end-i", "midspan", "end-j"]

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
  suggested?: { size: RebarSize; legs: number; spacing: number }
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
  | "axial-exceeded"
  | "no-result"

export interface MemberDesignResult {
  memberId: MemberId
  status: MemberDesignStatus
  mode?: DesignMode
  /** Governing axial compression, kN (positive = compression). */
  Pu?: number
  zones?: Record<ZoneId, { flexure: ZoneFlexureResult; shear: ZoneShearResult }>
  /** Worst flexural D/C across zones — drives member colour. */
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

export const DESIGN_REPORTS: {
  group: "General" | "As required" | "As checked"
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
]

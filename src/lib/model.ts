import type { LoadCaseId } from "./load-cases"

export type NodeId = string
export type MemberId = string
export type SupportType = "pin" | "roller" | "fixed"
// UI-only union for the SUPPORT tool's type picker. "none" means "remove support" (no glyph).
export type SupportPick = SupportType | "none"
export type SectionId = string
export type LoadId = string

export interface ModelNode {
  id: NodeId
  x: number
  y: number
}

export type MemberType = "frame" | "truss"

export interface Member {
  id: MemberId
  a: NodeId
  b: NodeId
  section: SectionId
  memberType?: MemberType   // "frame" (default) = full beam-column; "truss" = axial-only
}

export interface Support {
  nodeId: NodeId
  type: SupportType
}

export type MaterialClass = "concrete" | "steel"
export type SectionShape  = "rect" | "circle" | "iwf" | "tee" | "angle" | "chs" | "rhs"

/**
 * AISC F10 / E4 principal-axis properties, for sections whose principal axes do
 * NOT coincide with their geometric axes — in this catalogue, the single angle.
 *
 * The solver bends every member about the GEOMETRIC axis 3, so when this block
 * is present the steel design path must resolve that moment into its two
 * principal components and check AISC H2 rather than H1. See
 * `docs/DESIGN_STEEL.md` §S3.1.
 */
export interface PrincipalProperties {
  /** Rotation of the major principal axis (w) from geometric axis 3, radians CCW. */
  alpha: number
  Iw: number     // mm⁴ — major principal moment of inertia
  Iz: number     // mm⁴ — minor principal moment of inertia
  rw: number     // mm  — √(Iw/A); the "r_max" of CSI §3.5.2
  rz: number     // mm  — √(Iz/A); the "r_min", governs single-angle E3 slenderness
  /**
   * Elastic section moduli about the principal axes, to the WORST extreme
   * fibre — for an angle the heel and both leg toes are all considered, per
   * CSI §3.5.3.8.2 ("the possibility of yielding at the heel and both of the
   * leg tips").
   */
  SwMin: number  // mm³ — Iw / max|z|
  SzMin: number  // mm³ — Iz / max|w|
  /** AISC Table C-F10.1 monosymmetry property. Exactly 0 for equal legs. */
  betaW: number  // mm
  /** Shear-centre offset from the centroid, in principal axes. */
  w0: number     // mm
  z0: number     // mm
}

export interface Section {
  id: SectionId
  name: string
  /** Elastic modulus in MPa */
  E: number
  /** Second moment of area, strong-axis bending (about local axis 3), in mm⁴ */
  I33: number
  /** Cross-sectional area in mm² */
  A: number

  // ── Optional, additive fields ───────────────────────────────────────────────
  /** Poisson ratio (dimensionless). Default 0.3 if absent (back-compat). */
  nu?: number
  /** Shear area in direction 2 (in-plane shear, Timoshenko), mm². */
  "Aκ2"?: number
  /** Second moment of area, weak-axis bending (about local axis 2), mm⁴. 3D. */
  I22?: number
  /** Shear area in direction 3 (out-of-plane shear, 3D), mm². */
  "Aκ3"?: number
  /** Torsion constant, mm⁴. Populated when 3D solver lands. */
  J?: number
  /** Unit weight in kN/m³ (self-weight, future). */
  gamma?: number

  /** Author mode. Absent → legacy section, treated as manual at UI layer. */
  mode?: "parametric" | "manual"
  materialClass?: MaterialClass
  shape?: {
    kind: SectionShape
    dims: Record<string, number>  // keys: b, h, d, tf, tw (shape-dependent)
  }
  strength?: {
    fc?: number   // concrete f'c in MPa
    fy?: number   // steel yield in MPa
    fu?: number   // steel ultimate in MPa
  }
  /**
   * Derived properties cached when authored parametrically.
   * Naming follows SAP2000 local-axis convention (axis 3 = strong, axis 2 = weak).
   */
  derived?: {
    G:    number  // MPa
    S33b: number  // mm³ — elastic section modulus, axis 3 (bottom fibre, governing)
    S33t: number  // mm³ — elastic section modulus, axis 3 (top fibre); equals S33b for symmetric sections
    S22L: number  // mm³ — elastic section modulus, axis 2 (left fibre)
    S22R: number  // mm³ — elastic section modulus, axis 2 (right fibre)
    Z33:  number  // mm³ — plastic section modulus, strong axis
    Z22:  number  // mm³ — plastic section modulus, weak axis
    r33:  number  // mm   — radius of gyration, strong axis
    r22:  number  // mm   — radius of gyration, weak axis
    yBar: number  // mm   — centroid from base
    // ── Torsional / warping properties (steel design, AISC 360-16) ──────────
    // Optional: only shapes with a closed-form expression populate these, and
    // only the LTB path (F2) needs them. Absent → that limit state is skipped
    // rather than computed from invented data.
    Cw?:  number  // mm⁶  — warping constant (F2-4, E4)
    rts?: number  // mm   — effective radius of gyration for LTB (F2-7)
    ho?:  number  // mm   — distance between flange centroids (F2-4)
    // ── Shear centre, geometric axes (AISC E4) ──────────────────────────────
    // Both zero for a doubly-symmetric shape, so E4-2 needs neither.
    x0?:  number  // mm   — shear-centre offset from centroid along axis 3
    y0?:  number  // mm   — shear-centre offset from centroid along axis 2
    /** Principal-axis block; present only when principal ≠ geometric (angle). */
    principal?: PrincipalProperties
  }
  /** When true, advanced-panel edits are kept verbatim. */
  overridden?: boolean
}

export interface PointLoad {
  id: LoadId
  type: "point"
  nodeId: NodeId
  loadCaseId: LoadCaseId
  fx: number  // kN; global X-axis component (positive = rightward)
  fy: number  // kN; global Y-axis component (positive = upward)
}

export interface DistributedLoad {
  id: LoadId
  type: "distributed"
  memberId: MemberId
  loadCaseId: LoadCaseId
  mode?: "local-axis" | "global-axis"  // default "local-axis"
  // Local-axis mode: perpendicular to member
  wStart?: number  // kN/m at node-A end
  wEnd?: number    // kN/m at node-B end (equals wStart for uniform)
  // Global-axis mode: X and Y components
  wxStart?: number  // X-axis load at node-A end (positive = rightward)
  wxEnd?: number    // X-axis load at node-B end
  wyStart?: number  // Y-axis load at node-A end (positive = upward)
  wyEnd?: number    // Y-axis load at node-B end
}

export type Load = PointLoad | DistributedLoad

export interface StructureModel {
  nodes: Record<NodeId, ModelNode>
  members: Record<MemberId, Member>
  supports: Record<NodeId, Support>
  sections: Record<SectionId, Section>
  loads: Record<LoadId, Load>
}

export interface MultiSelection {
  nodeIds: NodeId[]
  memberIds: MemberId[]
  supportNodeIds: NodeId[]
}

export function emptySelection(): MultiSelection {
  return { nodeIds: [], memberIds: [], supportNodeIds: [] }
}

export function isEmptySelection(s: MultiSelection): boolean {
  return s.nodeIds.length === 0 && s.memberIds.length === 0 && s.supportNodeIds.length === 0
}

export function mergeSelection(a: MultiSelection, b: MultiSelection): MultiSelection {
  return {
    nodeIds: [...new Set([...a.nodeIds, ...b.nodeIds])],
    memberIds: [...new Set([...a.memberIds, ...b.memberIds])],
    supportNodeIds: [...new Set([...a.supportNodeIds, ...b.supportNodeIds])],
  }
}

export function removeFromSelection(a: MultiSelection, b: MultiSelection): MultiSelection {
  return {
    nodeIds: a.nodeIds.filter((id) => !b.nodeIds.includes(id)),
    memberIds: a.memberIds.filter((id) => !b.memberIds.includes(id)),
    supportNodeIds: a.supportNodeIds.filter((id) => !b.supportNodeIds.includes(id)),
  }
}

export function deleteMultiSelection(model: StructureModel, sel: MultiSelection): StructureModel {
  const supports = { ...model.supports }
  for (const id of sel.supportNodeIds) delete supports[id]
  const members = { ...model.members }
  for (const id of sel.memberIds) delete members[id]
  const loads = Object.fromEntries(
    Object.entries(model.loads).filter(([, load]) =>
      !(load.type === "distributed" && sel.memberIds.includes(load.memberId))
    )
  )
  let m: StructureModel = { ...model, supports, members, loads }
  for (const id of sel.nodeIds) m = deleteNode(m, id)
  return m
}

// Local require avoids a static cycle through lib/sections/* at module load;
// it's safe because compute.ts only imports types from this file.
import { buildParametricSection } from "@/lib/sections/compute"

export const defaultSections: Record<SectionId, Section> = {
  // RC 300x500 — parametric concrete, values match SAP2000 exactly (verified).
  rc300x500: buildParametricSection({
    id: "rc300x500", name: "Beam 300x500",
    materialClass: "concrete", shape: "rect",
    dims: { b: 300, h: 500 }, strength: { fc: 25 },
  }),
  // Steel IWF sections — all parametric, values from physical dimensions.
  iwf150: buildParametricSection({
    id: "iwf150", name: "IWF 100×100×6×8",
    materialClass: "steel", shape: "iwf",
    dims: { b: 100, h: 100, tf: 8, tw: 6 },
    strength: { fy: 240, fu: 400, E: 200000 },
  }),
  iwf200: buildParametricSection({
    id: "iwf200", name: "IWF 200×100×5.5×8",
    materialClass: "steel", shape: "iwf",
    dims: { b: 100, h: 200, tf: 8, tw: 5.5 },
    strength: { fy: 240, fu: 400, E: 200000 },
  }),
  wf300: buildParametricSection({
    id: "wf300", name: "H 300×300×10×15",
    materialClass: "steel", shape: "iwf",
    dims: { b: 300, h: 300, tf: 15, tw: 10 },
    strength: { fy: 240, fu: 400, E: 200000 },
  }),
}

let idCounter = 0
const prefixed = (prefix: string) => () => `${prefix}${++idCounter}`
export const newNodeId    = prefixed("n")
export const newMemberId  = prefixed("m")
export const newSectionId = prefixed("s")
export const newLoadId    = prefixed("l")

/** Resets the ID counter to zero. Call before building a fresh model (New, templates, examples) so IDs restart at 1. */
export function resetIdCounter(): void {
  idCounter = 0
}

/**
 * Seed the shared ID counter from an existing model so newly-created entities
 * never collide with loaded ones. Scans the numeric suffix of every node,
 * member, load, and section key and sets the counter to the maximum found.
 * Use this (instead of resetIdCounter) after loading a model from file.
 */
export function seedIdCounter(model: StructureModel): void {
  let max = 0
  const scan = (keys: string[]) => {
    for (const k of keys) {
      const n = parseInt(k.replace(/^\D+/, ""), 10)
      if (Number.isFinite(n) && n > max) max = n
    }
  }
  scan(Object.keys(model.nodes))
  scan(Object.keys(model.members))
  scan(Object.keys(model.loads))
  scan(Object.keys(model.sections))
  idCounter = max
}

/** Lightweight shape guard for untrusted file contents loaded as JSON. */
export function isStructureModel(x: unknown): x is StructureModel {
  if (!x || typeof x !== "object") return false
  const m = x as Record<string, unknown>
  const obj = (v: unknown) => !!v && typeof v === "object"
  return (
    obj(m.nodes) && obj(m.members) && obj(m.supports) &&
    obj(m.sections) && obj(m.loads) &&
    Object.keys(m.sections as object).length > 0
  )
}

/** Remove a section and reassign any members using it to the first remaining section. */
export function deleteSection(model: StructureModel, sectionId: SectionId): StructureModel {
  const sections = { ...model.sections }
  delete sections[sectionId]
  const fallback = Object.keys(sections)[0]
  const members = Object.fromEntries(
    Object.entries(model.members).map(([id, m]) => [
      id,
      m.section === sectionId ? { ...m, section: fallback } : m,
    ])
  )
  return { ...model, sections, members }
}

export function createEmptyModel(): StructureModel {
  return { nodes: {}, members: {}, supports: {}, sections: { ...defaultSections }, loads: {} }
}

export function createInitialModel(): StructureModel {
  const nodes: Record<NodeId, ModelNode> = {}
  const members: Record<MemberId, Member> = {}
  const supports: Record<NodeId, Support> = {}
  const loads: Record<LoadId, Load> = {}

  const left  = newNodeId()
  const mid   = newNodeId()
  const right = newNodeId()
  nodes[left]  = { id: left,  x: -2.5, y: 0 }
  nodes[mid]   = { id: mid,   x:  0,   y: 0 }
  nodes[right] = { id: right, x:  2.5, y: 0 }

  const mL = newMemberId()
  const mR = newMemberId()
  members[mL] = { id: mL, a: left, b: mid,   section: "iwf150" }
  members[mR] = { id: mR, a: mid,  b: right,  section: "iwf150" }

  supports[left]  = { nodeId: left,  type: "pin" }
  supports[right] = { nodeId: right, type: "roller" }

  const loadId = newLoadId()
  loads[loadId] = { id: loadId, type: "point", nodeId: mid, loadCaseId: "dead", fx: 0, fy: 10 }

  return { nodes, members, supports, sections: { ...defaultSections }, loads }
}

export function deleteNode(model: StructureModel, nodeId: NodeId): StructureModel {
  const nodes = { ...model.nodes }
  delete nodes[nodeId]
  const removedMemberIds = Object.values(model.members)
    .filter((m) => m.a === nodeId || m.b === nodeId)
    .map((m) => m.id)
  const members = Object.fromEntries(
    Object.entries(model.members).filter(([, m]) => m.a !== nodeId && m.b !== nodeId)
  )
  const supports = { ...model.supports }
  delete supports[nodeId]
  const loads = Object.fromEntries(
    Object.entries(model.loads).filter(([, load]) =>
      !(load.type === "point" && load.nodeId === nodeId) &&
      !(load.type === "distributed" && removedMemberIds.includes(load.memberId))
    )
  )
  return { ...model, nodes, members, supports, loads }
}

export function deleteMember(model: StructureModel, memberId: MemberId): StructureModel {
  const members = { ...model.members }
  delete members[memberId]
  const loads = Object.fromEntries(
    Object.entries(model.loads).filter(([, load]) =>
      !(load.type === "distributed" && load.memberId === memberId)
    )
  )
  return { ...model, members, loads }
}

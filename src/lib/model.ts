export type NodeId = string
export type MemberId = string
export type SupportType = "pin" | "roller" | "fixed"
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
export type SectionShape  = "rect" | "circle" | "iwf"

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
   * Naming follows reference software local-axis convention (axis 3 = strong, axis 2 = weak).
   */
  derived?: {
    G:    number  // MPa
    S33:  number  // mm³ — elastic section modulus, strong axis
    S22:  number  // mm³ — elastic section modulus, weak axis
    Z33:  number  // mm³ — plastic section modulus, strong axis
    Z22:  number  // mm³ — plastic section modulus, weak axis
    r33:  number  // mm   — radius of gyration, strong axis
    r22:  number  // mm   — radius of gyration, weak axis
    yBar: number  // mm   — centroid from base
  }
  /** When true, advanced-panel edits are kept verbatim. */
  overridden?: boolean
}

export interface PointLoad {
  id: LoadId
  type: "point"
  nodeId: NodeId
  fx: number  // kN; global X-axis component (positive = rightward)
  fy: number  // kN; global Y-axis component (positive = upward)
}

export interface DistributedLoad {
  id: LoadId
  type: "distributed"
  memberId: MemberId
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

// Local require avoids a static cycle through features/material/* at module load;
// it's safe because compute.ts only imports types from this file.
import { buildParametricSection } from "@/features/material/compute"

export const defaultSections: Record<SectionId, Section> = {
  // RC 300x500 — parametric concrete, values match reference software exactly (verified).
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

/** Resets the ID counter to zero. Use only in test setup / teardown. */
export function resetIdCounter(): void {
  idCounter = 0
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
  loads[loadId] = { id: loadId, type: "point", nodeId: mid, fx: 0, fy: 10 }

  return { nodes, members, supports, sections: { ...defaultSections }, loads }
}

export function stabilityOf(model: StructureModel): "STABLE" | "UNSTABLE" {
  const members = Object.values(model.members)
  const m = members.length
  const j = Object.values(model.nodes).length
  const r = Object.values(model.supports).reduce((sum, s) =>
    sum + (s.type === "fixed" ? 3 : s.type === "pin" ? 2 : 1), 0)
  const isPureTruss = m > 0 && members.every((mem) => mem.memberType === "truss")
  // Pure truss: m + r >= 2j  |  frame / mixed: 3m + r >= 3j
  if (isPureTruss) return m + r >= 2 * j ? "STABLE" : "UNSTABLE"
  return 3 * m + r >= 3 * j ? "STABLE" : "UNSTABLE"
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

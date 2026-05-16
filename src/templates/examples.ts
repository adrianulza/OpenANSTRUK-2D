import type { StructureModel } from "@/lib/model"
import { newNodeId, newMemberId, newLoadId, defaultSections } from "@/lib/model"

const SECTION_DEFAULT: StructureModel["sections"][string] = {
  id: "section", name: "section", E: 23500, I33: 3125000, A: 150000,
}

const SECTION_C30: StructureModel["sections"][string] = {
  id: "section", name: "section", E: 30000, I33: 480000000, A: 75000,
}

/** Template 1 — Simply supported beam, L=5 m (2+3 m), P=10 kN downward at 2 m from left, distributed load on right */
export function template1SimpleBeam(): StructureModel {
  const nodes: StructureModel["nodes"] = {}
  const members: StructureModel["members"] = {}
  const supports: StructureModel["supports"] = {}
  const loads: StructureModel["loads"] = {}

  const nA  = newNodeId()  // left end  x=−2.5 (pin)
  const nP  = newNodeId()  // load point x=−0.5 (2 m from left)
  const nB  = newNodeId()  // right end  x=+2.5 (roller)

  nodes[nA] = { id: nA, x: -2.5, y: 0 }
  nodes[nP] = { id: nP, x: -0.5, y: 0 }
  nodes[nB] = { id: nB, x:  2.5, y: 0 }

  const mL = newMemberId()
  const mR = newMemberId()
  members[mL] = { id: mL, a: nA, b: nP, section: "section" }
  members[mR] = { id: mR, a: nP, b: nB, section: "section" }

  supports[nA] = { nodeId: nA, type: "pin" }
  supports[nB] = { nodeId: nB, type: "roller" }

  const lPt = newLoadId()
  loads[lPt] = { id: lPt, type: "point", nodeId: nP, fx: 0, fy: -10 }

  return { nodes, members, supports, sections: { ...defaultSections, [SECTION_DEFAULT.id]: SECTION_DEFAULT }, loads }
}

/** Template 2 — Cantilever beam, fixed at left, L=5 m, uniform load −10 kN/m */
export function template2Cantilever(): StructureModel {
  const nodes: StructureModel["nodes"] = {}
  const members: StructureModel["members"] = {}
  const supports: StructureModel["supports"] = {}
  const loads: StructureModel["loads"] = {}

  const nA = newNodeId()  // fixed end  x=−2.5
  const nB = newNodeId()  // free end   x=+2.5

  nodes[nA] = { id: nA, x: -2.5, y: 0 }
  nodes[nB] = { id: nB, x:  2.5, y: 0 }

  const mId = newMemberId()
  members[mId] = { id: mId, a: nA, b: nB, section: "section" }

  supports[nA] = { nodeId: nA, type: "fixed" }

  const lId = newLoadId()
  loads[lId] = { id: lId, type: "distributed", memberId: mId, mode: "local-axis", wStart: -10, wEnd: -10 }

  return { nodes, members, supports, sections: { ...defaultSections, [SECTION_DEFAULT.id]: SECTION_DEFAULT }, loads }
}

/**
 * Template 3 — Portal frame: 2 fixed columns h=4 m, beam L=5 m.
 * Loads: uniform −10 kN/m on beam + P=−10 kN at 2 m from beam left end.
 * Vertically centred: bases at y=−2, beam at y=+2.
 */
export function template3Portal(): StructureModel {
  const nodes: StructureModel["nodes"] = {}
  const members: StructureModel["members"] = {}
  const supports: StructureModel["supports"] = {}
  const loads: StructureModel["loads"] = {}

  const nBL = newNodeId()  // bottom-left  (−2.5, −2)  fixed
  const nBR = newNodeId()  // bottom-right (+2.5, −2)  fixed
  const nTL = newNodeId()  // top-left     (−2.5, +2)  joint A
  const nLP = newNodeId()  // load point   (−0.5, +2)  2 m from left on beam
  const nTR = newNodeId()  // top-right    (+2.5, +2)  joint B

  nodes[nBL] = { id: nBL, x: -2.5, y: -2 }
  nodes[nBR] = { id: nBR, x:  2.5, y: -2 }
  nodes[nTL] = { id: nTL, x: -2.5, y:  2 }
  nodes[nLP] = { id: nLP, x: -0.5, y:  2 }
  nodes[nTR] = { id: nTR, x:  2.5, y:  2 }

  const mLC = newMemberId()  // left column
  const mRC = newMemberId()  // right column
  const mBL = newMemberId()  // beam left segment  (nTL → nLP, 2 m)
  const mBR = newMemberId()  // beam right segment (nLP → nTR, 3 m)

  members[mLC] = { id: mLC, a: nBL, b: nTL, section: "section" }
  members[mRC] = { id: mRC, a: nBR, b: nTR, section: "section" }
  members[mBL] = { id: mBL, a: nTL, b: nLP, section: "section" }
  members[mBR] = { id: mBR, a: nLP, b: nTR, section: "section" }

  supports[nBL] = { nodeId: nBL, type: "fixed" }
  supports[nBR] = { nodeId: nBR, type: "fixed" }

  const lD1 = newLoadId()
  const lD2 = newLoadId()
  const lPt = newLoadId()

  // Uniform downward load on both beam segments
  loads[lD1] = { id: lD1, type: "distributed", memberId: mBL, mode: "local-axis", wStart: -10, wEnd: -10 }
  loads[lD2] = { id: lD2, type: "distributed", memberId: mBR, mode: "local-axis", wStart: -10, wEnd: -10 }
  // Downward point load at 2 m from beam left
  loads[lPt] = { id: lPt, type: "point", nodeId: nLP, fx: 0, fy: -10 }

  const sections = { ...defaultSections, [SECTION_DEFAULT.id]: SECTION_DEFAULT }
  return { nodes, members, supports, sections, loads }
}

/**
 * Template 5 — Asymmetric frame with inclined rafter.
 * Left column 12 m (fixed base), right column 6 m (fixed base), 9 m span.
 * Horizontal beam at 6 m. Inclined rafter from top-left (12 m) to top-right (6 m).
 * Loads: 40 kN lateral at top-left, 80 kN lateral at mid-left junction,
 *        12 kN/m distributed (perpendicular, CCW) on rafter.
 * Section: E=30 GPa, A=75 000 mm², I=4.8×10⁸ mm⁴.
 * Centred on canvas: x ∈ [−4.5, 4.5], y ∈ [−6, 6].
 */
export function template5AsymmetricRafter(): StructureModel {
  const nodes:    StructureModel["nodes"]    = {}
  const members:  StructureModel["members"]  = {}
  const supports: StructureModel["supports"] = {}
  const loads:    StructureModel["loads"]    = {}

  // Nodes (world metres, centred)
  const nBL = newNodeId()  // base-left   (−4.5, −6)  fixed
  const nBR = newNodeId()  // base-right  (+4.5, −6)  fixed
  const nML = newNodeId()  // mid-left    (−4.5,  0)  junction + 80 kN
  const nTL = newNodeId()  // top-left    (−4.5, +6)  40 kN + rafter start
  const nTR = newNodeId()  // top-right   (+4.5,  0)  beam end + rafter end

  nodes[nBL] = { id: nBL, x: -4.5, y: -6 }
  nodes[nBR] = { id: nBR, x:  4.5, y: -6 }
  nodes[nML] = { id: nML, x: -4.5, y:  0 }
  nodes[nTL] = { id: nTL, x: -4.5, y:  6 }
  nodes[nTR] = { id: nTR, x:  4.5, y:  0 }

  const mLC1   = newMemberId()  // left column lower  nBL → nML
  const mLC2   = newMemberId()  // left column upper  nML → nTL
  const mBeam  = newMemberId()  // horizontal beam    nML → nTR
  const mRC    = newMemberId()  // right column       nBR → nTR
  const mRaft  = newMemberId()  // inclined rafter    nTL → nTR

  members[mLC1]  = { id: mLC1,  a: nBL, b: nML, section: "section" }
  members[mLC2]  = { id: mLC2,  a: nML, b: nTL, section: "section" }
  members[mBeam] = { id: mBeam, a: nML, b: nTR, section: "section" }
  members[mRC]   = { id: mRC,   a: nBR, b: nTR, section: "section" }
  members[mRaft] = { id: mRaft, a: nTL, b: nTR, section: "section" }

  supports[nBL] = { nodeId: nBL, type: "fixed" }
  supports[nBR] = { nodeId: nBR, type: "fixed" }

  const l40  = newLoadId()
  const l80  = newLoadId()
  const lDist = newLoadId()

  loads[l40]   = { id: l40,   type: "point",       nodeId:   nTL,   fx: 40, fy: 0 }
  loads[l80]   = { id: l80,   type: "point",       nodeId:   nML,   fx: 80, fy: 0 }
  loads[lDist] = { id: lDist, type: "distributed", memberId: mRaft, mode: "local-axis", wStart: 12, wEnd: 12 }

  const sections = { ...defaultSections, [SECTION_C30.id]: SECTION_C30 }
  return { nodes, members, supports, sections, loads }
}

/** Template 4 — Portal frame (same geometry as T3). Lateral loads: uniform +10 kN/m on left column + P=+10 kN at joint A. */
export function template4PortalLateral(): StructureModel {
  const nodes: StructureModel["nodes"] = {}
  const members: StructureModel["members"] = {}
  const supports: StructureModel["supports"] = {}
  const loads: StructureModel["loads"] = {}

  const nBL = newNodeId()  // bottom-left  (−2.5, −2)  fixed
  const nBR = newNodeId()  // bottom-right (+2.5, −2)  fixed
  const nTL = newNodeId()  // top-left / joint A (−2.5, +2)
  const nTR = newNodeId()  // top-right / joint B (+2.5, +2)

  nodes[nBL] = { id: nBL, x: -2.5, y: -2 }
  nodes[nBR] = { id: nBR, x:  2.5, y: -2 }
  nodes[nTL] = { id: nTL, x: -2.5, y:  2 }
  nodes[nTR] = { id: nTR, x:  2.5, y:  2 }

  const mLC = newMemberId()  // left column
  const mRC = newMemberId()  // right column
  const mB  = newMemberId()  // beam

  members[mLC] = { id: mLC, a: nBL, b: nTL, section: "section" }
  members[mRC] = { id: mRC, a: nBR, b: nTR, section: "section" }
  members[mB]  = { id: mB,  a: nTL, b: nTR, section: "section" }

  supports[nBL] = { nodeId: nBL, type: "fixed" }
  supports[nBR] = { nodeId: nBR, type: "fixed" }

  const lDist = newLoadId()
  const lPt   = newLoadId()

  loads[lDist] = { id: lDist, type: "distributed", memberId: mLC, mode: "local-axis", wStart: 10, wEnd: 10 }
  // Rightward lateral point load at joint A
  loads[lPt]   = { id: lPt,   type: "point", nodeId: nTL, fx: 10, fy: 0 }

  const sections = { ...defaultSections, [SECTION_DEFAULT.id]: SECTION_DEFAULT }
  return { nodes, members, supports, sections, loads }
}
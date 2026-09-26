/**
 * Lumped nodal mass from the mass source — the 2D counterpart of
 * OpenANSTRUK-3D's `seismic-weight.ts`.
 *
 * Every mass-source case contributes the DOWNWARD (−Y) component of its loads,
 * times its factor, lumped to the nodes by statics:
 *
 *  - Selfweight: γ·A·L per member, half to each end.
 *  - Point loads: −Fy at the node.
 *  - Distributed loads: the global-Y component of the trapezoid, split to the
 *    two ends as the reactions of a simply supported span,
 *      W_A = L·(2w₁ + w₂)/6,  W_B = L·(w₁ + 2w₂)/6.
 *    A local-axis load projects onto global Y by cos α; a global-axis load
 *    contributes its wy directly. Intensities are per unit member length, the
 *    same reading the solver gives them.
 *
 * ⚠ ONE DISTRIBUTED LOAD PER MEMBER PER CASE — the first one found — because
 * that is all the static solver assembles (`solver.ts`). Counting a second one
 * here would give the modal pass a mass the static pass never saw.
 *
 * Mass is W/g in tonnes (kN / (m/s²)), the unit that pairs with a stiffness in
 * kN/m to give ω² in 1/s². The same mass acts on u and v; a lumped point mass
 * has no rotary inertia, so θ gets none.
 */

import type { StructureModel, NodeId } from "../model"
import type { LoadCase, LoadCaseId } from "../load-cases"
import { activeMassTerms, type MassSource } from "./mass-source"

export const GRAVITY = 9.80665 // m/s²

export interface MassReport {
  /** Nodal seismic weight, kN (≥ 0). */
  nodeWeight: Record<NodeId, number>
  /** Contribution of each mass-source case to the total, kN (factor applied). */
  byCase: Record<LoadCaseId, number>
  /** Total weight, kN. */
  W: number
  /** Nodes whose net weight came out upward and was clamped to zero. */
  clamped: NodeId[]
}

export function buildMassReport(
  model: StructureModel,
  cases: Record<LoadCaseId, LoadCase>,
  source: MassSource,
): MassReport {
  const raw: Record<NodeId, number> = {}
  const byCase: Record<LoadCaseId, number> = {}
  const add = (nodeId: NodeId, w: number) => {
    raw[nodeId] = (raw[nodeId] ?? 0) + w
  }

  for (const { caseId, factor } of activeMassTerms(source)) {
    if (!cases[caseId]) continue
    let caseW = 0

    if (caseId === "selfweight") {
      for (const m of Object.values(model.members)) {
        const sec = model.sections[m.section]
        const a = model.nodes[m.a]
        const b = model.nodes[m.b]
        if (!sec || !a || !b) continue
        const gamma = sec.gamma ?? 0
        if (gamma <= 0) continue
        const L = Math.hypot(b.x - a.x, b.y - a.y)
        const w = factor * gamma * sec.A * 1e-6 * L // kN
        add(m.a, w / 2)
        add(m.b, w / 2)
        caseW += w
      }
      byCase[caseId] = caseW
      continue
    }

    const seenMember = new Set<string>()
    for (const load of Object.values(model.loads)) {
      if (load.loadCaseId !== caseId) continue
      if (load.type === "point") {
        if (!model.nodes[load.nodeId]) continue
        const w = -factor * load.fy
        add(load.nodeId, w)
        caseW += w
        continue
      }
      if (seenMember.has(load.memberId)) continue
      seenMember.add(load.memberId)
      const m = model.members[load.memberId]
      const a = m && model.nodes[m.a]
      const b = m && model.nodes[m.b]
      if (!m || !a || !b) continue
      const L = Math.hypot(b.x - a.x, b.y - a.y)
      if (L < 1e-9) continue
      let wy1: number, wy2: number
      if ((load.mode ?? "local-axis") === "local-axis") {
        // +local-2 = (−sin α, cos α); its global-Y share is cos α.
        const c = (b.x - a.x) / L
        wy1 = (load.wStart ?? 0) * c
        wy2 = (load.wEnd ?? 0) * c
      } else {
        wy1 = load.wyStart ?? 0
        wy2 = load.wyEnd ?? 0
      }
      // Downward is weight: flip the sign of the upward-positive wy.
      const wa = (-factor * L * (2 * wy1 + wy2)) / 6
      const wb = (-factor * L * (wy1 + 2 * wy2)) / 6
      add(m.a, wa)
      add(m.b, wb)
      caseW += wa + wb
    }
    byCase[caseId] = caseW
  }

  const nodeWeight: Record<NodeId, number> = {}
  const clamped: NodeId[] = []
  let W = 0
  for (const [id, w] of Object.entries(raw)) {
    if (w < -1e-9) clamped.push(id)
    const v = Math.max(w, 0)
    if (v > 0) nodeWeight[id] = v
    W += v
  }
  return { nodeWeight, byCase, W, clamped }
}

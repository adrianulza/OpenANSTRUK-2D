import type { StructureModel } from "@/lib/model"
import type { AnalysisResult } from "@/lib/solver"

/**
 * Peak displacement magnitude of a result, sampled along each member's
 * cubic-Hermite deflected shape (not only at the nodes), so mid-span sag
 * counts. The canvas scales the deformed shape to this peak; the Deformation
 * tool reports the amplification it implies.
 */
export function peakDeformation(model: StructureModel, result: AnalysisResult | null): number {
  if (!result) return 0
  const N_PTS = 40
  let p = 0
  for (const member of Object.values(model.members)) {
    const nA = model.nodes[member.a]
    const nB = model.nodes[member.b]
    if (!nA || !nB) continue
    const dA = result.nodeDisplacements[member.a]
    const dB = result.nodeDisplacements[member.b]
    if (!dA || !dB) continue
    const dx = nB.x - nA.x, dy = nB.y - nA.y
    const L = Math.hypot(dx, dy)
    if (L < 1e-9) continue
    const c = dx / L, sn = dy / L
    const u1 = c * dA.u + sn * dA.v, v1 = -sn * dA.u + c * dA.v, th1 = dA.theta
    const u2 = c * dB.u + sn * dB.v, v2 = -sn * dB.u + c * dB.v, th2 = dB.theta
    for (let i = 0; i <= N_PTS; i++) {
      const xi = i / N_PTS
      const uLoc = (1 - xi) * u1 + xi * u2
      const H1 = 1 - 3*xi*xi + 2*xi*xi*xi
      const H2 = L * xi * (1 - xi) * (1 - xi)
      const H3 = 3*xi*xi - 2*xi*xi*xi
      const H4 = L * xi*xi * (xi - 1)
      const vLoc = H1*v1 + H2*th1 + H3*v2 + H4*th2
      const mag = Math.hypot(c * uLoc - sn * vLoc, sn * uLoc + c * vLoc)
      if (mag > p) p = mag
    }
  }
  return p
}

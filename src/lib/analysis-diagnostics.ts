/**
 * Analysis diagnostics — pre-flight structural validity checks.
 *
 * Pure module (no React, no solver dependency). Runs cheaply on every model
 * change to drive the status-bar `Status` indicator and the warning dialog.
 *
 * Three categories of issues:
 *   1. Topological errors detected without solving (empty model, reaction
 *      count, disconnected substructures, γ=0 sections).
 *   2. Singular-DOF errors merged in from the solver path (see App.tsx).
 *   3. Warnings (γ=0) that do not block analysis but reduce its fidelity.
 *
 * The count formula `3m + r vs 3j` is used only to distinguish *determinate*
 * from *indeterminate* once the model has cleared the error checks. It is no
 * longer the sole stability signal — geometric mechanisms (collinear pins,
 * parallel rollers, etc.) are caught by pivot tracking in `gaussSolve`.
 */

import type { StructureModel, NodeId, SectionId } from "./model"

export type DiagnosticSeverity = "error" | "warning"

export type DiagnosticIssue =
  | { kind: "no-nodes";                severity: "error" }
  | { kind: "no-members";              severity: "error" }
  | { kind: "no-supports";             severity: "error" }
  | { kind: "insufficient-reactions";  severity: "error"; have: number }
  | { kind: "disconnected-component";  severity: "error" }
  | { kind: "singular-at-dof";         severity: "error"; nodeId: NodeId; direction: "u" | "v" | "θ" }
  | { kind: "selfweight-zero-gamma";   severity: "warning"; sectionIds: SectionId[] }
  | { kind: "duplicate-members";       severity: "warning"; count: number }

export type AnalysisStatus = "determinate" | "indeterminate" | "unstable"

export interface DiagnosticsReport {
  status: AnalysisStatus
  issues: DiagnosticIssue[]
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Build a diagnostics report from the model alone (no solver call).
 *
 * Singular-DOF errors are merged in separately at the App layer once the
 * solver has run — they require access to `caseResults` and the DOF→node
 * mapping. See `dofToLocation` below.
 */
export function runDiagnostics(model: StructureModel): DiagnosticsReport {
  const issues: DiagnosticIssue[] = []

  const nodes    = Object.values(model.nodes)
  const members  = Object.values(model.members)
  const supports = Object.values(model.supports)

  // ── Empty-model checks ──
  if (nodes.length === 0)    issues.push({ kind: "no-nodes",    severity: "error" })
  if (members.length === 0)  issues.push({ kind: "no-members",  severity: "error" })
  if (supports.length === 0) issues.push({ kind: "no-supports", severity: "error" })

  // Reaction count (skip if no supports — already reported).
  const r = supports.reduce(
    (sum, s) => sum + (s.type === "fixed" ? 3 : s.type === "pin" ? 2 : 1),
    0,
  )
  if (supports.length > 0 && r < 3) {
    issues.push({ kind: "insufficient-reactions", severity: "error", have: r })
  }

  // ── Connectivity (skip when there's nothing meaningful to connect) ──
  if (nodes.length > 0 && members.length > 0) {
    const supportedNodeIds = new Set(supports.map((s) => s.nodeId))
    if (hasDisconnectedComponent(model, supportedNodeIds)) {
      issues.push({ kind: "disconnected-component", severity: "error" })
    }
  }

  // ── γ=0 warning (informational, doesn't block) ──
  const zeroGamma = findZeroGammaSections(model)
  if (zeroGamma.length > 0) {
    issues.push({ kind: "selfweight-zero-gamma", severity: "warning", sectionIds: zeroGamma })
  }

  // ── Duplicate-member detection (defensive, doesn't block) ──
  // Two or more members on the same node pair (order-independent) get their
  // stiffness added together inside the global K, which is almost never what
  // the user intended. Templates and the user-facing MEMBER tool both guard
  // against this, but file imports or future template regressions could
  // sneak duplicates in — surface them as a warning so the cause is visible.
  // Cost: O(m), microseconds even on large models.
  const pairCounts = new Map<string, number>()
  let duplicateCount = 0
  for (const mem of members) {
    const key = mem.a < mem.b ? `${mem.a}|${mem.b}` : `${mem.b}|${mem.a}`
    const prev = pairCounts.get(key) ?? 0
    pairCounts.set(key, prev + 1)
    if (prev === 1) duplicateCount++
  }
  if (duplicateCount > 0) {
    issues.push({ kind: "duplicate-members", severity: "warning", count: duplicateCount })
  }

  // ── Status classification ──
  const hasError = issues.some((i) => i.severity === "error")
  let status: AnalysisStatus
  if (hasError) {
    status = "unstable"
  } else {
    // Pick the determinacy formula based on structural type. The classical
    // truss formula `m + r vs 2j` only applies when every member is a truss
    // (joints physically have 2 DOFs, members carry only N). Otherwise — pure
    // frame or mixed — fall back to the frame formula `3m + r vs 3j`. The
    // mixed case is approximate (it counts a truss member as if it carried
    // 3 internal forces) but agrees with the frame formula at the
    // determinate/indeterminate boundary for all realistic structures in
    // this app. See the v1.0.6 design discussion for the full case analysis.
    const m = members.length
    const j = nodes.length
    const allTruss = m > 0 && members.every((mem) => mem.memberType === "truss")
    if (allTruss) {
      // Pure-truss textbook formula. m + r < 2j (mechanism) is left to the
      // solver/topology checks above — if we reach here, there's no error.
      status = m + r > 2 * j ? "indeterminate" : "determinate"
    } else {
      status = 3 * m + r > 3 * j ? "indeterminate" : "determinate"
    }
  }

  return { status, issues }
}

/**
 * Translate a global DOF index (0..3j-1) into (nodeId, direction).
 * DOFs are laid out as [u, v, θ] per node in nodeIds order — this must match
 * the ordering used inside `analyze()` in solver.ts.
 */
export function dofToLocation(
  dofIndex: number,
  nodeIds: NodeId[],
): { nodeId: NodeId; direction: "u" | "v" | "θ" } {
  const nodeIdx = Math.floor(dofIndex / 3)
  const dirIdx  = dofIndex % 3
  return {
    nodeId: nodeIds[nodeIdx] ?? "",
    direction: dirIdx === 0 ? "u" : dirIdx === 1 ? "v" : "θ",
  }
}

/**
 * Sections that are referenced by at least one member AND have no positive
 * unit weight. These will contribute zero self-weight body force in the
 * selfweight case slice (see analysis-pipeline.ts::solveCase("selfweight")).
 */
export function findZeroGammaSections(model: StructureModel): SectionId[] {
  const referenced = new Set<SectionId>()
  for (const m of Object.values(model.members)) referenced.add(m.section)
  const out: SectionId[] = []
  for (const sid of referenced) {
    const sec = model.sections[sid]
    if (!sec) continue
    if ((sec.gamma ?? 0) <= 0) out.push(sid)
  }
  return out
}

// ── Internals ────────────────────────────────────────────────────────────────

/**
 * Union-find over members. Every connected component must touch a supported
 * node. Returns true if any component is fully unsupported (a floating
 * substructure). Cost: O((j + m) · α(j)) — microseconds even on large models.
 *
 * Isolated nodes (no member touches them) only count as "disconnected" if
 * they are also unsupported. A supported isolated node is structurally
 * useless but not a mechanism by this definition — solver will simply ignore
 * it. The intent of this check is to catch *floating subassemblies*, the
 * common user mistake of deleting a member and leaving an island.
 */
function hasDisconnectedComponent(
  model: StructureModel,
  supportedNodeIds: Set<NodeId>,
): boolean {
  const nodeIds = Object.keys(model.nodes)
  const parent: Record<NodeId, NodeId> = {}
  for (const id of nodeIds) parent[id] = id

  const find = (x: NodeId): NodeId => {
    let root = x
    while (parent[root] !== root) root = parent[root]
    // path compression
    let cur = x
    while (parent[cur] !== root) {
      const next = parent[cur]
      parent[cur] = root
      cur = next
    }
    return root
  }
  const union = (a: NodeId, b: NodeId) => {
    const ra = find(a), rb = find(b)
    if (ra !== rb) parent[ra] = rb
  }

  for (const m of Object.values(model.members)) {
    if (parent[m.a] !== undefined && parent[m.b] !== undefined) {
      union(m.a, m.b)
    }
  }

  // Bucket nodes by root; report unsupported components.
  const rootHasSupport = new Map<NodeId, boolean>()
  for (const id of nodeIds) {
    const root = find(id)
    if (!rootHasSupport.has(root)) rootHasSupport.set(root, false)
    if (supportedNodeIds.has(id)) rootHasSupport.set(root, true)
  }

  for (const supported of rootHasSupport.values()) {
    if (!supported) return true
  }
  return false
}

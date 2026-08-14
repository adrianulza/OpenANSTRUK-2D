import type { MultiSelection, StructureModel } from "@/lib/model"

export type BoxDirection = "window" | "crossing"

// Liang–Barsky segment-vs-axis-aligned-rect test.
// Returns true if the segment from (x1,y1) to (x2,y2) intersects (or lies inside) the rectangle.
function segmentIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  minX: number, minY: number, maxX: number, maxY: number,
): boolean {
  // Quick accept: either endpoint inside the rect
  if (x1 >= minX && x1 <= maxX && y1 >= minY && y1 <= maxY) return true
  if (x2 >= minX && x2 <= maxX && y2 >= minY && y2 <= maxY) return true

  let t0 = 0, t1 = 1
  const dx = x2 - x1, dy = y2 - y1
  const ps = [-dx, dx, -dy, dy]
  const qs = [x1 - minX, maxX - x1, y1 - minY, maxY - y1]
  for (let i = 0; i < 4; i++) {
    const p = ps[i], q = qs[i]
    if (p === 0) {
      if (q < 0) return false
    } else {
      const t = q / p
      if (p < 0) {
        if (t > t1) return false
        if (t > t0) t0 = t
      } else {
        if (t < t0) return false
        if (t < t1) t1 = t
      }
    }
  }
  return true
}

function normRect(wx1: number, wy1: number, wx2: number, wy2: number) {
  return {
    minX: Math.min(wx1, wx2),
    maxX: Math.max(wx1, wx2),
    minY: Math.min(wy1, wy2),
    maxY: Math.max(wy1, wy2),
  }
}

// Direction is encoded by the caller via the sign of (wx2 - wx1):
// positive = left→right (window), negative = right→left (crossing).
// Use `directionFromBox` at call sites.
export function directionFromBox(wx1: number, wx2: number): BoxDirection {
  return wx2 >= wx1 ? "window" : "crossing"
}

export function computeBoxSelection(
  model: StructureModel,
  wx1: number, wy1: number, wx2: number, wy2: number,
  direction: BoxDirection = "window",
): MultiSelection {
  const { minX, maxX, minY, maxY } = normRect(wx1, wy1, wx2, wy2)
  const memberIds: string[] = []
  const supportNodeIds: string[] = []

  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY

  for (const m of Object.values(model.members)) {
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (!a || !b) continue
    if (direction === "window") {
      if (inside(a.x, a.y) && inside(b.x, b.y)) memberIds.push(m.id)
    } else {
      if (segmentIntersectsRect(a.x, a.y, b.x, b.y, minX, minY, maxX, maxY)) memberIds.push(m.id)
    }
  }

  for (const s of Object.values(model.supports)) {
    const n = model.nodes[s.nodeId]
    if (n && inside(n.x, n.y)) supportNodeIds.push(s.nodeId)
  }

  return { nodeIds: [], memberIds, supportNodeIds }
}

export function computeBoxSelectionWithNodes(
  model: StructureModel,
  wx1: number, wy1: number, wx2: number, wy2: number,
  direction: BoxDirection = "window",
): MultiSelection {
  const { minX, maxX, minY, maxY } = normRect(wx1, wy1, wx2, wy2)
  const nodeIds: string[] = []
  const memberIds: string[] = []
  const supportNodeIds: string[] = []

  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY

  for (const n of Object.values(model.nodes)) {
    if (inside(n.x, n.y)) nodeIds.push(n.id)
  }

  for (const m of Object.values(model.members)) {
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (!a || !b) continue
    if (direction === "window") {
      if (inside(a.x, a.y) && inside(b.x, b.y)) memberIds.push(m.id)
    } else {
      if (segmentIntersectsRect(a.x, a.y, b.x, b.y, minX, minY, maxX, maxY)) memberIds.push(m.id)
    }
  }

  for (const s of Object.values(model.supports)) {
    const n = model.nodes[s.nodeId]
    if (n && inside(n.x, n.y)) supportNodeIds.push(s.nodeId)
  }

  return { nodeIds, memberIds, supportNodeIds }
}

// Select every node inside the box, split into bare nodes vs nodes-with-support.
// Used by the SUPPORT tool's rectangular selection. Direction-agnostic — nodes
// are points, so window and crossing behave identically.
export function computeBoxSelectionSupportTool(
  model: StructureModel,
  wx1: number, wy1: number, wx2: number, wy2: number,
): MultiSelection {
  const { minX, maxX, minY, maxY } = normRect(wx1, wy1, wx2, wy2)
  const nodeIds: string[] = []
  const supportNodeIds: string[] = []

  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY

  for (const n of Object.values(model.nodes)) {
    if (!inside(n.x, n.y)) continue
    if (model.supports[n.id]) supportNodeIds.push(n.id)
    else nodeIds.push(n.id)
  }

  return { nodeIds, memberIds: [], supportNodeIds }
}

// Select only nodes inside the box (no supports/members). Used by MOVE_NODE.
export function computeBoxSelectionNodesOnly(
  model: StructureModel,
  wx1: number, wy1: number, wx2: number, wy2: number,
): string[] {
  const { minX, maxX, minY, maxY } = normRect(wx1, wy1, wx2, wy2)
  const out: string[] = []
  for (const n of Object.values(model.nodes)) {
    if (n.x >= minX && n.x <= maxX && n.y >= minY && n.y <= maxY) out.push(n.id)
  }
  return out
}

export interface LoadFilter {
  /** If set, only loads of this type are considered. */
  type?: "point" | "distributed"
}

export function computeBoxSelectionLoads(
  model: StructureModel,
  wx1: number, wy1: number, wx2: number, wy2: number,
  direction: BoxDirection = "window",
  filter: LoadFilter = {},
): string[] {
  const { minX, maxX, minY, maxY } = normRect(wx1, wy1, wx2, wy2)
  const inside = (x: number, y: number) => x >= minX && x <= maxX && y >= minY && y <= maxY

  const result: string[] = []

  for (const load of Object.values(model.loads)) {
    if (filter.type && load.type !== filter.type) continue

    if (load.type === "point") {
      const node = model.nodes[load.nodeId]
      if (node && inside(node.x, node.y)) result.push(load.id)
    } else if (load.type === "distributed") {
      const member = model.members[load.memberId]
      if (!member) continue
      const a = model.nodes[member.a]
      const b = model.nodes[member.b]
      if (!a || !b) continue
      if (direction === "window") {
        if (inside(a.x, a.y) && inside(b.x, b.y)) result.push(load.id)
      } else {
        if (segmentIntersectsRect(a.x, a.y, b.x, b.y, minX, minY, maxX, maxY)) result.push(load.id)
      }
    }
  }

  return result
}

import type { MultiSelection, StructureModel } from "@/lib/model"

export function computeBoxSelection(
  model: StructureModel,
  wx1: number, wy1: number, wx2: number, wy2: number,
): MultiSelection {
  const minX = Math.min(wx1, wx2)
  const maxX = Math.max(wx1, wx2)
  const minY = Math.min(wy1, wy2)
  const maxY = Math.max(wy1, wy2)

  const memberIds: string[] = []
  const supportNodeIds: string[] = []

  const inside = (x: number, y: number) =>
    x >= minX && x <= maxX && y >= minY && y <= maxY

  for (const m of Object.values(model.members)) {
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (a && b && inside(a.x, a.y) && inside(b.x, b.y)) memberIds.push(m.id)
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
): MultiSelection {
  const minX = Math.min(wx1, wx2)
  const maxX = Math.max(wx1, wx2)
  const minY = Math.min(wy1, wy2)
  const maxY = Math.max(wy1, wy2)

  const nodeIds: string[] = []
  const memberIds: string[] = []
  const supportNodeIds: string[] = []

  const inside = (x: number, y: number) =>
    x >= minX && x <= maxX && y >= minY && y <= maxY

  for (const n of Object.values(model.nodes)) {
    if (inside(n.x, n.y)) nodeIds.push(n.id)
  }

  for (const m of Object.values(model.members)) {
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (a && b && inside(a.x, a.y) && inside(b.x, b.y)) memberIds.push(m.id)
  }

  for (const s of Object.values(model.supports)) {
    const n = model.nodes[s.nodeId]
    if (n && inside(n.x, n.y)) supportNodeIds.push(s.nodeId)
  }

  return { nodeIds, memberIds, supportNodeIds }
}

export function computeBoxSelectionLoads(
  model: StructureModel,
  wx1: number, wy1: number, wx2: number, wy2: number,
): string[] {
  const minX = Math.min(wx1, wx2)
  const maxX = Math.max(wx1, wx2)
  const minY = Math.min(wy1, wy2)
  const maxY = Math.max(wy1, wy2)

  const inside = (x: number, y: number) =>
    x >= minX && x <= maxX && y >= minY && y <= maxY

  const result: string[] = []

  for (const load of Object.values(model.loads)) {
    if (load.type === "point") {
      const node = model.nodes[load.nodeId]
      if (node && inside(node.x, node.y)) result.push(load.id)
    } else if (load.type === "distributed") {
      const member = model.members[load.memberId]
      if (!member) continue
      const a = model.nodes[member.a]
      const b = model.nodes[member.b]
      if (!a || !b) continue
      const minMx = Math.min(a.x, b.x), maxMx = Math.max(a.x, b.x)
      const minMy = Math.min(a.y, b.y), maxMy = Math.max(a.y, b.y)
      if (maxMx >= minX && minMx <= maxX && maxMy >= minY && minMy <= maxY) {
        result.push(load.id)
      }
    }
  }

  return result
}

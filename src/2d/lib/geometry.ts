/**
 * Coordinate conventions:
 *  - World space:  metres, Y-axis points up (right-hand).
 *  - Screen space: pixels, Y-axis points down, origin at canvas top-left.
 *  - worldToScreen / screenToWorld perform the Y-flip and scaling.
 */
import type { MemberId, NodeId, StructureModel } from "./model"
import { newMemberId, newNodeId } from "./model"
import {
  SCALE as _SCALE,
  GRID as _GRID,
  SNAP as _SNAP,
  HIT_TOL_NODE,
  HIT_TOL_MEMBER,
  HIT_TOL_NODE_SNAP,
  MEMBER_T_MIN,
  MEMBER_T_MAX,
} from "./constants"

// Re-export so existing consumers (`import { SCALE } from "@/lib/geometry"`) keep working.
export const SCALE = _SCALE
export const GRID  = _GRID
export const SNAP  = _SNAP

const SEED_BEAM_LENGTH   = 5 * SCALE
const SEED_COLUMN_HEIGHT = 3 * SCALE

export interface Rect {
  width: number
  height: number
}

export interface ScreenPoint {
  sx: number
  sy: number
}

export interface WorldPoint {
  x: number
  y: number
}

export function axisCenter(rect: Rect): ScreenPoint {
  const originX = Math.floor((rect.width / 2 - SEED_BEAM_LENGTH / 2) / GRID) * GRID
  const originY = Math.floor((rect.height / 2 + SEED_COLUMN_HEIGHT / 2) / GRID) * GRID
  return { sx: originX + SEED_BEAM_LENGTH / 2, sy: originY }
}

export function worldToScreen(p: WorldPoint, rect: Rect): ScreenPoint {
  const c = axisCenter(rect)
  return { sx: c.sx + p.x * SCALE, sy: c.sy - p.y * SCALE }
}

export function screenToWorld(p: ScreenPoint, rect: Rect): WorldPoint {
  const c = axisCenter(rect)
  return { x: (p.sx - c.sx) / SCALE, y: (c.sy - p.sy) / SCALE }
}

export function snap(v: number, step: number = SNAP): number {
  return Math.round(v / step) * step
}

export function snapWorld(p: WorldPoint, step: number = SNAP): WorldPoint {
  return { x: snap(p.x, step), y: snap(p.y, step) }
}

export function hitTestNode(
  model: StructureModel,
  w: WorldPoint,
  tol: number = HIT_TOL_NODE
): NodeId | null {
  let best: { id: NodeId; d: number } | null = null
  for (const n of Object.values(model.nodes)) {
    const d = Math.hypot(n.x - w.x, n.y - w.y)
    if (d <= tol && (!best || d < best.d)) best = { id: n.id, d }
  }
  return best ? best.id : null
}

export function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number) {
  const vx = bx - ax
  const vy = by - ay
  const len2 = vx * vx + vy * vy
  if (len2 < Number.EPSILON) return { d: Math.hypot(px - ax, py - ay), t: 0 }
  let t = ((px - ax) * vx + (py - ay) * vy) / len2
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * vx
  const cy = ay + t * vy
  return { d: Math.hypot(px - cx, py - cy), t }
}

export function hitTestMember(
  model: StructureModel,
  w: WorldPoint,
  tol: number = HIT_TOL_MEMBER
): MemberId | null {
  let best: { id: MemberId; d: number } | null = null
  for (const m of Object.values(model.members)) {
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (!a || !b) continue
    const { d, t } = pointSegDist(w.x, w.y, a.x, a.y, b.x, b.y)
    // exclude endpoints so node hit wins on joint clicks
    if (t > MEMBER_T_MIN && t < MEMBER_T_MAX && d <= tol && (!best || d < best.d)) {
      best = { id: m.id, d }
    }
  }
  return best ? best.id : null
}

export function findNodeAt(model: StructureModel, w: WorldPoint, tol = HIT_TOL_NODE_SNAP): NodeId | null {
  for (const n of Object.values(model.nodes)) {
    if (Math.hypot(n.x - w.x, n.y - w.y) <= tol) return n.id
  }
  return null
}

export function addNode(model: StructureModel, w: WorldPoint): { model: StructureModel; id: NodeId } {
  const id = newNodeId()
  const nodes = { ...model.nodes, [id]: { id, x: w.x, y: w.y } }
  return { model: { ...model, nodes }, id }
}

export function splitMember(
  model: StructureModel,
  memberId: MemberId,
  nodeId: NodeId
): StructureModel {
  const m = model.members[memberId]
  if (!m) return model
  const members = { ...model.members }
  delete members[memberId]
  const m1: { id: MemberId } = { id: newMemberId() }
  const m2: { id: MemberId } = { id: newMemberId() }
  members[m1.id] = { id: m1.id, a: m.a, b: nodeId, section: m.section }
  members[m2.id] = { id: m2.id, a: nodeId, b: m.b, section: m.section }
  return { ...model, members }
}

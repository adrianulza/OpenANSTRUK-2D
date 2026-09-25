import type { StructureModel, NodeId } from "@/lib/model"
import type { AnalysisResult } from "@/lib/solver"
import { worldToScreen, type Rect } from "@/lib/geometry"
import { memberPointDisplacement, LIVE_SPLINE_PTS, type LiveSystem } from "@/lib/live-solver"
import { drawSupportGlyph } from "@/canvas/support-glyph"
import { COLOR_SFD_POS, COLOR_SFD_NEG, COLOR_BMD_FILL } from "@/lib/constants"

// ── Live-mode draw primitives ────────────────────────────────────────────────
//
// All functions draw in the canvas's virtual space (the caller has applied the
// pan/zoom transform), and take `s`, the adaptive-view size factor, so strokes
// and text keep a constant on-screen size like the rest of the canvas.

const COLOR_DEFORMED = "#7c3aed"
// Applied load: orange, the palette's COLOR_BMD_FILL, with a darker edge.
const COLOR_LOAD = COLOR_BMD_FILL
const COLOR_LOAD_LIGHT = "#fb923c"
const COLOR_LOAD_EDGE = "#c2410c"
const COLOR_GRAB = "#7c3aed"
const COLOR_REACTION_POS = "#2563eb"
const COLOR_REACTION_NEG = "#ef4444"
const LABEL_FONT = (s: number, weight = 500) => `${weight} ${11 * s}px 'JetBrains Mono', monospace`

/** Deformed position of a node (virtual screen coords), displacement scaled by k. */
export function deformedNodeScreen(
  model: StructureModel,
  result: AnalysisResult | null,
  nodeId: NodeId,
  k: number,
  rect: Rect,
) {
  const n = model.nodes[nodeId]
  const d = result?.nodeDisplacements[nodeId]
  if (!n) return null
  return worldToScreen({ x: n.x + k * (d?.u ?? 0), y: n.y + k * (d?.v ?? 0) }, rect)
}

/**
 * The squishy structure: every member along its deformed shape (cubic Hermite
 * for frames, straight for pin-ended trusses). Truss members are tinted blue
 * for tension and red for compression, darker as |N| approaches the reference.
 */
export function drawLiveDeformed(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  model: StructureModel,
  sys: LiveSystem,
  shape: AnalysisResult | null,
  k: number,
  s: number,
  forces: AnalysisResult | null,
) {
  // At rest (nothing pulled) the structure is simply drawn undeformed.
  const ZERO = { u: 0, v: 0, theta: 0 }
  ctx.save()
  ctx.lineCap = "round"
  ctx.lineJoin = "round"
  for (const m of sys.members) {
    const nA = model.nodes[m.a]
    const dA = shape?.nodeDisplacements[m.a] ?? ZERO
    const dB = shape?.nodeDisplacements[m.b] ?? ZERO
    if (!nA) continue

    let color = COLOR_DEFORMED
    let alpha = 1
    if (m.isTruss && forces) {
      const N = forces.memberEndForces[m.id]?.N1 ?? 0
      const t = sys.refs.N > 1e-9 ? Math.min(Math.abs(N) / sys.refs.N, 1) : 0
      if (t > 0.01) {
        color = N >= 0 ? COLOR_SFD_POS : COLOR_SFD_NEG
        alpha = 0.45 + 0.55 * t
      }
    }
    ctx.strokeStyle = color
    ctx.globalAlpha = alpha
    ctx.lineWidth = (m.isTruss ? 3 : 3.5) * s
    ctx.beginPath()
    const steps = m.isTruss ? 1 : LIVE_SPLINE_PTS
    for (let p = 0; p <= steps; p++) {
      const xi = p / steps
      const d = memberPointDisplacement(m.L, m.c, m.s, m.isTruss, dA, dB, xi)
      const pt = worldToScreen(
        { x: nA.x + xi * m.L * m.c + k * d.dx, y: nA.y + xi * m.L * m.s + k * d.dy },
        rect,
      )
      if (p === 0) ctx.moveTo(pt.sx, pt.sy)
      else ctx.lineTo(pt.sx, pt.sy)
    }
    ctx.stroke()
  }
  ctx.globalAlpha = 1

  // Joints ride along with the structure.
  for (const id of sys.nodeIds) {
    const p = deformedNodeScreen(model, shape, id, k, rect)
    if (!p) continue
    ctx.beginPath()
    ctx.arc(p.sx, p.sy, 4 * s, 0, Math.PI * 2)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    ctx.strokeStyle = COLOR_DEFORMED
    ctx.lineWidth = 2 * s
    ctx.stroke()
  }

  // Rollers slide with their node.
  for (const sup of Object.values(model.supports)) {
    if (sup.type !== "roller") continue
    const p = deformedNodeScreen(model, shape, sup.nodeId, k, rect)
    if (p) drawSupportGlyph(ctx, p.sx, p.sy, "roller", false, COLOR_DEFORMED, s)
  }
  ctx.restore()
}

/**
 * Reaction arrows whose length is proportional to the reaction (frozen
 * reference), so they visibly grow, shrink and flip with the pull.
 */
export function drawLiveReactions(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  model: StructureModel,
  result: AnalysisResult,
  refR: number,
  s: number,
  fmtForce: (v: number) => string,
  fmtMoment: (v: number) => string,
) {
  if (refR <= 1e-9) return
  const MAX = 70 * s
  const MIN = 10 * s
  const GAP = 30 * s        // clears the support glyph
  const HEAD = 10 * s
  const len = (v: number) => MIN + (MAX - MIN) * Math.min(Math.abs(v) / refR, 1)
  const visible = (v: number) => Math.abs(v) > 0.005 * refR

  ctx.save()
  ctx.font = LABEL_FONT(s)
  for (const [nodeId, r] of Object.entries(result.reactions)) {
    const node = model.nodes[nodeId]
    if (!node) continue
    const { sx, sy } = worldToScreen(node, rect)

    // A reaction arrow points in the direction the support pushes on the structure.
    const arrow = (dirX: number, dirY: number, value: number, label: string) => {
      const L = len(value)
      const color = value >= 0 ? COLOR_REACTION_POS : COLOR_REACTION_NEG
      // Tail sits away from the node on the side opposite the push.
      const tipX = sx - dirX * GAP, tipY = sy - dirY * GAP
      const tailX = tipX - dirX * L, tailY = tipY - dirY * L
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 2.5 * s
      ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(tipX, tipY); ctx.stroke()
      const ang = Math.atan2(dirY, dirX)
      ctx.beginPath()
      ctx.moveTo(tipX, tipY)
      ctx.lineTo(tipX - HEAD * Math.cos(ang - 0.45), tipY - HEAD * Math.sin(ang - 0.45))
      ctx.lineTo(tipX - HEAD * Math.cos(ang + 0.45), tipY - HEAD * Math.sin(ang + 0.45))
      ctx.closePath(); ctx.fill()
      ctx.textAlign = dirX !== 0 ? (dirX > 0 ? "right" : "left") : "center"
      ctx.textBaseline = dirY !== 0 ? (dirY > 0 ? "bottom" : "top") : "middle"
      ctx.fillText(label, tailX - dirX * 4 * s, tailY - dirY * 4 * s)
    }

    // Screen y points down, so an upward (+Ry) push is dirY = −1.
    if (visible(r.Ry)) arrow(0, r.Ry >= 0 ? -1 : 1, r.Ry, fmtForce(r.Ry))
    if (visible(r.Rx)) arrow(r.Rx >= 0 ? 1 : -1, 0, r.Rx, fmtForce(r.Rx))
    if (visible(r.Mz)) {
      // Arc radius grows with |Mz|; CCW on the page for a positive (CCW) moment.
      const color = r.Mz >= 0 ? COLOR_REACTION_POS : COLOR_REACTION_NEG
      const R = 12 * s + 14 * s * Math.min(Math.abs(r.Mz) / refR, 1)
      const ccw = r.Mz >= 0
      const a0 = Math.PI * 0.15, a1 = Math.PI * 1.35
      ctx.strokeStyle = color
      ctx.fillStyle = color
      ctx.lineWidth = 2.5 * s
      ctx.beginPath()
      // Canvas angles run clockwise on screen, so a CCW sweep uses negative angles.
      ctx.arc(sx, sy, R, ccw ? -a0 : a0, ccw ? -a1 : a1, ccw)
      ctx.stroke()
      const end = ccw ? -a1 : a1
      const ex = sx + R * Math.cos(end), ey = sy + R * Math.sin(end)
      const tangent = end + (ccw ? -Math.PI / 2 : Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(ex + HEAD * 0.9 * Math.cos(tangent), ey + HEAD * 0.9 * Math.sin(tangent))
      ctx.lineTo(ex + HEAD * 0.5 * Math.cos(tangent + 2.2), ey + HEAD * 0.5 * Math.sin(tangent + 2.2))
      ctx.lineTo(ex + HEAD * 0.5 * Math.cos(tangent - 2.2), ey + HEAD * 0.5 * Math.sin(tangent - 2.2))
      ctx.closePath(); ctx.fill()
      ctx.textAlign = "left"
      ctx.textBaseline = "bottom"
      ctx.fillText(fmtMoment(r.Mz), sx + R + 4 * s, sy - R)
    }
  }
  ctx.restore()
}

/**
 * The applied load, drawn as the rope itself: a tapered orange arrow whose
 * tail is a point at the node and whose head sits on the finger / cursor.
 * The body widens steadily from the tail to the head, so it reads as the pull
 * flowing out of the node toward the hand.
 *
 * `scale` (0 → 1, eased by the caller) is P / P_max and sets how fat the
 * arrow is; its length is simply the rope, so past the cap the arrow keeps
 * following the finger but stops getting thicker. While `animate` is on,
 * chevrons flow from the node toward the head (faster for a harder pull) and
 * the arrow breathes with a glow once the force is capped.
 */
export function drawLoadArrow(
  ctx: CanvasRenderingContext2D,
  node: { sx: number; sy: number },
  cursor: { sx: number; sy: number },
  force: { px: number; py: number; P: number; capped: boolean },
  scale: number,
  snapped: boolean,
  label: string,
  s: number,
  t: number,
  animate: boolean,
) {
  const ropeLen = Math.hypot(cursor.sx - node.sx, cursor.sy - node.sy)
  if (force.P <= 1e-9 || ropeLen < 4 * s) return
  const k = Math.min(Math.max(scale, 0), 1)

  // Direction: straight at the cursor, unless the angle is snapped, in which
  // case the arrow follows the snapped force (screen y points down).
  const ux = snapped ? force.px / force.P : (cursor.sx - node.sx) / ropeLen
  const uy = snapped ? -force.py / force.P : (cursor.sy - node.sy) / ropeLen
  const total = ropeLen

  // Thickness grows with the force; a short rope shrinks the head to fit.
  const HEAD_W = (20 + 22 * k) * s
  const HEAD_L = Math.min((18 + 16 * k) * s, total * 0.45)
  const BODY_W = HEAD_W * 0.55     // body width where it meets the head
  const TAIL_W = 1.5 * s           // nearly a point at the node
  const bodyL = total - HEAD_L

  ctx.save()
  // Local frame: origin at the node (tail), +x toward the head.
  ctx.translate(node.sx, node.sy)
  ctx.rotate(Math.atan2(uy, ux))

  const outline = () => {
    ctx.beginPath()
    ctx.moveTo(0, -TAIL_W / 2)
    ctx.lineTo(bodyL, -BODY_W / 2)
    ctx.lineTo(bodyL, -HEAD_W / 2)
    ctx.lineTo(total, 0)
    ctx.lineTo(bodyL, HEAD_W / 2)
    ctx.lineTo(bodyL, BODY_W / 2)
    ctx.lineTo(0, TAIL_W / 2)
    ctx.closePath()
  }

  const pulse = force.capped && animate ? 0.5 + 0.5 * Math.sin((t / 1000) * 2 * Math.PI * 2) : 0
  ctx.shadowColor = force.capped ? `rgba(249,115,22,${0.45 + 0.35 * pulse})` : "rgba(15,23,42,0.25)"
  ctx.shadowBlur = (force.capped ? 10 + 10 * pulse : 6) * s
  ctx.shadowOffsetY = force.capped ? 0 : 2 * s
  const grad = ctx.createLinearGradient(0, 0, total, 0)
  grad.addColorStop(0, COLOR_LOAD_LIGHT)
  grad.addColorStop(1, COLOR_LOAD)
  ctx.fillStyle = grad
  outline()
  ctx.fill()
  ctx.shadowColor = "transparent"

  // Chevrons flowing from the node toward the head, clipped to the body and
  // sized to the local body width so they follow the taper.
  if (bodyL > 12 * s) {
    ctx.save()
    ctx.beginPath()
    ctx.moveTo(0, -TAIL_W / 2)
    ctx.lineTo(bodyL, -BODY_W / 2)
    ctx.lineTo(bodyL, BODY_W / 2)
    ctx.lineTo(0, TAIL_W / 2)
    ctx.closePath()
    ctx.clip()
    const pitch = 16 * s
    const speed = animate ? (40 + 140 * k) * s : 0 // px per second
    const offset = ((t / 1000) * speed) % pitch
    ctx.strokeStyle = "rgba(255,255,255,0.5)"
    ctx.lineWidth = 2.5 * s
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    for (let x = offset; x < bodyL + pitch; x += pitch) {
      const halfW = (TAIL_W + (BODY_W - TAIL_W) * Math.min(x / bodyL, 1)) / 2
      const arm = halfW * 0.65
      ctx.beginPath()
      ctx.moveTo(x - arm * 0.8, -arm)
      ctx.lineTo(x, 0)
      ctx.lineTo(x - arm * 0.8, arm)
      ctx.stroke()
    }
    ctx.restore()
  }

  ctx.strokeStyle = COLOR_LOAD_EDGE
  ctx.lineWidth = 1.5 * s
  ctx.lineJoin = "round"
  outline()
  ctx.stroke()
  ctx.restore()

  // Label pill beside the middle of the arrow, on the upper side of the screen
  // so it never sits under the hand holding the head.
  ctx.save()
  ctx.font = LABEL_FONT(s, 700)
  let nx = -uy, ny = ux                      // a perpendicular to the arrow
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) { nx = -nx; ny = -ny }
  const w = ctx.measureText(label).width
  const padX = 6 * s, h = 20 * s
  const away = HEAD_W / 2 + 8 * s + h / 2
  // Push the pill's centre out far enough that its box clears the arrow body.
  const reach = away + Math.abs(nx) * (w / 2 + padX - h / 2)
  const mx = node.sx + ux * total * 0.5 + nx * reach
  const my = node.sy + uy * total * 0.5 + ny * reach
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.strokeStyle = COLOR_LOAD
  ctx.lineWidth = 1.5 * s
  ctx.beginPath()
  ctx.roundRect(mx - w / 2 - padX, my - h / 2, w + 2 * padX, h, h / 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = COLOR_LOAD_EDGE
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, mx, my + 0.5 * s)
  ctx.restore()
}

/** Rings on every node the rope can attach to; the hovered one is stronger. */
export function drawGrabRings(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  model: StructureModel,
  grabbable: Set<NodeId>,
  hoverId: NodeId | null,
  s: number,
) {
  ctx.save()
  for (const id of grabbable) {
    const n = model.nodes[id]
    if (!n) continue
    const { sx, sy } = worldToScreen(n, rect)
    const hot = id === hoverId
    ctx.beginPath()
    ctx.arc(sx, sy, (hot ? 12 : 9) * s, 0, Math.PI * 2)
    ctx.strokeStyle = COLOR_GRAB
    ctx.globalAlpha = hot ? 0.9 : 0.35
    ctx.lineWidth = (hot ? 2.5 : 1.5) * s
    ctx.stroke()
    if (hot) {
      ctx.globalAlpha = 0.12
      ctx.fillStyle = COLOR_GRAB
      ctx.fill()
    }
  }
  ctx.restore()
}

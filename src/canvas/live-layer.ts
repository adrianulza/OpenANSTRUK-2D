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
const COLOR_ROPE = "#475569"
const COLOR_ROPE_TAUT = "#c2410c"
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
 * The rope: a thin line from the (deformed) node to the finger, with a grip
 * dot at the finger. Dashed while it can still stretch the force, solid and
 * darker once the force is capped.
 */
export function drawRope(
  ctx: CanvasRenderingContext2D,
  node: { sx: number; sy: number },
  cursor: { sx: number; sy: number },
  capped: boolean,
  s: number,
) {
  ctx.save()
  ctx.lineCap = "round"
  ctx.strokeStyle = capped ? COLOR_ROPE_TAUT : COLOR_ROPE
  ctx.globalAlpha = capped ? 0.9 : 0.6
  ctx.lineWidth = (capped ? 2 : 1.5) * s
  ctx.setLineDash(capped ? [] : [5 * s, 4 * s])
  ctx.beginPath()
  ctx.moveTo(node.sx, node.sy)
  ctx.lineTo(cursor.sx, cursor.sy)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1
  ctx.beginPath()
  ctx.arc(cursor.sx, cursor.sy, 5 * s, 0, Math.PI * 2)
  ctx.fillStyle = capped ? COLOR_ROPE_TAUT : COLOR_ROPE
  ctx.fill()
  ctx.restore()
}

/**
 * The applied load, drawn the textbook way: a big orange block arrow whose
 * TIP touches the node and which points along the force. The rope pulls the
 * node toward the finger, so the arrow body lies on the far side of the node
 * (it pushes through the node toward the finger). That also keeps it clear of
 * a finger on a touch screen.
 *
 * `scale` (0 → 1, eased by the caller) sets the length. While `animate` is on,
 * chevrons flow along the body toward the tip, faster for a harder pull, and
 * the arrow breathes gently once the force is capped.
 */
export function drawLoadArrow(
  ctx: CanvasRenderingContext2D,
  node: { sx: number; sy: number },
  force: { px: number; py: number; P: number; capped: boolean },
  scale: number,
  label: string,
  s: number,
  t: number,
  animate: boolean,
) {
  if (force.P <= 1e-9 || scale <= 1e-3) return
  const HEAD_L = 28 * s
  const HEAD_W = 38 * s
  const BODY_W = 18 * s
  const MIN_L = 48 * s
  const MAX_L = 160 * s
  const total = MIN_L + (MAX_L - MIN_L) * Math.min(scale, 1)
  const bodyL = total - HEAD_L

  // Unit vector of the force on screen (screen y points down).
  const ux = force.px / force.P
  const uy = -force.py / force.P
  const ang = Math.atan2(uy, ux)

  ctx.save()
  // Local frame: origin at the tip (on the node), +x along the force, so the
  // arrow body runs along −x.
  ctx.translate(node.sx, node.sy)
  ctx.rotate(ang)
  // A small gap so the tip meets the node ring rather than covering it.
  ctx.translate(-5 * s, 0)

  const outline = () => {
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-HEAD_L, -HEAD_W / 2)
    ctx.lineTo(-HEAD_L, -BODY_W / 2)
    ctx.lineTo(-total, -BODY_W / 2)
    ctx.lineTo(-total, BODY_W / 2)
    ctx.lineTo(-HEAD_L, BODY_W / 2)
    ctx.lineTo(-HEAD_L, HEAD_W / 2)
    ctx.closePath()
  }

  // Body: soft shadow lifts it off the diagrams; it glows and breathes at the cap.
  const pulse = force.capped && animate ? 0.5 + 0.5 * Math.sin((t / 1000) * 2 * Math.PI * 2) : 0
  ctx.shadowColor = force.capped ? `rgba(249,115,22,${0.45 + 0.35 * pulse})` : "rgba(15,23,42,0.25)"
  ctx.shadowBlur = (force.capped ? 10 + 10 * pulse : 6) * s
  ctx.shadowOffsetY = force.capped ? 0 : 2 * s
  const grad = ctx.createLinearGradient(-total, 0, 0, 0)
  grad.addColorStop(0, COLOR_LOAD_LIGHT)
  grad.addColorStop(1, COLOR_LOAD)
  ctx.fillStyle = grad
  outline()
  ctx.fill()
  ctx.shadowColor = "transparent"

  // Chevrons flowing toward the tip, clipped to the body.
  if (bodyL > 8 * s) {
    ctx.save()
    ctx.beginPath()
    ctx.rect(-total, -BODY_W / 2, bodyL, BODY_W)
    ctx.clip()
    const pitch = 14 * s
    const speed = animate ? (40 + 140 * Math.min(scale, 1)) * s : 0 // px per second
    const offset = ((t / 1000) * speed) % pitch
    ctx.strokeStyle = "rgba(255,255,255,0.5)"
    ctx.lineWidth = 3 * s
    ctx.lineCap = "round"
    ctx.lineJoin = "round"
    for (let x = -total - pitch + offset; x < -HEAD_L + pitch; x += pitch) {
      ctx.beginPath()
      ctx.moveTo(x - 5 * s, -BODY_W * 0.32)
      ctx.lineTo(x, 0)
      ctx.lineTo(x - 5 * s, BODY_W * 0.32)
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

  // Label pill just beyond the tail, away from the node and the finger.
  ctx.save()
  ctx.font = LABEL_FONT(s, 700)
  const gap = 10 * s
  const tailX = node.sx - ux * (total + 5 * s + gap)
  const tailY = node.sy - uy * (total + 5 * s + gap)
  const w = ctx.measureText(label).width
  const padX = 6 * s, h = 20 * s
  // Anchor the pill so it grows away from the arrow in the arrow's direction.
  const cx = tailX - ux * (w / 2 + padX)
  const cy = tailY - uy * (h / 2)
  ctx.fillStyle = "rgba(255,255,255,0.95)"
  ctx.strokeStyle = COLOR_LOAD
  ctx.lineWidth = 1.5 * s
  ctx.beginPath()
  ctx.roundRect(cx - w / 2 - padX, cy - h / 2, w + 2 * padX, h, h / 2)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = COLOR_LOAD_EDGE
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(label, cx, cy + 0.5 * s)
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

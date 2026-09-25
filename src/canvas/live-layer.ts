import type { StructureModel, NodeId } from "@/lib/model"
import type { AnalysisResult } from "@/lib/solver"
import { worldToScreen, type Rect } from "@/lib/geometry"
import { memberPointDisplacement, LIVE_SPLINE_PTS, type LiveSystem } from "@/lib/live-solver"
import { drawSupportGlyph } from "@/canvas/support-glyph"
import { COLOR_SFD_POS, COLOR_SFD_NEG } from "@/lib/constants"

// ── Live-mode draw primitives ────────────────────────────────────────────────
//
// All functions draw in the canvas's virtual space (the caller has applied the
// pan/zoom transform), and take `s`, the adaptive-view size factor, so strokes
// and text keep a constant on-screen size like the rest of the canvas.

const COLOR_DEFORMED = "#7c3aed"
const COLOR_ROPE = "#475569"
const COLOR_ROPE_TAUT = "#e11d48"
const COLOR_FORCE = "#e11d48"
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
 * The rope and the force arrow. The rope runs from the (deformed) node to the
 * cursor. The bold arrow lies along the force direction, its length linear in
 * P up to ARROW_MAX, so it stops growing when the force is capped while the
 * rope keeps stretching.
 */
export function drawRope(
  ctx: CanvasRenderingContext2D,
  node: { sx: number; sy: number },
  cursor: { sx: number; sy: number },
  force: { px: number; py: number; P: number; capped: boolean },
  pMax: number,
  label: string,
  s: number,
) {
  const ARROW_MAX = 110 * s
  const HEAD = 13 * s
  ctx.save()
  ctx.lineCap = "round"

  // Rope: a thin line, dashed while slack-ish, solid and red when taut at the cap.
  ctx.strokeStyle = force.capped ? COLOR_ROPE_TAUT : COLOR_ROPE
  ctx.globalAlpha = force.capped ? 0.9 : 0.6
  ctx.lineWidth = (force.capped ? 2 : 1.5) * s
  ctx.setLineDash(force.capped ? [] : [5 * s, 4 * s])
  ctx.beginPath()
  ctx.moveTo(node.sx, node.sy)
  ctx.lineTo(cursor.sx, cursor.sy)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.globalAlpha = 1

  // Hand grip at the cursor end.
  ctx.beginPath()
  ctx.arc(cursor.sx, cursor.sy, 5 * s, 0, Math.PI * 2)
  ctx.fillStyle = force.capped ? COLOR_ROPE_TAUT : COLOR_ROPE
  ctx.fill()

  if (force.P > 1e-9) {
    // Screen y is flipped relative to world y.
    const ux = force.px / force.P
    const uy = -force.py / force.P
    const ropeScreen = Math.hypot(cursor.sx - node.sx, cursor.sy - node.sy)
    const L = Math.min((force.P / pMax) * ARROW_MAX, Math.max(ropeScreen, HEAD * 1.2))
    const tipX = node.sx + ux * L
    const tipY = node.sy + uy * L
    ctx.strokeStyle = COLOR_FORCE
    ctx.fillStyle = COLOR_FORCE
    ctx.lineWidth = 4 * s
    ctx.beginPath()
    ctx.moveTo(node.sx, node.sy)
    ctx.lineTo(tipX - ux * HEAD * 0.6, tipY - uy * HEAD * 0.6)
    ctx.stroke()
    const ang = Math.atan2(uy, ux)
    ctx.beginPath()
    ctx.moveTo(tipX, tipY)
    ctx.lineTo(tipX - HEAD * Math.cos(ang - 0.42), tipY - HEAD * Math.sin(ang - 0.42))
    ctx.lineTo(tipX - HEAD * Math.cos(ang + 0.42), tipY - HEAD * Math.sin(ang + 0.42))
    ctx.closePath()
    ctx.fill()

    // Label on the side of the node away from the finger, so a hand on a
    // touch screen never covers it.
    ctx.font = LABEL_FONT(s, 600)
    const lx = node.sx - ux * 16 * s
    const ly = node.sy - uy * 16 * s
    ctx.textAlign = ux > 0.3 ? "right" : ux < -0.3 ? "left" : "center"
    ctx.textBaseline = uy > 0.3 ? "bottom" : uy < -0.3 ? "top" : "middle"
    const w = ctx.measureText(label).width
    const pad = 3 * s
    const h = 14 * s
    const bx = ctx.textAlign === "right" ? lx - w : ctx.textAlign === "left" ? lx : lx - w / 2
    const by = ctx.textBaseline === "bottom" ? ly - h : ctx.textBaseline === "top" ? ly : ly - h / 2
    ctx.fillStyle = "rgba(255,255,255,0.9)"
    ctx.beginPath()
    ctx.roundRect(bx - pad, by - pad / 2, w + 2 * pad, h + pad, 4 * s)
    ctx.fill()
    ctx.fillStyle = COLOR_FORCE
    ctx.fillText(label, lx, ly + (ctx.textBaseline === "bottom" ? -pad / 2 : ctx.textBaseline === "top" ? pad / 2 : 0))
  }
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

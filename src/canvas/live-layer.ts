import type { StructureModel, NodeId } from "@/lib/model"
import type { AnalysisResult, MemberEndForces, NodeDisplacement } from "@/lib/solver"
import { worldToScreen, type Rect } from "@/lib/geometry"
import { memberPointDisplacement, LIVE_SPLINE_PTS, type LiveSystem } from "@/lib/live-solver"
import { COLOR_BRAND, COLOR_SFD_POS, COLOR_SFD_NEG } from "@/lib/constants"
import { LIVE_MOTION, easeOutBack, easeOutBounce, easeOutCubic, clamp01 } from "@/lib/live-physics"
import type { LiveDiagram, LiveReactions } from "@/canvas/use-live-pull"

// ── Live-mode draw primitives ────────────────────────────────────────────────
//
// Live stays inside the OpenANSTRUK palette: the navy model itself bends, the
// diagrams use the Analyze blue and red, reactions are one neutral slate (the
// arrow direction shows the sign), and amber is reserved for the student's
// hand: the rope arrow, grab rings, ripples and the grabbed node.
//
// All functions draw in the canvas's virtual space (the caller has applied the
// pan/zoom transform), and take `s`, the adaptive-view size factor, so strokes
// and text keep a constant on-screen size like the rest of the canvas.

export const COLOR_HAND = "#f59e0b"
const COLOR_HAND_LIGHT = "#fbbf24"
const COLOR_HAND_EDGE = "#b45309"
const COLOR_REACTION = "#475569"
const LABEL_FONT = (s: number, size = 12, weight = 700) => `${weight} ${size * s}px 'JetBrains Mono', monospace`
const ZERO: NodeDisplacement = { u: 0, v: 0, theta: 0 }

const rgba = (hex: string, a: number) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
  return `rgba(${r},${g},${b},${a})`
}

type Member = LiveSystem["members"][number]

/** Value of the selected internal force at x (m) from end A. No distributed load in Live. */
function valueAt(ef: MemberEndForces, x: number, kind: NonNullable<LiveDiagram>): number {
  return kind === "AXIAL" ? ef.N1 : kind === "SHEAR" ? ef.V1 : ef.M1 - ef.V1 * x
}
const refOf = (sys: LiveSystem, kind: NonNullable<LiveDiagram>) =>
  kind === "AXIAL" ? sys.refs.N : kind === "SHEAR" ? sys.refs.V : sys.refs.M

/** Screen points along a member's drawn (deformed) axis. */
function memberPoints(
  model: StructureModel, m: Member, shape: AnalysisResult | null, k: number, rect: Rect, dy: number, n = LIVE_SPLINE_PTS,
): [number, number][] {
  const A = model.nodes[m.a]
  const dA = shape?.nodeDisplacements[m.a] ?? ZERO, dB = shape?.nodeDisplacements[m.b] ?? ZERO
  const pts: [number, number][] = []
  for (let i = 0; i <= n; i++) {
    const xi = i / n
    const d = memberPointDisplacement(m.L, m.c, m.s, m.isTruss, dA, dB, xi)
    const p = worldToScreen({ x: A.x + xi * m.L * m.c + k * d.dx, y: A.y + xi * m.L * m.s + k * d.dy }, rect)
    pts.push([p.sx, p.sy + dy])
  }
  return pts
}

/** Drawn (deformed) position of a node. */
export function deformedNodeScreen(
  model: StructureModel, shape: AnalysisResult | null, nodeId: NodeId, k: number, rect: Rect, dy = 0,
) {
  const n = model.nodes[nodeId]
  if (!n) return null
  const d = shape?.nodeDisplacements[nodeId] ?? ZERO
  const p = worldToScreen({ x: n.x + k * d.u, y: n.y + k * d.v }, rect)
  return { sx: p.sx, sy: p.sy + dy }
}

/** Entrance offset (virtual px): the frame drops onto its supports with a bounce. */
export function entryDrop(entryAt: number, now: number, s: number): number {
  const e = clamp01((now - entryAt) / LIVE_MOTION.entryMs)
  return -(1 - easeOutBounce(e)) * LIVE_MOTION.entryDropPx * s
}

/** The original geometry, as a faint dashed navy outline. */
export function drawLiveGhost(ctx: CanvasRenderingContext2D, rect: Rect, model: StructureModel, sys: LiveSystem, dy: number, s: number) {
  ctx.save()
  ctx.strokeStyle = rgba(COLOR_BRAND, 0.28)
  ctx.lineWidth = 2 * s
  ctx.setLineDash([6 * s, 5 * s])
  ctx.lineCap = "round"
  for (const m of sys.members) {
    const a = worldToScreen(model.nodes[m.a], rect), b = worldToScreen(model.nodes[m.b], rect)
    ctx.beginPath(); ctx.moveTo(a.sx, a.sy + dy); ctx.lineTo(b.sx, b.sy + dy); ctx.stroke()
  }
  ctx.restore()
}

/**
 * The selected diagram, drawn on the original geometry at a frozen reference
 * scale, grown by `grow` (0 → 1). While `morph` is set it blends from the
 * previous kind into the new one, so switching diagrams is a smooth change.
 * One peak label per sign appears once the shape has settled.
 */
export function drawLiveDiagram(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  model: StructureModel,
  sys: LiveSystem,
  result: AnalysisResult,
  kind: NonNullable<LiveDiagram>,
  morph: { from: LiveDiagram; t: number } | null,
  grow: number,
  s: number,
  opts: { invertSFD: boolean; invertBMD: boolean; format: (v: number, kind: NonNullable<LiveDiagram>) => string },
) {
  if (grow <= 0.001) return
  // Pixel offsets of the upper and lower diagram edges (axial is a mirrored band).
  const edges = (kd: NonNullable<LiveDiagram>, ef: MemberEndForces, x: number): [number, number, number] => {
    const v = valueAt(ef, x, kd), r = refOf(sys, kd) || 1
    if (kd === "AXIAL") { const o = (v / r) * 32 * s; return [o, -o, v / r] }
    // Same sides as the Analyze tab: sagging moment on the tension side, shear per the invert setting.
    const side = kd === "MOMENT" ? (opts.invertBMD ? 1 : -1) : (opts.invertSFD ? -1 : 1)
    return [side * (v / r) * 64 * s, 0, v / r]
  }
  const swap = kind === "MOMENT" ? opts.invertBMD : kind === "SHEAR" ? opts.invertSFD : false
  const posC = swap ? COLOR_SFD_NEG : COLOR_SFD_POS, negC = swap ? COLOR_SFD_POS : COLOR_SFD_NEG
  const from = morph?.from ?? null, mk = morph?.t ?? 1
  const N = 40
  const peaks: { v: number; x: number; y: number; ax: number; ay: number }[] = []

  ctx.save()
  for (const m of sys.members) {
    const ef = result.memberEndForces[m.id]
    if (!ef) continue
    const A = model.nodes[m.a]
    const nx = -m.s, ny = -m.c // local-2 on screen (y flipped)
    type P = { ax: number; ay: number; ux: number; uy: number; lx: number; ly: number; sg: number; v: number }
    const pts: P[] = []
    for (let i = 0; i <= N; i++) {
      const x = (i / N) * m.L
      let [u, l, sg] = edges(kind, ef, x)
      if (from && mk < 1) {
        const [u0, l0, s0] = edges(from, ef, x)
        u = u0 + (u - u0) * mk; l = l0 + (l - l0) * mk; sg = s0 + (sg - s0) * mk
      }
      const p = worldToScreen({ x: A.x + m.c * x, y: A.y + m.s * x }, rect)
      pts.push({ ax: p.sx, ay: p.sy, ux: p.sx + nx * u * grow, uy: p.sy + ny * u * grow, lx: p.sx + nx * l * grow, ly: p.sy + ny * l * grow, sg, v: valueAt(ef, x, kind) })
    }
    // Same-sign runs, cut exactly at the zero crossing.
    const runs: P[][] = []
    let cur: P[] = [pts[0]]
    for (let i = 1; i < pts.length; i++) {
      const a = pts[i - 1], b = pts[i]
      if (a.sg * b.sg < 0) {
        const f = a.sg / (a.sg - b.sg)
        const z = { ...a, sg: 0 } as P
        for (const key of ["ax", "ay", "ux", "uy", "lx", "ly"] as const) z[key] = a[key] + (b[key] - a[key]) * f
        cur.push(z); runs.push(cur); cur = [z, b]
      } else cur.push(b)
    }
    runs.push(cur)
    const mirrored = kind === "AXIAL" || from === "AXIAL"
    for (const run of runs) {
      const mid = run[Math.floor(run.length / 2)]
      const color = (mid.sg || run[run.length - 1].sg) >= 0 ? posC : negC
      ctx.beginPath()
      run.forEach((p, i) => (i ? ctx.lineTo(p.ux, p.uy) : ctx.moveTo(p.ux, p.uy)))
      for (let i = run.length - 1; i >= 0; i--) ctx.lineTo(run[i].lx, run[i].ly)
      ctx.closePath()
      ctx.globalAlpha = 0.3; ctx.fillStyle = color; ctx.fill(); ctx.globalAlpha = 1
      ctx.strokeStyle = color; ctx.lineWidth = 1.6 * s; ctx.lineJoin = "round"
      ctx.beginPath(); run.forEach((p, i) => (i ? ctx.lineTo(p.ux, p.uy) : ctx.moveTo(p.ux, p.uy))); ctx.stroke()
      if (mirrored) { ctx.beginPath(); run.forEach((p, i) => (i ? ctx.lineTo(p.lx, p.ly) : ctx.moveTo(p.lx, p.ly))); ctx.stroke() }
    }
    for (const i of [0, N]) peaks.push({ v: pts[i].v, x: pts[i].ux, y: pts[i].uy, ax: pts[i].ax, ay: pts[i].ay })
  }

  if (mk >= 1 && grow > 0.85 && peaks.length) {
    peaks.sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
    const shown = [peaks[0]]
    const opp = peaks.find((p) => p.v * peaks[0].v < 0 && Math.abs(p.v) > 0.3 * Math.abs(peaks[0].v))
    if (opp) shown.push(opp)
    for (const p of shown) {
      if (Math.abs(p.v) < 0.5) continue
      const dl = Math.hypot(p.x - p.ax, p.y - p.ay)
      const ox = dl > 2 ? (p.x - p.ax) / dl : 0, oy = dl > 2 ? (p.y - p.ay) / dl : -1
      pill(ctx, opts.format(p.v, kind), p.x + ox * 30 * s, p.y + oy * 16 * s, p.v >= 0 ? posC : negC, s, Math.min(1, (grow - 0.85) / 0.15))
    }
  }
  ctx.restore()
}

function pill(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, edge: string, s: number, alpha = 1, ink = "#1e293b", size = 12) {
  ctx.save()
  ctx.globalAlpha = alpha
  ctx.font = LABEL_FONT(s, size)
  const w = ctx.measureText(text).width, h = (size + 10) * s
  ctx.fillStyle = "#ffffff"; ctx.strokeStyle = edge; ctx.lineWidth = 1.5 * s
  ctx.shadowColor = "rgba(26,47,94,.12)"; ctx.shadowBlur = 6 * s; ctx.shadowOffsetY = 2 * s
  ctx.beginPath(); ctx.roundRect(x - w / 2 - 8 * s, y - h / 2, w + 16 * s, h, h / 2); ctx.fill()
  ctx.shadowColor = "transparent"; ctx.stroke()
  ctx.fillStyle = ink; ctx.textAlign = "center"; ctx.textBaseline = "middle"
  ctx.fillText(text, x, y + 0.5 * s)
  ctx.restore()
}

/**
 * Stress tint: a soft glow under each member in the diagram's sign color,
 * strongest where the selected internal force is largest.
 */
export function drawLiveTint(
  ctx: CanvasRenderingContext2D, rect: Rect, model: StructureModel, sys: LiveSystem,
  result: AnalysisResult, shape: AnalysisResult | null, kind: NonNullable<LiveDiagram>, k: number, grow: number, s: number,
) {
  if (grow <= 0.01) return
  const ref = refOf(sys, kind) || 1
  ctx.save()
  ctx.lineCap = "round"
  for (const m of sys.members) {
    const ef = result.memberEndForces[m.id]
    if (!ef) continue
    const pts = memberPoints(model, m, shape, k, rect, 0)
    for (let i = 0; i < pts.length - 1; i++) {
      const v = valueAt(ef, ((i + 0.5) / (pts.length - 1)) * m.L, kind)
      const a = Math.min(1, Math.abs(v) / ref) * Math.min(grow, 1)
      if (a < 0.03) continue
      const c = v >= 0 ? COLOR_SFD_POS : COLOR_SFD_NEG
      ctx.strokeStyle = rgba(c, 0.55 * a)
      ctx.shadowColor = rgba(c, 0.9 * a)
      ctx.shadowBlur = 16 * s
      ctx.lineWidth = (8 + 12 * a) * s
      ctx.beginPath(); ctx.moveTo(pts[i][0], pts[i][1]); ctx.lineTo(pts[i + 1][0], pts[i + 1][1]); ctx.stroke()
    }
  }
  ctx.restore()
}

/** The navy model itself, bending. The grabbed node turns amber and pops. */
export function drawLiveStructure(
  ctx: CanvasRenderingContext2D, rect: Rect, model: StructureModel, sys: LiveSystem,
  shape: AnalysisResult | null, k: number, dy: number, s: number,
  grab: { node: NodeId | null; at: number; now: number },
) {
  ctx.save()
  ctx.lineCap = "round"; ctx.lineJoin = "round"
  ctx.strokeStyle = COLOR_BRAND; ctx.lineWidth = 4.5 * s
  for (const m of sys.members) {
    const pts = memberPoints(model, m, shape, k, rect, dy)
    ctx.beginPath(); pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y))); ctx.stroke()
  }
  for (const id of sys.nodeIds) {
    const p = deformedNodeScreen(model, shape, id, k, rect, dy)
    if (!p) continue
    let r = 5 * s
    const hot = id === grab.node
    if (hot) {
      const e = (grab.now - grab.at) / 1000
      r *= 1.45 + LIVE_MOTION.nodePop * Math.exp(-7 * e) * Math.cos(20 * e)
    }
    ctx.fillStyle = "#ffffff"; ctx.strokeStyle = hot ? COLOR_HAND : COLOR_BRAND; ctx.lineWidth = 2.2 * s
    ctx.beginPath(); ctx.arc(p.sx, p.sy, Math.max(r, 1), 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  }
  ctx.restore()
}

/** Eased reactions in one slate color; a component that just flipped sign flashes amber. */
export function drawLiveReactions(
  ctx: CanvasRenderingContext2D, rect: Rect, model: StructureModel, sys: LiveSystem,
  reactions: LiveReactions, flashAt: Record<NodeId, [number, number, number]>, now: number, s: number,
  format: (v: number, moment: boolean) => string,
) {
  const refR = sys.refs.R
  if (refR <= 1e-9) return
  ctx.save()
  ctx.font = LABEL_FONT(s)
  for (const id of sys.supportNodeIds) {
    const r = reactions[id], node = model.nodes[id]
    if (!r || !node) continue
    const { sx: x, sy: y } = worldToScreen(node, rect)
    const flash = flashAt[id] ?? [-1e9, -1e9, -1e9]
    const glow = (i: number) => {
      const f = Math.max(0, 1 - (now - flash[i]) / 320)
      if (f > 0) { ctx.shadowColor = rgba(COLOR_HAND, f); ctx.shadowBlur = 18 * f * s } else ctx.shadowColor = "transparent"
    }
    const arrow = (dx: number, dy: number, v: number, i: number) => {
      const mag = Math.abs(v) / refR
      if (mag < 0.008) return
      const Ls = (10 + 60 * Math.min(mag, 1)) * s, gap = 32 * s, h = 11 * s
      const tx = x - dx * gap, ty = y - dy * gap, sx = tx - dx * Ls, sy = ty - dy * Ls
      ctx.save(); glow(i)
      ctx.strokeStyle = COLOR_REACTION; ctx.fillStyle = COLOR_REACTION; ctx.lineWidth = 3 * s; ctx.lineCap = "round"
      const a = Math.atan2(dy, dx)
      ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(tx - dx * h * 0.6, ty - dy * h * 0.6); ctx.stroke()
      ctx.beginPath(); ctx.moveTo(tx, ty)
      ctx.lineTo(tx - h * Math.cos(a - 0.5), ty - h * Math.sin(a - 0.5))
      ctx.lineTo(tx - h * Math.cos(a + 0.5), ty - h * Math.sin(a + 0.5))
      ctx.closePath(); ctx.fill()
      ctx.restore()
      ctx.fillStyle = COLOR_REACTION
      ctx.textAlign = dx ? (dx > 0 ? "right" : "left") : "center"
      ctx.textBaseline = dy ? (dy > 0 ? "bottom" : "top") : "middle"
      ctx.fillText(format(Math.abs(v), false), sx - dx * 6 * s, sy - dy * 6 * s)
    }
    // A reaction arrow points the way the support pushes on the structure (screen y points down).
    arrow(0, r.Ry >= 0 ? -1 : 1, r.Ry, 1)
    arrow(r.Rx >= 0 ? 1 : -1, 0, r.Rx, 0)
    const mag = Math.abs(r.Mz) / refR
    if (mag > 0.008) {
      const rr = (12 + 13 * Math.min(mag, 1)) * s, ccw = r.Mz >= 0
      ctx.save(); glow(2)
      ctx.strokeStyle = COLOR_REACTION; ctx.fillStyle = COLOR_REACTION; ctx.lineWidth = 3 * s; ctx.lineCap = "round"
      ctx.beginPath(); ctx.arc(x, y, rr, ccw ? -0.5 : 0.5, ccw ? -4.2 : 4.2, ccw); ctx.stroke()
      const e = ccw ? -4.2 : 4.2, ex = x + rr * Math.cos(e), ey = y + rr * Math.sin(e), t = e + (ccw ? -Math.PI / 2 : Math.PI / 2)
      ctx.beginPath()
      ctx.moveTo(ex + 9 * s * Math.cos(t), ey + 9 * s * Math.sin(t))
      ctx.lineTo(ex + 5 * s * Math.cos(t + 2.2), ey + 5 * s * Math.sin(t + 2.2))
      ctx.lineTo(ex + 5 * s * Math.cos(t - 2.2), ey + 5 * s * Math.sin(t - 2.2))
      ctx.closePath(); ctx.fill()
      ctx.restore()
      const left = node.x < 0
      ctx.fillStyle = COLOR_REACTION; ctx.textAlign = left ? "right" : "left"; ctx.textBaseline = "bottom"
      ctx.fillText(format(Math.abs(r.Mz), true), x + (left ? -rr - 6 * s : rr + 6 * s), y - rr + 2 * s)
    }
  }
  ctx.restore()
}

/** Amber rings that spread from a node on grab and release. */
export function drawRipples(
  ctx: CanvasRenderingContext2D, rect: Rect, model: StructureModel,
  ripples: { node: NodeId; t: number }[], now: number, s: number,
) {
  for (const rp of ripples) {
    const n = model.nodes[rp.node]
    if (!n) continue
    const e = clamp01((now - rp.t) / LIVE_MOTION.rippleMs)
    const { sx, sy } = worldToScreen(n, rect)
    ctx.save()
    ctx.strokeStyle = COLOR_HAND; ctx.globalAlpha = (1 - e) * 0.75; ctx.lineWidth = (3 * (1 - e) + 0.5) * s
    ctx.beginPath(); ctx.arc(sx, sy, (8 + LIVE_MOTION.ripplePx * easeOutCubic(e)) * s, 0, Math.PI * 2); ctx.stroke()
    ctx.restore()
  }
}

/** Amber rings on every node the rope can attach to; they pop in one by one on entry. */
export function drawGrabRings(
  ctx: CanvasRenderingContext2D, rect: Rect, model: StructureModel, grabbable: Set<NodeId>,
  hoverId: NodeId | null, entryAt: number, now: number, s: number,
) {
  let i = 0
  for (const id of grabbable) {
    const n = model.nodes[id]
    if (!n) { i++; continue }
    const e = clamp01((now - entryAt - LIVE_MOTION.entryMs + 50 - i * 150) / 380)
    i++
    const scale = e <= 0 ? 0 : easeOutBack(e, 2.4)
    if (scale <= 0) continue
    const { sx, sy } = worldToScreen(n, rect)
    const hot = id === hoverId
    ctx.save()
    ctx.strokeStyle = COLOR_HAND; ctx.globalAlpha = hot ? 0.95 : 0.55; ctx.lineWidth = (hot ? 2.5 : 1.8) * s
    ctx.beginPath(); ctx.arc(sx, sy, (hot ? 13 : 10.5) * s * scale, 0, Math.PI * 2); ctx.stroke()
    if (hot) { ctx.globalAlpha = 0.14; ctx.fillStyle = COLOR_HAND; ctx.fill() }
    ctx.restore()
  }
}

/**
 * The rope, drawn as an amber coil spring from the node to the hand. Pulling
 * further spreads and flattens the coils like a real spring; at the cap it
 * quivers and glows. A classic filled head sits exactly on the cursor, and the
 * force label rides beside the middle of the spring, clear of the hand.
 */
export function drawSpringArrow(
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
  const len = Math.hypot(cursor.sx - node.sx, cursor.sy - node.sy)
  if (force.P <= 1e-9 || len < 4 * s) return
  const k = Math.min(Math.max(scale, 0), 1)
  const ux = snapped ? force.px / force.P : (cursor.sx - node.sx) / len
  const uy = snapped ? -force.py / force.P : (cursor.sy - node.sy) / len
  const pulse = force.capped && animate ? 0.5 + 0.5 * Math.sin((t / 1000) * Math.PI * 4) : 0

  const hl = Math.min((20 + 6 * k) * s, len * 0.4), hw = (18 + 8 * k) * s
  const L0 = len - hl * 0.85
  const lead = Math.min(10 * s, L0 * 0.15), coilLen = Math.max(L0 - 2 * lead, 1)
  // Fixed coil pitch in a relaxed spring; stretching spreads the coils and flattens them.
  const coils = Math.max(3, Math.min(9, Math.round(coilLen / (16 * s))))
  const amp = Math.max(4 * s, Math.min(9 * s, (520 * s * s) / Math.max(coilLen, 40 * s)))
  const wob = animate ? (t / 1000) * 10 * (force.capped ? 1.6 : 0.4) : 0

  ctx.save()
  ctx.translate(node.sx, node.sy)
  ctx.rotate(Math.atan2(uy, ux))
  ctx.shadowColor = force.capped ? rgba(COLOR_HAND, 0.45 + 0.35 * pulse) : "rgba(26,47,94,.22)"
  ctx.shadowBlur = (force.capped ? 10 + 10 * pulse : 6) * s
  ctx.shadowOffsetY = force.capped ? 0 : 2 * s
  ctx.strokeStyle = COLOR_HAND; ctx.lineWidth = (2.2 + 0.8 * k) * s; ctx.lineJoin = "round"; ctx.lineCap = "round"
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(lead, 0)
  const steps = coils * 12
  for (let i = 0; i <= steps; i++) {
    const u = i / steps
    // Amplitude eases in and out at the ends so the coil meets the leads cleanly.
    const env = Math.min(1, u / 0.06, (1 - u) / 0.06)
    ctx.lineTo(lead + u * coilLen, Math.sin(u * coils * 2 * Math.PI + wob) * amp * env)
  }
  ctx.lineTo(L0, 0)
  ctx.stroke()
  ctx.shadowColor = "transparent"
  // Hook at the node, and the head with its tip on the cursor.
  ctx.fillStyle = COLOR_HAND
  ctx.beginPath(); ctx.arc(0, 0, 3.5 * s, 0, Math.PI * 2); ctx.fill()
  ctx.beginPath()
  ctx.moveTo(len, 0); ctx.lineTo(len - hl, -hw / 2); ctx.lineTo(len - hl * 0.82, 0); ctx.lineTo(len - hl, hw / 2)
  ctx.closePath()
  const g = ctx.createLinearGradient(len - hl, 0, len, 0)
  g.addColorStop(0, COLOR_HAND_LIGHT); g.addColorStop(1, COLOR_HAND)
  ctx.fillStyle = g; ctx.fill()
  ctx.strokeStyle = COLOR_HAND_EDGE; ctx.lineWidth = 1.4 * s; ctx.stroke()
  ctx.restore()

  // Force label beside the middle of the spring, on the upper side of the screen.
  let nx = -uy, ny = ux
  if (ny > 0 || (Math.abs(ny) < 1e-6 && nx > 0)) { nx = -nx; ny = -ny }
  ctx.save()
  ctx.font = LABEL_FONT(s, 15)
  const w = ctx.measureText(label).width + 22 * s
  const reach = hw / 2 + amp + 16 * s + Math.abs(nx) * w / 2
  const cx = node.sx + ux * len * 0.5 + nx * reach, cy = node.sy + uy * len * 0.5 + ny * reach
  ctx.restore()
  pill(ctx, label, cx, cy, COLOR_HAND, s, 1, COLOR_HAND_EDGE, 15)
}

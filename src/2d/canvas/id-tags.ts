// Small pill labels rendered at screen positions, used by all three diagram drawers.

export function drawNodeIdTag(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  nodeId: string,
  s: number = 1,
) {
  const text = nodeId
  const font = `bold ${10 * s}px 'JetBrains Mono', monospace`
  ctx.save()
  ctx.font = font
  const tw = ctx.measureText(text).width
  const ph = 4 * s, pw = 6 * s
  const bw = tw + pw * 2, bh = 14 * s + ph * 2
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.strokeStyle = "#94a3b8"
  ctx.lineWidth = 1 * s
  ctx.beginPath()
  ctx.roundRect(sx - bw / 2, sy - bh / 2, bw, bh, 3 * s)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = "#475569"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, sx, sy)
  ctx.restore()
}

export function drawMemberIdTag(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  memberId: string,
  angle: number = 0,
  s: number = 1,
) {
  const text = memberId
  const font = `bold ${10 * s}px 'JetBrains Mono', monospace`
  ctx.save()
  ctx.translate(sx, sy)
  if (angle !== 0) ctx.rotate(angle)
  ctx.font = font
  const tw = ctx.measureText(text).width
  const ph = 4 * s, pw = 6 * s
  const bw = tw + pw * 2, bh = 14 * s + ph * 2
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.strokeStyle = "#94a3b8"
  ctx.lineWidth = 1 * s
  ctx.beginPath()
  ctx.roundRect(-bw / 2, -bh / 2, bw, bh, 3 * s)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = "#475569"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, 0, 0)
  ctx.restore()
}

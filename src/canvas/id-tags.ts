// Small pill labels rendered at screen positions, used by all three diagram drawers.

export function drawNodeIdTag(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  nodeId: string,
) {
  const text = "N" + nodeId.replace(/^\D+/, "")
  const font = "bold 10px 'JetBrains Mono', monospace"
  ctx.save()
  ctx.font = font
  const tw = ctx.measureText(text).width
  const ph = 4, pw = 6
  const bw = tw + pw * 2, bh = 14 + ph * 2
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.strokeStyle = "#94a3b8"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(sx - bw / 2, sy - bh / 2, bw, bh, 3)
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
) {
  const text = memberId.toUpperCase()
  const font = "bold 10px 'JetBrains Mono', monospace"
  ctx.save()
  ctx.font = font
  const tw = ctx.measureText(text).width
  const ph = 4, pw = 6
  const bw = tw + pw * 2, bh = 14 + ph * 2
  ctx.fillStyle = "rgba(255,255,255,0.92)"
  ctx.strokeStyle = "#94a3b8"
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.roundRect(sx - bw / 2, sy - bh / 2, bw, bh, 3)
  ctx.fill()
  ctx.stroke()
  ctx.fillStyle = "#475569"
  ctx.textAlign = "center"
  ctx.textBaseline = "middle"
  ctx.fillText(text, sx, sy)
  ctx.restore()
}

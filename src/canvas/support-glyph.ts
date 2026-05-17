import type { StructureModel, SupportType } from "@/lib/model"
import {
  COLOR_BRAND,
  COLOR_SELECTION,
  COLOR_SUPPORT_HATCH,
  SUPPORT_SIZE,
} from "@/lib/constants"
import { Rect, worldToScreen } from "@/lib/geometry"

export function drawSupportGlyph(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  type: SupportType,
  selected = false,
  overrideColor?: string,
  s = 1,
) {
  const fill  = overrideColor ?? (selected ? COLOR_SELECTION : COLOR_BRAND)
  const hatch = overrideColor ?? COLOR_SUPPORT_HATCH
  const sz = SUPPORT_SIZE * s
  ctx.save()
  if (type === "pin") {
    ctx.beginPath()
    ctx.moveTo(x, y + 4 * s)
    ctx.lineTo(x - sz / 2, y + sz + 4 * s)
    ctx.lineTo(x + sz / 2, y + sz + 4 * s)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()

    ctx.beginPath()
    ctx.moveTo(x - sz / 2 - 5 * s, y + sz + 8 * s)
    ctx.lineTo(x + sz / 2 + 5 * s, y + sz + 8 * s)
    ctx.strokeStyle = hatch
    ctx.lineWidth = 2 * s
    ctx.stroke()
  } else if (type === "roller") {
    ctx.beginPath()
    ctx.moveTo(x, y + 4 * s)
    ctx.lineTo(x - sz / 2, y + sz + 4 * s)
    ctx.lineTo(x + sz / 2, y + sz + 4 * s)
    ctx.closePath()
    ctx.fillStyle = fill
    ctx.fill()

    const cy = y + sz + 10 * s
    ctx.beginPath()
    ctx.arc(x - 5 * s, cy, 3 * s, 0, Math.PI * 2)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    ctx.strokeStyle = fill
    ctx.lineWidth = 1.5 * s
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(x + 5 * s, cy, 3 * s, 0, Math.PI * 2)
    ctx.fillStyle = "#ffffff"
    ctx.fill()
    ctx.stroke()

    ctx.beginPath()
    ctx.moveTo(x - sz / 2 - 5 * s, cy + 5 * s)
    ctx.lineTo(x + sz / 2 + 5 * s, cy + 5 * s)
    ctx.strokeStyle = hatch
    ctx.lineWidth = 2 * s
    ctx.stroke()
  } else if (type === "fixed") {
    const w = (SUPPORT_SIZE + 6) * s
    const h = 8 * s
    ctx.fillStyle = fill
    ctx.fillRect(x - w / 2, y + 4 * s, w, h)

    ctx.strokeStyle = hatch
    ctx.lineWidth = 1.5 * s
    const baseY = y + 4 * s + h
    ctx.beginPath()
    ctx.moveTo(x - w / 2 - 3 * s, baseY + 6 * s)
    ctx.lineTo(x + w / 2 + 3 * s, baseY + 6 * s)
    ctx.stroke()
    for (let i = -w / 2; i <= w / 2; i += 5 * s) {
      ctx.beginPath()
      ctx.moveTo(x + i, baseY)
      ctx.lineTo(x + i - 4 * s, baseY + 6 * s)
      ctx.stroke()
    }
  }
  ctx.restore()
}

export function hitTestSupportGlyph(
  model: StructureModel,
  mx: number,
  my: number,
  rect: Rect,
): string | null {
  for (const s of Object.values(model.supports)) {
    const n = model.nodes[s.nodeId]
    if (!n) continue
    const { sx, sy } = worldToScreen(n, rect)
    if (
      Math.abs(mx - sx) <= SUPPORT_SIZE / 2 + 5 &&
      my >= sy + 4 &&
      my <= sy + SUPPORT_SIZE + 14
    ) {
      return s.nodeId
    }
  }
  return null
}

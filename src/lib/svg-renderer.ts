import type { StructureModel, NodeId } from "@/lib/model"
import { SCALE } from "./constants"

export interface SVGRendererOptions {
  width?: number
  height?: number
  padding?: number
  showGrid?: boolean
  showDimensions?: boolean
}

/**
 * Renders a structural model as a clean SVG diagram.
 * Follows the visual style: dark navy members, white node circles, colored loads.
 */
export function renderModelToSVG(
  model: StructureModel,
  options: SVGRendererOptions = {}
): string {
  const {
    padding = 40,
    showGrid = true,
    showDimensions = true,
  } = options

  // Calculate bounding box
  const nodeIds = Object.keys(model.nodes)
  if (nodeIds.length === 0) return "<svg></svg>"

  let minX = Infinity, maxX = -Infinity
  let minY = Infinity, maxY = -Infinity

  for (const nodeId of nodeIds) {
    const node = model.nodes[nodeId as NodeId]
    minX = Math.min(minX, node.x)
    maxX = Math.max(maxX, node.x)
    minY = Math.min(minY, node.y)
    maxY = Math.max(maxY, node.y)
  }

  // Add padding in world space
  const padWorld = padding / SCALE
  minX -= padWorld
  maxX += padWorld
  minY -= padWorld
  maxY += padWorld

  const worldWidth = maxX - minX
  const worldHeight = maxY - minY
  const aspectRatio = worldWidth / worldHeight

  // SVG dimensions
  const svgHeight = 600
  const svgWidth = svgHeight * aspectRatio

  // Scale factor: world coords to SVG pixels
  const scaleX = svgWidth / worldWidth
  const scaleY = svgHeight / worldHeight
  const scale = Math.min(scaleX, scaleY)

  const worldToSVG = (wx: number, wy: number) => {
    const sx = (wx - minX) * scale
    const sy = (maxY - wy) * scale  // Y-axis flip for SVG
    return { x: sx, y: sy }
  }

  let svg = `<svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}">\n`

  // Background
  svg += `  <rect width="${svgWidth}" height="${svgHeight}" fill="#f0f2f5"/>\n`

  // Grid (optional)
  if (showGrid) {
    svg += renderGrid(minX, maxX, minY, maxY, worldToSVG, svgWidth, svgHeight)
  }

  // Members (lines)
  svg += "  <g id=\"members\" stroke=\"#1a2f5e\" stroke-width=\"3\" fill=\"none\">\n"
  for (const memberId of Object.keys(model.members)) {
    const member = model.members[memberId]
    const nodeA = model.nodes[member.a]
    const nodeB = model.nodes[member.b]
    if (!nodeA || !nodeB) continue

    const p1 = worldToSVG(nodeA.x, nodeA.y)
    const p2 = worldToSVG(nodeB.x, nodeB.y)
    svg += `    <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>\n`
  }
  svg += "  </g>\n"

  // Supports
  svg += "  <g id=\"supports\">\n"
  for (const [nodeId, support] of Object.entries(model.supports)) {
    const node = model.nodes[nodeId as NodeId]
    if (!node) continue
    const p = worldToSVG(node.x, node.y)
    svg += renderSupport(p.x, p.y, support.type, scale)
  }
  svg += "  </g>\n"

  // Nodes (circles)
  svg += `  <g id="nodes" fill="white" stroke="#1a2f5e" stroke-width="2">\n`
  for (const nodeId of nodeIds) {
    const node = model.nodes[nodeId as NodeId]
    const p = worldToSVG(node.x, node.y)
    const radius = 5 * (scale / SCALE)
    svg += `    <circle cx="${p.x}" cy="${p.y}" r="${radius}"/>\n`
  }
  svg += "  </g>\n"

  // Point Loads
  svg += "  <g id=\"point-loads\">\n"
  for (const loadId of Object.keys(model.loads)) {
    const load = model.loads[loadId]
    if (load.type !== "point") continue

    const node = model.nodes[load.nodeId]
    if (!node) continue

    const p = worldToSVG(node.x, node.y)
    const magnitude = Math.sqrt(load.fx ** 2 + load.fy ** 2)
    if (magnitude < 0.01) continue

    const angle = Math.atan2(load.fy, load.fx)
    svg += renderPointLoad(p.x, p.y, magnitude, angle, scale)
  }
  svg += "  </g>\n"

  // Distributed Loads
  svg += "  <g id=\"distributed-loads\">\n"
  for (const loadId of Object.keys(model.loads)) {
    const load = model.loads[loadId]
    if (load.type !== "distributed") continue

    const member = model.members[load.memberId]
    if (!member) continue

    const nodeA = model.nodes[member.a]
    const nodeB = model.nodes[member.b]
    if (!nodeA || !nodeB) continue

    const p1 = worldToSVG(nodeA.x, nodeA.y)
    const p2 = worldToSVG(nodeB.x, nodeB.y)

    svg += renderDistributedLoad(
      p1.x, p1.y, p2.x, p2.y,
      load.wStart ?? 0,
      load.wEnd ?? load.wStart ?? 0,
      scale
    )
  }
  svg += "  </g>\n"

  // Dimensions (optional)
  if (showDimensions) {
    svg += renderDimensions(model, worldToSVG, svgHeight, svgWidth)
  }

  svg += "</svg>\n"
  return svg
}

function renderGrid(
  minX: number,
  maxX: number,
  minY: number,
  maxY: number,
  worldToSVG: (wx: number, wy: number) => { x: number; y: number },
  _svgWidth: number,
  _svgHeight: number,
): string {
  let svg = "  <g id=\"grid\" stroke=\"#e5e7eb\" stroke-width=\"0.5\">\n"

  // Vertical gridlines every 0.5m
  for (let x = Math.ceil(minX * 2) / 2; x <= maxX; x += 0.5) {
    const p1 = worldToSVG(x, minY)
    const p2 = worldToSVG(x, maxY)
    svg += `    <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>\n`
  }

  // Horizontal gridlines every 0.5m
  for (let y = Math.ceil(minY * 2) / 2; y <= maxY; y += 0.5) {
    const p1 = worldToSVG(minX, y)
    const p2 = worldToSVG(maxX, y)
    svg += `    <line x1="${p1.x}" y1="${p1.y}" x2="${p2.x}" y2="${p2.y}"/>\n`
  }

  svg += "  </g>\n"
  return svg
}

function renderSupport(
  x: number,
  y: number,
  type: "pin" | "roller" | "fixed",
  scale: number
): string {
  const size = 15 * (scale / SCALE)
  let svg = ""

  if (type === "pin") {
    // Triangle + hatching
    svg += `    <polygon points="${x},${y} ${x - size},${y + size * 1.2} ${x + size},${y + size * 1.2}" fill="none" stroke="#1a2f5e" stroke-width="2"/>\n`
    // Hatching
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * (size / 2)
      svg += `    <line x1="${x - size + offset}" y1="${y + size * 1.2}" x2="${x - size + offset + size * 0.8}" y2="${y + size * 1.5}" stroke="#94a3b8" stroke-width="1.5"/>\n`
    }
  } else if (type === "roller") {
    // Triangle + circles
    svg += `    <polygon points="${x},${y} ${x - size},${y + size * 1.2} ${x + size},${y + size * 1.2}" fill="none" stroke="#1a2f5e" stroke-width="2"/>\n`
    // Two circles
    const radius = size * 0.35
    svg += `    <circle cx="${x - size * 0.35}" cy="${y + size * 1.5}" r="${radius}" fill="none" stroke="#1a2f5e" stroke-width="1.5"/>\n`
    svg += `    <circle cx="${x + size * 0.35}" cy="${y + size * 1.5}" r="${radius}" fill="none" stroke="#1a2f5e" stroke-width="1.5"/>\n`
  } else if (type === "fixed") {
    // Square + hatching
    svg += `    <rect x="${x - size}" y="${y}" width="${size * 2}" height="${size * 1.2}" fill="none" stroke="#1a2f5e" stroke-width="2"/>\n`
    // Hatching
    for (let i = 0; i < 4; i++) {
      const offset = (i - 1.5) * (size / 1.5)
      svg += `    <line x1="${x - size + offset}" y1="${y + size * 1.2}" x2="${x - size + offset + size * 0.8}" y2="${y + size * 1.5}" stroke="#94a3b8" stroke-width="1.5"/>\n`
    }
  }

  return svg
}

function renderPointLoad(
  x: number,
  y: number,
  magnitude: number,
  angle: number,
  scale: number,
): string {
  const arrowLen = Math.max(30, Math.min(60, magnitude * 3)) * (scale / SCALE)
  const arrowheadSize = 8 * (scale / SCALE)

  const endX = x + Math.cos(angle) * arrowLen
  const endY = y + Math.sin(angle) * arrowLen

  let svg = ""

  // Arrow shaft
  svg += `    <line x1="${x}" y1="${y}" x2="${endX}" y2="${endY}" stroke="#0BE77E" stroke-width="3" stroke-linecap="round"/>\n`

  // Arrowhead
  const backAngle1 = angle + Math.PI * 0.75
  const backAngle2 = angle - Math.PI * 0.75
  const arrowTip1X = endX + Math.cos(backAngle1) * arrowheadSize
  const arrowTip1Y = endY + Math.sin(backAngle1) * arrowheadSize
  const arrowTip2X = endX + Math.cos(backAngle2) * arrowheadSize
  const arrowTip2Y = endY + Math.sin(backAngle2) * arrowheadSize

  svg += `    <polygon points="${endX},${endY} ${arrowTip1X},${arrowTip1Y} ${arrowTip2X},${arrowTip2Y}" fill="#0BE77E"/>\n`

  // Label
  const labelX = x + Math.cos(angle) * (arrowLen + 20)
  const labelY = y + Math.sin(angle) * (arrowLen + 20)
  svg += `    <text x="${labelX}" y="${labelY}" font-size="12" font-family="JetBrains Mono" font-weight="bold" fill="#107343" text-anchor="middle">${magnitude.toFixed(0)} kN</text>\n`

  return svg
}

function renderDistributedLoad(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  wStart: number,
  wEnd: number,
  scale: number,
): string {
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy)
  if (len < 0.01) return ""

  // Perpendicular direction (CCW)
  const nx = -dy / len
  const ny = dx / len

  const maxArrowLen = 30 * (scale / SCALE)
  const numArrows = Math.max(3, Math.floor(len / 25))

  let svg = ""

  // Draw arrows
  for (let i = 0; i <= numArrows; i++) {
    const t = i / numArrows
    const px = x1 + t * dx
    const py = y1 + t * dy

    // Interpolate load magnitude
    const w = wStart + t * (wEnd - wStart)
    const arrowLen = Math.max(5, Math.min(maxArrowLen, Math.abs(w) * 2))

    const endX = px + nx * arrowLen
    const endY = py + ny * arrowLen

    // Determine color based on direction
    const color = w < 0 ? "#ef4444" : "#0BE77E"

    // Arrow shaft
    svg += `    <line x1="${px}" y1="${py}" x2="${endX}" y2="${endY}" stroke="${color}" stroke-width="2"/>\n`

    // Arrowhead
    const arrowheadSize = 5 * (scale / SCALE)
    const backAngle1 = Math.atan2(ny, nx) + Math.PI * 0.65
    const backAngle2 = Math.atan2(ny, nx) - Math.PI * 0.65
    const arrowTip1X = endX + Math.cos(backAngle1) * arrowheadSize
    const arrowTip1Y = endY + Math.sin(backAngle1) * arrowheadSize
    const arrowTip2X = endX + Math.cos(backAngle2) * arrowheadSize
    const arrowTip2Y = endY + Math.sin(backAngle2) * arrowheadSize

    svg += `    <polygon points="${endX},${endY} ${arrowTip1X},${arrowTip1Y} ${arrowTip2X},${arrowTip2Y}" fill="${color}"/>\n`
  }

  return svg
}

function renderDimensions(
  model: StructureModel,
  worldToSVG: (wx: number, wy: number) => { x: number; y: number },
  _svgHeight: number,
  _svgWidth: number,
): string {
  let svg = "  <g id=\"dimensions\" stroke=\"#2563eb\" stroke-width=\"1\" fill=\"none\">\n"

  // Find horizontal spans
  const nodeIds = Object.keys(model.nodes)
  const horizontalNodes: { x: number; y: number; nodeId: string }[] = []

  for (const nodeId of nodeIds) {
    const node = model.nodes[nodeId as NodeId]
    horizontalNodes.push({ x: node.x, y: node.y, nodeId })
  }

  // Sort by Y, then X
  horizontalNodes.sort((a, b) => a.y - b.y || a.x - b.x)

  // Group by Y coordinate
  const yGroups: { [key: string]: typeof horizontalNodes } = {}
  for (const node of horizontalNodes) {
    const key = node.y.toFixed(2)
    if (!yGroups[key]) yGroups[key] = []
    yGroups[key].push(node)
  }

  // Draw dimensions for each horizontal level
  for (const nodes of Object.values(yGroups)) {
    if (nodes.length < 2) continue

    const minNode = nodes[0]
    const maxNode = nodes[nodes.length - 1]

    const p1 = worldToSVG(minNode.x, minNode.y)
    const p2 = worldToSVG(maxNode.x, minNode.y)

    const offsetY = -30  // above the nodes

    // Extension lines
    svg += `    <line x1="${p1.x}" y1="${p1.y}" x2="${p1.x}" y2="${p1.y + offsetY}" stroke="#2563eb" stroke-dasharray="2,2"/>\n`
    svg += `    <line x1="${p2.x}" y1="${p2.y}" x2="${p2.x}" y2="${p2.y + offsetY}" stroke="#2563eb" stroke-dasharray="2,2"/>\n`

    // Dimension line
    svg += `    <line x1="${p1.x}" y1="${p1.y + offsetY}" x2="${p2.x}" y2="${p2.y + offsetY}"/>\n`

    // Endpoints
    svg += `    <line x1="${p1.x - 3}" y1="${p1.y + offsetY - 5}" x2="${p1.x - 3}" y2="${p1.y + offsetY + 5}"/>\n`
    svg += `    <line x1="${p2.x + 3}" y1="${p2.y + offsetY - 5}" x2="${p2.x + 3}" y2="${p2.y + offsetY + 5}"/>\n`

    // Label
    const dist = Math.abs(maxNode.x - minNode.x)
    const midX = (p1.x + p2.x) / 2
    svg += `    <text x="${midX}" y="${p1.y + offsetY - 8}" font-size="12" font-family="Arial, sans-serif" font-weight="bold" fill="#1e293b" text-anchor="middle">${dist.toFixed(2)} m</text>\n`
  }

  svg += "  </g>\n"
  return svg
}

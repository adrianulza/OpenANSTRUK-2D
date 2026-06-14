/**
 * Shared RC column perimeter bar geometry — code-agnostic.
 *
 * Single source of truth for where every column bar sits — consumed by the
 * column SVG preview, the P–M interaction engine (codes/<code>/column.ts), and
 * the detailing checklist. Bars are placed on an `nx × ny` perimeter grid: `nx`
 * bars on the top and bottom rows, `(ny − 2)` bars on each side, corners shared.
 * Total = `2·nx + 2·ny − 4` (book's 6/2/2/2/2/6 → nx=6, ny=6 = 20 bars).
 *
 * Bar centre inset from a face = cover + tie diameter + ½·bar diameter (matches
 * the book: 40 + 13 + 12.5 = 65.5 mm). The detailing *verdicts* (ρg bounds,
 * clear spacing) live in the per-code strategy.
 */

import { barArea, barDia, type RebarSize } from "./rebar"
import type { ColumnBar } from "./types"
import type { ColumnArrangement } from "../types"

export interface ColumnLayoutBar {
  /** Centre x from the left face, mm. */
  x: number
  /** Centre depth from the top fibre, mm. */
  y: number
  db: number
  area: number
}

export interface ColumnLayout {
  bars: ColumnLayoutBar[]
  /** Total longitudinal steel, mm². */
  Ast: number
  /** Bar-centre inset from each face, mm. */
  inset: number
  /** Centre-to-centre spacing of the top/bottom-row bars, mm (null when nx < 2). */
  rowSpacing: number | null
}

/** Evenly distribute n values across [from, to] inclusive (centred when n = 1). */
function spread(n: number, from: number, to: number): number[] {
  if (n <= 0) return []
  if (n === 1) return [(from + to) / 2]
  const step = (to - from) / (n - 1)
  return Array.from({ length: n }, (_, i) => from + i * step)
}

export function buildColumnBarLayout(
  b: number,
  h: number,
  cover: number,
  arr: ColumnArrangement,
): ColumnLayout {
  const nx = Math.max(2, Math.round(arr.nx))
  const ny = Math.max(2, Math.round(arr.ny))
  const db = barDia(arr.size)
  const dbTie = barDia(arr.tie.size)
  const area = barArea(arr.size)
  const inset = Math.max(0, cover) + dbTie + db / 2

  const xs = spread(nx, inset, b - inset)
  const ys = spread(ny, inset, h - inset)
  const bars: ColumnLayoutBar[] = []

  // Top + bottom rows: nx bars each.
  for (const x of xs) {
    bars.push({ x, y: ys[0], db, area })
    bars.push({ x, y: ys[ys.length - 1], db, area })
  }
  // Side rows (interior y levels): 2 bars each (left + right).
  for (let i = 1; i < ny - 1; i++) {
    bars.push({ x: inset, y: ys[i], db, area })
    bars.push({ x: b - inset, y: ys[i], db, area })
  }

  const rowSpacing = nx >= 2 ? (b - 2 * inset) / (nx - 1) : null
  return { bars, Ast: bars.length * area, inset, rowSpacing }
}

/** ColumnBar list (depth-from-top = y) for the interaction engine. */
export function layoutToColumnBars(layout: ColumnLayout): ColumnBar[] {
  return layout.bars.map((p) => ({ d: p.y, area: p.area }))
}

/**
 * Representative symmetric ring carrying a target steel area, for As-required
 * ρg sizing. Positions follow a default near-square grid; each bar's area is
 * scaled so the total equals `targetAst` exactly — giving a continuous ρg for
 * the bisection while keeping realistic bar placement.
 */
export function representativeColumnBars(
  b: number,
  h: number,
  cover: number,
  targetAst: number,
  opts: { barSize: RebarSize; tieSize: RebarSize },
): ColumnBar[] {
  // Default grid scales mildly with the section so steel isn't bunched at the
  // corners of a large column; clamped to a sensible perimeter.
  const nx = Math.min(8, Math.max(3, Math.round(b / 150)))
  const ny = Math.min(8, Math.max(3, Math.round(h / 150)))
  const layout = buildColumnBarLayout(b, h, cover, {
    nx, ny, size: opts.barSize, tie: { size: opts.tieSize, spacing: 100 },
  })
  const n = layout.bars.length
  const areaEach = n > 0 ? targetAst / n : 0
  return layout.bars.map((p) => ({ d: p.y, area: areaEach }))
}

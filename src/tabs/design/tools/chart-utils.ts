/**
 * Axis and formatting helpers shared by every Advanced Capacity Report deck —
 * RC beam, RC column, steel beam, steel column. Material-agnostic: nothing here
 * knows a clause from a load case.
 *
 * These were originally inline in the RC column deck. They live here so the
 * steel decks pick the SAME tick spacing and number formatting, which is what
 * makes four separately-written charts read as one instrument rather than four.
 */

/** Deck geometry — one width so stacked cards line up. */
export const DECK_WIDTH = 600
export const CHART_W = 552
export const CHART_H = 360

export const PAD_L = 56 // room for y-axis labels
export const PAD_R = 16
export const PAD_T = 18
export const PAD_B = 40 // room for x-axis labels

export const GRAY = "#9ca3af"
export const GRID = "#e5e7eb"

/** Integer, or an em dash when the value is not finite. */
export function fmt0(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toString() : "—"
}

/** Fixed decimals, or an em dash when the value is not finite. */
export function fmt(n: number | undefined, dp = 2): string {
  return n !== undefined && Number.isFinite(n) ? n.toFixed(dp) : "—"
}

/** "Nice" tick step for a given span and target tick count. */
export function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1
  return step * mag
}

/** Tick values covering [lo, hi] at a nice step (lo < hi). */
export function ticks(lo: number, hi: number, target: number): number[] {
  const step = niceStep(hi - lo, target)
  const out: number[] = []
  const start = Math.ceil(lo / step) * step
  for (let v = start; v <= hi + step * 1e-6; v += step) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : v)
  }
  return out
}

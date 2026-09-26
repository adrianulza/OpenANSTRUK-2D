/**
 * Trace geometry for the accelerogram chart — pure, so the suites can test the
 * binning without a DOM (the scene-component rule, applied to an SVG).
 *
 * A record can carry far more samples than the chart has pixel columns, and a
 * polyline through every sample just aliases: which peaks survive depends on
 * which samples land on which pixel. The honest rendering is the per-column
 * MIN/MAX ENVELOPE — every sample is inside the drawn band by construction,
 * so no peak can disappear.
 */

export interface EnvelopeBin {
  /** Time at the bin's centre, seconds. */
  t: number
  min: number
  max: number
}

/**
 * Fold `values` (uniform `dt`) into at most `columns` bins. Fewer samples than
 * columns gives one bin per sample — the band degenerates to the polyline.
 */
export function binEnvelope(
  values: readonly number[],
  dt: number,
  columns: number,
): EnvelopeBin[] {
  const n = values.length
  if (n === 0 || columns < 1) return []
  const per = Math.max(1, Math.ceil(n / columns))
  const out: EnvelopeBin[] = []
  for (let start = 0; start < n; start += per) {
    const end = Math.min(n, start + per)
    let min = Infinity
    let max = -Infinity
    for (let i = start; i < end; i++) {
      if (values[i] < min) min = values[i]
      if (values[i] > max) max = values[i]
    }
    out.push({ t: ((start + end - 1) / 2) * dt, min, max })
  }
  return out
}

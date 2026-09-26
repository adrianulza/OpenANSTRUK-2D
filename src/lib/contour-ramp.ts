/**
 * The deformation contour palette — OpenANSTRUK-3D's `contour-ramp.ts`, so the
 * two apps colour a displacement field identically: blue (zero or −peak)
 * through cyan, green and yellow to red (peak).
 */

export const CONTOUR_STOPS = [
  { t: 0.0, hex: "#2563eb" }, // blue
  { t: 0.25, hex: "#06b6d4" }, // cyan
  { t: 0.5, hex: "#22c55e" }, // green
  { t: 0.75, hex: "#eab308" }, // yellow
  { t: 1.0, hex: "#ef4444" }, // red
] as const

const STOP_RGB = CONTOUR_STOPS.map(({ hex }) => [
  parseInt(hex.slice(1, 3), 16),
  parseInt(hex.slice(3, 5), 16),
  parseInt(hex.slice(5, 7), 16),
])

/** Colour at t ∈ [0, 1] as a CSS rgb() string. Clamped outside the range. */
export function contourColor(t: number): string {
  const n = CONTOUR_STOPS.length - 1
  const x = t <= 0 ? 0 : t >= 1 ? n : t * n
  const i = Math.min(Math.floor(x), n - 1)
  const f = x - i
  const a = STOP_RGB[i]
  const b = STOP_RGB[i + 1]
  const c = (k: number) => Math.round(a[k] + (b[k] - a[k]) * f)
  return `rgb(${c(0)},${c(1)},${c(2)})`
}

/** Magnitude → [0, 1] against the peak. */
export function magnitudeT(v: number, peak: number): number {
  return peak > 1e-12 ? Math.min(Math.max(v / peak, 0), 1) : 0
}

/** Signed value → [0, 1] with zero at the middle (green). */
export function signedT(v: number, peak: number): number {
  return peak > 1e-12 ? Math.min(Math.max(0.5 + v / (2 * peak), 0), 1) : 0.5
}

/** The legend strip's CSS gradient. */
export const CONTOUR_GRADIENT = `linear-gradient(to right, ${CONTOUR_STOPS.map(
  (s) => `${s.hex} ${s.t * 100}%`,
).join(", ")})`

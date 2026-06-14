/**
 * Metric deformed-bar catalogue (SNI 2052 sizes, D prefix).
 * Areas are exact π/4·db² — no rounding, so capacity math stays consistent.
 */

export type RebarSize = "D10" | "D13" | "D16" | "D19" | "D22" | "D25" | "D29" | "D32"

export interface RebarSpec {
  size: RebarSize
  /** Nominal diameter, mm */
  db: number
  /** Cross-sectional area of one bar, mm² */
  area: number
}

const DIAMETERS: Record<RebarSize, number> = {
  D10: 10, D13: 13, D16: 16, D19: 19, D22: 22, D25: 25, D29: 29, D32: 32,
}

export const REBAR_SIZES: RebarSize[] = ["D10", "D13", "D16", "D19", "D22", "D25", "D29", "D32"]

export const REBAR: Record<RebarSize, RebarSpec> = Object.fromEntries(
  REBAR_SIZES.map((size) => {
    const db = DIAMETERS[size]
    return [size, { size, db, area: (Math.PI / 4) * db * db }]
  })
) as Record<RebarSize, RebarSpec>

export function barArea(size: RebarSize): number {
  return REBAR[size].area
}

export function barDia(size: RebarSize): number {
  return REBAR[size].db
}

/** Stirrup-suitable subset (small diameters). */
export const STIRRUP_SIZES: RebarSize[] = ["D10", "D13", "D16"]

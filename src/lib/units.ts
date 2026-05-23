export type ForceUnit    = "kN" | "N"
export type PressureUnit = "GPa" | "MPa"
export type LengthUnit   = "m" | "mm"

export interface UnitSettings {
  force:       ForceUnit
  pressure:    PressureUnit
  length:      LengthUnit
  gridSpacing: number   // always stored in metres internally
}

// Base units: E in MPa, I in mm⁴, A in mm², W in N/mm³
// Default display matches the base units — no conversion needed at rest
export const DEFAULT_UNIT_SETTINGS: UnitSettings = {
  force:       "N",
  pressure:    "MPa",
  length:      "mm",
  gridSpacing: 0.5,
}

export const GRID_SPACING_MIN_M = 0.1
export const GRID_SPACING_MAX_M = 5.0

// ── Elastic Modulus (stored MPa) ─────────────────────────────────────────────
// 1 GPa = 1000 MPa

export function displayE(v: number, u: UnitSettings): number {
  return u.pressure === "GPa" ? v / 1000 : v
}
export function parseE(v: number, u: UnitSettings): number {
  return u.pressure === "GPa" ? v * 1000 : v
}
export function labelE(u: UnitSettings): string {
  return u.pressure
}

// ── Second Moment of Area (stored mm⁴) ───────────────────────────────────────
// 1 mm⁴ = 1e-12 m⁴

export function displayI(v: number, u: UnitSettings): number {
  return u.length === "m" ? v * 1e-12 : v
}
export function parseI(v: number, u: UnitSettings): number {
  return u.length === "m" ? v / 1e-12 : v
}
export function labelI(u: UnitSettings): string {
  return u.length === "m" ? "m\u2074" : "mm\u2074"
}

// ── Cross-sectional Area (stored mm²) ────────────────────────────────────────
// 1 mm² = 1e-6 m²

export function displayA(v: number, u: UnitSettings): number {
  return u.length === "m" ? v * 1e-6 : v
}
export function parseA(v: number, u: UnitSettings): number {
  return u.length === "m" ? v / 1e-6 : v
}
export function labelA(u: UnitSettings): string {
  return u.length === "m" ? "m\u00b2" : "mm\u00b2"
}

// ── Unit Weight (stored N/mm³) ────────────────────────────────────────────────
// Conversion table from N/mm³:
//   N/mm³  →  N/mm³  : ×1          (force=N,  length=mm)
//   N/mm³  →  N/m³   : ×1e9        (force=N,  length=m)
//   N/mm³  →  kN/mm³ : ×1e-3       (force=kN, length=mm)
//   N/mm³  →  kN/m³  : ×1e6        (force=kN, length=m)

export function displayW(v: number, u: UnitSettings): number {
  const forceScale  = u.force  === "kN" ? 1e-3 : 1
  const lengthScale = u.length === "m"  ? 1e9  : 1
  return v * forceScale * lengthScale
}
export function parseW(v: number, u: UnitSettings): number {
  const forceScale  = u.force  === "kN" ? 1e-3 : 1
  const lengthScale = u.length === "m"  ? 1e9  : 1
  return v / (forceScale * lengthScale)
}
export function labelW(u: UnitSettings): string {
  return `${u.force}/${u.length}\u00b3`
}

// ── Analyze-tab display helpers ──────────────────────────────────────────────
// The solver works in base units (kN, m, rad). These helpers convert solver
// outputs into the user-selected display units, plus matching unit labels.

// Force (stored kN). N = kN × 1000.
export function displayForce(v: number, u: UnitSettings): number {
  return u.force === "N" ? v * 1000 : v
}
export function labelForce(u: UnitSettings): string {
  return u.force
}

// Moment (stored kN·m). N·m = kN·m × 1000.
export function displayMoment(v: number, u: UnitSettings): number {
  return u.force === "N" ? v * 1000 : v
}
export function labelMoment(u: UnitSettings): string {
  return `${u.force}·m`
}

// Displacement (stored m). mm = m × 1000.
export function displayDisplacement(v: number, u: UnitSettings): number {
  return u.length === "mm" ? v * 1000 : v
}
export function labelDisplacement(u: UnitSettings): string {
  return u.length
}

// Rotation (stored radians). With length=mm, display in milliradians for
// consistency with the mm prefix; with length=m, display in radians.
export function displayRotation(v: number, u: UnitSettings): number {
  return u.length === "mm" ? v * 1000 : v
}
export function labelRotation(u: UnitSettings): string {
  return u.length === "mm" ? "mrad" : "rad"
}

// ── Grid spacing (stored metres) ─────────────────────────────────────────────

export function displayGridSpacing(v: number, u: UnitSettings): number {
  return u.length === "mm" ? v * 1000 : v
}
export function parseGridSpacing(v: number, u: UnitSettings): number {
  return u.length === "mm" ? v / 1000 : v
}
export function labelGridSpacing(u: UnitSettings): string {
  return u.length
}

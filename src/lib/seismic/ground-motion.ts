/**
 * Ground motion records for linear time history analysis.
 *
 * A record is a uniformly sampled acceleration history — `values[i]` is the
 * ground acceleration at `t = i·dt`. Uniform sampling is a contract, not a
 * convenience: the Newmark integration steps at exactly `dt` (no subdivision,
 * no interpolation), which is also what makes the reference software comparison
 * interpolation-free.
 *
 * Built-in records are code constants; user-imported records live in App
 * state (`groundMotions`), guarded by `reconcileGroundMotions`. A record id is derived from its name at import time; built-in ids win on
 * collision, so `resolveRecord` checks the custom list first only for ids the
 * built-ins do not claim.
 */
import { GRAVITY } from "./mass"
import { EL_CENTRO_NS } from "./records/elcentro"

export type GroundMotionUnit = "g" | "m/s2"

export interface GroundMotionRecord {
  id: string
  name: string
  /** Uniform sample step, seconds. */
  dt: number
  unit: GroundMotionUnit
  values: readonly number[]
  /** Provenance sentence, shown wherever the record is offered. */
  source: string
}

export const BUILT_IN_RECORDS: readonly GroundMotionRecord[] = [EL_CENTRO_NS]

/** Built-ins first — a custom record can never shadow a bundled id. */
export function resolveRecord(
  id: string,
  custom?: readonly GroundMotionRecord[],
): GroundMotionRecord | undefined {
  return (
    BUILT_IN_RECORDS.find((r) => r.id === id) ??
    custom?.find((r) => r.id === id)
  )
}

/**
 * The record as ground accelerations in m/s², scaled.
 *
 * The unit conversion lives here and nowhere else, so a record stored in g and
 * one stored in m/s² are indistinguishable past this point.
 */
export function recordAccelerations(
  r: GroundMotionRecord,
  scale: number,
  opts?: { unit?: GroundMotionUnit },
): Float64Array {
  const f = ((opts?.unit ?? r.unit) === "g" ? GRAVITY : 1) * scale
  const out = new Float64Array(r.values.length)
  for (let i = 0; i < r.values.length; i++) out[i] = r.values[i] * f
  return out
}

/**
 * Linear resample of a uniformly sampled history onto a different step.
 *
 * ⚠ AN IDENTITY AT THE RECORD'S OWN STEP — `dtOut === dtIn` returns the input
 * array itself, not a copy of it, and not a copy that agrees to within a
 * rounding — so a run at the record's own Δt goes through code that does
 * nothing.
 *
 * Total DURATION is preserved, not sample count: n samples span (n−1)·dt, so
 * the output covers the same seconds and its last sample is the input's last.
 * Interpolation is exact for data that is already linear between samples,
 * which is what makes a ramp fixture a real test of it.
 */
export function resampleUniform(
  values: Float64Array,
  dtIn: number,
  dtOut: number,
): Float64Array {
  if (!(dtIn > 0) || !(dtOut > 0)) return values
  if (dtOut === dtIn) return values
  const n = values.length
  if (n < 2) return values
  const T = (n - 1) * dtIn
  // Round rather than floor: a step that divides the duration to within float
  // error must not lose its last sample to 2.9999999999999996.
  const m = Math.max(2, Math.round(T / dtOut) + 1)
  const out = new Float64Array(m)
  for (let i = 0; i < m; i++) {
    const t = Math.min(i * dtOut, T)
    const x = t / dtIn
    const j = Math.min(n - 2, Math.floor(x))
    const w = x - j
    out[i] = values[j] * (1 - w) + values[j + 1] * w
  }
  return out
}

/** Record duration in seconds — n samples span (n − 1)·dt. */
export function recordDuration(r: GroundMotionRecord): number {
  return Math.max(0, r.values.length - 1) * r.dt
}

/** Peak |acceleration| in the record's own unit, with its signed value and time. */
export function recordPeak(r: GroundMotionRecord): {
  value: number
  at: number
} {
  let value = 0
  let at = 0
  for (let i = 0; i < r.values.length; i++) {
    if (Math.abs(r.values[i]) > Math.abs(value)) {
      value = r.values[i]
      at = i * r.dt
    }
  }
  return { value, at }
}

/** Id from a display name: lower-kebab, collapsed. Import enforces uniqueness. */
export function groundMotionId(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
}

/**
 * Field-by-field guard for the document's custom-record list. Never throws:
 * anything that is not a well-formed record is dropped, a malformed list
 * answers empty — the same posture as `reconcileMassSource`.
 */
export function reconcileGroundMotions(raw: unknown): GroundMotionRecord[] {
  if (!Array.isArray(raw)) return []
  const out: GroundMotionRecord[] = []
  const seen = new Set<string>()
  for (const item of raw) {
    if (typeof item !== "object" || item === null) continue
    const r = item as Record<string, unknown>
    const id = typeof r.id === "string" ? r.id : ""
    const name = typeof r.name === "string" ? r.name : ""
    const dt = typeof r.dt === "number" && isFinite(r.dt) && r.dt > 0 ? r.dt : 0
    const unit = r.unit === "g" || r.unit === "m/s2" ? r.unit : null
    const values =
      Array.isArray(r.values) &&
      r.values.length > 0 &&
      r.values.every((v) => typeof v === "number" && isFinite(v))
        ? (r.values as number[])
        : null
    if (!id || !name || !dt || !unit || !values) continue
    if (seen.has(id) || BUILT_IN_RECORDS.some((b) => b.id === id)) continue
    seen.add(id)
    out.push({
      id,
      name,
      dt,
      unit,
      values,
      source: typeof r.source === "string" ? r.source : "Imported record",
    })
  }
  return out
}

/**
 * The assigned ground-motion records, one strip per component on a shared time
 * axis — what the LTH face of the seismic window shows where the ELF/MRS faces
 * show the design spectrum.
 *
 * Same canvas contract as `spectrum-chart.tsx`: the viewBox is the dialog's
 * locked box in pixels, 1:1, so 11 in here is the 11px the rest of the window
 * uses. ⚠ Change either and the other must follow.
 *
 * Colour discipline: the trace is the same navy the spectrum draws with —
 * strips are told apart by POSITION AND LABEL, never by a new hue. The one
 * accent is the peak marker, the same split the spectrum chart makes for the
 * design-period drop-line: colour buys attention, not identity.
 *
 * The band is the per-column min/max envelope (`binEnvelope`), so a 10k-sample
 * custom record draws without aliasing away a peak.
 */

import { binEnvelope } from "@/lib/seismic/accelerogram-geometry"
import {
  recordDuration,
  recordPeak,
  type GroundMotionRecord,
  type GroundMotionUnit,
} from "@/lib/seismic/ground-motion"

const W = 386
const H = 322
const PAD_L = 52
const PAD_R = 14
const PAD_T = 10
const PAD_B = 46
const STRIP_GAP = 22

const AXIS_Y = H - PAD_B
const ROW_TICKS = AXIS_Y + 15
const ROW_AXIS_NAME = AXIS_Y + 31

const NAVY = "#1a2f5e"
const ACCENT = "#2563eb"
const RULE = "#94a3b8"
const MONO = "JetBrains Mono, monospace"
const TYPE = { fontSize: 11, fontFamily: MONO } as const
const SMALL = { fontSize: 9, fontFamily: MONO } as const

export interface AccelerogramStrip {
  /**
   * Identity and DOM hook: the axis for an assigned component, the record id
   * for a library preview. A preview has no axis — the viewer offers every
   * record the document holds, assigned or not.
   */
  key: string
  /** The caption above the strip, composed by the caller. */
  label: string
  record: GroundMotionRecord
  scale: number
  /**
   * The EFFECTIVE unit — the component's declaration where it has one, not
   * the record's own. A component declaring m/s2 over a record stored in g
   * would otherwise be captioned in the unit it is not being read as.
   */
  unit: GroundMotionUnit
}

/** A tick ladder that lands on 1, 2 or 5 × a power of ten. */
function ticks(max: number, target = 6): number[] {
  if (!(max > 0)) return [0]
  const raw = max / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = 0; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)))
  return out
}

export function AccelerogramChart({ strips }: { strips: readonly AccelerogramStrip[] }) {
  if (strips.length === 0) {
    // The empty state keeps its sentence inside the same canvas, so the pane
    // does not collapse and the escape from it — the component rows beside
    // this chart — stays where it was.
    return (
      <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img"
        aria-label="No ground-motion component is enabled." data-accelerogram-chart>
        <text x={W / 2} y={H / 2} textAnchor="middle" className="fill-gray-400" style={TYPE}>
          Enable a component to see its record
        </text>
      </svg>
    )
  }

  const tMax = Math.max(...strips.map((s) => recordDuration(s.record)), 1e-9)
  const x = (t: number) => PAD_L + (t / tMax) * (W - PAD_L - PAD_R)

  const stripH =
    (AXIS_Y - PAD_T - STRIP_GAP * (strips.length - 1)) / strips.length
  const columns = Math.floor(W - PAD_L - PAD_R)

  const unitOf = (s: AccelerogramStrip) => (s.unit === "g" ? "g" : "m/s²")

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      role="img"
      aria-label={
        "Ground-motion accelerogram. " +
        strips
          .map((s) => {
            const p = recordPeak(s.record)
            return (
              `${s.label}, peak ` +
              `${Math.abs(p.value * s.scale).toFixed(3)} ${unitOf(s)} at ${p.at.toFixed(2)} seconds.`
            )
          })
          .join(" ")
      }
      data-accelerogram-chart
    >
      {strips.map((s, k) => {
        const top = PAD_T + k * (stripH + STRIP_GAP)
        const mid = top + stripH / 2
        const p = recordPeak(s.record)
        // The strip is normalised to ITS OWN scaled peak — each record fills
        // its band; relative sizes are stated by the peak captions, which are
        // exact where a shared scale would be a squint.
        const amp = Math.abs(p.value * s.scale)
        const yOf = (v: number) =>
          mid - (amp > 0 ? ((v * s.scale) / amp) * (stripH / 2 - 2) : 0)
        const bins = binEnvelope(s.record.values, s.record.dt, columns)
        const band =
          bins.map((b, i) => `${i === 0 ? "M" : "L"}${x(b.t).toFixed(2)},${yOf(b.max).toFixed(2)}`).join(" ") +
          " " +
          [...bins].reverse().map((b) => `L${x(b.t).toFixed(2)},${yOf(b.min).toFixed(2)}`).join(" ") +
          " Z"
        const peakX = x(p.at)
        const anchor: "start" | "end" = peakX > W - PAD_R - 130 ? "end" : "start"
        return (
          <g key={s.key} data-accelerogram-strip={s.key}>
            {/* Zero line first, so the band paints over it. */}
            <line x1={PAD_L} y1={mid} x2={W - PAD_R} y2={mid} stroke="#e2e8f0" strokeWidth={1} />
            <path d={band} fill={NAVY} fillOpacity={0.85} stroke={NAVY} strokeWidth={0.5} />
            {/* Axis + record, above the strip's left edge. */}
            <text x={PAD_L} y={top - 4} className="fill-gray-500" style={TYPE}>
              {s.label}
            </text>
            {/* The peak: the one accent mark per strip. */}
            <circle cx={peakX} cy={yOf(p.value)} r={2.5} fill={ACCENT} />
            <text
              x={anchor === "start" ? peakX + 5 : peakX - 5}
              y={top + (p.value * s.scale >= 0 ? stripH - 2 : 10)}
              textAnchor={anchor}
              style={{ ...SMALL, fill: ACCENT }}
              data-accelerogram-peak={s.key}
            >
              peak {Math.abs(p.value * s.scale).toFixed(3)} {unitOf(s)} @ {p.at.toFixed(2)} s
            </text>
          </g>
        )
      })}

      <line x1={PAD_L} y1={AXIS_Y} x2={W - PAD_R} y2={AXIS_Y} stroke={RULE} strokeWidth={1} />
      {ticks(tMax).map((v) => (
        <g key={`t${v}`}>
          <line x1={x(v)} y1={AXIS_Y} x2={x(v)} y2={AXIS_Y + 3} stroke={RULE} strokeWidth={1} />
          <text x={x(v)} y={ROW_TICKS} textAnchor="middle" className="fill-gray-400" style={TYPE}>
            {v}
          </text>
        </g>
      ))}
      <text
        x={PAD_L + (W - PAD_L - PAD_R) / 2}
        y={ROW_AXIS_NAME}
        textAnchor="middle"
        className="fill-gray-400"
        style={TYPE}
      >
        time, s
      </text>
    </svg>
  )
}

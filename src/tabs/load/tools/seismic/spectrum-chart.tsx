/**
 * The design response spectrum, with this structure's own period on it.
 *
 * The equivalent lateral force procedure reads two numbers off this curve, SDS
 * and SD1, and never plots it. It is drawn anyway because the plot answers the
 * question the numbers do not: WHY is Cs what it is. A period sitting on the
 * plateau means the short-period cap governs; one out on the 1/T branch means
 * the structure is long enough to shed force. That is one glance instead of
 * three equations, and it is the reason the drop-line to the axis is the loudest
 * thing here — the reader should find their own building before they read the
 * curve.
 *
 * TWO CURVES, because the reader is looking at two different quantities. The
 * DBE curve is the hazard, Sa(T). The reduced curve is the demand the structure
 * is actually designed for, Sa·Ie/R — and the whole content of R is the distance
 * between them. Cs is read off the LOWER curve, which is why the two §12.8.1.1
 * thresholds are drawn there and not on the hazard.
 */

import type { ReactNode } from "react"

import { seismicCoefficient } from "@/lib/seismic/elf"
import type { PeriodSource } from "@/lib/seismic/period"
import type { RiskCategory } from "@/lib/seismic/sdc"
import {
  spectralAcceleration,
  spectrumCorners,
  spectrumCurve,
  type SpectrumInput,
} from "@/lib/seismic/spectrum"

/**
 * ⚠ THE PERIOD AXIS IS CAPPED, and it is a display decision rather than a
 * modelling one. `T_L` is 8 s in most of the maps, and a spectrum plotted to
 * 12 s spends a third of its width on the tail.
 */
const T_AXIS_MAX = 8

/**
 * ⚠ THE VIEWBOX IS THE CANVAS, IN PIXELS, 1:1 — and that is the whole reason
 * the type in here can be sized like the type outside it.
 *
 * An SVG scales its viewBox to fit its box, so `fontSize: 13` in a 560-unit
 * viewBox laid into a 386px column rendered at nine pixels: the source said one
 * size and the screen showed another, exactly as `md:text-sm` did to the number
 * fields. Matching these to the canvas the dialog locks (`h-[340px]`, minus its
 * padding and border) makes one unit one pixel, so 11 here IS the 11px the rest
 * of the window uses. ⚠ Change either of these and the other must follow.
 */
const W = 386
const H = 322
const PAD_L = 60
const PAD_R = 14
const PAD_T = 18
const PAD_B = 62

/** The rows below the axis, each on its own line so nothing lands on anything. */
const AXIS_Y = H - PAD_B
const ROW_TICKS = AXIS_Y + 15
const ROW_PERIOD = AXIS_Y + 30
const ROW_AXIS_NAME = AXIS_Y + 46

/**
 * The legend, INSIDE the plot at the top right.
 *
 * ⚠ IT IS THERE BECAUSE THE SPACE IS EMPTY, not because the corner is
 * conventional — and it is empty for a reason that holds for every design
 * spectrum: past Ts the curve decays as 1/T, so the further right you look the
 * lower it is, and above the tail there is nothing to cover. Below the axis it
 * cost two rows of canvas that the plot has now instead.
 *
 * ⚠ It starts BELOW the corner-period row. T_L's hairline label sits at the top
 * right too, and a legend flush with the top of the plot lands on it.
 */
const LEGEND_ROWS = [PAD_T + 26, PAD_T + 40, PAD_T + 54, PAD_T + 68]
const LEGEND_X = W - PAD_R - 146
const SWATCH = 16

/** The rotated axis title's baseline. Glyph tops face left of it once rotated. */
const AXIS_TITLE_X = 17

const NAVY = "#1a2f5e"
const ACCENT = "#2563eb"
const RULE = "#94a3b8"
/** What a number reads as in this window — the fields' own ink, not the accent. */
const FIELD_INK = "#0f172a"

const MONO = "JetBrains Mono, monospace"
const TYPE = { fontSize: 11, fontFamily: MONO } as const
/** SVG has no `<sub>`; a real subscript is a shifted, smaller tspan. */
const SUB = { fontSize: 8, fontFamily: MONO } as const

/** Dash patterns, so the two thresholds are told apart without a second colour. */
const DASH_MAX = "5 3"
const DASH_MIN = "1.5 2.5"

export interface SpectrumChartProps {
  SDS: number
  SD1: number
  /** Mapped 1-second acceleration. Only the §12.8-6 floor reads it. */
  S1: number
  TL: number
  /** Response modification coefficient — what separates the two curves. */
  R: number
  /** Importance factor. */
  Ie: number
  /**
   * Table 1.5-2's category, which names the upper curve.
   *
   * ⚠ IT DOES NOT CHANGE THE ORDINATE, and the label change is a claim about
   * the DEMAND LEVEL rather than about the curve's height. What is plotted is
   * always the §11.4.6 design spectrum, built on S_DS and S_D1 and independent
   * of the risk category. At Risk Category IV, Table 1.5-2 sets Ie = 1.5 and
   * §11.4.4 already put the design spectrum at two thirds of MCE_R, so the
   * design force carries 1.5 × ⅔ = 1.0 of MCE_R: an essential facility is
   * designed to the maximum considered earthquake. The reduced curve is where
   * that shows up in this figure, since Ie divides into it.
   */
  riskCategory: RiskCategory
  /** The design period. A drop-line marks it. */
  T: number
  /**
   * WHICH period that is — what the drop-line is allowed to call itself.
   *
   * ⚠ IT IS NOT ALWAYS Tₐ, and hard-coding that label would be wrong in three
   * of the four states `governingPeriod` can return. Empirical gives Tₐ;
   * Empirical past the cap gives Cu·Tₐ; Auto reads T₁ off the modes; User
   * defined is whatever was typed. All four land on the same drop-line, and a
   * mark that named the approximate period while pointing at a computed one
   * would be a label disagreeing with the number beside it.
   */
  periodSource: PeriodSource
  /** Sa at the design period, for the marker. */
  Sa: number
  /**
   * The extracted modes, each at its own spectral ordinate — drawn as small
   * markers ON the curve when a modal analysis exists. Quieter than the design
   * period's drop-line: the modes are where the spectrum is READ, the design
   * period is what the reader is looking for.
   */
  modes?: readonly { T: number; Sa: number }[]
}

/**
 * The drop-line's own name, with the value already attached.
 *
 * ⚠ THE VALUE RIDES INSIDE, because every notation here ends on a subscript
 * and the tail has to carry the `dy` back up. Appending " = 0.125 s" as a
 * sibling would render it half a line low, which reads as a rendering fault
 * rather than as a subscript that was never closed.
 */
function periodMark(source: PeriodSource, value: string): ReactNode {
  const tail = (dy: number) => <tspan dy={dy} style={TYPE}>{value}</tspan>
  switch (source) {
    case "approximate":
      return <>T<tspan dy={2.5} style={SUB}>a</tspan>{tail(-2.5)}</>
    case "cu-limit":
      return (
        <>
          C<tspan dy={2.5} style={SUB}>u</tspan>
          <tspan dy={-2.5} style={TYPE}>·T</tspan>
          <tspan dy={2.5} style={SUB}>a</tspan>
          {tail(-2.5)}
        </>
      )
    case "computed":
      return <>T<tspan dy={2.5} style={SUB}>1</tspan>{tail(-2.5)}</>
    case "user":
      return <>T{tail(0)}</>
  }
}

/** A tick ladder that lands on 1, 2 or 5 × a power of ten. */
function ticks(max: number, target = 5): number[] {
  if (!(max > 0)) return [0]
  const raw = max / target
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag
  const out: number[] = []
  for (let v = 0; v <= max + step * 1e-9; v += step) out.push(Number(v.toFixed(10)))
  return out
}

export function SpectrumChart({
  SDS, SD1, S1, TL, R, Ie, T, Sa, riskCategory, periodSource, modes,
}: SpectrumChartProps) {
  /** See `riskCategory` on the props: a demand level, not a different ordinate. */
  const hazard = riskCategory === "IV" ? "MCE" : "DBE"
  const input: SpectrumInput = { SDS, SD1, TL }
  const { T0, Ts } = spectrumCorners(input)
  const pts = spectrumCurve(input)

  // ⚠ THE AXIS STOPS AT 8 s, whatever was sampled. Past the long-period
  // transition the curve is 1/T² and visually flat, so every second beyond
  // this one spends width on a line that says nothing while squeezing the
  // plateau — the part of the spectrum a reviewer actually reads — into the
  // first eighth of the plot. Sampling is unchanged; this is the VIEW.
  const tMax = Math.min(T_AXIS_MAX, pts.length > 0 ? pts[pts.length - 1].T : 1)

  // ⚠ AND THE CURVE IS CUT TO IT, rather than left to run off the edge. It was
  // drawn from every sampled point, so with TL = 8 the tail carried on to 12 s
  // and the viewBox clipped it — the curve reached the right border and the
  // axis label sat on top of it. The endpoint is inserted exactly, so the last
  // segment ends ON the axis rather than wherever a sample happened to fall.
  const shown = pts.filter((p) => p.T <= tMax)
  if (shown.length === 0 || shown[shown.length - 1].T < tMax) {
    shown.push({ T: tMax, Sa: spectralAcceleration(tMax, input) })
  }

  /**
   * ⚠ Cs,max AND Cs,min COME FROM `seismicCoefficient`, the same function the
   * ladder runs. Writing `0.044·SDS·Ie` here would be a second derivation of a
   * published quantity in a file whose job is to draw one — which is how two
   * numbers for one thing get into a report. This chart is the only caller that
   * wants the equations rather than the answer.
   *
   * ⚠ GUARDED BEFORE ANYTHING READS THEM, not after. This component is called
   * from suites that are type-checked by no tsconfig, so an absent `R` arrives
   * as undefined — and NaN does not announce itself: it drops out of every
   * comparison as `false`, so the two threshold lines simply do not draw, and
   * it reaches the screen only through the one place that formats a number
   * without comparing it first, the aria-label. A chart that renders correctly
   * for a sighted reader and says "NaN" to a screen reader is the worst
   * available outcome.
   */
  const RSafe = R > 0 ? R : 1
  const IeSafe = Ie > 0 ? Ie : 1
  const cs = seismicCoefficient({ SDS, SD1, S1, TL, T, R: RSafe, Ie: IeSafe })
  // ⚠ THE FLOOR DRAWN IS THE GOVERNING ONE. §12.8-6 raises it near a major
  // fault (S1 >= 0.6), and a line labelled Cs,min sitting BELOW the value Cs
  // was clamped to would be worse than no line at all.
  const csMin = Math.max(cs.CsMin, cs.CsNearFault ?? 0)
  const csMax = cs.CsEq2

  /** The reduction the design curve carries — the whole distance between them. */
  const RoverI = RSafe / IeSafe

  const saMax = Math.max(SDS * 1.15, Sa * 1.15, 1e-6)

  const x = (t: number) => PAD_L + (t / tMax) * (W - PAD_L - PAD_R)
  const y = (s: number) => AXIS_Y - (s / saMax) * (AXIS_Y - PAD_T)

  /** Keep a label inside the plot however close to an edge its line is. */
  const anchorAt = (px: number): "start" | "middle" | "end" =>
    px < PAD_L + 22 ? "start" : px > W - PAD_R - 22 ? "end" : "middle"
  const clampX = (px: number) => Math.min(Math.max(px, PAD_L + 2), W - PAD_R - 2)

  const curve = (scale: number) =>
    shown
      .map((p, i) => `${i === 0 ? "M" : "L"}${x(p.T).toFixed(2)},${y(p.Sa * scale).toFixed(2)}`)
      .join(" ")

  const plateau = `M${x(T0)},${y(0)} L${x(T0)},${y(SDS)} L${x(Ts)},${y(SDS)} L${x(Ts)},${y(0)} Z`

  const corners: [number, string, string][] = [
    [T0, "T", "0"],
    [Ts, "T", "s"],
  ]
  if (TL <= tMax) corners.push([TL, "T", "L"])

  /** One legend entry: a swatch of the very stroke it names, then the name. */
  const legendKey = (
    row: number,
    stroke: string,
    dash: string | undefined,
    opacity: number,
    label: ReactNode,
  ) => (
    <g>
      <line
        x1={LEGEND_X} y1={LEGEND_ROWS[row] - 4} x2={LEGEND_X + SWATCH} y2={LEGEND_ROWS[row] - 4}
        stroke={stroke} strokeWidth={1.75} strokeDasharray={dash} strokeOpacity={opacity}
      />
      <text x={LEGEND_X + SWATCH + 6} y={LEGEND_ROWS[row]} className="fill-gray-500" style={TYPE}>
        {label}
      </text>
    </g>
  )

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="h-full w-full"
      role="img"
      aria-label={
        `Design response spectrum. SDS ${SDS.toFixed(3)} g, SD1 ${SD1.toFixed(3)} g, ` +
        `design period ${T.toFixed(3)} seconds. The upper curve is the ${hazard} level. ` +
        `The reduced curve is Sa times Ie over R, ` +
        `bounded by Cs max ${csMax.toFixed(4)} and Cs min ${csMin.toFixed(4)}.`
      }
      data-spectrum-chart
    >
      {/* Horizontal gridlines and the Sa scale. */}
      {ticks(saMax, 6).map((v) => (
        <g key={`h${v}`}>
          <line x1={PAD_L} y1={y(v)} x2={W - PAD_R} y2={y(v)} stroke="#f1f5f9" strokeWidth={1} />
          <text x={PAD_L - 8} y={y(v) + 4} textAnchor="end" className="fill-gray-400" style={TYPE}>
            {v.toFixed(2)}
          </text>
        </g>
      ))}
      {ticks(tMax, 6).map((v) => (
        <text
          key={`t${v}`} x={x(v)} y={ROW_TICKS} textAnchor="middle"
          className="fill-gray-400" style={TYPE}
        >
          {v}
        </text>
      ))}

      {/* The constant-acceleration plateau, named by being the only shaded region. */}
      <path d={plateau} fill={NAVY} fillOpacity={0.05} />

      {/* Corner periods. Hairlines, because they are reference and not data. */}
      {corners.map(([t, base, s]) => (
        <g key={`${base}${s}`}>
          <line
            x1={x(t)} y1={PAD_T} x2={x(t)} y2={AXIS_Y}
            stroke="#cbd5e1" strokeWidth={1} strokeDasharray="2 3"
          />
          <text
            x={clampX(x(t))} y={PAD_T + 8} textAnchor={anchorAt(x(t))}
            className="fill-gray-400" style={TYPE}
          >
            {base}
            <tspan dy={2.5} style={SUB}>{s}</tspan>
          </text>
        </g>
      ))}

      <line x1={PAD_L} y1={AXIS_Y} x2={W - PAD_R} y2={AXIS_Y} stroke={RULE} strokeWidth={1} />
      <line x1={PAD_L} y1={PAD_T} x2={PAD_L} y2={AXIS_Y} stroke={RULE} strokeWidth={1} />

      {/* ⚠ THE THRESHOLDS BELONG TO THE REDUCED CURVE, so they are drawn under
          it: Cs is what the lower curve is read for, and §12.8.1.1 caps and
          floors THAT. Drawn across the full width because neither bound is a
          function of the period — Cs,max is the reduced plateau extended, which
          is the point. */}
      {csMax > 0 && csMax <= saMax && (
        <line
          data-spectrum-csmax
          x1={PAD_L} y1={y(csMax)} x2={W - PAD_R} y2={y(csMax)}
          stroke={RULE} strokeWidth={1.25} strokeDasharray={DASH_MAX}
        />
      )}
      {csMin > 0 && csMin <= saMax && (
        <line
          data-spectrum-csmin
          x1={PAD_L} y1={y(csMin)} x2={W - PAD_R} y2={y(csMin)}
          stroke={RULE} strokeWidth={1.25} strokeDasharray={DASH_MIN}
        />
      )}

      {/* The two spectra. The reduced one is the same navy at a lower value —
          ⚠ NOT a second hue. Every colour on the canvas already means something,
          and these are one quantity divided by a number, not two quantities. */}
      <path
        data-spectrum-reduced
        d={curve(1 / RoverI)}
        fill="none" stroke={NAVY} strokeOpacity={0.38} strokeWidth={1.5} strokeLinejoin="round"
      />
      <path
        data-spectrum-dbe
        d={curve(1)}
        fill="none" stroke={NAVY} strokeWidth={1.75} strokeLinejoin="round"
      />

      {/* The modes — open markers on the curve, numbered from the longest. */}
      {(modes ?? []).map((m, i) =>
        m.T > 0 && m.T <= tMax ? (
          <g key={`m${i}`} data-spectrum-mode={i + 1}>
            <circle cx={x(m.T)} cy={y(m.Sa)} r={2.5} fill="#fff" stroke={NAVY} strokeWidth={1.25} />
            <text
              x={x(m.T)} y={y(m.Sa) - 5} textAnchor="middle"
              style={{ ...TYPE, fill: NAVY }}
            >
              {i + 1}
            </text>
          </g>
        ) : null,
      )}

      {/* The structure. A drop-line, because the reader is looking for their own
          building before they are looking at the curve. */}
      {T > 0 && T <= tMax && (
        <g>
          <line x1={x(T)} y1={y(Sa)} x2={x(T)} y2={AXIS_Y} stroke={ACCENT} strokeWidth={1.25} />
          <circle cx={x(T)} cy={y(Sa)} r={3.5} fill={ACCENT} />
          {/* ⚠ THE LINE KEEPS THE ACCENT AND THE READOUT DOES NOT, which is a
              split rather than an inconsistency. The accent is what makes the
              drop-line findable against a navy curve — it is the one mark in
              here that answers "where is MY building". The NUMBER beside it is
              a value like every value in this window, and reading it in the
              same near-black as the fields is what says so. Colour is spent on
              this canvas; it buys attention, not identity. */}
          <text
            data-spectrum-period={periodSource}
            x={clampX(x(T))} y={ROW_PERIOD} textAnchor={anchorAt(x(T))}
            style={{ ...TYPE, fill: FIELD_INK }}
          >
            {periodMark(periodSource, ` = ${T.toFixed(3)} s`)}
          </text>
        </g>
      )}

      {/* ⚠ THE AXIS IS NAMED ON THE AXIS, rotated to read bottom-to-top. It was
          a two-letter corner label above the topmost tick, which is a legend
          for the scale pretending to be part of it: "Sa" names nothing to a
          reader who does not already know the notation, and it competed with
          T₀ for the same corner. ⚠ `PAD_L` carries it — 60px, not 46 — so the
          title clears the tick numbers rather than sitting under them. */}
      <text
        transform={`rotate(-90 ${AXIS_TITLE_X} ${(PAD_T + AXIS_Y) / 2})`}
        x={AXIS_TITLE_X} y={(PAD_T + AXIS_Y) / 2} textAnchor="middle"
        className="fill-gray-400" style={TYPE}
      >
        Spectral acceleration, S
        <tspan dy={2.5} style={SUB}>a</tspan>
        <tspan dy={-2.5} style={TYPE}> (g)</tspan>
      </text>
      {/* ⚠ A ROW OF ITS OWN, below the period readout. It sat on the tick line
          at the right-hand end, where it collided with the last tick and with
          the tail of the curve. */}
      <text
        x={PAD_L + (W - PAD_L - PAD_R) / 2} y={ROW_AXIS_NAME} textAnchor="middle"
        className="fill-gray-400" style={TYPE}
      >
        period, s
      </text>

      {/* ── The legend ───────────────────────────────────────────────────────
          ⚠ FOUR ENTRIES, because there are four strokes. Two dashed rules at
          different heights are not self-describing, and the reader has no way
          to tell which is the cap without being told.

          ⚠ AND IN THE ORDER THE FIGURE IS READ DOWN: the hazard, the reduction
          of it, then the two bounds on the reduced one. That is the sentence
          the plot makes, and a legend in any other order asks the reader to
          reassemble it. */}
      <g data-spectrum-legend>
        {legendKey(0, NAVY, undefined, 1, <>
          {hazard}
          {hazard === "MCE" && <tspan dy={2.5} style={SUB}>R</tspan>}
          <tspan dy={hazard === "MCE" ? -2.5 : 0} style={TYPE}> — S</tspan>
          <tspan dy={2.5} style={SUB}>a</tspan>
        </>)}
        {legendKey(1, NAVY, undefined, 0.38, <>
          Reduced — S<tspan dy={2.5} style={SUB}>a</tspan>
          <tspan dy={-2.5} style={TYPE}>·I</tspan>
          <tspan dy={2.5} style={SUB}>e</tspan>
          <tspan dy={-2.5} style={TYPE}>/R</tspan>
        </>)}
        {legendKey(2, RULE, DASH_MAX, 1, <>
          C<tspan dy={2.5} style={SUB}>s,max</tspan>
        </>)}
        {legendKey(3, RULE, DASH_MIN, 1, <>
          C<tspan dy={2.5} style={SUB}>s,min</tspan>
        </>)}
      </g>
    </svg>
  )
}

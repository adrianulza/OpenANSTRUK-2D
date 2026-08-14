/**
 * Advanced Report deck — steel BEAM (AISC 360-16 Chapter F + G).
 *
 * The centrepiece is the **Mn vs Lb curve**: the whole of Chapter F's flexural
 * story in one picture — the plastic plateau, the inelastic-LTB ramp between
 * `Lp` and `Lr`, and the elastic tail beyond — with a marker at the member's
 * actual unbraced length. It is the chart a steel engineer draws by hand, and it
 * answers the question a single `φMn` cannot: *how much capacity is bracing
 * buying, and how much would a little more buy?*
 *
 * NO DESIGN MATH LIVES HERE. Every point on the curve comes from the same
 * `flexuralStrength()` the strategy calls, fed by the same
 * `steelFlexureInput()`. The deck only chooses which `Lb` values to ask about.
 *
 * Two shapes get a second curve, because for them one curve would be a lie:
 *  - a TEE has different strengths sagging and hogging (F9's sign split);
 *  - an ANGLE resists about two principal axes at once (F10), and the minor one
 *    usually governs.
 */

import * as React from "react"
import type { Section } from "@/lib/model"
import type { SteelCriteria } from "@/lib/design/steel/criteria"
import type { SteelDesignResult } from "@/lib/design/core/types"
import { flexuralStrength } from "@/lib/design/steel/flexure"
import {
  isSteelPropsError, resolveSteelSection, steelFlexureInput,
} from "@/lib/design/steel/section-props"
import { FONT } from "../../chart-text"
import {
  CHART_H, CHART_W, GRAY, GRID, PAD_B, PAD_L, PAD_R, PAD_T, fmt, ticks,
} from "../../chart-utils"
import { AMBER, Card, DList, DRow, FAIL, LadderRow, NAVY, ReportDeck, UtilBar } from "../deck"

const CURVE_MAIN = "#1a2f5e"
const CURVE_ALT = "#0ea5e9"
const CURVE_Z = "#f97316"
const N_SAMPLES = 90

interface Props {
  open: boolean
  section: Section
  criteria: SteelCriteria
  /** Unbraced length actually used, m. */
  Lb: number
  Cb: number
  /** Governing member's result, when a design run has happened. */
  result?: SteelDesignResult
  memberId?: string
}

export interface Curve {
  key: string
  label: string
  color: string
  dash?: string
  /** [Lb in m, φMn in kN·m] */
  pts: [number, number][]
}

/**
 * Sample the φMn(Lb) curves for a section — the deck's whole data model, split
 * out so a render test can build it without a DOM. Returns `{ error }` for a
 * section the clauses refuse.
 */
export function buildLtbCurves(
  section: Section, criteria: SteelCriteria, Lb: number, Cb: number,
) {
  const rs = resolveSteelSection(section, criteria.Fy, criteria.E)
  if (isSteelPropsError(rs)) return { error: rs.error }

  // Probe once to learn Lp/Lr, then span a range that shows all three zones
  // plus the member's own Lb. Falling back to 6 m keeps the axis sane for
  // shapes with no LTB limit state at all (RHS, CHS).
  const probe = flexuralStrength(steelFlexureInput(rs, Lb * 1000 || 1, Cb))
  if (probe.outOfScope) return { error: probe.outOfScope }
  const LrM = probe.Lr !== undefined ? probe.Lr / 1000 : 0
  const xMax = Math.max(2 * LrM, 1.4 * Lb, 6)

  const sample = (
    momentSign: 1 | -1,
    pick: (f: ReturnType<typeof flexuralStrength>) => number | undefined,
  ) => {
    const pts: [number, number][] = []
    for (let i = 0; i <= N_SAMPLES; i++) {
      const x = (i / N_SAMPLES) * xMax
      const f = flexuralStrength(steelFlexureInput(rs, Math.max(x * 1000, 1e-6), Cb, momentSign))
      const v = pick(f)
      if (v !== undefined && Number.isFinite(v)) pts.push([x, criteria.phiB * v])
    }
    return pts
  }

  const kind = rs.g.kind
  const curves: Curve[] = []
  if (kind === "tee") {
    curves.push({ key: "pos", label: "φMn — sagging (stem in tension)", color: CURVE_MAIN, pts: sample(1, (f) => f.Mn) })
    curves.push({ key: "neg", label: "φMn — hogging (stem in compression)", color: CURVE_ALT, dash: "5 3", pts: sample(-1, (f) => f.Mn) })
  } else if (kind === "angle") {
    curves.push({ key: "w", label: "φMn — major principal (w)", color: CURVE_MAIN, pts: sample(1, (f) => f.MnW) })
    curves.push({ key: "z", label: "φMn — minor principal (z)", color: CURVE_Z, dash: "5 3", pts: sample(1, (f) => f.MnZ) })
  } else {
    curves.push({ key: "mn", label: "φMn", color: CURVE_MAIN, pts: sample(1, (f) => f.Mn) })
  }

  const at = flexuralStrength(steelFlexureInput(rs, Math.max(Lb * 1000, 1e-6), Cb))
  return {
    rs, at, curves, xMax,
    Lp: at.Lp !== undefined ? at.Lp / 1000 : undefined,
    Lr: at.Lr !== undefined ? at.Lr / 1000 : undefined,
    phiMp: criteria.phiB * at.Mp,
  }
}

export function SteelBeamReportDeck({
  open, section, criteria, Lb, Cb, result, memberId,
}: Props) {
  const model = React.useMemo(
    () => buildLtbCurves(section, criteria, Lb, Cb),
    [section, criteria, Lb, Cb],
  )

  if (!open) return null
  if ("error" in model) {
    return (
      <ReportDeck open={open} title="Advanced Report: Steel Beam">
        <div className="rounded bg-amber-50 border border-amber-200 px-2 py-2">
          <p className="text-[10px] text-amber-800 leading-snug">{model.error}</p>
        </div>
      </ReportDeck>
    )
  }

  const { curves, xMax, Lp, Lr, phiMp, at, rs } = model
  const phiMnAt = criteria.phiB * at.Mn

  return (
    <ReportDeck open={open} title="Advanced Report: Steel Beam">
      <LtbChart
        curves={curves} xMax={xMax} Lp={Lp} Lr={Lr} phiMp={phiMp}
        Lb={Lb} phiMnAt={phiMnAt}
      />

      <Card title="Flexural limit states (Chapter F)">
        <div className="space-y-0.5">
          <LadderRow
            name="Yielding — φMp" clause={clauseFor(rs.g.kind, "yielding")}
            value={phiMp} unit="kN·m" governs={at.governing === "yielding"}
          />
          {Lp !== undefined && (
            <LadderRow
              name="Lateral-torsional buckling"
              clause={Lb <= Lp ? "Lb ≤ Lp" : Lb <= (Lr ?? 0) ? "F2-2 / F9-6" : "F2-3 / F9-7"}
              value={criteria.phiB * at.Mn} unit="kN·m"
              governs={at.governing === "LTB-inelastic" || at.governing === "LTB-elastic"}
            />
          )}
          <LadderRow
            name={localName(rs.g.kind)} clause={clauseFor(rs.g.kind, "local")}
            value={criteria.phiB * at.MnNoLTB} unit="kN·m"
            governs={at.governing === "FLB" || at.governing === "WLB" || at.governing === "LLB"}
          />
        </div>
        <DList>
          <DRow label="Governing" value={at.governing} strong color={NAVY} />
          <DRow label="Classification" value={at.cls} />
          <DRow label={<>L<sub>b</sub> / L<sub>p</sub> / L<sub>r</sub></>} value={
            `${fmt(Lb)} / ${fmt(Lp)} / ${fmt(Lr)} m`
          } />
          <DRow label={<>C<sub>b</sub></>} value={fmt(Cb, 3)} />
        </DList>
        {rs.g.kind === "angle" && (
          <p className="text-[9px] text-gray-500 leading-snug">
            F10 works on the principal axes. The solver's geometric M33 splits
            into <span className="font-mono">Mw = M33·cos α</span> and
            {" "}<span className="font-mono">Mz = −M33·sin α</span>, and since
            {" "}<span className="font-mono">Iz ≈ Iw/4</span> the minor term
            usually governs — a high D/C on a bending angle is real behaviour,
            not a modelling artefact.
          </p>
        )}
        {rs.g.kind === "tee" && (
          <p className="text-[9px] text-gray-500 leading-snug">
            F9 is sign-dependent. Sagging puts the stem in tension
            (cap 1.6M<sub>y</sub>); hogging puts it in compression (cap
            M<sub>y</sub>, and the F9-10 bracket collapses instead of growing).
          </p>
        )}
      </Card>

      {result && (
        <Card title={`Utilisation — governing member ${memberId ?? ""}`}>
          <UtilBar
            label={<>Flexure φM<sub>n</sub></>}
            capacity={result.Mc33} demand={result.governing?.Mr ?? result.MrMax} unit="kN·m"
          />
          <UtilBar
            label={<>Shear φV<sub>n</sub> (Chapter G)</>}
            capacity={result.Vc} demand={result.Vr} unit="kN"
          />
          <DList>
            <DRow label="Governing equation" value={result.equation} strong color={NAVY} />
            <DRow label="Combination" value={result.governing?.combo ?? "—"} />
            <DRow label="Station x" value={`${fmt(result.governing?.x)} m`} />
            <DRow
              label="Combined D/C"
              value={Number.isFinite(result.ratio) ? result.ratio.toFixed(3) : "O/S"}
              strong color={result.ratio <= 1 ? NAVY : FAIL}
            />
          </DList>
          {result.McPos !== undefined && result.McNeg !== undefined && (
            <DList>
              <DRow label="φMn sagging" value={`${fmt(result.McPos, 1)} kN·m`} />
              <DRow label="φMn hogging" value={`${fmt(result.McNeg, 1)} kN·m`} color={AMBER} />
            </DList>
          )}
          {result.McW !== undefined && (
            <DList>
              <DRow label={<>φM<sub>n,w</sub> / M<sub>r,w</sub></>} value={`${fmt(result.McW, 1)} / ${fmt(result.MrW, 2)}`} />
              <DRow label={<>φM<sub>n,z</sub> / M<sub>r,z</sub></>} value={`${fmt(result.McZ, 1)} / ${fmt(result.MrZ, 2)}`} color={CURVE_Z} />
            </DList>
          )}
        </Card>
      )}
    </ReportDeck>
  )
}

function localName(kind: string): string {
  if (kind === "angle") return "Leg local buckling"
  if (kind === "tee") return "Flange / stem local buckling"
  if (kind === "chs") return "Local buckling"
  return "Flange / web local buckling"
}

function clauseFor(kind: string, what: "yielding" | "local"): string {
  const y: Record<string, string> = {
    iwf: "F2-1", rhs: "F7-1", chs: "F8-1", tee: "F9-2 / F9-4", angle: "F10-1",
  }
  const l: Record<string, string> = {
    iwf: "F3-1 / F3-2", rhs: "F7-2 / F7-5", chs: "F8-2 / F8-3",
    tee: "F9-14 / F9-16", angle: "F10-6…8",
  }
  return (what === "yielding" ? y : l)[kind] ?? "—"
}

// ── Mn vs Lb chart ───────────────────────────────────────────────────────────

/**
 * Exported for `validation/steel_ui_smoke.mts`: the deck itself portals into
 * `document.body`, which does not exist server-side, so a render test can only
 * reach the chart's scale arithmetic by rendering it directly.
 */
export function LtbChart({
  curves, xMax, Lp, Lr, phiMp, Lb, phiMnAt,
}: {
  curves: Curve[]
  xMax: number
  Lp?: number
  Lr?: number
  phiMp: number
  Lb: number
  phiMnAt: number
}) {
  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = CHART_H - PAD_T - PAD_B
  const yMax = Math.max(phiMp, ...curves.flatMap((c) => c.pts.map((p) => p[1])), 1) * 1.08

  const X = (v: number) => PAD_L + (v / xMax) * plotW
  const Y = (v: number) => PAD_T + plotH - (v / yMax) * plotH

  const path = (pts: [number, number][]) =>
    pts.map(([x, y], i) => `${i ? "L" : "M"}${X(x).toFixed(1)},${Y(y).toFixed(1)}`).join(" ")

  const xT = ticks(0, xMax, 6)
  const yT = ticks(0, yMax, 5)

  return (
    <div className="rounded border border-gray-200 bg-gray-50">
      <svg width={CHART_W} height={CHART_H} className="block w-full h-auto" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        {/* LTB zone shading — plastic / inelastic / elastic */}
        {Lp !== undefined && Lr !== undefined && Lr > Lp && (
          <>
            <rect x={PAD_L} y={PAD_T} width={Math.max(0, X(Lp) - PAD_L)} height={plotH} fill="#1a2f5e" opacity={0.04} />
            <rect x={X(Lp)} y={PAD_T} width={Math.max(0, X(Math.min(Lr, xMax)) - X(Lp))} height={plotH} fill="#0ea5e9" opacity={0.05} />
          </>
        )}

        <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="none" stroke={GRAY} strokeWidth={0.8} />

        {xT.map((v) => (
          <g key={`x${v}`}>
            <line x1={X(v)} y1={PAD_T} x2={X(v)} y2={PAD_T + plotH} stroke={GRID} strokeWidth={0.6} />
            <text className="font-mono" x={X(v)} y={PAD_T + plotH + 14} fontSize={FONT} fill={NAVY} textAnchor="middle">
              {v % 1 === 0 ? v : v.toFixed(1)}
            </text>
          </g>
        ))}
        {yT.map((v) => (
          <g key={`y${v}`}>
            <line x1={PAD_L} y1={Y(v)} x2={PAD_L + plotW} y2={Y(v)} stroke={GRID} strokeWidth={0.6} />
            <text className="font-mono" x={PAD_L - 7} y={Y(v) + 3} fontSize={FONT} fill={NAVY} textAnchor="end">
              {Math.round(v)}
            </text>
          </g>
        ))}

        {/* φMp reference */}
        <line x1={PAD_L} y1={Y(phiMp)} x2={PAD_L + plotW} y2={Y(phiMp)} stroke={GRAY} strokeWidth={0.8} strokeDasharray="2 3" />
        <text className="font-mono" x={PAD_L + plotW - 3} y={Y(phiMp) - 3} fontSize={FONT} fill={GRAY} textAnchor="end">
          φMp
        </text>

        {/* Lp / Lr verticals */}
        {[["Lp", Lp], ["Lr", Lr]].map(([name, v]) =>
          typeof v === "number" && v > 0 && v <= xMax ? (
            <g key={name as string}>
              <line x1={X(v)} y1={PAD_T} x2={X(v)} y2={PAD_T + plotH} stroke={GRAY} strokeWidth={0.9} strokeDasharray="4 3" />
              <text className="font-mono" x={X(v) + 3} y={PAD_T + 10} fontSize={FONT} fill={GRAY}>{name as string}</text>
            </g>
          ) : null,
        )}

        {curves.map((c) => (
          <path key={c.key} d={path(c.pts)} fill="none" stroke={c.color} strokeWidth={1.6} strokeDasharray={c.dash} />
        ))}

        {/* the member's actual Lb */}
        {Lb > 0 && Lb <= xMax && (
          <g>
            <line x1={X(Lb)} y1={PAD_T} x2={X(Lb)} y2={PAD_T + plotH} stroke={FAIL} strokeWidth={1} />
            <circle cx={X(Lb)} cy={Y(phiMnAt)} r={3.2} fill={FAIL} />
            <text className="font-mono" x={X(Lb) + 4} y={Y(phiMnAt) - 5} fontSize={FONT} fill={FAIL}>
              {phiMnAt.toFixed(1)}
            </text>
          </g>
        )}

        <text className="font-mono" x={PAD_L + plotW / 2} y={CHART_H - 6} fontSize={FONT} fill={NAVY} textAnchor="middle">
          unbraced length Lb (m)
        </text>
        <text
          className="font-mono" x={12} y={PAD_T + plotH / 2} fontSize={FONT} fill={NAVY}
          textAnchor="middle" transform={`rotate(-90 12 ${PAD_T + plotH / 2})`}
        >
          φMn (kN·m)
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 pb-1.5 pt-1">
        {curves.map((c) => (
          <span key={c.key} className="inline-flex items-center gap-1 text-[9px] text-gray-600">
            <span className="inline-block w-3 h-0 border-t-2" style={{ borderColor: c.color, borderStyle: c.dash ? "dashed" : "solid" }} />
            {c.label}
          </span>
        ))}
        <span className="inline-flex items-center gap-1 text-[9px] text-gray-600">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: FAIL }} />
          this member's Lb
        </span>
      </div>
    </div>
  )
}

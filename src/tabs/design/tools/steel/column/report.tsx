/**
 * Advanced Report deck — steel COLUMN (AISC 360-16 Chapter E + H).
 *
 * The steel analogue of the RC column's P–M curve, and it draws the same way:
 * an interaction envelope in (M, P) with the demands that were actually checked
 * plotted on it. What differs is that a steel envelope is EXACT and
 * piecewise-linear — it is the H1 equation rearranged, not a strain-compatibility
 * sweep:
 *
 *     Pr/Pc ≥ 0.2 :  Pr/Pc + (8/9)(Mr/Mc) = 1   ⇒  M = (9/8)·Mc·(1 − Pr/Pc)
 *     Pr/Pc < 0.2 :  Pr/(2Pc) + Mr/Mc  = 1      ⇒  M = Mc·(1 − Pr/(2Pc))
 *
 * so the compression side is two straight segments with a kink at Pr/Pc = 0.2 —
 * the visible signature of AISC's bilinear form. The tension side uses `PcTens`.
 * An unsymmetric section (single angle) or a hogging tee is checked with H2
 * instead, which is a single straight line: `Pr/Pc + Mrw/Mcw + Mrz/Mcz = 1`.
 *
 * Every number comes from the design run or from the same clause functions the
 * strategy uses. Nothing is recomputed differently here.
 */

import * as React from "react"
import type { Section } from "@/lib/model"
import type { SteelDesignResult } from "@/lib/design/core/types"
import { FONT } from "../../chart-text"
import {
  CHART_H, CHART_W, GRAY, GRID, PAD_B, PAD_L, PAD_R, PAD_T, fmt, ticks,
} from "../../chart-utils"
import { Card, DList, DRow, FAIL, NAVY, ReportDeck, UtilBar } from "../deck"

const ENVELOPE = "#1a2f5e"
const ENVELOPE_ALT = "#0ea5e9"
const DEMAND = "#64748b"

interface Props {
  open: boolean
  section: Section
  result?: SteelDesignResult
  memberId?: string
}

export interface Pt { M: number; P: number }

/**
 * The H1 envelope on the +M side, compression-positive. Returned top-down:
 * squash load → the 0.2 kink → pure flexure → tension yield.
 */
export function h1Envelope(PcComp: number, PcTens: number, Mc: number): Pt[] {
  const kinkP = 0.2 * PcComp
  return [
    { M: 0, P: PcComp },
    // H1-1a segment, from Pr = Pc down to the kink.
    { M: (9 / 8) * Mc * (1 - kinkP / PcComp), P: kinkP },
    // H1-1b segment, kink down to pure flexure.
    { M: Mc, P: 0 },
    // Tension side: same two-branch form on PcTens, plotted as negative P.
    { M: (9 / 8) * Mc * (1 - 0.2), P: -0.2 * PcTens },
    { M: 0, P: -PcTens },
  ]
}

/** H2 is a single plane: `Pr/Pc + Mr/Mc = 1`. One straight segment per side. */
function h2Envelope(PcComp: number, PcTens: number, Mc: number): Pt[] {
  return [
    { M: 0, P: PcComp },
    { M: Mc, P: 0 },
    { M: 0, P: -PcTens },
  ]
}

export function SteelColumnReportDeck({
  open, section, result, memberId,
}: Props) {
  const env = React.useMemo(() => {
    if (!result) return null
    const isH2 = result.equation === "H2-1"
    // For H2 the drawn Mc is the MAJOR-axis capacity reduced by whatever the
    // minor-axis term already consumes — otherwise the demand marker would sit
    // inside an envelope it actually failed.
    const minorUse =
      isH2 && result.McZ && result.McZ > 0 && result.MrZ !== undefined
        ? Math.min(0.999, Math.abs(result.MrZ) / result.McZ)
        : 0
    const McDraw = isH2
      ? Math.max(1e-6, (result.McW ?? result.Mc33) * (1 - minorUse))
      : result.Mc33
    const pts = isH2
      ? h2Envelope(result.PcComp, result.PcTens, McDraw)
      : h1Envelope(result.PcComp, result.PcTens, McDraw)
    return { isH2, pts, McDraw, minorUse }
  }, [result])

  if (!open) return null

  if (!result || !env) {
    return (
      <ReportDeck open={open} title="Advanced Report: Steel Column">
        <div className="rounded bg-gray-50 border border-gray-200 px-2 py-3">
          <p className="text-[10px] text-gray-500 leading-snug">
            Run the design check to draw the interaction envelope. Unlike the RC
            column curve, a steel envelope depends on the member's own unbraced
            length and effective-length factors, so it cannot be drawn from the
            section alone.
          </p>
        </div>
      </ReportDeck>
    )
  }

  const shape = section.shape?.kind ?? "—"

  return (
    <ReportDeck open={open} title="Advanced Report: Steel Column">
      <InteractionChart
        pts={env.pts}
        isH2={env.isH2}
        pmPairs={result.pmPairs}
        governing={result.governing ? { M: result.governing.Mr, P: result.governing.Pr } : undefined}
      />

      <Card title="Compression — Chapter E ladder">
        <DList>
          <DRow label={<>KL/r (governing)</>} value={`${fmt(result.slenderness, 0)} (axis ${result.slendernessAxis ?? "—"})`} />
          <DRow label={<>F<sub>e</sub> — elastic buckling</>} value={`${fmt(result.Fe, 1)} MPa`} />
          {result.Fez !== undefined && (
            <DRow label={<>F<sub>ez</sub> — torsional (E4)</>} value={`${fmt(result.Fez, 1)} MPa`} />
          )}
          <DRow
            label="Governing buckling mode"
            value={result.bucklingMode ?? "flexural"}
            strong color={result.bucklingMode === "flexural-torsional" ? ENVELOPE_ALT : NAVY}
          />
          <DRow label={<>F<sub>cr</sub> (E3-2 / E3-3)</>} value={`${fmt(result.Fcr, 1)} MPa`} />
          <DRow label={<>A<sub>e</sub> (E7)</>} value={result.Ae !== undefined ? `${fmt(result.Ae, 0)} mm²` : "gross"} />
          <DRow label="Axial classification" value={result.axialClass} />
          <DRow label={<>φP<sub>n</sub> compression</>} value={`${fmt(result.PcComp, 0)} kN`} strong color={NAVY} />
          <DRow label={<>φP<sub>n</sub> tension (D2)</>} value={`${fmt(result.PcTens, 0)} kN`} />
        </DList>
      </Card>

      <Card title={`Utilisation — governing member ${memberId ?? ""}`}>
        <UtilBar
          label={<>Axial φP<sub>n</sub></>}
          capacity={result.governing && result.governing.Pr < 0 ? result.PcTens : result.PcComp}
          demand={Math.abs(result.governing?.Pr ?? result.PrMax)} unit="kN"
        />
        <UtilBar
          label={<>Flexure φM<sub>n</sub></>}
          capacity={result.Mc33} demand={result.governing?.Mr ?? result.MrMax} unit="kN·m"
        />
        <UtilBar
          label={<>Shear φV<sub>n</sub></>}
          capacity={result.Vc} demand={result.Vr} unit="kN"
        />
        <DList>
          <DRow label="Governing equation" value={result.equation} strong color={NAVY} />
          <DRow label="Combination" value={result.governing?.combo ?? "—"} />
          <DRow label="Station x" value={`${fmt(result.governing?.x)} m`} />
          <DRow label="Section (flexure)" value={`${shape} · ${result.sectionClass}`} />
          <DRow
            label="Combined D/C"
            value={Number.isFinite(result.ratio) ? result.ratio.toFixed(3) : "O/S"}
            strong color={result.ratio <= 1 ? NAVY : FAIL}
          />
        </DList>
        {env.isH2 && env.minorUse > 0 && (
          <p className="text-[9px] text-gray-500 leading-snug">
            H2 is a linear sum, so the minor-principal term consumes{" "}
            <span className="font-mono">{(env.minorUse * 100).toFixed(0)}%</span> of
            the envelope before any major-axis moment is applied. The curve above
            is drawn on what is left, so the marker's position matches the
            reported D/C.
          </p>
        )}
      </Card>
    </ReportDeck>
  )
}

// ── interaction chart ────────────────────────────────────────────────────────

/**
 * Exported for `validation/steel_ui_smoke.mts` — see the note on `LtbChart`:
 * the deck portals into `document.body`, so a render test cannot reach the
 * chart's scale arithmetic through it.
 */
export function InteractionChart({
  pts, isH2, pmPairs, governing,
}: {
  pts: Pt[]
  isH2: boolean
  pmPairs?: { P: number; M: number }[]
  governing?: { M: number; P: number }
}) {
  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = CHART_H - PAD_T - PAD_B

  const demands = pmPairs ?? []
  const Mmax = Math.max(1, ...pts.map((p) => p.M), ...demands.map((d) => Math.abs(d.M))) * 1.1
  const Ptop = Math.max(...pts.map((p) => p.P), ...demands.map((d) => d.P), 1) * 1.06
  const Pbot = Math.min(...pts.map((p) => p.P), ...demands.map((d) => d.P), 0) * 1.1

  // Compression UP: P is compression-positive, so the top of the plot is Ptop.
  const X = (m: number) => PAD_L + plotW / 2 + (m / Mmax) * (plotW / 2)
  const Y = (p: number) => PAD_T + ((Ptop - p) / (Ptop - Pbot)) * plotH

  // Mirror to −M so the closed envelope reads like the RC deck's.
  const closed = [...pts, ...pts.slice(0, -1).reverse().map((p) => ({ M: -p.M, P: p.P }))]
  const poly = closed.map((p) => `${X(p.M).toFixed(1)},${Y(p.P).toFixed(1)}`).join(" ")

  const mT = ticks(0, Mmax, 4)
  const mGrid = [...mT.slice(1).map((m) => -m).reverse(), ...mT]
  const pT = ticks(Pbot, Ptop, 6)

  return (
    <div className="rounded border border-gray-200 bg-gray-50">
      <svg width={CHART_W} height={CHART_H} className="block w-full h-auto" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        <rect x={PAD_L} y={PAD_T} width={plotW} height={plotH} fill="none" stroke={GRAY} strokeWidth={0.8} />

        {mGrid.map((m) => (
          <g key={`m${m}`}>
            <line x1={X(m)} y1={PAD_T} x2={X(m)} y2={PAD_T + plotH} stroke={GRID} strokeWidth={0.6} />
            <text className="font-mono" x={X(m)} y={PAD_T + plotH + 14} fontSize={FONT} fill={NAVY} textAnchor="middle">
              {Math.round(Math.abs(m))}
            </text>
          </g>
        ))}
        {pT.map((p) => (
          <g key={`p${p}`}>
            <line x1={PAD_L} y1={Y(p)} x2={PAD_L + plotW} y2={Y(p)} stroke={GRID} strokeWidth={0.6} />
            <text className="font-mono" x={PAD_L - 7} y={Y(p) + 3} fontSize={FONT} fill={NAVY} textAnchor="end">
              {Math.round(p)}
            </text>
          </g>
        ))}

        {/* axes through the origin */}
        <line x1={X(0)} y1={PAD_T} x2={X(0)} y2={PAD_T + plotH} stroke={GRAY} strokeWidth={1} />
        <line x1={PAD_L} y1={Y(0)} x2={PAD_L + plotW} y2={Y(0)} stroke={GRAY} strokeWidth={1} />

        <polygon points={poly} fill={ENVELOPE} fillOpacity={0.06} stroke={ENVELOPE} strokeWidth={1.6} />

        {/* the H1-1a/H1-1b kink — the visible signature of the bilinear form */}
        {!isH2 && pts[1] && (
          <>
            <circle cx={X(pts[1].M)} cy={Y(pts[1].P)} r={2.6} fill={ENVELOPE} />
            <text className="font-mono" x={X(pts[1].M) + 5} y={Y(pts[1].P) + 3} fontSize={FONT} fill={ENVELOPE}>
              Pr/Pc = 0.2
            </text>
          </>
        )}

        {demands.map((d, i) => (
          <circle key={i} cx={X(d.M)} cy={Y(d.P)} r={1.8} fill={DEMAND} fillOpacity={0.55} />
        ))}
        {governing && (
          <>
            <circle cx={X(governing.M)} cy={Y(governing.P)} r={4} fill="none" stroke={FAIL} strokeWidth={1.6} />
            <circle cx={X(governing.M)} cy={Y(governing.P)} r={1.6} fill={FAIL} />
          </>
        )}

        <text className="font-mono" x={PAD_L + plotW / 2} y={CHART_H - 6} fontSize={FONT} fill={NAVY} textAnchor="middle">
          M (kN·m)
        </text>
        <text
          className="font-mono" x={12} y={PAD_T + plotH / 2} fontSize={FONT} fill={NAVY}
          textAnchor="middle" transform={`rotate(-90 12 ${PAD_T + plotH / 2})`}
        >
          P (kN, compression +)
        </text>
      </svg>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 px-2 pb-1.5 pt-1">
        <span className="inline-flex items-center gap-1 text-[9px] text-gray-600">
          <span className="inline-block w-3 h-0 border-t-2" style={{ borderColor: ENVELOPE }} />
          {isH2 ? "H2-1 envelope (linear)" : "H1-1a / H1-1b envelope"}
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] text-gray-600">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: DEMAND }} />
          checked (P, M) pairs
        </span>
        <span className="inline-flex items-center gap-1 text-[9px] text-gray-600">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: FAIL }} />
          governing
        </span>
      </div>
    </div>
  )
}

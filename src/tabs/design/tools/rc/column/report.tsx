import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { COLOR_DESIGN_FAIL } from "@/lib/constants"
import { buildColumnBarLayout, layoutToColumnBars } from "@/lib/design/rc/shared/column-grid"
import { getRcCode } from "@/lib/design/rc/codes"
import type { ColumnInteractionCurve } from "@/lib/design/rc/codes/aci318-25"
import type { RcCriteria } from "@/lib/design/rc/criteria"
import type { ColumnArrangement } from "@/lib/design/rc/types"
import type { ColumnPointKey } from "@/lib/design/rc/codes/aci318-25"
import { FONT, NAVY, LABEL, SubText } from "../chart-text"

/**
 * Advanced Capacity Report deck — column. Replaces the beam deck's
 * Section/Strain/Stress/Force triptych with a **section + P–M interaction
 * curve** (book Gambar 5-30): both the nominal Pn–Mn and reduced φPn–φMn closed
 * loops (both +M and −M), the flat φPn,max cap, the five named points A–E, and
 * (after a Run) the demand (Pu, Mu) markers.
 *
 * Anchored to the right of the flyout via the same [data-flyout-root] measure
 * pattern as the beam AdvancedReportDeck. The capacity curve is computed live
 * from the section + arrangement; demand markers come from the design run.
 */

const DECK_WIDTH = 600
const PILL_WIDTH = 3
const GRAY = "#9ca3af"

interface DemandPair {
  P: number
  M: number
}

interface Props {
  open: boolean
  b: number
  h: number
  /** Clear cover to tie, mm */
  cover: number
  arrangement: ColumnArrangement
  fc: number
  criteria: RcCriteria
  /** All combo (P,M) candidate pairs for members using this section (kN, kN·m). */
  demandPairs?: DemandPair[]
  /** Governing demand + its radial D/C. */
  governing?: { P: number; M: number; dc: number }
}

export function ColumnAdvancedReportDeck({
  open, b, h, cover, arrangement, fc, criteria, demandPairs, governing,
}: Props) {
  const [pos, setPos] = React.useState<{ left: number; top: number } | null>(null)
  React.useEffect(() => {
    if (!open || typeof document === "undefined") return
    const root = document.querySelector<HTMLElement>("[data-flyout-root]")
    if (!root) return
    const update = () => {
      const r = root.getBoundingClientRect()
      setPos({ left: r.right + PILL_WIDTH, top: r.top })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(root)
    window.addEventListener("resize", update)
    window.addEventListener("scroll", update, true)
    return () => {
      ro.disconnect()
      window.removeEventListener("resize", update)
      window.removeEventListener("scroll", update, true)
    }
  }, [open])

  const curve = React.useMemo(() => {
    const layout = buildColumnBarLayout(b, h, cover, arrangement)
    return getRcCode(criteria.code).buildInteractionCurve(layoutToColumnBars(layout), b, h, fc, criteria)
  }, [b, h, cover, arrangement, fc, criteria])

  if (!open || typeof document === "undefined" || !pos) return null

  const Ag = b * h
  const rhoG = Ag > 0 ? curve.Ast / Ag : 0

  const deck = (
    <div
      className={cn(
        "fixed bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 z-10",
        "animate-in fade-in slide-in-from-left-2 duration-150 ease-out",
        "flex flex-col max-h-[calc(100dvh-5rem)]",
      )}
      style={{ left: pos.left, top: pos.top, width: DECK_WIDTH }}
    >
      <div className="pl-7 pr-3 py-2 border-b border-gray-100">
        <span className="text-xs font-semibold text-[#1a2f5e] block">
          Advanced Report: Column
        </span>
      </div>

      <div className="p-3 pl-7 overflow-y-auto space-y-3">
        <InteractionChart curve={curve} demandPairs={demandPairs} governing={governing} />

        <CoordinateTable curve={curve} />
        <SummaryCard curve={curve} rhoG={rhoG} governing={governing} b={b} h={h} />
      </div>
    </div>
  )

  return createPortal(deck, document.body)
}

// ── P–M interaction chart (true-pixel SVG) ───────────────────────────────────

const CHART_W = 552
const CHART_H = 360
const PAD_L = 56 // P-axis labels
const PAD_R = 16
const PAD_T = 18
const PAD_B = 40 // M-axis labels
const GRID = "#e5e7eb"

/** Structured label parts per control-point key → true SubText subscripts. */
interface LabelParts { main: string; sub?: string; suffix?: string; sub2?: string }

const POINT_LABEL: Record<ColumnPointKey, LabelParts> = {
  maxComp: { main: "P", sub: "o" },
  allowComp: { main: "P", sub: "n,max" },
  fs0: { main: "f", sub: "s", suffix: "=0" },
  fs05: { main: "f", sub: "s", suffix: "=0.5f", sub2: "y" },
  balanced: { main: "ε", sub: "y" },
  tensionControl: { main: "ε", sub: "t" },
  pureBending: { main: "M", sub: "o" },
  maxTension: { main: "P", sub: "nt,max" },
}

/** HTML twin of SubText for the table's Point column (real <sub>). */
function PointLabel({ parts }: { parts: LabelParts }) {
  return (
    <>
      {parts.main}
      {parts.sub !== undefined && <sub>{parts.sub}</sub>}
      {parts.suffix !== undefined && <span>{parts.suffix}</span>}
      {parts.sub2 !== undefined && <sub>{parts.sub2}</sub>}
    </>
  )
}

/** Emphasis-column notes rendered with real subscripts (presentation-side; the
 *  engine `note` strings stay plain for the domain layer). */
const EMPHASIS: Record<ColumnPointKey, React.ReactNode> = {
  maxComp: "pure compression",
  allowComp: <>design compression (φP<sub>max</sub>)</>,
  fs0: <>tension bar at zero strain (c = d<sub>t</sub>)</>,
  fs05: "tension bar at half-yield strength",
  balanced: <>balanced condition (ε<sub>t</sub> = ε<sub>y</sub>)</>,
  tensionControl: <>tension-controlled (ε<sub>t</sub> = 0.005)</>,
  pureBending: <>pure bending (P = 0)</>,
  maxTension: <>design tension (φf<sub>y</sub>·A<sub>st</sub>)</>,
}

function fmt0(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toString() : "—"
}

/** "Nice" tick step for a given span and target tick count. */
function niceStep(span: number, target: number): number {
  const raw = span / Math.max(1, target)
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const norm = raw / mag
  const step = norm >= 5 ? 5 : norm >= 2 ? 2 : 1
  return step * mag
}

/** Tick values covering [lo, hi] at a nice step (lo<hi). */
function ticks(lo: number, hi: number, target: number): number[] {
  const step = niceStep(hi - lo, target)
  const out: number[] = []
  const start = Math.ceil(lo / step) * step
  for (let v = start; v <= hi + step * 1e-6; v += step) {
    out.push(Math.abs(v) < step * 1e-6 ? 0 : v)
  }
  return out
}

function InteractionChart({
  curve, demandPairs, governing,
}: {
  curve: ColumnInteractionCurve
  demandPairs?: DemandPair[]
  governing?: { P: number; M: number; dc: number }
}) {
  const plotW = CHART_W - PAD_L - PAD_R
  const plotH = CHART_H - PAD_T - PAD_B

  // Axis ranges from the nominal curve (the larger envelope). M symmetric.
  const allM = curve.nominalPolygon.map((p) => Math.abs(p.M))
  const Mmax = Math.max(1, ...allM) * 1.08
  const Ptop = -curve.caps.Po * 1.05 // most compression (top)
  const Pbot = curve.caps.Pnt * 1.1 // most tension (bottom)

  const xM = (m: number) => PAD_L + plotW / 2 + (m / Mmax) * (plotW / 2)
  const yP = (p: number) => PAD_T + ((p - Ptop) / (Pbot - Ptop)) * plotH

  const polyPts = (poly: { M: number; P: number }[]) =>
    poly.map((p) => `${xM(p.M).toFixed(1)},${yP(p.P).toFixed(1)}`).join(" ")

  const x0 = xM(0)
  const yPzero = yP(0)
  const yCap = yP(-curve.caps.PnMax)

  // Radial reference lines (spColumn-style): origin → each control point,
  // extended out to the unreduced (nominal) curve and mirrored to the −M side.
  // A grey dot marks each landing on the nominal curve.
  const rays = curve.controlPoints
    .filter((c) => Math.abs(c.pt.Mn) > 1e-6 && Number.isFinite(c.pt.c)) // skip M=0 / apex
    .flatMap((c) => {
      const x = xM(c.pt.Mn), xm = xM(-c.pt.Mn), y = yP(c.pt.Pn)
      return [{ x, y }, { x: xm, y }] // +M and mirrored −M, on the nominal curve
    })

  // Grid ticks: M symmetric about 0; P in plotted (compression-negative) range.
  const mTicks = ticks(0, Mmax, 4)
  const mGrid = [...mTicks.slice(1).map((m) => -m).reverse(), ...mTicks]
  // P axis is drawn comp-up: top = Ptop (most negative), bottom = Pbot.
  const pTicks = ticks(Math.min(Ptop, Pbot), Math.max(Ptop, Pbot), 6)

  return (
    <div className="rounded border border-gray-200 bg-gray-50">
      <svg width={CHART_W} height={CHART_H} className="block w-full h-auto" viewBox={`0 0 ${CHART_W} ${CHART_H}`}>
        {/* plot frame */}
        <rect
          x={PAD_L} y={PAD_T} width={plotW} height={plotH}
          fill="none" stroke={GRAY} strokeWidth={0.8}
        />

        {/* vertical grid (M) */}
        {mGrid.map((m) => {
          const x = xM(m)
          return (
            <g key={`mg${m}`}>
              <line x1={x} y1={PAD_T} x2={x} y2={PAD_T + plotH} stroke={GRID} strokeWidth={0.6} />
              <line x1={x} y1={PAD_T + plotH} x2={x} y2={PAD_T + plotH + 4} stroke={GRAY} strokeWidth={0.8} />
              <text className="font-mono" x={x} y={PAD_T + plotH + 14} fontSize={FONT} fill={NAVY} textAnchor="middle">
                {fmt0(m)}
              </text>
            </g>
          )
        })}

        {/* horizontal grid (P) — displayed comp-positive (up), so negate label */}
        {pTicks.map((p) => {
          const y = yP(p)
          return (
            <g key={`pg${p}`}>
              <line x1={PAD_L} y1={y} x2={PAD_L + plotW} y2={y} stroke={GRID} strokeWidth={0.6} />
              <line x1={PAD_L - 4} y1={y} x2={PAD_L} y2={y} stroke={GRAY} strokeWidth={0.8} />
              <text className="font-mono" x={PAD_L - 7} y={y + 3} fontSize={FONT} fill={NAVY} textAnchor="end">
                {fmt0(-p)}
              </text>
            </g>
          )
        })}

        {/* radial reference lines: origin → nominal curve, mirrored, with grey dots */}
        {rays.map(({ x, y }, i) => (
          <line
            key={`ray${i}`}
            x1={x0} y1={yPzero} x2={x} y2={y}
            stroke="#cbd5e1" strokeWidth={0.6} strokeDasharray="3 3"
          />
        ))}
        {rays.map(({ x, y }, i) => (
          <circle key={`raydot${i}`} cx={x} cy={y} r={2} fill={GRAY} />
        ))}

        {/* zero axes (emphasised) */}
        <line x1={x0} y1={PAD_T} x2={x0} y2={PAD_T + plotH} stroke={GRAY} strokeWidth={1} />
        <line x1={PAD_L} y1={yPzero} x2={PAD_L + plotW} y2={yPzero} stroke={GRAY} strokeWidth={1} />

        {/* φPn,max cap line (design, dashed) — labelled at the allowComp corner below */}
        <line
          x1={PAD_L} y1={yCap} x2={PAD_L + plotW} y2={yCap}
          stroke={GRAY} strokeWidth={0.6} strokeDasharray="3 3"
        />

        {/* nominal loop (grey dashed) */}
        <polygon
          points={polyPts(curve.nominalPolygon)}
          fill="none" stroke={GRAY} strokeWidth={1} strokeDasharray="4 3"
        />
        {/* φ loop (navy, light fill) */}
        <polygon
          points={polyPts(curve.phiPolygon)}
          fill="#1a2f5e10" stroke={NAVY} strokeWidth={1.4}
        />

        {/* Pₒ (pure compression, nominal squash apex) + Pmax (0.80Pₒ nominal cap):
            chart-only markers on the M = 0 axis, each annotated with its kN value
            (these two are NOT tabulated). Pmax level drawn as a faint dashed line. */}
        {(() => {
          const yPo = yP(-curve.caps.Po)
          const yPmax = yP(-curve.caps.PnMax)
          return (
            <g>
              <circle cx={x0} cy={yPo} r={2.5} fill={GRAY} />
              <SubText
                x={x0 + 6} y={yPo + 3.5}
                main="P" sub="o" suffix={` = ${fmt0(curve.caps.Po)} kN`}
                fill={NAVY} anchor="start"
              />
              <line
                x1={PAD_L} y1={yPmax} x2={PAD_L + plotW} y2={yPmax}
                stroke={GRID} strokeWidth={0.6} strokeDasharray="2 3"
              />
              <circle cx={x0} cy={yPmax} r={2.5} fill={GRAY} />
              <SubText
                x={x0 + 6} y={yPmax + 3.5}
                main="P" sub="max" suffix={` = ${fmt0(curve.caps.PnMax)} kN`}
                fill={NAVY} anchor="start"
              />
            </g>
          )
        })()}

        {/* spColumn control points (φ design loop). Labels match the table's Point
            column (POINT_LABEL); LABEL (#374151), mirrored to both ±M sides. The
            squash apex (maxComp / Pₒ) is drawn separately above. Points on the
            M = 0 axis (Pnt,max) are labelled once. */}
        {curve.controlPoints
          .filter(({ key }) => key !== "maxComp")
          .map(({ key, pt }) => {
          const m = pt.phiMn
          const cy = yP(pt.phiPn)
          const dotFill = NAVY
          const textFill = LABEL
          const onAxis = Math.abs(m) < 1e-6
          const parts = POINT_LABEL[key]
          return (
            <g key={key}>
              <circle cx={xM(m)} cy={cy} r={2.5} fill={dotFill} />
              <SubText
                x={xM(m) + 6} y={cy + 3.5}
                main={parts.main} sub={parts.sub} suffix={parts.suffix} sub2={parts.sub2}
                fill={textFill} anchor="start"
              />
              {!onAxis && (
                <>
                  <circle cx={xM(-m)} cy={cy} r={2.5} fill={dotFill} />
                  <SubText
                    x={xM(-m) - 6} y={cy + 3.5}
                    main={parts.main} sub={parts.sub} suffix={parts.suffix} sub2={parts.sub2}
                    fill={textFill} anchor="end"
                  />
                </>
              )}
            </g>
          )
        })}

        {/* demand markers */}
        {demandPairs?.map((d, i) => (
          <rect
            key={i}
            x={xM(d.M) - 2} y={yP(d.P) - 2} width={4} height={4}
            transform={`rotate(45 ${xM(d.M)} ${yP(d.P)})`}
            fill="none" stroke="#64748b" strokeWidth={0.8}
          />
        ))}
        {governing && (
          <rect
            x={xM(governing.M) - 3} y={yP(governing.P) - 3} width={6} height={6}
            transform={`rotate(45 ${xM(governing.M)} ${yP(governing.P)})`}
            fill={governing.dc > 1 ? COLOR_DESIGN_FAIL : "#16a34a"}
            stroke="#fff" strokeWidth={0.8}
          />
        )}

        {/* axis titles */}
        <SubText
          x={PAD_L + plotW / 2} y={CHART_H - 4}
          main="Bending Moment Capacity (kN)"
          fill={NAVY} anchor="middle"
        />
        <g transform={`rotate(-90 12 ${PAD_T + plotH / 2})`}>
          <SubText
            x={12} y={PAD_T + plotH / 2}
            main="Axial Capacity (kN)"
            fill={NAVY} anchor="middle"
          />
        </g>

        {/* legend: nominal (grey dashed) vs φ design (navy solid) loops */}
        {(() => {
          const lx = PAD_L + 12
          const ly1 = PAD_T + 14
          const ly2 = PAD_T + 30
          return (
            <g>
              <rect
                x={lx - 8} y={ly1 - 11} width={142} height={33}
                rx={4} fill="#ffffff" fillOpacity={0.85} stroke={GRID} strokeWidth={0.8}
              />
              <line x1={lx} y1={ly1} x2={lx + 14} y2={ly1} stroke={GRAY} strokeWidth={1} strokeDasharray="4 3" />
              <text className="font-mono" x={lx + 19} y={ly1 + 3} fontSize={FONT} fill={LABEL}>Pₙ–Mₙ (nominal)</text>
              <line x1={lx} y1={ly2} x2={lx + 14} y2={ly2} stroke={NAVY} strokeWidth={1.4} />
              <text className="font-mono" x={lx + 19} y={ly2 + 3} fontSize={FONT} fill={LABEL}>φPₙ–φMₙ (design)</text>
            </g>
          )
        })()}
      </svg>
    </div>
  )
}

// ── Tables ────────────────────────────────────────────────────────────────────

function CoordinateTable({ curve }: { curve: ColumnInteractionCurve }) {
  const th = "text-right font-normal px-1 py-0.5"
  const td = "text-right px-1 py-0.5"
  const fmt1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—")
  const fmtEps = (e: number) => (Number.isFinite(e) ? e.toFixed(4) : "—")
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">Interaction Control Points (+M)</p>
      <table className="w-full font-mono text-[10px] text-gray-700 border-collapse">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-normal px-1 py-0.5">Point</th>
            <th className="text-left font-normal px-1 py-0.5">Condition</th>
            <th className={th}>φP<sub>n</sub> (kN)</th>
            <th className={th}>φM<sub>n</sub> (kN·m)</th>
            <th className={th}>c (mm)</th>
            <th className={th}>ε<sub>t</sub></th>
            <th className={th}>φ</th>
          </tr>
        </thead>
        <tbody>
          {curve.controlPoints.filter((r) => r.key !== "maxComp").map((r) => (
            <tr key={r.key} className="border-b border-gray-100 last:border-0">
              <td className="text-left px-1 py-0.5 text-[#1a2f5e]">
                <PointLabel parts={POINT_LABEL[r.key]} />
              </td>
              <td className="text-left px-1 py-0.5 text-gray-400">{EMPHASIS[r.key]}</td>
              <td className={td}>{fmt1(r.pt.phiPn)}</td>
              <td className={td}>{fmt1(r.pt.phiMn)}</td>
              <td className={td}>{Number.isFinite(r.pt.c) ? fmt1(r.pt.c) : "∞"}</td>
              <td className={td}>{fmtEps(r.pt.epsT)}</td>
              <td className={td}>{r.pt.phi.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 leading-snug">
        P<sub>n,max</sub> capped at 0.80·φP<sub>o</sub> (tied, 22.4.2.1).
        Strain compatibility per bar; φ ramp 0.65→0.9 (21.2.2).
      </p>
    </div>
  )
}

function SummaryCard({
  curve, rhoG, governing, b, h,
}: {
  curve: ColumnInteractionCurve
  rhoG: number
  governing?: { P: number; M: number; dc: number }
  b: number
  h: number
}) {
  const dc = governing?.dc
  const fmt1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—")
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-0.5">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">Section Summary</p>
      <p className="font-mono text-[10px] text-gray-700">
        A<sub>g</sub> = {Math.round(b)}×{Math.round(h)} = {Math.round(b * h)} mm²
      </p>
      <p className="font-mono text-[10px] text-gray-700">
        A<sub>st</sub> = {Math.round(curve.Ast)} mm² &nbsp; ρ<sub>g</sub> = {(rhoG * 100).toFixed(2)}%
      </p>
      <p className="font-mono text-[10px] text-gray-700">
        P<sub>o</sub> = {fmt1(curve.caps.Po)} kN &nbsp; φP<sub>n,max</sub> = {fmt1(curve.caps.phiPnMax)} kN
      </p>
      {governing ? (
        <p className="font-mono text-[10px] text-gray-700">
          worst D/C = {dc!.toFixed(3)}{" "}
          <span className={dc! > 1 ? "text-red-600" : "text-gray-400"}>
            @ (P = {fmt1(governing.P)} kN, M = {fmt1(governing.M)} kN·m)
          </span>
        </p>
      ) : (
        <p className="font-mono text-[10px] text-gray-400">Run Design to evaluate demands.</p>
      )}
    </div>
  )
}

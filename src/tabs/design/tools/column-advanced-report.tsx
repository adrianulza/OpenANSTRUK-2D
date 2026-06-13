import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { COLOR_DESIGN_FAIL } from "@/lib/constants"
import { buildColumnBarLayout, layoutToColumnBars } from "@/lib/design/column-layout"
import { buildInteractionCurve, type PMPoint } from "@/lib/design/column"
import type { ColumnArrangement, DesignCriteria } from "@/lib/design/types"
import { RcColumnPreview } from "./rc-column-preview"

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
const NAVY = "#1a2f5e"
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
  criteria: DesignCriteria
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
    return buildInteractionCurve(layoutToColumnBars(layout), b, h, fc, criteria)
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
          Advanced Capacity Report — Column
        </span>
        <span className="text-[10px] text-gray-500">
          P–M interaction · f′<sub>c</sub> = {fc} MPa · ρ<sub>g</sub> = {(rhoG * 100).toFixed(2)}%
        </span>
      </div>

      <div className="p-3 pl-7 overflow-y-auto space-y-3">
        <div className="flex gap-3">
          <div className="w-[150px] shrink-0">
            <RcColumnPreview b={b} h={h} cover={cover} arrangement={arrangement} />
          </div>
          <div className="flex-1 min-w-0">
            <InteractionChart curve={curve} demandPairs={demandPairs} governing={governing} />
          </div>
        </div>

        <CoordinateTable curve={curve} />
        <SummaryCard curve={curve} rhoG={rhoG} governing={governing} b={b} h={h} />
      </div>
    </div>
  )

  return createPortal(deck, document.body)
}

// ── P–M interaction chart (true-pixel SVG) ───────────────────────────────────

const CHART_W = 392
const CHART_H = 300
const PAD_L = 44 // P-axis labels
const PAD_R = 10
const PAD_T = 14
const PAD_B = 28 // M-axis labels
const FONT = 10

function fmt0(n: number): string {
  return Number.isFinite(n) ? Math.round(n).toString() : "—"
}

function InteractionChart({
  curve, demandPairs, governing,
}: {
  curve: ReturnType<typeof buildInteractionCurve>
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

  const named: { pt: PMPoint; label: string }[] = [
    { pt: curve.named.A, label: "A" },
    { pt: curve.named.B, label: "B" },
    { pt: curve.named.C, label: "C" },
    { pt: curve.named.D, label: "D" },
    { pt: curve.named.E, label: "E" },
  ]

  const x0 = xM(0)
  const yPzero = yP(0)
  const yCap = yP(-curve.caps.PnMax)

  return (
    <div className="rounded border border-gray-200 bg-gray-50">
      <svg width={CHART_W} height={CHART_H}>
        {/* axes */}
        <line x1={x0} y1={PAD_T} x2={x0} y2={PAD_T + plotH} stroke={GRAY} strokeWidth={0.8} />
        <line x1={PAD_L} y1={yPzero} x2={PAD_L + plotW} y2={yPzero} stroke={GRAY} strokeWidth={0.8} />

        {/* Pn,max cap line (nominal, dashed) */}
        <line
          x1={PAD_L} y1={yCap} x2={PAD_L + plotW} y2={yCap}
          stroke={GRAY} strokeWidth={0.6} strokeDasharray="3 3"
        />
        <text x={PAD_L + plotW} y={yCap - 2} fontSize={FONT - 2} fill={GRAY} textAnchor="end">
          Pn,max
        </text>

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

        {/* named points A–E on the φ curve */}
        {named.map(({ pt, label }) => {
          const cx = xM(pt.phiMn)
          const cy = yP(pt.phiPn)
          return (
            <g key={label}>
              <circle cx={cx} cy={cy} r={2.6} fill={NAVY} />
              <text x={cx + 5} y={cy + 3} fontSize={FONT} fill={NAVY} fontWeight={600}>
                {label}
              </text>
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

        {/* axis labels + a few ticks */}
        <text x={PAD_L + plotW / 2} y={CHART_H - 4} fontSize={FONT} fill={NAVY} textAnchor="middle">
          φMₙ (kN·m)
        </text>
        <text
          x={12} y={PAD_T + plotH / 2} fontSize={FONT} fill={NAVY} textAnchor="middle"
          transform={`rotate(-90 12 ${PAD_T + plotH / 2})`}
        >
          φPₙ (kN)  — comp ↑
        </text>
        <text x={x0 + 3} y={PAD_T + 9} fontSize={FONT - 2} fill={GRAY}>{fmt0(-curve.caps.phiPnMax)}</text>
        <text x={x0 + 3} y={PAD_T + plotH - 3} fontSize={FONT - 2} fill={GRAY}>{fmt0(curve.caps.phiPnt)}</text>
        <text x={PAD_L + plotW - 2} y={yPzero - 3} fontSize={FONT - 2} fill={GRAY} textAnchor="end">{fmt0(Mmax)}</text>
      </svg>
    </div>
  )
}

// ── Tables ────────────────────────────────────────────────────────────────────

function CoordinateTable({ curve }: { curve: ReturnType<typeof buildInteractionCurve> }) {
  const rows: { label: string; pt: PMPoint; note: string }[] = [
    { label: "A", pt: curve.named.A, note: "pure compression (cap)" },
    { label: "B", pt: curve.named.B, note: "balanced (εs = εy)" },
    { label: "C", pt: curve.named.C, note: "tension control (εt = 0.005)" },
    { label: "D", pt: curve.named.D, note: "pure moment" },
    { label: "E", pt: curve.named.E, note: "pure tension" },
  ]
  const th = "text-right font-normal px-1 py-0.5"
  const td = "text-right px-1 py-0.5"
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">Interaction Coordinates</p>
      <table className="w-full font-mono text-[10px] text-gray-700 border-collapse">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-normal px-1 py-0.5">Pt</th>
            <th className={th}>P<sub>n</sub> (kN)</th>
            <th className={th}>M<sub>n</sub> (kN·m)</th>
            <th className={th}>φP<sub>n</sub> (kN)</th>
            <th className={th}>φM<sub>n</sub> (kN·m)</th>
            <th className="text-left font-normal px-1 py-0.5">note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-gray-100 last:border-0">
              <td className="text-left px-1 py-0.5 text-[#1a2f5e] font-semibold">{r.label}</td>
              <td className={td}>{fmt0(r.pt.Pn)}</td>
              <td className={td}>{fmt0(r.pt.Mn)}</td>
              <td className={td}>{fmt0(r.pt.phiPn)}</td>
              <td className={td}>{fmt0(r.pt.phiMn)}</td>
              <td className="text-left px-1 py-0.5 text-gray-400">{r.note}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 leading-snug">
        Compression negative. Strain compatibility per bar; φ ramp 0.65→0.9 (21.2.2);
        cap Pn,max = 0.80·Po (tied, 22.4.2.1).
      </p>
    </div>
  )
}

function SummaryCard({
  curve, rhoG, governing, b, h,
}: {
  curve: ReturnType<typeof buildInteractionCurve>
  rhoG: number
  governing?: { P: number; M: number; dc: number }
  b: number
  h: number
}) {
  const dc = governing?.dc
  const dcColor = dc === undefined ? "text-gray-400" : dc > 1 ? "text-red-600" : "text-[#1a2f5e]"
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
        P<sub>o</sub> = {fmt0(curve.caps.Po)} kN &nbsp; φP<sub>n,max</sub> = {fmt0(curve.caps.phiPnMax)} kN
      </p>
      {governing ? (
        <p className={cn("font-mono text-[10px]", dcColor)}>
          worst D/C = {dc!.toFixed(3)} @ (P = {fmt0(governing.P)} kN, M = {fmt0(governing.M)} kN·m)
        </p>
      ) : (
        <p className="font-mono text-[10px] text-gray-400">Run Design to evaluate demands.</p>
      )}
    </div>
  )
}

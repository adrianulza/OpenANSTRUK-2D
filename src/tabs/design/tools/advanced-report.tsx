import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { barDia } from "@/lib/design/rebar"
import { buildBarLayout } from "@/lib/design/bar-layout"
import {
  buildSectionCapacityReport,
  type BendingDirection,
  type SectionCapacityReport,
} from "@/lib/design/section-report"
import type { DesignCriteria, RebarArrangement } from "@/lib/design/types"

/**
 * Advanced Capacity Report deck — textbook Section / Strain / Stress /
 * Compatibility chart + per-level flexural report + shear capacity report.
 *
 * Anchored to the right of the flyout via the same [data-flyout-root] measure
 * pattern as the Model tab's AdvancedDeck. Pure capacity view: everything is
 * computed live from the section + arrangement (no solver run, no demand).
 */

const DECK_WIDTH = 1000
const PILL_WIDTH = 3

interface Props {
  open: boolean
  /** Section width / height, mm */
  b: number
  h: number
  /** Clear cover to stirrup, mm */
  cover: number
  arrangement: RebarArrangement
  zone: "support" | "midspan"
  /** Concrete strength f'c, MPa */
  fc: number
  criteria: DesignCriteria
}

export function AdvancedReportDeck({
  open, b, h, cover, arrangement, zone, fc, criteria,
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

  const [direction, setDirection] = React.useState<BendingDirection>("pos")

  const report = React.useMemo(
    () => buildSectionCapacityReport(b, h, cover, arrangement, fc, criteria, direction, zone),
    [b, h, cover, arrangement, fc, criteria, direction, zone],
  )

  if (!open) return null
  if (typeof document === "undefined" || !pos) return null

  const deck = (
    <div
      className={cn(
        "fixed bg-white rounded-xl shadow-[0_4px_24px_rgba(0,0,0,0.12)] border border-gray-100 z-10",
        "animate-in fade-in slide-in-from-left-2 duration-150 ease-out",
        "flex flex-col max-h-[calc(100dvh-5rem)]",
      )}
      style={{ left: pos.left, top: pos.top, width: DECK_WIDTH }}
    >
      <div className="pl-7 pr-3 py-2 border-b border-gray-100 flex items-center justify-between gap-2">
        <div className="min-w-0">
          <span className="text-xs font-semibold text-[#1a2f5e] block">
            Advanced Capacity Report
          </span>
          <span className="text-[10px] text-gray-500">
            {zone === "support" ? "Support zone (2h)" : "Midspan"} · f′c = {fc} MPa
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1 shrink-0">
          <DirButton active={direction === "pos"} onClick={() => setDirection("pos")} title="Sagging — bottom bars in tension">
            +M
          </DirButton>
          <DirButton active={direction === "neg"} onClick={() => setDirection("neg")} title="Hogging — top bars in tension">
            −M
          </DirButton>
        </div>
      </div>

      <div className="p-3 pl-7 overflow-y-auto space-y-3">
        {!report.fits ? (
          <div className="rounded border border-amber-300 bg-amber-50 p-2 text-[10px] text-amber-900">
            Arrangement does not fit the section (25.2.1, 2-layer cap) — fix the
            bar counts before reading capacities.
          </div>
        ) : (
          <CompatibilityChart
            b={b} h={h} cover={cover} arrangement={arrangement} report={report}
          />
        )}

        <FlexureReport report={report} criteria={criteria} />
        <ShearReport report={report} arrangement={arrangement} criteria={criteria} />
      </div>
    </div>
  )

  return createPortal(deck, document.body)
}

function DirButton({
  active, onClick, title, children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-6 w-12 rounded text-[11px] font-medium transition-colors",
        active
          ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
          : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
      )}
    >
      {children}
    </button>
  )
}

// ── Chart ─────────────────────────────────────────────────────────────────────

const NAVY = "#1a2f5e"
const RED = "#ef4444"
const BLUE = "#3b82f6"
const GRAY = "#9ca3af"
const STIRRUP = "#5a6f96"

// viewBox geometry (all px in chart space)
const VW = 440
const VH = 196
const M_TOP = 18
const M_BOT = 20
const GH = VH - M_TOP - M_BOT // shared vertical span for h
const FONT = 7

function fmtEps(e: number): string {
  if (!Number.isFinite(e)) return "∞"
  return e.toFixed(4)
}
function fmt1(n: number): string {
  return Number.isFinite(n) ? n.toFixed(1) : "—"
}

function CompatibilityChart({
  b, h, cover, arrangement, report,
}: {
  b: number
  h: number
  cover: number
  arrangement: RebarArrangement
  report: SectionCapacityReport
}) {
  const layout = React.useMemo(
    () => buildBarLayout(b, h, cover, arrangement),
    [b, h, cover, arrangement],
  )
  const { c, a, direction, levels, Cc } = report

  // Shared vertical scale: physical y (mm from top) → px.
  const sy = GH / h
  const yPx = (y: number) => M_TOP + y * sy
  // Compression fibre + depth→physical-y mapping (direction-aware).
  const dToY = (d: number) => (direction === "pos" ? d : h - d)
  const yNA = yPx(dToY(c)) // neutral axis
  const yCompFibre = yPx(direction === "pos" ? 0 : h)
  const yBlockEnd = yPx(dToY(a))

  // Panel x-origins
  const secW = Math.min(80, b * sy) // section width at the shared scale, capped
  const SEC_X = 8
  const STRAIN_X = SEC_X + secW + 42
  const STRAIN_W = 78
  const STRESS_X = STRAIN_X + STRAIN_W + 30
  const STRESS_W = 70
  const FORCE_X = STRESS_X + STRESS_W + 28
  const FORCE_W = VW - FORCE_X - 8

  const sxSec = secW / b // section panel horizontal scale

  // Strain scale: zero axis at panel centre-left; compression drawn rightward.
  const epsExtreme = Math.max(
    0.003,
    ...levels.filter((l) => l.As > 0).map((l) => Math.abs(l.epsS)),
  )
  const STRAIN_X0 = STRAIN_X + STRAIN_W * 0.55
  const sEps = (STRAIN_W * 0.45) / epsExtreme
  const strainX = (e: number) => STRAIN_X0 + e * sEps

  // Strain profile endpoints: εcu at compression fibre, ε at opposite fibre.
  const epsOpp = c > 0 ? 0.003 * ((c - h) / c) : 0
  const epsOppClamped = Math.max(-epsExtreme, epsOpp)
  const yOppFibre = yPx(direction === "pos" ? h : 0)

  // Force scale
  const maxF = Math.max(Math.abs(Cc), ...levels.map((l) => Math.abs(l.force)), 1e-9)
  const FORCE_X0 = FORCE_X + FORCE_W * 0.5
  const sF = (FORCE_W * 0.42) / maxF

  const guideYs = levels.filter((l) => l.As > 0).map((l) => yPx(l.y))

  // Stirrup rect for section panel
  const cv = cover * sxSec
  const cvY = cover * sy

  return (
    <div className="rounded border border-gray-200 bg-gray-50">
      <svg viewBox={`0 0 ${VW} ${VH}`} width="100%" preserveAspectRatio="xMidYMid meet">
        {/* ── level guide lines across all panels ── */}
        {guideYs.map((y, i) => (
          <line
            key={`g${i}`}
            x1={SEC_X} y1={y} x2={FORCE_X + FORCE_W} y2={y}
            stroke={GRAY} strokeWidth={0.4} strokeDasharray="3 3" opacity={0.6}
          />
        ))}
        {/* neutral axis guide */}
        <line
          x1={SEC_X} y1={yNA} x2={FORCE_X + FORCE_W} y2={yNA}
          stroke={NAVY} strokeWidth={0.5} strokeDasharray="5 3" opacity={0.7}
        />

        {/* ── Section panel ── */}
        <rect x={SEC_X} y={M_TOP} width={secW} height={GH} fill="#1a2f5e10" stroke={NAVY} strokeWidth={1} />
        <rect
          x={SEC_X + cv} y={M_TOP + cvY}
          width={Math.max(2, secW - 2 * cv)} height={Math.max(2, GH - 2 * cvY)}
          rx={2} fill="none" stroke={STIRRUP}
          strokeWidth={Math.max(0.6, barDia(arrangement.stirrup.size) * sxSec)} opacity={0.8}
        />
        {layout.bars.map((p, i) => (
          <circle
            key={i}
            cx={SEC_X + p.x * sxSec}
            cy={yPx(p.y)}
            r={Math.max(1, (p.db / 2) * sy)}
            fill={NAVY}
          />
        ))}
        <text x={SEC_X + secW / 2} y={VH - 6} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Section
        </text>

        {/* ── Strain panel ── */}
        {/* zero axis */}
        <line x1={STRAIN_X0} y1={M_TOP} x2={STRAIN_X0} y2={M_TOP + GH} stroke={GRAY} strokeWidth={0.6} />
        {/* strain line: compression fibre → opposite fibre */}
        <line
          x1={strainX(0.003)} y1={yCompFibre}
          x2={strainX(epsOppClamped)} y2={yOppFibre}
          stroke={NAVY} strokeWidth={1.2}
        />
        {/* εcu label */}
        <text
          x={strainX(0.003) + 2} y={yCompFibre + (direction === "pos" ? -3 : 8)}
          fontSize={FONT - 1} fill={NAVY}
        >
          εcu = 0.003
        </text>
        {/* per-level strain dots + labels */}
        {levels.filter((l) => l.As > 0).map((l) => (
          <g key={l.label}>
            <circle cx={strainX(l.epsS)} cy={yPx(l.y)} r={1.6} fill={l.yielded ? RED : BLUE} />
            <text
              x={strainX(l.epsS) + (l.epsS >= 0 ? 4 : -4)} y={yPx(l.y) + 2}
              fontSize={FONT - 1.5} fill="#374151"
              textAnchor={l.epsS >= 0 ? "start" : "end"}
            >
              εs,{l.label}
            </text>
          </g>
        ))}
        {/* c bracket along the zero axis */}
        <line x1={STRAIN_X - 6} y1={yCompFibre} x2={STRAIN_X - 6} y2={yNA} stroke={NAVY} strokeWidth={0.6} />
        <line x1={STRAIN_X - 9} y1={yCompFibre} x2={STRAIN_X - 3} y2={yCompFibre} stroke={NAVY} strokeWidth={0.6} />
        <line x1={STRAIN_X - 9} y1={yNA} x2={STRAIN_X - 3} y2={yNA} stroke={NAVY} strokeWidth={0.6} />
        <text
          x={STRAIN_X - 11} y={(yCompFibre + yNA) / 2}
          fontSize={FONT - 1} fill={NAVY} textAnchor="middle"
          transform={`rotate(-90 ${STRAIN_X - 11} ${(yCompFibre + yNA) / 2})`}
        >
          c = {fmt1(c)}
        </text>
        <text x={STRAIN_X0} y={VH - 6} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Strain
        </text>

        {/* ── Stress panel ── */}
        {/* Whitney block: 0.85f'c over depth a from the compression fibre */}
        <rect
          x={STRESS_X + 10}
          y={Math.min(yCompFibre, yBlockEnd)}
          width={STRESS_W - 26}
          height={Math.abs(yBlockEnd - yCompFibre)}
          fill="#3b82f630" stroke={NAVY} strokeWidth={1}
        />
        <text
          x={STRESS_X + 10 + (STRESS_W - 26) / 2}
          y={direction === "pos" ? M_TOP - 5 : M_TOP + GH + 9}
          fontSize={FONT - 1} fill={NAVY} textAnchor="middle"
        >
          0.85f′c
        </text>
        {/* a = β1·c bracket */}
        <line x1={STRESS_X + STRESS_W - 10} y1={yCompFibre} x2={STRESS_X + STRESS_W - 10} y2={yBlockEnd} stroke={NAVY} strokeWidth={0.6} />
        <line x1={STRESS_X + STRESS_W - 13} y1={yCompFibre} x2={STRESS_X + STRESS_W - 7} y2={yCompFibre} stroke={NAVY} strokeWidth={0.6} />
        <line x1={STRESS_X + STRESS_W - 13} y1={yBlockEnd} x2={STRESS_X + STRESS_W - 7} y2={yBlockEnd} stroke={NAVY} strokeWidth={0.6} />
        <text
          x={STRESS_X + STRESS_W - 2} y={(yCompFibre + yBlockEnd) / 2}
          fontSize={FONT - 1.5} fill={NAVY} textAnchor="middle"
          transform={`rotate(-90 ${STRESS_X + STRESS_W - 2} ${(yCompFibre + yBlockEnd) / 2})`}
        >
          a = β₁c
        </text>
        {/* section edge reference line */}
        <line x1={STRESS_X + 10} y1={M_TOP} x2={STRESS_X + 10} y2={M_TOP + GH} stroke={GRAY} strokeWidth={0.5} />
        <text x={STRESS_X + STRESS_W / 2} y={VH - 6} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Stress
        </text>

        {/* ── Compatibility (forces) panel ── */}
        <line x1={FORCE_X0} y1={M_TOP} x2={FORCE_X0} y2={M_TOP + GH} stroke={GRAY} strokeWidth={0.6} />
        {/* Cc arrow at a/2 from compression fibre (compression → leftward) */}
        <ForceArrow
          x0={FORCE_X0} y={yPx(dToY(a / 2))} value={Cc} scale={sF}
          label={`Cc = ${fmt1(Cc)}`} color={NAVY}
        />
        {levels.filter((l) => l.As > 0 && Math.abs(l.force) > 1e-6).map((l) => (
          <ForceArrow
            key={l.label}
            x0={FORCE_X0} y={yPx(l.y)} value={l.force} scale={sF}
            label={`${l.force >= 0 ? "Cs" : "Ts"},${l.label}`}
            color={l.force >= 0 ? NAVY : RED}
          />
        ))}
        <text x={FORCE_X0} y={VH - 6} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Compatibility
        </text>
      </svg>
    </div>
  )
}

/** Horizontal force arrow: compression (+) leftward, tension (−) rightward. */
function ForceArrow({
  x0, y, value, scale, label, color,
}: {
  x0: number
  y: number
  value: number
  scale: number
  label: string
  color: string
}) {
  const len = Math.max(8, Math.abs(value) * scale)
  const dir = value >= 0 ? -1 : 1 // compression points left (toward viewer ←), tension right
  const xTip = x0 + dir * len
  const AH = 3
  return (
    <g>
      <line x1={x0} y1={y} x2={xTip} y2={y} stroke={color} strokeWidth={1.1} />
      <polygon
        points={`${xTip},${y} ${xTip - dir * AH},${y - AH * 0.7} ${xTip - dir * AH},${y + AH * 0.7}`}
        fill={color}
      />
      <text
        x={xTip + dir * 3} y={y + 2}
        fontSize={5.5} fill={color}
        textAnchor={dir < 0 ? "end" : "start"}
      >
        {label}
      </text>
    </g>
  )
}

// ── Reports ───────────────────────────────────────────────────────────────────

function FlexureReport({
  report, criteria,
}: {
  report: SectionCapacityReport
  criteria: DesignCriteria
}) {
  const { levels, c, a, epsT, phi, phiClass, Mn, phiMn } = report
  const active = levels.filter((l) => l.As > 0)
  const classLabel =
    phiClass === "tension" ? "tension-controlled"
    : phiClass === "compression" ? "compression-controlled"
    : "transition"
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">
        Flexural capacity report{" "}
        <span className="font-normal text-gray-500">
          ({report.direction === "pos" ? "+M, sagging" : "−M, hogging"})
        </span>
      </p>
      <div className="font-mono text-[10px] text-gray-700 space-y-0.5">
        {active.map((l) => (
          <div key={l.label} className="grid grid-cols-[1fr_1fr_1fr_auto] gap-x-2">
            <span>As,{l.label} = {Math.round(l.As)} mm²</span>
            <span>εs,{l.label} = {fmtEps(l.epsS)}</span>
            <span>fs,{l.label} = {fmt1(l.fs)} MPa</span>
            <span className={cn("text-[9px]", l.yielded ? "text-red-500" : "text-gray-400")}>
              {l.yielded ? "yielded" : "elastic"}
            </span>
          </div>
        ))}
      </div>
      <div className="border-t border-gray-200 my-1" />
      <div className="font-mono text-[10px] text-gray-700 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>c = {fmt1(c)} mm</span>
        <span>a = β₁·c = {fmt1(a)} mm</span>
        <span>εt = {fmtEps(epsT)}</span>
        <span>
          φ-used = {phi.toFixed(3)}{" "}
          <span className="text-gray-400">({classLabel})</span>
        </span>
        <span>Mn = {fmt1(Mn)} kN·m</span>
        <span className="font-semibold text-[#1a2f5e]">φMn = {fmt1(phiMn)} kN·m</span>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        Strain compatibility per bar level; εcu = 0.003 (22.2.2.1); φ ramp per
        21.2.2 with fy = {criteria.fy} MPa.
      </p>
    </div>
  )
}

function ShearReport({
  report, arrangement, criteria,
}: {
  report: SectionCapacityReport
  arrangement: RebarArrangement
  criteria: DesignCriteria
}) {
  const s = report.shear
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">
        Shear capacity report{" "}
        <span className="font-normal text-gray-500">
          ({criteria.stirrupLegs}-leg {arrangement.stirrup.size} @ {arrangement.stirrup.spacing} mm, d = {fmt1(s.d)} mm)
        </span>
      </p>
      <div className="font-mono text-[10px] text-gray-700 grid grid-cols-2 gap-x-3 gap-y-0.5">
        <span>φ-used = {s.phi.toFixed(2)}</span>
        <span>
          Vc = {fmt1(s.Vc)} kN
          {s.vcZeroed && <span className="text-amber-600"> (= 0, SMF end zone)</span>}
        </span>
        <span>Vs = {fmt1(s.Vs)} kN</span>
        <span>Vn = {fmt1(s.Vn)} kN</span>
        <span className="font-semibold text-[#1a2f5e] col-span-2">φVn = {fmt1(s.phiVn)} kN</span>
      </div>
    </div>
  )
}

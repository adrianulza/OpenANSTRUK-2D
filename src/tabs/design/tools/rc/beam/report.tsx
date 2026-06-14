import * as React from "react"
import { createPortal } from "react-dom"
import { cn } from "@/lib/utils"
import { COLOR_SFD_NEG, COLOR_SFD_POS } from "@/lib/constants"
import { barDia } from "@/lib/design/rc/shared/rebar"
import { buildBarLayout } from "@/lib/design/rc/shared/bar-geometry"
import { getRcCode } from "@/lib/design/rc/codes"
import type {
  BendingDirection,
  ReportLevel,
  SectionCapacityReport,
} from "@/lib/design/rc/codes/aci318-25"
import type { RcCriteria } from "@/lib/design/rc/criteria"
import type { RebarArrangement } from "@/lib/design/rc/types"
import { FONT, NAVY, SubText } from "../chart-text"
import { PREVIEW_VIEW_W, sectionFitScale } from "./preview"

/**
 * Advanced Capacity Report deck — textbook Section / Strain / Stress /
 * Compatibility chart + per-level flexural report + shear capacity report.
 *
 * Anchored to the right of the flyout via the same [data-flyout-root] measure
 * pattern as the Model tab's AdvancedDeck. Pure capacity view: everything is
 * computed live from the section + arrangement (no solver run, no demand).
 *
 * The chart renders in TRUE PIXELS (no viewBox stretch) so its text stays at
 * the app's 10px standard regardless of deck width. Colors follow the AFD
 * convention: tension = blue (COLOR_SFD_POS), compression = red (COLOR_SFD_NEG).
 */

const DECK_WIDTH = 600
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
  criteria: RcCriteria
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
    () =>
      getRcCode(criteria.code).buildSectionCapacityReport(
        b, h, cover, arrangement, fc, criteria, direction, zone,
      ),
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
            Advanced Report: Beam
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
        <ShearReport report={report} />
        <SummaryReport report={report} b={b} h={h} />
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

const TENSION = COLOR_SFD_POS // blue — matches AFD tension
const COMPRESSION = COLOR_SFD_NEG // red — matches AFD compression
const GRAY = "#9ca3af"
const STIRRUP = "#5a6f96"

// True-pixel chart geometry (1 SVG unit = 1 px; text stays app-sized).
// Height is dynamic: M_TOP + drawn section height + M_BOT, so the figure hugs
// its content instead of floating in a fixed-height canvas.
const VW = 556
const M_TOP = 18 // room for εcu / 0.85f'c labels (+M: they sit above the figure)
const GH_MAX = 262 // cap on the drawn section height
// FONT / FONT_SUB / NAVY / SubText now live in ../chart-text (shared with column).

// Panel x-budget. The Section panel is drawn at the TRUE b:h ratio (same as
// RcSectionPreview): one scale serves both axes, capped by height (GH) and by
// SEC_W_MAX so wide-flat beams can't eat the other panels. The remaining
// panels are laid out dynamically after the section's actual width.
const SEC_X = 12
const SEC_W_MAX = 150
/** On-screen width the SECTION DESIGN flyout gives RcSectionPreview:
 *  flyout 300px − p-3 padding (2×12) − stable scrollbar gutter ≈ 266px. */
const FLYOUT_PREVIEW_RENDER_W = 266
const GAP_SEC_STRAIN = 48 // room for the c bracket + tension εs labels
const STRAIN_W = 112
const GAP_STRAIN_STRESS = 32
const STRESS_W = 92
const GAP_STRESS_FORCE = 26

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
  const active = levels.filter((l) => l.As > 0)

  // ONE scale for both axes (true b:h ratio), sized to render the section at
  // the SAME on-screen size as RcSectionPreview in the SECTION DESIGN flyout:
  // the preview stretches its 150-unit viewBox to the flyout content width
  // (300px flyout − p-3 padding − scrollbar gutter ≈ 266px). Caps keep huge
  // sections inside the chart area.
  const previewPx = sectionFitScale(b, h) * (FLYOUT_PREVIEW_RENDER_W / PREVIEW_VIEW_W)
  const sy = Math.min(previewPx, GH_MAX / h, SEC_W_MAX / b)
  const GHe = h * sy // effective drawn height
  const yTop = M_TOP // figure hugs the top margin; SVG height follows below
  // −M puts the εcu / 0.85f'c labels below the figure — give them a lane there.
  const M_BOT = direction === "neg" ? 34 : 20
  const VH = M_TOP + GHe + M_BOT // dynamic canvas height — no dead bands
  const yPx = (y: number) => yTop + y * sy
  const dToY = (d: number) => (direction === "pos" ? d : h - d)
  const yNA = yPx(dToY(c))
  const yCompFibre = yPx(direction === "pos" ? 0 : h)
  const yBlockEnd = yPx(dToY(a))

  const secW = b * sy
  const sxSec = sy // same scale both axes

  // Dynamic panel x-positions: panels follow the section's true width.
  const STRAIN_X = SEC_X + secW + GAP_SEC_STRAIN
  const STRESS_X = STRAIN_X + STRAIN_W + GAP_STRAIN_STRESS
  const FORCE_X = STRESS_X + STRESS_W + GAP_STRESS_FORCE
  const FORCE_W = Math.max(80, VW - FORCE_X - 10)

  // ── Strain mapping: auto-fit tension (−, left) and compression (+, right) ──
  const epsMax = Math.max(0.003, ...active.map((l) => l.epsS))
  const epsMin = Math.min(0, ...active.map((l) => l.epsS))
  const span = epsMax - epsMin || 1
  const sEps = STRAIN_W / span
  const strainX = (e: number) => STRAIN_X + (e - epsMin) * sEps
  const X0 = strainX(0) // zero-strain axis

  // Strain line: compression fibre (εcu) → extreme tension bar level. Strains
  // are linear in depth, so any bar point defines the same line — ending at the
  // deepest bar keeps every εs dot exactly on the line (no fibre clamping).
  const extreme = active.reduce<ReportLevel | null>(
    (best, l) => (best === null || l.d > best.d ? l : best),
    null,
  )

  // ── Force mapping: proportional arrows about a central axis ──
  const maxF = Math.max(Math.abs(Cc), ...levels.map((l) => Math.abs(l.force)), 1e-9)
  const FX0 = FORCE_X + FORCE_W * 0.5
  const sF = (FORCE_W * 0.4) / maxF

  const guideYs = active.map((l) => yPx(l.y))
  const cv = cover * sxSec
  const cvY = cover * sy

  return (
    <div className="rounded border border-gray-200 bg-gray-50 flex justify-center">
      <svg width={VW} height={VH}>
        {/* ── guide lines: bar levels + compression fibre, across all panels ── */}
        {guideYs.map((y, i) => (
          <line
            key={`g${i}`}
            x1={SEC_X} y1={y} x2={FORCE_X + FORCE_W} y2={y}
            stroke={GRAY} strokeWidth={0.5} strokeDasharray="4 4" opacity={0.6}
          />
        ))}
        <line
          x1={SEC_X} y1={yCompFibre} x2={FORCE_X + FORCE_W} y2={yCompFibre}
          stroke={GRAY} strokeWidth={0.5} strokeDasharray="4 4" opacity={0.6}
        />
        {/* neutral axis */}
        <line
          x1={SEC_X} y1={yNA} x2={FORCE_X + FORCE_W} y2={yNA}
          stroke={NAVY} strokeWidth={0.6} strokeDasharray="6 4" opacity={0.7}
        />

        {/* ── Section panel ── */}
        <rect x={SEC_X} y={yTop} width={secW} height={GHe} fill="#1a2f5e10" stroke={NAVY} strokeWidth={1.2} />
        <rect
          x={SEC_X + cv} y={yTop + cvY}
          width={Math.max(2, secW - 2 * cv)} height={Math.max(2, GHe - 2 * cvY)}
          rx={3} fill="none" stroke={STIRRUP}
          strokeWidth={Math.max(1, barDia(arrangement.stirrup.size) * sxSec)} opacity={0.8}
        />
        {layout.bars.map((p, i) => (
          <circle
            key={i}
            cx={SEC_X + p.x * sxSec}
            cy={yPx(p.y)}
            r={Math.max(1.5, (p.db / 2) * sy)}
            fill={NAVY}
          />
        ))}
        <text className="font-mono" x={SEC_X + secW / 2} y={VH - 8} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Section
        </text>

        {/* ── Strain panel ── */}
        {/* Filled diagram, shear/moment style: red = compression (+ε), blue =
            tension (−ε); the two triangles meet on the zero axis at the NA.
            The diagonal + horizontal closing edges share the region colour. */}
        {extreme && (
          <>
            {/* compression triangle (top, red) */}
            <polygon
              points={`${X0},${yCompFibre} ${strainX(0.003)},${yCompFibre} ${X0},${yNA}`}
              fill={COMPRESSION} fillOpacity={0.18}
            />
            {/* tension triangle (bottom, blue) */}
            <polygon
              points={`${X0},${yNA} ${strainX(extreme.epsS)},${yPx(extreme.y)} ${X0},${yPx(extreme.y)}`}
              fill={TENSION} fillOpacity={0.18}
            />
            {/* horizontal closing edges */}
            <line x1={X0} y1={yCompFibre} x2={strainX(0.003)} y2={yCompFibre} stroke={COMPRESSION} strokeWidth={1.4} />
            <line x1={X0} y1={yPx(extreme.y)} x2={strainX(extreme.epsS)} y2={yPx(extreme.y)} stroke={TENSION} strokeWidth={1.4} />
            {/* diagonal, split at the NA so each half takes its region colour */}
            <line x1={strainX(0.003)} y1={yCompFibre} x2={X0} y2={yNA} stroke={COMPRESSION} strokeWidth={1.6} />
            <line x1={X0} y1={yNA} x2={strainX(extreme.epsS)} y2={yPx(extreme.y)} stroke={TENSION} strokeWidth={1.6} />
          </>
        )}
        {/* zero-strain axis — kept grey, drawn over the fill */}
        <line x1={X0} y1={yTop} x2={X0} y2={yTop + GHe} stroke={GRAY} strokeWidth={0.8} />
        <SubText
          x={(X0 + strainX(0.003)) / 2}
          y={yCompFibre + (direction === "pos" ? -6 : 14)}
          main="ε" sub="cu" suffix=" = 0.003"
          fill={NAVY} anchor="middle"
        />
        {/* per-level strain dots + labels — tension blue, compression red */}
        {active.map((l) => (
          <g key={l.label}>
            <circle
              cx={strainX(l.epsS)} cy={yPx(l.y)} r={2.5}
              fill={l.epsS > 0 ? COMPRESSION : TENSION}
            />
            <SubText
              x={strainX(l.epsS) + (l.epsS >= 0 ? 6 : -6)}
              y={yPx(l.y) + 3.5}
              main="ε" sub={`s,${l.label}`}
              fill="#374151"
              anchor={l.epsS >= 0 ? "start" : "end"}
            />
          </g>
        ))}
        {/* c bracket */}
        <line x1={STRAIN_X - 10} y1={yCompFibre} x2={STRAIN_X - 10} y2={yNA} stroke={NAVY} strokeWidth={0.8} />
        <line x1={STRAIN_X - 14} y1={yCompFibre} x2={STRAIN_X - 6} y2={yCompFibre} stroke={NAVY} strokeWidth={0.8} />
        <line x1={STRAIN_X - 14} y1={yNA} x2={STRAIN_X - 6} y2={yNA} stroke={NAVY} strokeWidth={0.8} />
        <text
          className="font-mono"
          x={STRAIN_X - 16} y={(yCompFibre + yNA) / 2}
          fontSize={FONT} fill={NAVY} textAnchor="middle"
          transform={`rotate(-90 ${STRAIN_X - 16} ${(yCompFibre + yNA) / 2})`}
        >
          c = {fmt1(c)}
        </text>
        <text className="font-mono" x={X0} y={VH - 8} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Strain
        </text>

        {/* ── Stress panel ── */}
        <line x1={STRESS_X + 14} y1={yTop} x2={STRESS_X + 14} y2={yTop + GHe} stroke={GRAY} strokeWidth={0.8} />
        <rect
          x={STRESS_X + 14}
          y={Math.min(yCompFibre, yBlockEnd)}
          width={STRESS_W - 36}
          height={Math.max(1, Math.abs(yBlockEnd - yCompFibre))}
          fill="#3b82f630" stroke={NAVY} strokeWidth={1.2}
        />
        <SubText
          x={STRESS_X + 14 + (STRESS_W - 36) / 2}
          y={direction === "pos" ? yTop - 8 : yTop + GHe + 14}
          main="0.85f′" sub="c"
          fill={NAVY} anchor="middle"
        />
        {/* a = β₁·c bracket */}
        <line x1={STRESS_X + STRESS_W - 14} y1={yCompFibre} x2={STRESS_X + STRESS_W - 14} y2={yBlockEnd} stroke={NAVY} strokeWidth={0.8} />
        <line x1={STRESS_X + STRESS_W - 18} y1={yCompFibre} x2={STRESS_X + STRESS_W - 10} y2={yCompFibre} stroke={NAVY} strokeWidth={0.8} />
        <line x1={STRESS_X + STRESS_W - 18} y1={yBlockEnd} x2={STRESS_X + STRESS_W - 10} y2={yBlockEnd} stroke={NAVY} strokeWidth={0.8} />
        <g transform={`rotate(-90 ${STRESS_X + STRESS_W - 2} ${(yCompFibre + yBlockEnd) / 2})`}>
          <SubText
            x={STRESS_X + STRESS_W - 2}
            y={(yCompFibre + yBlockEnd) / 2}
            main="a = β" sub="1" suffix="c"
            fill={NAVY} anchor="middle"
          />
        </g>
        <text className="font-mono" x={STRESS_X + STRESS_W / 2} y={VH - 8} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Stress
        </text>

        {/* ── Compatibility (forces) panel ── */}
        <line x1={FX0} y1={yTop} x2={FX0} y2={yTop + GHe} stroke={GRAY} strokeWidth={0.8} />
        {/* Cc arrow at a/2 from the compression fibre */}
        <ForceArrow x0={FX0} y={yPx(dToY(a / 2))} forceCompPos={Cc} scale={sF} name="C" sub="c" />
        {active.filter((l) => Math.abs(l.force) > 1e-6).map((l) => (
          <ForceArrow
            key={l.label}
            x0={FX0} y={yPx(l.y)} forceCompPos={l.force} scale={sF}
            name={l.force >= 0 ? "C" : "T"} sub={`s,${l.label}`}
          />
        ))}
        <text className="font-mono" x={FX0} y={VH - 8} fontSize={FONT} fill={NAVY} textAnchor="middle" fontWeight={600}>
          Compatibility
        </text>
      </svg>
    </div>
  )
}

/**
 * Horizontal force arrow with a value label centred above it. Length is
 * proportional to |force| (no flattening floor). Compression (+, internal
 * convention) points left and renders red; tension points right, blue.
 */
function ForceArrow({
  x0, y, forceCompPos, scale, name, sub,
}: {
  x0: number
  y: number
  forceCompPos: number
  scale: number
  name: string
  sub: string
}) {
  const compression = forceCompPos >= 0
  const color = compression ? COMPRESSION : TENSION
  const len = Math.max(2, Math.abs(forceCompPos) * scale)
  const dir = compression ? -1 : 1
  const xTip = x0 + dir * len
  const AH = 4
  return (
    <g>
      <line x1={x0} y1={y} x2={xTip} y2={y} stroke={color} strokeWidth={1.4} />
      <polygon
        points={`${xTip},${y} ${xTip - dir * AH},${y - AH * 0.7} ${xTip - dir * AH},${y + AH * 0.7}`}
        fill={color}
      />
      {/* Label sits just past the arrow head; numeric value lives in the table. */}
      <SubText
        x={xTip + dir * 5}
        y={y + 3.5}
        main={name} sub={sub}
        fill={color} anchor={dir < 0 ? "end" : "start"}
      />
    </g>
  )
}

// ── Reports ───────────────────────────────────────────────────────────────────

/** One single-column parameter line: name (with optional subscript) = value. */
function ParamRow({
  main, sub, value, bold,
}: {
  main: string
  sub?: string
  value: string
  bold?: boolean
}) {
  return (
    <p className={cn("font-mono text-[10px]", bold ? "font-semibold text-[#1a2f5e]" : "text-gray-700")}>
      {main}
      {sub !== undefined && <sub>{sub}</sub>}
      {" = "}
      {value}
    </p>
  )
}

function FlexureReport({
  report, criteria,
}: {
  report: SectionCapacityReport
  criteria: RcCriteria
}) {
  const { levels, c, a, epsT, phi, phiClass, Mn, phiMn, Cc } = report
  const active = levels.filter((l) => l.As > 0)
  const classLabel =
    phiClass === "tension" ? "tension-controlled"
    : phiClass === "compression" ? "compression-controlled"
    : "transition"
  const th = "text-right font-normal px-1 py-0.5"
  const td = "text-right px-1 py-0.5"
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1.5">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">
        Flexural Capacity Report{" "}
        <span className="font-normal text-gray-500">
          ({report.direction === "pos" ? "+M, sagging" : "−M, hogging"})
        </span>
      </p>

      <table className="w-full font-mono text-[10px] text-gray-700 border-collapse">
        <thead>
          <tr className="text-gray-500 border-b border-gray-200">
            <th className="text-left font-normal px-1 py-0.5">Level</th>
            <th className={th}>A<sub>s</sub> (mm²)</th>
            <th className={th}>ε<sub>s</sub></th>
            <th className={th}>f<sub>s</sub> (MPa)</th>
            <th className={th}>C<sub>s</sub> (kN)</th>
            <th className={th}>T<sub>s</sub> (kN)</th>
            <th className={th}>status</th>
          </tr>
        </thead>
        <tbody>
          {active.map((l) => (
            <tr key={l.label} className="border-b border-gray-100 last:border-0">
              <td className="text-left px-1 py-0.5 text-[#1a2f5e]">{l.label}</td>
              <td className={td}>{Math.round(l.As)}</td>
              <td className={td}>{fmtEps(l.epsS)}</td>
              <td className={td}>{fmt1(-l.fs)}</td>
              {/* force is compression-positive: split into Cs / Ts columns. */}
              <td className={td}>{l.force > 0 ? fmt1(l.force) : "—"}</td>
              <td className={td}>{l.force < 0 ? fmt1(-l.force) : "—"}</td>
              <td className={cn(td, "text-gray-400")}>({l.yielded ? "yielded" : "elastic"})</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-[10px] text-gray-400 leading-snug">
        C<sub>s</sub> = compression, T<sub>s</sub> = tension bar force (kN);
        f<sub>s</sub> tension-positive, ε<sub>s</sub> compression-positive.
      </p>

      <div className="border-t border-gray-200" />
      <div className="space-y-0.5">
        <ParamRow main="C" sub="c" value={`${fmt1(Cc)} kN`} />
        <ParamRow main="c" value={`${fmt1(c)} mm`} />
        <p className="font-mono text-[10px] text-gray-700">
          a = β<sub>1</sub>·c = {fmt1(a)} mm
        </p>
        <ParamRow main="ε" sub="t" value={fmtEps(epsT)} />
        <p className="font-mono text-[10px] text-gray-700">
          φ-used = {phi.toFixed(3)} <span className="text-gray-400">({classLabel})</span>
        </p>
        <ParamRow main="M" sub="n" value={`${fmt1(Mn)} kN·m`} />
        <ParamRow main="φM" sub="n" value={`${fmt1(phiMn)} kN·m`} />
      </div>

      <p className="text-[10px] text-gray-400 leading-snug">
        Strain compatibility per bar level; ε<sub>cu</sub> = 0.003 (22.2.2.1); φ
        ramp per 21.2.2 with f<sub>y</sub> = {criteria.fy} MPa.
      </p>
    </div>
  )
}

/** Ratio shown as decimal + percent, e.g. "0.0125 (1.25%)". */
function fmtRatio(r: number): string {
  if (!Number.isFinite(r)) return "—"
  return `${r.toFixed(4)} (${(r * 100).toFixed(2)}%)`
}

function SummaryReport({
  report, b, h,
}: {
  report: SectionCapacityReport
  b: number
  h: number
}) {
  const s = report.summary
  const noteFor = (rho: number): { text: string; color: string } => {
    if (rho > 0 && rho < s.rhoMin) return { text: "below ρₘᵢₙ", color: "text-red-600" }
    if (rho > s.rhoMax) return { text: "above ρₘₐₓ — not tension-controlled", color: "text-red-600" }
    return { text: "within limits", color: "text-gray-400" }
  }
  const topNote = noteFor(s.rhoTop)
  const botNote = noteFor(s.rhoBot)
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">Section Summary</p>
      <div className="space-y-0.5">
        <p className="font-mono text-[10px] text-gray-700">
          ρ<sub>min</sub> = {fmtRatio(s.rhoMin)}
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          ρ<sub>max</sub> = {fmtRatio(s.rhoMax)}
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          ρ<sub>top</sub> = A<sub>s,top</sub>/b·d<sub>top</sub> = {fmtRatio(s.rhoTop)}{" "}
          <span className={topNote.color}>({topNote.text})</span>
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          ρ<sub>bot</sub> = A<sub>s,bot</sub>/b·d<sub>bot</sub> = {fmtRatio(s.rhoBot)}{" "}
          <span className={botNote.color}>({botNote.text})</span>
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          ρ<sub>gross</sub> = A<sub>s,tot</sub>/b·h = {fmtRatio(s.rhoGross)}
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          c/d = {Number.isFinite(s.cOverD) ? s.cOverD.toFixed(3) : "—"}{" "}
          <span className="text-gray-400">(ductility)</span>
        </p>
        <ParamRow main="A" sub="s,tot" value={`${Math.round(s.AsTotal)} mm²`} />
        <p className="font-mono text-[10px] text-gray-700">
          steel-concrete weight = {s.steelWeight.toFixed(2)} kg/m
        </p>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        ρ<sub>top</sub> / ρ<sub>bot</sub> on each face's own steel (d<sub>top</sub> ={" "}
        {fmt1(s.dTop)} mm, d<sub>bot</sub> = {fmt1(s.dBot)} mm, both layers as
        drawn); ρ<sub>min</sub> per 9.6.1.2, ρ<sub>max</sub> at ε<sub>t</sub> =
        0.005; steel-concrete weight = longitudinal steel mass at 7850 kg/m³ over
        b×h = {Math.round(b)}×{Math.round(h)} mm.
      </p>
    </div>
  )
}

function ShearReport({ report }: { report: SectionCapacityReport }) {
  const s = report.shear
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e]">
        Shear Capacity Report
      </p>
      <div className="space-y-0.5">
        <p className="font-mono text-[10px] text-gray-700">φ-used = {s.phi.toFixed(2)}</p>
        <p className="font-mono text-[10px] text-gray-700">
          V<sub>c</sub> = 0.17·λ·√f′<sub>c</sub>·b<sub>w</sub>·d = {fmt1(s.Vc)} kN
          {s.vcZeroed && <span className="text-amber-600"> (= 0, SMF end zone)</span>}
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          A<sub>v</sub>/s = n<sub>legs</sub>·A<sub>b</sub>/s = {fmt1(s.avS)} mm²/m
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          V<sub>s</sub> = (A<sub>v</sub>/s)·f<sub>yt</sub>·d = {fmt1(s.Vs)} kN
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          V<sub>n</sub> = V<sub>c</sub> + V<sub>s</sub> = {fmt1(s.Vn)} kN
        </p>
        <p className="font-mono text-[10px] text-gray-700">
          φV<sub>n</sub> = φ(V<sub>c</sub> + V<sub>s</sub>) = {fmt1(s.phiVn)} kN
        </p>
      </div>
      <p className="text-[10px] text-gray-400 leading-snug">
        V<sub>c</sub> per 22.5.5.1, V<sub>s</sub> per 22.5.10.5.3, V<sub>n</sub>{" "}
        per 22.5.1.1 (d = {fmt1(s.d)} mm = tension-steel centroid).
      </p>
    </div>
  )
}

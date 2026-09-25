import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import { ToggleButton } from "@/components/flyout-shared"
import type { LiveBuildResult } from "@/lib/live-solver"
import { LIVE_P_MAX } from "@/lib/live-solver"
import type { LiveReadout } from "@/lib/live-physics"
import {
  type UnitSettings,
  DEFAULT_UNIT_SETTINGS,
  displayForce, labelForce,
  displayMoment, labelMoment,
  displayDisplacement, labelDisplacement,
} from "@/lib/units"

type LiveDiagram = "AXIAL" | "SHEAR" | "MOMENT" | null

// Deformation scale slider: logarithmic 0.1 → 10 with 1 at the centre, so
// "smaller" and "bigger" get equal travel. Snaps to exactly 1 near the centre.
/** Angle with a true minus sign, e.g. "−90°". */
const formatAngle = (deg: number) => `${Math.round(deg)}°`.replace("-", "\u2212")

const posToScale = (p: number) => (Math.abs(p) < 0.04 ? 1 : Math.pow(10, p))
const scaleToPos = (s: number) => Math.log10(Math.min(Math.max(s, 0.1), 10))

export function LivePanelContent({
  liveSystem,
  readout,
  diagram,
  deformScale,
  onDeformScaleChange,
  snap,
  onSnapChange,
  unitSettings = DEFAULT_UNIT_SETTINGS,
}: {
  liveSystem: LiveBuildResult | null
  readout: LiveReadout | null
  diagram: LiveDiagram
  deformScale: number
  onDeformScaleChange: (v: number) => void
  snap: boolean
  onSnapChange: (v: boolean) => void
  unitSettings?: UnitSettings
}) {
  if (liveSystem && !liveSystem.ok) {
    return (
      <div className="space-y-2">
        <p className="text-xs font-medium text-[#ef4444]">Pulling is paused</p>
        <p className="text-xs text-gray-600 leading-relaxed">{liveSystem.reason}</p>
      </div>
    )
  }

  const fU = labelForce(unitSettings)
  const dU = labelDisplacement(unitSettings)
  const f1 = (v: number) => displayForce(v, unitSettings).toFixed(1)
  const d2 = (v: number) => displayDisplacement(v, unitSettings).toFixed(unitSettings.length === "mm" ? 2 : 5)

  const peakUnit = diagram === "MOMENT" ? labelMoment(unitSettings) : fU
  const peakText = (v: number) => {
    const shown = diagram === "MOMENT" ? displayMoment(v, unitSettings) : displayForce(v, unitSettings)
    return `${shown >= 0 ? "+" : ""}${shown.toFixed(1)} ${peakUnit}`
  }
  const diagramName = diagram === "AXIAL" ? "Axial" : diagram === "SHEAR" ? "Shear" : diagram === "MOMENT" ? "Moment" : null

  const pulling = readout !== null && readout.P > 1e-9
  // Equilibrium badge: the residual is round-off (~1e-12) for a correct solve.
  // The threshold is relative to the rope force so it reads "balanced" at any size.
  const balanced = readout
    ? Math.max(Math.abs(readout.eq.Fx), Math.abs(readout.eq.Fy), Math.abs(readout.eq.M) / 10) <= 1e-6 * Math.max(readout.P, 1)
    : true

  return (
    <div className="space-y-3 select-none">
      <p className="text-xs text-gray-600 leading-relaxed">
        Drag any free node to pull it with a rope. Rope length sets the force, up to{" "}
        <span className="font-mono">{f1(LIVE_P_MAX)} {fU}</span>.
      </p>

      <div className="rounded-md border border-gray-100 bg-gray-50 px-2.5 py-2 space-y-1">
        {pulling && readout ? (
          <>
            <div className="flex items-baseline justify-between">
              <span className="inline-block text-[10px] font-mono font-bold text-[#475569] bg-white border border-[#94a3b8] rounded px-1.5 py-0.5 tracking-wide">
                {readout.nodeId}
              </span>
              <span className="text-[10px] text-gray-500">{readout.capped ? "max force" : "rope force"}</span>
            </div>
            <div className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
              <span className="text-[11px] text-gray-500">P</span>
              <span className="text-[11px] font-mono text-right text-[#1e293b]">
                {f1(readout.P)} {fU} ∠ {formatAngle(readout.angleDeg)}
              </span>
              <span className="text-[11px] text-gray-500">δx</span>
              <span className="text-[11px] font-mono text-right text-[#1e293b]">{d2(readout.u)} {dU}</span>
              <span className="text-[11px] text-gray-500">δy</span>
              <span className="text-[11px] font-mono text-right text-[#1e293b]">{d2(readout.v)} {dU}</span>
              {diagramName && readout.peak !== null && (
                <>
                  <span className="text-[11px] text-gray-500">Max. {diagramName === "Moment" ? "M" : diagramName === "Shear" ? "V" : "N"}</span>
                  <span
                    className="text-[11px] font-mono text-right"
                    style={{ color: readout.peak >= 0 ? FLYOUT_PANEL_COLORS.positiveValue : FLYOUT_PANEL_COLORS.negativeValue }}
                  >
                    {peakText(readout.peak)}
                  </span>
                </>
              )}
            </div>
          </>
        ) : (
          <p className="text-[11px] text-gray-400 italic">Grab a node to see the rope force here</p>
        )}
      </div>

      <div
        className="flex items-center gap-1.5 text-[11px]"
        title="Rope force plus all support reactions: ΣFx, ΣFy and ΣM should all be zero."
      >
        <span
          className="inline-block h-2 w-2 rounded-full"
          style={{ background: balanced ? "#16a34a" : "#ef4444" }}
          aria-hidden
        />
        <span className="text-gray-600">
          {balanced ? "In equilibrium: ΣFx = ΣFy = ΣM = 0" : "Out of balance"}
        </span>
      </div>

      <div className="border-t" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }} />

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Deformation Scale</span>
          <span className="text-[11px] font-mono text-gray-500">
            ×{deformScale >= 1 ? deformScale.toFixed(1) : deformScale.toFixed(2)}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-400 font-mono w-6 text-center">0.1</span>
          <input
            type="range"
            aria-label="Deformation scale"
            value={scaleToPos(deformScale)}
            min={-1}
            max={1}
            step={0.01}
            className="flex-1 h-1.5 accent-[#2563eb] cursor-pointer touch-none"
            onChange={(e) => onDeformScaleChange(posToScale(Number(e.target.value)))}
            onDoubleClick={() => onDeformScaleChange(1)}
          />
          <span className="text-xs text-gray-400 font-mono w-6 text-center">10</span>
        </div>
        <p className="text-[10px] text-gray-400">Only changes the drawing, never the forces.</p>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-600" title="Hold Shift while pulling for the same effect">
          Snap angle to 45°
        </span>
        <ToggleButton active={snap} onClick={() => onSnapChange(!snap)} className="!flex-none h-6 text-xs px-3">
          {snap ? "On" : "Off"}
        </ToggleButton>
      </div>
    </div>
  )
}

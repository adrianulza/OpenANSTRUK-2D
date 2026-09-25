import { AlertTriangle } from "lucide-react"
import { cn } from "@/lib/utils"
import type { LiveBuildResult } from "@/lib/live-solver"
import type { LiveReadout } from "@/lib/live-physics"
import { LiveDiagramSwitch, type LiveDiagramKind } from "./live-diagram-switch"

// Deformation scale slider: logarithmic 0.1 → 10 with 1 at the centre, so
// "smaller" and "bigger" get equal travel. Snaps to exactly 1 near the centre.
const posToScale = (p: number) => (Math.abs(p) < 0.04 ? 1 : Math.pow(10, p))
const scaleToPos = (s: number) => Math.log10(Math.min(Math.max(s, 0.1), 10))

/**
 * Everything Live mode shows besides the canvas, stacked in the middle:
 * the diagram buttons, a compact deformation-scale slider, and, while a node
 * is pulled, a small equilibrium chip. An unstable model replaces the slider
 * and chip with a warning so a mechanism is never silent.
 */
export function LiveControls({
  diagram,
  onDiagramChange,
  deformScale,
  onDeformScaleChange,
  readout,
  liveSystem,
}: {
  diagram: LiveDiagramKind
  onDiagramChange: (d: LiveDiagramKind) => void
  deformScale: number
  onDeformScaleChange: (v: number) => void
  readout: LiveReadout | null
  liveSystem: LiveBuildResult | null
}) {
  const unstable = liveSystem !== null && !liveSystem.ok
  // Round-off residual (≈1e-12) reads as balanced at any force size.
  const balanced = readout
    ? Math.max(Math.abs(readout.eq.Fx), Math.abs(readout.eq.Fy), Math.abs(readout.eq.M) / 10) <=
      1e-6 * Math.max(readout.P, 1)
    : true
  const pill = "bg-white/95 border border-gray-200 shadow-sm rounded-full"

  return (
    <div className="flex flex-col items-center gap-2 select-none">
      <LiveDiagramSwitch value={diagram} onChange={onDiagramChange} />

      {unstable && liveSystem && !liveSystem.ok ? (
        <div
          role="alert"
          className="flex items-start gap-2 max-w-[min(90vw,420px)] rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 shadow-sm"
        >
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          <span>
            <span className="font-semibold">Pulling is paused.</span> {liveSystem.reason}
          </span>
        </div>
      ) : (
        <>
          <div
            className={cn(pill, "flex items-center gap-2 h-8 px-3")}
            title="Only changes how exaggerated the drawing is, never the forces. Double-click to reset."
          >
            <span className="text-xs text-gray-500">Deformation</span>
            <input
              type="range"
              aria-label="Deformation scale"
              value={scaleToPos(deformScale)}
              min={-1}
              max={1}
              step={0.01}
              className="w-24 h-1.5 accent-[#1a2f5e] cursor-pointer touch-none"
              onChange={(e) => onDeformScaleChange(posToScale(Number(e.target.value)))}
              onDoubleClick={() => onDeformScaleChange(1)}
            />
            <span className="text-xs font-mono text-[#1a2f5e] w-10 text-right tabular-nums">
              ×{deformScale >= 1 ? deformScale.toFixed(1) : deformScale.toFixed(2)}
            </span>
          </div>

          <div
            aria-live="polite"
            title="Rope force plus all support reactions"
            className={cn(
              pill,
              "flex items-center gap-1.5 h-6 px-2.5 text-[11px] transition-opacity duration-150 motion-reduce:transition-none",
              readout ? "opacity-100" : "opacity-0 pointer-events-none",
            )}
          >
            <span
              className="inline-block h-2 w-2 rounded-full"
              style={{ background: balanced ? "#16a34a" : "#ef4444" }}
              aria-hidden
            />
            <span className="font-mono text-gray-600">
              {balanced ? "ΣFx = ΣFy = ΣM = 0" : "Out of balance"}
            </span>
          </div>
        </>
      )}
    </div>
  )
}

import { useEffect, useState, type ReactNode } from "react"
import { ChevronDown, Activity, Waves, Play, Pause } from "lucide-react"
import type { LthRun } from "@/lib/seismic/lth"
import type { ModalSolution } from "@/lib/seismic/modal"
import type { SeismicCaseRun } from "@/lib/seismic/solve"

/**
 * Floating result card for the dynamic cases on the Analyze tab — the modal
 * table (period, frequency, mass participation) when the Vibration analysis
 * case is shown, or the earthquake summary (W, Cs, T, V, scale factor) when a
 * generated seismic case is. Collapsible so it never hides the model for long.
 */

const MODE_ROW = "grid grid-cols-[22px_52px_48px_40px_40px_40px_40px] items-center gap-1"

function pct(v: number): string {
  return (v * 100).toFixed(1)
}

function Shell({
  icon,
  title,
  children,
}: {
  icon: ReactNode
  title: string
  children: ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="absolute bottom-[60px] right-3 z-10 max-w-[calc(100%-1.5rem)] rounded-lg border border-gray-100 bg-white/95 shadow-[0_2px_12px_rgba(0,0,0,0.08)] backdrop-blur-sm pointer-events-auto">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-left text-[11px] font-semibold text-[#1a2f5e]"
      >
        {icon}
        <span className="flex-1 truncate">{title}</span>
        <ChevronDown size={12} className={`shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="border-t border-gray-100 px-3 pb-2.5 pt-2">{children}</div>}
    </div>
  )
}

export function ModalResultsCard({
  modal,
  selectedModeIndex,
  onSelectMode,
}: {
  modal: ModalSolution | null
  selectedModeIndex: number
  onSelectMode: (i: number) => void
}) {
  if (!modal) return null
  if (!modal.ok) {
    return (
      <Shell icon={<Activity size={12} />} title="Vibration analysis">
        <p className="max-w-[300px] rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
          {modal.reason}
        </p>
      </Shell>
    )
  }
  return (
    <Shell icon={<Activity size={12} />} title={`Vibration analysis — ${modal.modes.length} modes`}>
      <div className="overflow-x-auto font-mono text-[10px]">
        <div className={`${MODE_ROW} pb-1 font-sans text-[9px] font-semibold tracking-wide text-gray-400`}>
          <span>#</span>
          <span className="text-right">T (s)</span>
          <span className="text-right">f (Hz)</span>
          <span className="text-right">Ux %</span>
          <span className="text-right">ΣUx</span>
          <span className="text-right">Uy %</span>
          <span className="text-right">ΣUy</span>
        </div>
        <div className="max-h-[min(240px,35vh)] overflow-y-auto">
          {modal.modes.map((m) => {
            const active = m.index === selectedModeIndex
            return (
              <button
                type="button"
                key={m.index}
                onClick={() => onSelectMode(m.index)}
                className={`${MODE_ROW} w-full rounded py-0.5 text-left ${
                  active ? "bg-[#1a2f5e]/10 text-[#1a2f5e]" : "text-gray-600 hover:bg-gray-50"
                }`}
              >
                <span>{m.index}</span>
                <span className="text-right">{m.T.toFixed(3)}</span>
                <span className="text-right">{m.f.toFixed(2)}</span>
                <span className="text-right">{pct(m.ratioX)}</span>
                <span className="text-right">{pct(m.cumX)}</span>
                <span className="text-right">{pct(m.ratioY)}</span>
                <span className="text-right">{pct(m.cumY)}</span>
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-1.5 text-[10px] leading-snug text-gray-400">
        Participating mass X {modal.massX.toFixed(2)} t · Y {modal.massY.toFixed(2)} t. Click a row
        to draw its mode shape.
      </p>
      {modal.issues.map((s) => (
        <p key={s} className="mt-1 max-w-[320px] text-[10px] leading-snug text-amber-700">
          {s}
        </p>
      ))}
    </Shell>
  )
}

function Line({ k, v }: { k: ReactNode; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-[11px]">
      <span className="text-gray-500">{k}</span>
      <span className="font-mono text-[#1e293b]">{v}</span>
    </div>
  )
}

const METHOD_TITLE = { elf: "static equivalent", mrs: "response spectrum", lth: "time history" }

/**
 * A response history as a small SVG trace, with the instant being drawn on
 * the canvas marked. Min/max per pixel column, so no peak can alias away.
 */
function HistoryTrace({
  label,
  unit,
  values,
  dt,
  cursorT,
  scale = 1,
}: {
  label: string
  unit: string
  values: Float64Array
  dt: number
  cursorT: number | null
  scale?: number
}) {
  const W = 260
  const H = 54
  const cols = W
  const n = values.length
  const per = Math.max(1, Math.ceil(n / cols))
  let amp = 0
  for (let i = 0; i < n; i++) amp = Math.max(amp, Math.abs(values[i] * scale))
  const y = (v: number) => H / 2 - (amp > 0 ? (v * scale) / amp : 0) * (H / 2 - 2)
  const x = (i: number) => (i / Math.max(n - 1, 1)) * W
  let d = ""
  const lows: string[] = []
  for (let s = 0; s < n; s += per) {
    let lo = Infinity
    let hi = -Infinity
    for (let i = s; i < Math.min(n, s + per); i++) {
      lo = Math.min(lo, values[i])
      hi = Math.max(hi, values[i])
    }
    d += `${d ? "L" : "M"}${x(s).toFixed(1)},${y(hi).toFixed(1)}`
    lows.unshift(`L${x(s).toFixed(1)},${y(lo).toFixed(1)}`)
  }
  d += lows.join("") + "Z"
  const duration = (n - 1) * dt
  return (
    <div>
      <div className="flex items-baseline justify-between text-[10px] text-gray-500">
        <span>{label}</span>
        <span className="font-mono">
          ±{amp.toPrecision(3)} {unit}
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-[54px] w-[260px] max-w-full" preserveAspectRatio="none">
        <line x1={0} y1={H / 2} x2={W} y2={H / 2} stroke="#e2e8f0" strokeWidth={1} />
        <path d={d} fill="#1a2f5e" fillOpacity={0.85} stroke="#1a2f5e" strokeWidth={0.5} />
        {cursorT !== null && duration > 0 && (
          <line
            x1={(cursorT / duration) * W}
            y1={0}
            x2={(cursorT / duration) * W}
            y2={H}
            stroke="#2563eb"
            strokeWidth={1.5}
          />
        )}
      </svg>
    </div>
  )
}

/** Peak summary, the two histories and a scrubber over the kept frames. */
function LthSection({
  lth,
  frameIndex,
  onFrameIndexChange,
}: {
  lth: LthRun
  frameIndex: number | null
  onFrameIndexChange: (i: number | null) => void
}) {
  const [playing, setPlaying] = useState(false)
  const last = lth.frames.length - 1
  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(() => {
      onFrameIndexChange(frameIndex === null || frameIndex >= last ? 0 : frameIndex + 1)
    }, 50)
    return () => window.clearInterval(id)
  }, [playing, frameIndex, last, onFrameIndexChange])
  const t = frameIndex === null ? null : lth.frames[Math.min(frameIndex, last)].t
  return (
    <div className="space-y-1.5">
      <Line k="Record" v={lth.record.name} />
      <Line k="PGA · Δt · steps" v={`${(lth.pga / 9.80665).toFixed(3)} g · ${lth.dt} s · ${lth.steps}`} />
      <Line k="ζ at T₁ and Tₙ" v={`${(lth.zeta * 100).toFixed(1)} % (${lth.T1.toFixed(3)} / ${lth.Tn.toFixed(4)} s)`} />
      <Line k="Peak roof u" v={`${(lth.peakRoof.value * 1000).toFixed(2)} mm @ ${lth.peakRoof.t.toFixed(2)} s`} />
      <Line k="Peak base shear" v={`${lth.peakBase.value.toFixed(2)} kN @ ${lth.peakBase.t.toFixed(2)} s`} />
      <HistoryTrace label="Roof displacement u(t)" unit="mm" values={lth.roofU} dt={lth.dt} cursorT={t} scale={1000} />
      <HistoryTrace label="Base shear V(t)" unit="kN" values={lth.baseShear} dt={lth.dt} cursorT={t} />
      <div className="flex items-center gap-2 pt-0.5">
        <button
          type="button"
          aria-label={playing ? "Pause" : "Play"}
          onClick={() => {
            if (!playing && frameIndex === null) onFrameIndexChange(0)
            setPlaying((p) => !p)
          }}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-gray-200 text-[#1a2f5e] hover:border-[#2563eb]"
        >
          {playing ? <Pause size={11} /> : <Play size={11} />}
        </button>
        <input
          type="range"
          min={0}
          max={last}
          value={frameIndex ?? 0}
          aria-label="Time"
          onChange={(e) => {
            setPlaying(false)
            onFrameIndexChange(Number(e.target.value))
          }}
          className="h-1 min-w-0 flex-1 accent-[#1a2f5e]"
        />
        <button
          type="button"
          onClick={() => {
            setPlaying(false)
            onFrameIndexChange(null)
          }}
          className={`h-6 shrink-0 rounded-md border px-2 font-mono text-[10px] ${
            frameIndex === null
              ? "border-[#1a2f5e] bg-[#1a2f5e] text-white"
              : "border-gray-200 text-gray-600 hover:border-[#2563eb]"
          }`}
        >
          {frameIndex === null ? "Peak" : `t = ${t!.toFixed(2)} s`}
        </button>
      </div>
    </div>
  )
}

export function SeismicResultsCard({
  name,
  run,
  frameIndex = null,
  onFrameIndexChange = () => {},
}: {
  name: string
  run: SeismicCaseRun
  frameIndex?: number | null
  onFrameIndexChange?: (i: number | null) => void
}) {
  const elf = run.mrs?.elf ?? run.elf
  const l = elf?.ladder
  return (
    <Shell icon={<Waves size={12} />} title={`${name} — ${METHOD_TITLE[run.def.analysis]}`}>
      <div className="min-w-[220px] space-y-0.5">
        {run.error && (
          <p className="max-w-[300px] rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
            {run.error}
          </p>
        )}
        {elf && l && (
          <>
            <Line k="W" v={`${elf.W.toFixed(1)} kN`} />
            <Line k="T (used for Cs)" v={`${l.T.toFixed(3)} s`} />
            <Line k={<>C<sub>s</sub> (Eq. {l.csGoverning})</>} v={l.Cs.toFixed(5)} />
            <Line k="k" v={l.k.toFixed(3)} />
            <Line k={<>V<sub>ELF</sub> = C<sub>s</sub>·W</>} v={`${elf.V.toFixed(2)} kN`} />
          </>
        )}
        {run.mrs && (
          <>
            <Line k={<>V<sub>MRS</sub> (CQC)</>} v={`${run.mrs.unscaledV.toFixed(2)} kN`} />
            <Line
              k="Scale factor"
              v={run.mrs.scaleFactor > 1 ? `× ${run.mrs.scaleFactor.toFixed(3)}` : "none required"}
            />
            <Line k="Design base shear" v={`${run.mrs.V.toFixed(2)} kN`} />
            <Line k="Modes · ΣUx" v={`${run.mrs.modes.length} · ${pct(run.mrs.massRatioX)} %`} />
          </>
        )}
        {run.lth && (
          <LthSection lth={run.lth} frameIndex={frameIndex} onFrameIndexChange={onFrameIndexChange} />
        )}
        {run.issues.map((s) => (
          <p key={s} className="max-w-[300px] pt-1 text-[10px] leading-snug text-amber-700">
            {s}
          </p>
        ))}
      </div>
    </Shell>
  )
}

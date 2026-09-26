import { useState, type ReactNode } from "react"
import { ChevronDown, Activity, Waves } from "lucide-react"
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

export function SeismicResultsCard({ name, run }: { name: string; run: SeismicCaseRun }) {
  const elf = run.mrs?.elf ?? run.elf
  const l = elf?.ladder
  return (
    <Shell
      icon={<Waves size={12} />}
      title={`${name} — ${run.def.analysis === "mrs" ? "response spectrum" : "static equivalent"}`}
    >
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
        {run.issues.map((s) => (
          <p key={s} className="max-w-[300px] pt-1 text-[10px] leading-snug text-amber-700">
            {s}
          </p>
        ))}
      </div>
    </Shell>
  )
}

/**
 * Vibration analysis — the Modal case's settings window.
 *
 * Two things: the MASS SOURCE (which load cases become mass, at what factor)
 * and the mode count, which is automatic. The mass source is document-level —
 * every earthquake case reads the same mass — so this is its only editor.
 *
 * Same frame and row family as the seismic window (OpenANSTRUK-3D style):
 * portal card, draft-and-commit, Escape cancels.
 */

import { useEffect, useMemo, useState, type ReactNode } from "react"
import { createPortal } from "react-dom"
import { X } from "lucide-react"

import { NumInline, ReadRow } from "@/components/dialog-fields"
import { Checkbox } from "@/components/flyout-shared"
import type { StructureModel } from "@/lib/model"
import type { LoadCase, LoadCaseId } from "@/lib/load-cases"
import { Z_DIALOG } from "@/lib/z-layers"
import { massEligibleCases, type MassSource } from "@/lib/seismic/mass-source"
import { buildMassReport, GRAVITY } from "@/lib/seismic/mass"
import type { ModalSolution } from "@/lib/seismic/modal"

export interface ModalDialogProps {
  model: StructureModel
  loadCases: Record<LoadCaseId, LoadCase>
  /** The mass source, already reconciled with the case list. */
  value: MassSource
  /** The current solution, if one has been run — for the mode summary. */
  modal: ModalSolution | null
  onCommit: (next: MassSource) => void
  onCancel: () => void
}

/** One track string for the header and every row, so the columns cannot drift. */
// Content-sized tracks: the name column stops at 112px instead of stretching
// across the window, so the table reads as one tight block.
const MASS_ROW = "grid grid-cols-[16px_minmax(0,112px)_64px_56px_52px] items-center gap-2"

/** A titled, bordered box, so each setting visibly belongs to its group. */
function Panel({
  title,
  className = "",
  children,
}: {
  title: string
  className?: string
  children: ReactNode
}) {
  return (
    <section className={`overflow-hidden rounded-lg border border-gray-200 ${className}`}>
      <h3 className="border-b border-gray-200 bg-gray-50 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-[#1a2f5e]">
        {title}
      </h3>
      <div className="space-y-1.5 p-2.5">{children}</div>
    </section>
  )
}

export function ModalDialog({
  model,
  loadCases,
  value,
  modal,
  onCommit,
  onCancel,
}: ModalDialogProps) {
  const [draft, setDraft] = useState<MassSource>(value)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onCancel])

  const report = useMemo(() => buildMassReport(model, loadCases, draft), [model, loadCases, draft])
  const eligible = massEligibleCases(loadCases)

  const setTerm = (id: LoadCaseId, patch: Partial<MassSource["terms"][string]>) =>
    setDraft((d) => ({ terms: { ...d.terms, [id]: { ...d.terms[id], ...patch } } }))

  const modalOk = modal && modal.ok ? modal : null
  const last = modalOk?.modes[modalOk.modes.length - 1]

  const body = (
    <div className="flex max-h-[calc(100dvh-1rem)] w-fit max-w-[96vw] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-2">
        <span className="truncate text-sm font-medium text-[#1e293b]">
          Vibration analysis — Modal settings
        </span>
        <button
          aria-label="Close"
          onClick={onCancel}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={15} />
        </button>
      </div>

      {/* Side by side from `sm` up, so a landscape phone fits without scrolling. */}
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto overflow-x-hidden p-3 sm:flex-row sm:items-start">
        <Panel title="Mass source" className="min-w-0">
          <div className="space-y-0.5">
            <div
              className={`${MASS_ROW} px-1 text-[9px] font-semibold uppercase tracking-wide text-gray-400`}
            >
              <span />
              <span>Load case</span>
              <span>Type</span>
              <span className="text-right">Factor</span>
              <span className="text-right">
                W <span className="normal-case">(kN)</span>
              </span>
            </div>
            {eligible.length === 0 && (
              <p className="px-1 text-[11px] text-gray-400">
                No dead or live cases to take mass from.
              </p>
            )}
            {eligible.map((c) => {
              const t = draft.terms[c.id] ?? { factor: 0, include: false }
              const w = report.byCase[c.id]
              return (
                <div
                  key={c.id}
                  className={`${MASS_ROW} rounded-md px-1 py-0.5 ${t.include ? "" : "opacity-50"}`}
                >
                  <Checkbox
                    checked={t.include}
                    onChange={(include) => setTerm(c.id, { include })}
                    title="Include this case in the mass"
                  />
                  <span className="truncate text-[11px] text-[#1e293b]">{c.name}</span>
                  <span className="truncate text-[11px] text-gray-500">
                    {c.id === "selfweight" ? "Dead (γ·A)" : c.kind}
                  </span>
                  <NumInline
                    value={t.factor}
                    disabled={!t.include}
                    invalid={!Number.isFinite(t.factor) || t.factor < 0}
                    ariaLabel={`${c.name} mass factor`}
                    width="w-full"
                    pad={false}
                    onChange={(factor) =>
                      setTerm(c.id, { factor: Number.isFinite(factor) ? Math.max(factor, 0) : 0 })
                    }
                  />
                  <span className="text-right font-mono text-[11px] text-gray-500">
                    {t.include && w !== undefined ? w.toFixed(1) : "—"}
                  </span>
                </div>
              )
            })}
            <div
              className={`${MASS_ROW} border-t border-gray-100 px-1 pt-1.5 text-[11px] font-medium text-[#1e293b]`}
            >
              <span />
              <span>Total</span>
              <span className="font-mono text-gray-500">{(report.W / GRAVITY).toFixed(2)} t</span>
              <span />
              <span className="text-right font-mono">{report.W.toFixed(1)}</span>
            </div>
          </div>

          {report.clamped.length > 0 && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
              {report.clamped.length} node{report.clamped.length === 1 ? "" : "s"} carry a net
              upward load and are given zero mass.
            </p>
          )}
        </Panel>

        <Panel title="Modes" className="shrink-0 sm:w-[180px]">
          <div className="space-y-1">
            <ReadRow label="Method">Eigen</ReadRow>
            <ReadRow label="Modes">{modalOk ? modalOk.modes.length : "Auto"}</ReadRow>
            {last && (
              <>
                <ReadRow label="Σ mass, X">{(last.cumX * 100).toFixed(1)} %</ReadRow>
                <ReadRow label="Σ mass, Y">{(last.cumY * 100).toFixed(1)} %</ReadRow>
              </>
            )}
          </div>
          {modal && !modal.ok && (
            <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
              {modal.reason}
            </p>
          )}
        </Panel>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-4 py-2">
        <button
          onClick={onCancel}
          className="h-8 rounded-md border border-gray-200 px-4 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onCommit(draft)}
          className="h-8 rounded-md bg-[#1a2f5e] px-6 text-xs font-medium text-white transition-transform hover:scale-[1.02] active:scale-95"
        >
          OK
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div
      style={{ zIndex: Z_DIALOG }}
      className="fixed inset-0 flex items-center justify-center bg-black/25 p-2 sm:p-4"
    >
      {body}
    </div>,
    document.body,
  )
}

/**
 * Analysis Issues Dialog (v1.0.6).
 *
 * Surfaces structural-validity issues to the user when the analysis cannot
 * produce results. Auto-opens once per Analyze-tab entry when there is at
 * least one error-severity issue; manually re-openable by clicking the
 * status-bar STATUS label. Closed via the × button, backdrop click, or ESC.
 *
 * Follows the project's custom modal pattern (matches examples-modal.tsx and
 * the template modals) — does not use the shadcn Dialog primitive because
 * the rest of the codebase doesn't either.
 */

import { useEffect } from "react"
import { X } from "lucide-react"
import type {
  DiagnosticIssue,
  DiagnosticsReport,
} from "@/lib/analysis-diagnostics"

interface AnalysisIssuesDialogProps {
  open: boolean
  onClose: () => void
  report: DiagnosticsReport
}

function messageFor(issue: DiagnosticIssue): string {
  switch (issue.kind) {
    case "no-nodes":
      return "The model has no nodes."
    case "no-members":
      return "The model has no members."
    case "no-supports":
      return "The model has no supports."
    case "insufficient-reactions":
      return "The model has reaction components but needs at least 3 reaction components for static equilibrium."
    case "disconnected-component":
      return "There are nodes disconnected from any support."
    case "singular-at-dof":
      return "Instability detected. Likely cause: missing constraint or geometric mechanism."
    case "selfweight-zero-gamma":
      return "Warning: Some sections have Unit Weight (γ) = 0 and will produce zero self-weight contribution."
    case "duplicate-members":
      return "Two or more members share the same endpoints. The solver is adding their stiffness together, which is usually a template or import bug."
  }
}

export function AnalysisIssuesDialog({ open, onClose, report }: AnalysisIssuesDialogProps) {
  // ESC closes, matching other modals.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, onClose])

  if (!open) return null

  // Drop issues that already have dedicated inline surfaces elsewhere in the
  // app — listing them here too is just visual noise. The γ=0 self-weight
  // warning is shown in both the Load Case and Load Combination flyout tools
  // and doesn't need to repeat in this dialog.
  //
  // Then sort errors before warnings and de-duplicate by message text so
  // repeated singular-DOF entries across cases don't spam the list.
  const sorted = [...report.issues]
    .filter((i) => i.kind !== "selfweight-zero-gamma")
    .sort((a, b) => {
      if (a.severity === b.severity) return 0
      return a.severity === "error" ? -1 : 1
    })
  const seen = new Set<string>()
  const issues = sorted.filter((i) => {
    const msg = messageFor(i)
    if (seen.has(msg)) return false
    seen.add(msg)
    return true
  })

  if (issues.length === 0) {
    // Nothing to show — should not normally render, but guard defensively.
    return null
  }

  const hasError = issues.some((i) => i.severity === "error")
  const title = "Warning"

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-black/30"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-xl shadow-2xl w-[480px] max-w-[calc(100vw-2rem)] max-h-[85dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-[#1a2f5e]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* Issue list */}
        <div className="px-5 py-4 space-y-2">
          {issues.map((issue, idx) => (
            <div
              key={`${issue.kind}-${idx}`}
              className="flex items-start gap-2.5 text-xs leading-snug"
            >
              <span
                className={
                  "mt-1 w-2 h-2 rounded-full flex-none " +
                  (issue.severity === "error" ? "bg-[#dc2626]" : "bg-[#d97706]")
                }
              />
              <span
                className={
                  issue.severity === "error"
                    ? "text-[#1e293b]"
                    : "text-amber-900"
                }
              >
                {messageFor(issue)}
              </span>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-5 py-3 border-t border-gray-100 text-[10px] text-gray-400">
          {hasError
            ? "Resolve the issues above for the analysis to produce results."
            : "Warnings do not block analysis but may affect result fidelity."}
        </div>
      </div>
    </div>
  )
}

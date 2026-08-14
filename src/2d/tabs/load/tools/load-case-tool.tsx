import { Plus, Trash2, Lock } from "lucide-react"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  type LoadCase,
  type LoadCaseId,
  type LoadCaseKind,
  LOAD_CASE_KINDS,
  caseShortLabel,
} from "@/lib/load-cases"
import { Checkbox } from "@/components/flyout-shared"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"

interface LoadCaseToolContentProps {
  loadCases: Record<LoadCaseId, LoadCase>
  onAddLoadCase: () => void
  onDeleteLoadCase: (id: LoadCaseId) => void
  onPatchLoadCase: (id: LoadCaseId, patch: Partial<LoadCase>) => void
  /**
   * Sections referenced by at least one member that have γ ≤ 0. Drives the
   * inline Selfweight γ=0 warning at the bottom of the panel.
   */
  zeroGammaSectionIds?: string[]
}

export function LoadCaseToolContent({
  loadCases,
  onAddLoadCase,
  onDeleteLoadCase,
  onPatchLoadCase,
  zeroGammaSectionIds = [],
}: LoadCaseToolContentProps) {
  const cases = Object.values(loadCases)
  // Warn when Selfweight is enabled but at least one referenced section has
  // γ ≤ 0 — those members contribute nothing to the synthetic body-force
  // load (see analysis-pipeline.ts::solveCase("selfweight")).
  const selfweightCase = loadCases["selfweight"]
  const showZeroGammaWarning =
    !!selfweightCase?.enabled && zeroGammaSectionIds.length > 0

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[20px_1fr_28px_90px_24px] md:grid-cols-[20px_1fr_36px_140px_28px] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        <span />
        <span>Name</span>
        <span className="text-center">Abbr</span>
        <span>Type</span>
        <span />
      </div>

      <div className="space-y-1">
        {cases.map((c) => (
          <CaseRow
            key={c.id}
            loadCase={c}
            onPatch={(patch) => onPatchLoadCase(c.id, patch)}
            onDelete={() => onDeleteLoadCase(c.id)}
          />
        ))}
      </div>

      <button
        onClick={onAddLoadCase}
        className="w-full h-8 text-[11px] rounded-md border border-gray-200 bg-white text-gray-500 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5 transition-colors flex items-center justify-center gap-1.5"
      >
        <Plus size={12} />
        Add Case
      </button>

      {showZeroGammaWarning && (
        <div className="border-t pt-3" style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}>
          <div className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 text-[11px] text-amber-900 leading-snug">
            Warning: Some sections have Unit Weight (γ) = 0 and will produce zero self-weight contribution.
          </div>
        </div>
      )}
    </div>
  )
}

function CaseRow({
  loadCase,
  onPatch,
  onDelete,
}: {
  loadCase: LoadCase
  onPatch: (patch: Partial<LoadCase>) => void
  onDelete: () => void
}) {
  return (
    <div className="grid grid-cols-[20px_1fr_28px_90px_24px] md:grid-cols-[20px_1fr_36px_140px_28px] items-center gap-2">
      {/* Col 1 — enabled checkbox. For Selfweight: gates body-force inclusion.
                 For other cases: skips this case (and its loads) in the solver. */}
      <div className="flex items-center justify-center">
        <Checkbox
          checked={loadCase.enabled}
          onChange={(v) => onPatch({ enabled: v })}
          title={
            loadCase.locked
              ? "Include self-weight body force (γ·A per member) in solve & analyze"
              : "Include this case in solve & analyze"
          }
        />
      </div>

      <Input
        value={loadCase.name}
        disabled={loadCase.locked}
        onChange={(e) => onPatch({ name: e.target.value })}
        className="h-7 text-xs"
      />

      {/* Col 3 — kind abbreviation pill (D, L, Lr, W, E, R). Derived from kind,
                 read-only. Reinforces the shorthand used in combo expressions. */}
      <div className="flex items-center justify-center">
        <span className="inline-flex items-center justify-center min-w-[24px] h-5 px-1.5 rounded bg-gray-100 text-[10px] font-mono font-semibold text-gray-700">
          {caseShortLabel(loadCase.kind)}
        </span>
      </div>

      <Select
        value={loadCase.kind}
        disabled={loadCase.locked}
        onValueChange={(v) => onPatch({ kind: v as LoadCaseKind })}
      >
        <SelectTrigger className="h-7 text-xs w-full" size="sm">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {LOAD_CASE_KINDS.map((k) => (
            <SelectItem key={k} value={k} className="text-xs">
              {k}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <div className="flex items-center justify-center">
        {loadCase.locked ? (
          <Lock size={12} className="text-gray-400" />
        ) : (
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-600 transition-colors p-0.5 rounded hover:bg-gray-100"
            title="Delete case"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}

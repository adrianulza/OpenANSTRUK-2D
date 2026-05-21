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

interface LoadCaseToolContentProps {
  loadCases: Record<LoadCaseId, LoadCase>
  onAddLoadCase: () => void
  onDeleteLoadCase: (id: LoadCaseId) => void
  onPatchLoadCase: (id: LoadCaseId, patch: Partial<LoadCase>) => void
}

export function LoadCaseToolContent({
  loadCases,
  onAddLoadCase,
  onDeleteLoadCase,
  onPatchLoadCase,
}: LoadCaseToolContentProps) {
  const cases = Object.values(loadCases)

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
        className="w-full h-8 text-[11px] rounded-md transition-colors flex items-center justify-center gap-1.5"
        style={{ backgroundColor: "#f3f4f6", color: "#4b5563" }}
        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e5e7eb")}
        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
      >
        <Plus size={12} />
        Add Case
      </button>
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
        <input
          type="checkbox"
          checked={loadCase.enabled}
          onChange={(e) => onPatch({ enabled: e.target.checked })}
          className="h-3.5 w-3.5 cursor-pointer accent-[#1a2f5e]"
          title={
            loadCase.locked
              ? "Include self-weight in solve"
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

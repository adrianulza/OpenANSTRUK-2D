import { Plus, Trash2 } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FLYOUT_PANEL_COLORS } from "@/lib/flyout-panel-colors"
import {
  type LoadCase,
  type LoadCaseId,
  type LoadCaseKind,
  LOAD_CASE_KINDS,
} from "@/lib/load-cases"

interface LoadCaseToolContentProps {
  loadCases: Record<LoadCaseId, LoadCase>
  activeLoadCaseId: LoadCaseId
  onActiveLoadCaseChange: (id: LoadCaseId) => void
  onAddLoadCase: () => void
  onDeleteLoadCase: (id: LoadCaseId) => void
  onPatchLoadCase: (id: LoadCaseId, patch: Partial<LoadCase>) => void
}

export function LoadCaseToolContent({
  loadCases,
  activeLoadCaseId,
  onActiveLoadCaseChange,
  onAddLoadCase,
  onDeleteLoadCase,
  onPatchLoadCase,
}: LoadCaseToolContentProps) {
  const cases = Object.values(loadCases)

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[1fr_90px_36px_32px_24px] md:grid-cols-[1fr_140px_56px_44px_28px] items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500">
        <span>Name</span>
        <span>Type</span>
        <span className="text-center">Loads</span>
        <span className="text-center">SW</span>
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

      <div
        className="border-t pt-3 space-y-1.5"
        style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}
      >
        <Label className="text-xs text-gray-600">Active for new loads</Label>
        <Select value={activeLoadCaseId} onValueChange={onActiveLoadCaseChange}>
          <SelectTrigger className="h-8 text-xs w-full" size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {cases.map((c) => (
              <SelectItem key={c.id} value={c.id} className="text-xs">
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
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
  // Loads count is wired later — placeholder dash for now.
  const loadsCount = "—"

  return (
    <div className="grid grid-cols-[1fr_90px_36px_32px_24px] md:grid-cols-[1fr_140px_56px_44px_28px] items-center gap-2">
      <Input
        value={loadCase.name}
        disabled={loadCase.locked}
        onChange={(e) => onPatch({ name: e.target.value })}
        className="h-7 text-xs"
      />

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

      <div className="text-[11px] text-gray-500 text-center font-mono">
        {loadsCount}
      </div>

      <div className="flex items-center justify-center">
        {loadCase.locked ? (
          <input
            type="checkbox"
            checked={loadCase.includeSelfWeight ?? false}
            onChange={(e) =>
              onPatch({ includeSelfWeight: e.target.checked })
            }
            className="h-3.5 w-3.5 cursor-pointer accent-[#1a2f5e]"
            title="Include self-weight in solve"
          />
        ) : (
          <span className="text-[11px] text-gray-300">—</span>
        )}
      </div>

      <div className="flex items-center justify-center">
        {loadCase.locked ? (
          <span className="text-[10px] text-gray-300" title="Locked">
            🔒
          </span>
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

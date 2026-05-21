import { useState } from "react"
import { Plus, Trash2, Pencil, Sparkles } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { NumericInput } from "@/components/ui/numeric-input"
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
  type LoadCombination,
  type LoadComboId,
  type CodePreset,
  CODE_PRESETS,
  formatComboExpression,
} from "@/lib/load-cases"
import {
  requiredKindsForPreset,
  expectedComboCount,
} from "@/lib/combinations-presets"

interface LoadCombinationToolContentProps {
  loadCases: Record<LoadCaseId, LoadCase>
  combinations: Record<LoadComboId, LoadCombination>
  combinationsEnabled: boolean
  onCombinationsEnabledChange: (v: boolean) => void
  combinationMode: "manual" | "code"
  onCombinationModeChange: (m: "manual" | "code") => void
  selectedCodePreset: CodePreset
  onSelectedCodePresetChange: (p: CodePreset) => void
  onAddCombination: () => void
  onDeleteCombination: (id: LoadComboId) => void
  onPatchCombination: (id: LoadComboId, patch: Partial<LoadCombination>) => void
  onGenerateCodeCombinations: () => void
  editingCombinationId: LoadComboId | null
  onEditingCombinationIdChange: (id: LoadComboId | null) => void
}

export function LoadCombinationToolContent(props: LoadCombinationToolContentProps) {
  const {
    loadCases,
    combinations,
    combinationsEnabled,
    onCombinationsEnabledChange,
    combinationMode,
    onCombinationModeChange,
    selectedCodePreset,
    onSelectedCodePresetChange,
    onAddCombination,
    onDeleteCombination,
    onPatchCombination,
    onGenerateCodeCombinations,
    editingCombinationId,
    onEditingCombinationIdChange,
  } = props

  const [confirmGenerate, setConfirmGenerate] = useState(false)

  const combos = Object.values(combinations)
  const manualCombos = combos.filter((c) => c.source === "custom")
  const codeCombos = combos.filter((c) => c.source === "preset")

  return (
    <div className="space-y-3">
      {/* Master toggle */}
      <label className="flex items-center gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={combinationsEnabled}
          onChange={(e) => onCombinationsEnabledChange(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-[#1a2f5e]"
        />
        <span className="text-xs text-gray-700 font-medium">
          Enable load combinations
        </span>
      </label>

      {!combinationsEnabled && (
        <p className="text-[11px] text-gray-500 leading-relaxed">
          Combinations let you apply code-based or custom factor sets across
          your load cases. Envelopes show the max/min effect across all
          checked combinations. Existing combinations are preserved below —
          re-enable to use them.
        </p>
      )}

      {/* The block stays visible but greys out when combinations are disabled,
          so users can see their work is preserved (combos aren't destroyed by
          toggling). Inputs become non-interactive in that state. */}
      <div
        className={combinationsEnabled ? "" : "opacity-50 pointer-events-none"}
        aria-disabled={!combinationsEnabled}
      >
        <>
          {/* Mode radio */}
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Mode</Label>
            <div className="flex gap-1">
              <button
                onClick={() => onCombinationModeChange("manual")}
                className="flex-1 h-7 text-[11px] rounded-md transition-colors"
                style={
                  combinationMode === "manual"
                    ? { backgroundColor: FLYOUT_PANEL_COLORS.primary, color: "white" }
                    : { backgroundColor: "#f3f4f6", color: "#4b5563" }
                }
              >
                Manual
              </button>
              <button
                onClick={() => onCombinationModeChange("code")}
                className="flex-1 h-7 text-[11px] rounded-md transition-colors"
                style={
                  combinationMode === "code"
                    ? { backgroundColor: FLYOUT_PANEL_COLORS.primary, color: "white" }
                    : { backgroundColor: "#f3f4f6", color: "#4b5563" }
                }
              >
                Code
              </button>
            </div>
          </div>

          {combinationMode === "code" && (
            <div className="space-y-1.5">
              <Label className="text-xs text-gray-600">Code</Label>
              <div className="flex gap-2">
                <Select
                  value={selectedCodePreset}
                  onValueChange={(v) => onSelectedCodePresetChange(v as CodePreset)}
                >
                  <SelectTrigger className="h-8 text-xs flex-1" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {CODE_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id} className="text-xs">
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => setConfirmGenerate(true)}
                  className="h-8 px-3 text-[11px] rounded-md transition-colors flex items-center gap-1.5 whitespace-nowrap"
                  style={{
                    backgroundColor: FLYOUT_PANEL_COLORS.primary,
                    color: "white",
                  }}
                  title="Generate combinations for this preset"
                >
                  <Sparkles size={12} />
                  Generate
                </button>
              </div>
            </div>
          )}

          {/* Header row — code rows get a delete-only action column, manual rows
              get edit + delete. Grid template stays uniform so columns align. */}
          <div className="grid items-center gap-2 px-1 text-[10px] font-semibold uppercase tracking-wide text-gray-500 pt-1 grid-cols-[16px_100px_1fr_40px] md:grid-cols-[20px_160px_1fr_60px]">
            <span />
            <span>Name</span>
            <span>Expression</span>
            <span className="text-right">Actions</span>
          </div>

          {/* List */}
          <div className="space-y-1">
            {(combinationMode === "code" ? codeCombos : manualCombos).map((c) => (
              <ComboRow
                key={c.id}
                combo={c}
                cases={loadCases}
                readonly={combinationMode === "code"}
                isEditing={editingCombinationId === c.id}
                onToggle={(enabled) => onPatchCombination(c.id, { enabled })}
                onDelete={() => onDeleteCombination(c.id)}
                onEdit={() =>
                  onEditingCombinationIdChange(
                    editingCombinationId === c.id ? null : c.id
                  )
                }
                onPatch={(patch) => onPatchCombination(c.id, patch)}
              />
            ))}

            {combinationMode === "code" && codeCombos.length === 0 && (
              <p className="text-[11px] text-gray-500 italic px-1 py-2">
                No matching cases — add cases of the right type (Dead, Live,
                Wind, etc.) for this preset to generate combinations.
              </p>
            )}

            {combinationMode === "manual" && manualCombos.length === 0 && (
              <p className="text-[11px] text-gray-500 italic px-1 py-2">
                No combinations yet.
              </p>
            )}
          </div>

          {combinationMode === "manual" && (
            <button
              onClick={onAddCombination}
              className="w-full h-8 text-[11px] rounded-md transition-colors flex items-center justify-center gap-1.5"
              style={{ backgroundColor: "#f3f4f6", color: "#4b5563" }}
              onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "#e5e7eb")}
              onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "#f3f4f6")}
            >
              <Plus size={12} />
              Add New Combination
            </button>
          )}

          {/* Envelope row */}
          <div
            className="border-t pt-3"
            style={{ borderTopColor: FLYOUT_PANEL_COLORS.contentSeparator }}
          >
            <div
              className={`grid items-center gap-2 px-1 ${
                combinationMode === "code"
                  ? "grid-cols-[16px_100px_1fr] md:grid-cols-[20px_160px_1fr]"
                  : "grid-cols-[16px_100px_1fr_40px] md:grid-cols-[20px_160px_1fr_60px]"
              }`}
            >
              <span className="text-[11px] text-gray-500">◆</span>
              <span className="text-xs font-medium text-gray-700">Envelope</span>
              <span className="text-[11px] text-gray-500 italic">
                max/min of checked combinations
              </span>
              {combinationMode === "manual" && <span />}
            </div>
          </div>
        </>
      </div>

      {confirmGenerate && (
        <GenerateConfirmDialog
          preset={selectedCodePreset}
          presetLabel={
            CODE_PRESETS.find((p) => p.id === selectedCodePreset)?.label ??
            selectedCodePreset
          }
          loadCases={loadCases}
          onCancel={() => setConfirmGenerate(false)}
          onConfirm={() => {
            onGenerateCodeCombinations()
            setConfirmGenerate(false)
          }}
        />
      )}
    </div>
  )
}

function GenerateConfirmDialog({
  preset,
  presetLabel,
  loadCases,
  onCancel,
  onConfirm,
}: {
  preset: CodePreset
  presetLabel: string
  loadCases: Record<LoadCaseId, LoadCase>
  onCancel: () => void
  onConfirm: () => void
}) {
  const required = requiredKindsForPreset(preset)
  const missingKinds = required.filter(
    (k) => !Object.values(loadCases).some((c) => c.kind === k)
  )
  // Counted against the *final* case set (i.e., after auto-creating missing cases).
  const projectedCases = { ...loadCases }
  for (const k of missingKinds) {
    projectedCases[`tmp_${k}`] = {
      id: `tmp_${k}`,
      name: k,
      kind: k,
      color: "#000",
      enabled: true,
    }
  }
  const comboCount = expectedComboCount(preset, projectedCases)

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-xl shadow-2xl border border-gray-200 max-w-md w-[92vw] p-5 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-sm font-semibold text-[#1a2f5e]">
            Generate {presetLabel} combinations
          </h3>
          <p className="text-xs text-gray-600 mt-1.5 leading-relaxed">
            This will create <strong>{comboCount}</strong> combination
            {comboCount !== 1 ? "s" : ""} based on {presetLabel}.
            Any existing preset combinations will be replaced. Custom
            combinations will be kept.
          </p>
        </div>

        {missingKinds.length > 0 ? (
          <div className="text-xs text-gray-700 bg-amber-50 border border-amber-200 rounded-md p-3 space-y-1.5">
            <div className="font-medium">
              The following load case{missingKinds.length > 1 ? "s" : ""}{" "}
              will be created automatically:
            </div>
            <ul className="list-disc list-inside text-gray-600">
              {missingKinds.map((k) => (
                <li key={k}>{k}</li>
              ))}
            </ul>
          </div>
        ) : (
          <p className="text-xs text-gray-500 italic">
            All required load cases already exist.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button
            onClick={onCancel}
            className="h-8 px-4 text-xs rounded-md bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-8 px-4 text-xs rounded-md text-white transition-colors"
            style={{ backgroundColor: FLYOUT_PANEL_COLORS.primary }}
          >
            Generate
          </button>
        </div>
      </div>
    </div>
  )
}

function ComboRow({
  combo,
  cases,
  readonly,
  isEditing,
  onToggle,
  onDelete,
  onEdit,
  onPatch,
}: {
  combo: LoadCombination
  cases: Record<LoadCaseId, LoadCase>
  readonly: boolean
  isEditing: boolean
  onToggle: (enabled: boolean) => void
  onDelete: () => void
  onEdit: () => void
  onPatch: (patch: Partial<LoadCombination>) => void
}) {
  const dim = !combo.enabled
  const expression = formatComboExpression(combo, cases)

  return (
    <div
      className="rounded-md transition-colors"
      style={{ backgroundColor: isEditing ? "#f8fafc" : "transparent" }}
    >
      <div
        className="grid items-center gap-2 py-1 px-1 grid-cols-[16px_100px_1fr_40px] md:grid-cols-[20px_160px_1fr_60px]"
        style={{ opacity: dim ? 0.5 : 1 }}
      >
        <input
          type="checkbox"
          checked={combo.enabled}
          onChange={(e) => onToggle(e.target.checked)}
          className="h-3.5 w-3.5 cursor-pointer accent-[#1a2f5e]"
          title="Include in envelope"
        />
        <span
          className="text-[11px] font-mono text-gray-700 truncate"
          title={combo.name}
        >
          {combo.name}
        </span>
        <span
          className="text-[11px] text-gray-600 truncate"
          title={expression}
        >
          {expression}
        </span>
        <div className="flex items-center justify-end gap-1">
          {!readonly && (
            <button
              onClick={onEdit}
              className="text-gray-400 hover:text-gray-700 transition-colors p-0.5 rounded hover:bg-gray-100"
              title={isEditing ? "Close editor" : "Edit"}
            >
              <Pencil size={12} />
            </button>
          )}
          <button
            onClick={onDelete}
            className="text-gray-400 hover:text-red-600 transition-colors p-0.5 rounded hover:bg-gray-100"
            title={readonly ? "Remove this combination (regenerate to restore)" : "Delete combination"}
          >
            <Trash2 size={12} />
          </button>
        </div>
      </div>

      {!readonly && isEditing && (
        <ComboEditor combo={combo} cases={cases} onPatch={onPatch} />
      )}
    </div>
  )
}

function ComboEditor({
  combo,
  cases,
  onPatch,
}: {
  combo: LoadCombination
  cases: Record<LoadCaseId, LoadCase>
  onPatch: (patch: Partial<LoadCombination>) => void
}) {
  const caseList = Object.values(cases)
  const firstCaseId = caseList[0]?.id ?? ""

  const setName = (name: string) => onPatch({ name })
  const setTerms = (terms: LoadCombination["terms"]) => onPatch({ terms })

  const updateTerm = (
    idx: number,
    patch: Partial<LoadCombination["terms"][number]>
  ) => {
    const next = combo.terms.map((t, i) => (i === idx ? { ...t, ...patch } : t))
    setTerms(next)
  }
  const removeTerm = (idx: number) => {
    setTerms(combo.terms.filter((_, i) => i !== idx))
  }
  const addTerm = () => {
    setTerms([...combo.terms, { factor: 1.0, caseId: firstCaseId }])
  }

  return (
    <div className="mx-1 mb-2 px-2 py-2 bg-white border border-gray-200 rounded-md space-y-2">
      <div className="space-y-1">
        <Label className="text-[10px] text-gray-500 uppercase tracking-wide">
          Name
        </Label>
        <Input
          value={combo.name}
          onChange={(e) => setName(e.target.value)}
          className="h-7 text-xs"
        />
      </div>

      {/* Expression-style row: [1.2] × [Dead ▾]  +  [1.6] × [Live ▾]  [+ term].
          Wraps on narrow viewports — each term is a single inline group. */}
      <div>
        <Label className="text-[10px] text-gray-500 uppercase tracking-wide block mb-1">
          Expression
        </Label>
        <div className="flex flex-wrap items-center gap-1.5">
          {combo.terms.map((t, i) => (
            <div key={i} className="contents">
              {i > 0 && (
                <span className="text-xs text-gray-400 font-mono select-none">+</span>
              )}
              <div className="flex items-center gap-1 bg-gray-50 rounded-md px-1 py-0.5 border border-gray-100">
                <NumericInput
                  value={t.factor}
                  onChange={(v) => updateTerm(i, { factor: v })}
                  className="h-6 w-14 text-xs font-mono bg-white"
                />
                <span className="text-[10px] text-gray-400 font-mono">×</span>
                <Select
                  value={t.caseId}
                  onValueChange={(v) => updateTerm(i, { caseId: v })}
                >
                  <SelectTrigger className="h-6 text-xs min-w-[80px] bg-white" size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {caseList.map((c) => (
                      <SelectItem key={c.id} value={c.id} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <button
                  onClick={() => removeTerm(i)}
                  className="text-gray-400 hover:text-red-600 transition-colors p-0.5 rounded hover:bg-gray-100"
                  title="Remove term"
                >
                  <Trash2 size={11} />
                </button>
              </div>
            </div>
          ))}
          <button
            onClick={addTerm}
            className="inline-flex items-center gap-1 h-6 px-2 text-[11px] rounded-md transition-colors bg-gray-100 hover:bg-gray-200 text-gray-600"
            title="Add term"
          >
            <Plus size={11} />
            term
          </button>
        </div>
      </div>
    </div>
  )
}

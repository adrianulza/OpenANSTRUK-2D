import * as React from "react"
import { cn } from "@/lib/utils"
import { Plus, Pencil, Trash2, Check, X } from "lucide-react"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import type { Section, SectionId, StructureModel } from "@/lib/model"
import { newSectionId } from "@/lib/model"
import type { UnitSettings } from "@/lib/units"
import { DEFAULT_UNIT_SETTINGS } from "@/lib/units"
import { SectionSelect } from "./section-select"
import {
  ManualForm, manualFieldsFromSection, parseManualFields, validateManual,
  type ManualFields,
} from "./manual-form"
import {
  ParametricForm, defaultParametricFields, parametricFieldsFromSection,
  computeSectionFromParametric, validateParametric,
  type ParametricFields,
} from "./parametric-form"
import { AdvancedDeck } from "./advanced-panel"
import { AdvancedPill } from "./advanced-pill"

const MAX_SECTIONS = 100

type Mode = "parametric" | "manual"

export interface MaterialFlyoutProps {
  model?: StructureModel
  activeSection: SectionId
  onSectionChange?: (id: SectionId) => void
  onSectionPropsChange?: (id: SectionId, patch: Partial<Section>) => void
  onAddSection?: (section: Section) => void
  onDeleteSection?: (id: SectionId) => void
  unitSettings?: UnitSettings
}

export function MaterialFlyout({
  model,
  activeSection,
  onSectionChange,
  onSectionPropsChange,
  onAddSection,
  onDeleteSection,
  unitSettings,
}: MaterialFlyoutProps) {
  const u = unitSettings ?? DEFAULT_UNIT_SETTINGS
  const sections = model?.sections ?? {}
  const s = sections[activeSection]
  const sectionCount = Object.keys(sections).length

  const initialMode: Mode = s?.mode === "parametric" ? "parametric" : "manual"
  const [mode, setMode] = React.useState<Mode>(initialMode)

  const [name,       setName]       = React.useState<string>(s?.name ?? "")
  const [manual,     setManual]     = React.useState<ManualFields>(() =>
    s ? manualFieldsFromSection(s, u) : manualFieldsFromSection({ id: "", name: "", E: 200000, I33: 1, A: 1 }, u),
  )
  const [parametric, setParametric] = React.useState<ParametricFields>(() =>
    s?.mode === "parametric" ? parametricFieldsFromSection(s) : defaultParametricFields(),
  )

  // ── Adding mode (toolbar +) ──────────────────────────────────────────────────
  const [adding, setAdding] = React.useState<boolean>(false)

  // ── Delete inline confirm ────────────────────────────────────────────────────
  const [deleteArmed, setDeleteArmed] = React.useState<boolean>(false)
  React.useEffect(() => {
    if (!deleteArmed) return
    const t = setTimeout(() => setDeleteArmed(false), 3000)
    return () => clearTimeout(t)
  }, [deleteArmed])

  // ── Advanced deck (vertical pill + side panel) ───────────────────────────────
  const [deckOpen, setDeckOpen] = React.useState<boolean>(false)
  React.useEffect(() => {
    if (mode !== "parametric") setDeckOpen(false)
  }, [mode])

  // ── Saved snapshots — used to detect dirty state per mode ────────────────────
  const [savedName,       setSavedName]       = React.useState<string>(s?.name ?? "")
  const [savedManual,     setSavedManual]     = React.useState<ManualFields>(manual)
  const [savedParametric, setSavedParametric] = React.useState<ParametricFields>(parametric)

  // Reset form when active section changes or units change.
  // Also cancels any in-progress add (per spec: "cancel on exit, no warning").
  React.useEffect(() => {
    if (!s) return
    const newMode: Mode = s.mode === "parametric" ? "parametric" : "manual"
    setMode(newMode)
    setName(s.name)
    setSavedName(s.name)
    const mf = manualFieldsFromSection(s, u)
    setManual(mf); setSavedManual(mf)
    const pf = s.mode === "parametric" ? parametricFieldsFromSection(s) : defaultParametricFields()
    setParametric(pf); setSavedParametric(pf)
    setAdding(false)
    setDeleteArmed(false)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeSection, u.pressure, u.length, u.force])

  if (!s) return null

  // ── Validation ────────────────────────────────────────────────────────────────
  const manualV     = validateManual(manual)
  const parametricV = validateParametric(parametric)
  const isFormValid = mode === "manual" ? manualV.isValid : parametricV.isValid

  const nameEmpty = name.trim() === ""
  const nameTaken = Object.values(sections).some(
    (sec) => sec.name === name && (adding || sec.id !== activeSection),
  )

  // ── Dirty detection (only meaningful when NOT adding) ────────────────────────
  const isNameDirty   = name !== savedName
  const isManualDirty =
    manual.E !== savedManual.E || manual.I33 !== savedManual.I33 || manual.A !== savedManual.A ||
    manual.nu !== savedManual.nu || manual["Aκ2"] !== savedManual["Aκ2"] || manual.gamma !== savedManual.gamma
  const isParametricDirty =
    parametric.materialClass !== savedParametric.materialClass ||
    parametric.shape !== savedParametric.shape ||
    JSON.stringify(parametric.dims) !== JSON.stringify(savedParametric.dims) ||
    JSON.stringify(parametric.strength) !== JSON.stringify(savedParametric.strength)
  const isValuesDirty = mode === "manual" ? isManualDirty : isParametricDirty
  const isModeDirty   = mode !== (s.mode ?? "manual")
  const isDirty       = isNameDirty || isValuesDirty || isModeDirty

  // ── Button states ────────────────────────────────────────────────────────────
  const canModify = !adding && isDirty && !nameEmpty && !nameTaken && isFormValid
  const canSaveNew = adding && !nameEmpty && !nameTaken && isFormValid && sectionCount < MAX_SECTIONS
  const canDelete = !adding && sectionCount > 1

  // ── Build the patch the current mode produces ────────────────────────────────
  const buildPatch = (): Partial<Section> => {
    if (mode === "parametric") return computeSectionFromParametric(parametric)
    return { ...parseManualFields(manual, u), mode: "manual" }
  }

  // ── Handlers ──────────────────────────────────────────────────────────────────
  const handleStartAdd = () => {
    setAdding(true)
    setDeleteArmed(false)
    // Seed with sensible defaults: manual mode, empty name, mode defaults
    setMode("manual")
    setName("")
    setParametric(defaultParametricFields())
    setManual(manualFieldsFromSection({ id: "", name: "", E: 200000, I33: 1, A: 1 }, u))
  }

  const handleCancelAdd = () => {
    setAdding(false)
    // Restore from current active section
    if (s) {
      setName(s.name)
      const mf = manualFieldsFromSection(s, u)
      setManual(mf)
      const pf = s.mode === "parametric" ? parametricFieldsFromSection(s) : defaultParametricFields()
      setParametric(pf)
      setMode(s.mode === "parametric" ? "parametric" : "manual")
    }
  }

  const handleSaveNew = () => {
    if (!canSaveNew) return
    const id = newSectionId()
    const patch = buildPatch()
    const section: Section = {
      id,
      name: name.trim(),
      E:   patch.E   ?? 200000,
      I33: patch.I33 ?? 1,
      A:   patch.A   ?? 1,
      ...patch,
    }
    onAddSection?.(section)
    setAdding(false)
  }

  const handleModify = () => {
    if (!canModify) return
    const patch = buildPatch()
    if (mode === "manual") {
      patch.materialClass = undefined
      patch.shape         = undefined
      patch.strength      = undefined
      patch.derived       = undefined
      patch.overridden    = undefined
    }
    if (isNameDirty) patch.name = name.trim()
    onSectionPropsChange?.(activeSection, patch)
    setSavedName(name)
    setSavedManual(manual)
    setSavedParametric(parametric)
  }

  const handleDeleteClick = () => {
    if (!canDelete) return
    if (!deleteArmed) {
      setDeleteArmed(true)
      return
    }
    onDeleteSection?.(activeSection)
    setDeleteArmed(false)
  }

  // ── Advanced panel: parametric override workflow ─────────────────────────────
  const isParametric = mode === "parametric"
  const overrideDirty = !!s.overridden && isParametricDirty

  const handleRecompute = () => {
    const patch = computeSectionFromParametric(parametric)
    patch.overridden = false
    onSectionPropsChange?.(activeSection, patch)
    setSavedParametric(parametric)
  }
  const handleKeepOverride = () => setParametric(savedParametric)
  const handleCommitOverride = (patch: Partial<Section>) => {
    onSectionPropsChange?.(activeSection, patch)
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-3">
      {/* Toolbar: Add / Modify / Delete  OR  Save / Cancel (when adding) */}
      <Toolbar
        adding={adding}
        canModify={canModify}
        canDelete={canDelete}
        canSaveNew={canSaveNew}
        deleteArmed={deleteArmed}
        onStartAdd={handleStartAdd}
        onModify={handleModify}
        onDeleteClick={handleDeleteClick}
        onSaveNew={handleSaveNew}
        onCancelAdd={handleCancelAdd}
      />

      {/* Mode: interactive toggle while adding; locked badge when editing */}
      {adding ? (
        <div className="flex gap-1 rounded border p-0.5" style={{ borderColor: "#e5e7eb" }}>
          <ModeButton active={mode === "parametric"} onClick={() => setMode("parametric")}>Parametric</ModeButton>
          <ModeButton active={mode === "manual"}     onClick={() => setMode("manual")}>Manual</ModeButton>
        </div>
      ) : (
        <ModeBadge mode={mode} />
      )}

      {/* Section dropdown — disabled while adding */}
      <div className={cn(adding && "opacity-50 pointer-events-none")}>
        <SectionSelect value={activeSection} sections={sections} onChange={onSectionChange} />
      </div>

      {/* Name */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Name</Label>
        <Input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={cn(
            "h-7 text-xs flex-1",
            (nameEmpty || nameTaken) && "border-red-400 focus-visible:ring-red-300",
          )}
          placeholder="Section name"
        />
        {nameEmpty && <p className="text-[10px] text-red-500">Name is required</p>}
        {nameTaken && <p className="text-[10px] text-red-500">Name already exists</p>}
      </div>

      {/* Active form */}
      {mode === "parametric" ? (
        <ParametricForm fields={parametric} onChange={setParametric} validation={parametricV} />
      ) : (
        <ManualForm fields={manual} onChange={setManual} validation={manualV} u={u} />
      )}

      {/* Vertical "ADVANCED" pill + sibling deck — parametric only */}
      {isParametric && (
        <>
          <AdvancedPill
            open={deckOpen}
            onToggle={() => setDeckOpen((v) => !v)}
          />
          <AdvancedDeck
            open={deckOpen}
            onClose={() => setDeckOpen(false)}
            section={s}
            u={u}
            canOverride={true}
            onCommitOverride={handleCommitOverride}
            overrideDirty={overrideDirty}
            onRecompute={handleRecompute}
            onKeepOverride={handleKeepOverride}
          />
        </>
      )}

      {sectionCount >= MAX_SECTIONS && (
        <p className="text-[10px] text-gray-400 text-center">
          Max {MAX_SECTIONS} materials reached
        </p>
      )}
    </div>
  )
}

// ── Toolbar ────────────────────────────────────────────────────────────────────
function Toolbar({
  adding, canModify, canDelete, canSaveNew, deleteArmed,
  onStartAdd, onModify, onDeleteClick, onSaveNew, onCancelAdd,
}: {
  adding: boolean
  canModify: boolean
  canDelete: boolean
  canSaveNew: boolean
  deleteArmed: boolean
  onStartAdd: () => void
  onModify: () => void
  onDeleteClick: () => void
  onSaveNew: () => void
  onCancelAdd: () => void
}) {
  if (adding) {
    return (
      <div className="flex gap-1.5">
        <ToolbarButton
          icon={<Check size={14} />}
          label="Save"
          tone={canSaveNew ? "primary" : "muted"}
          disabled={!canSaveNew}
          onClick={onSaveNew}
        />
        <ToolbarButton
          icon={<X size={14} />}
          label="Cancel"
          tone="neutral"
          onClick={onCancelAdd}
        />
      </div>
    )
  }
  return (
    <div className="flex gap-1.5">
      <ToolbarButton
        icon={<Plus size={14} />}
        label="Add new material"
        tone="neutral"
        onClick={onStartAdd}
      />
      <ToolbarButton
        icon={<Pencil size={14} />}
        label="Save changes"
        tone={canModify ? "primary" : "muted"}
        disabled={!canModify}
        onClick={onModify}
      />
      <ToolbarButton
        icon={<Trash2 size={14} />}
        label={deleteArmed ? "Click again to confirm delete" : "Delete material"}
        tone={deleteArmed ? "danger" : (canDelete ? "neutral" : "muted")}
        disabled={!canDelete}
        onClick={onDeleteClick}
      />
    </div>
  )
}

function ToolbarButton({
  icon, label, tone, disabled, onClick,
}: {
  icon: React.ReactNode
  label: string
  tone: "primary" | "neutral" | "muted" | "danger"
  disabled?: boolean
  onClick?: () => void
}) {
  const styles: Record<typeof tone, string> = {
    primary: "border-[#2563eb] text-[#2563eb] hover:bg-[#2563eb]/10",
    neutral: "border-gray-200 text-gray-600 hover:border-[#1a2f5e] hover:text-[#1a2f5e]",
    muted:   "border-gray-200 text-gray-300 cursor-not-allowed",
    danger:  "border-red-400 text-red-500 bg-red-50 hover:bg-red-100",
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={cn(
        "flex-1 h-8 rounded border bg-white flex items-center justify-center transition-colors",
        styles[tone],
      )}
    >
      {icon}
    </button>
  )
}

// ── Mode badge (read-only display when editing an existing section) ───────────
function ModeBadge({ mode }: { mode: Mode }) {
  const label = mode === "parametric" ? "Parametric" : "Manual"
  return (
    <div
      className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded"
      style={{ backgroundColor: "#1a2f5e", color: "white" }}
    >
      <span className="w-1.5 h-1.5 rounded-full bg-white/70" />
      {label}
    </div>
  )
}

// ── Mode toggle ────────────────────────────────────────────────────────────────
function ModeButton({
  active, children, onClick,
}: {
  active: boolean
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex-1 h-6 text-[11px] rounded transition-colors",
        active ? "bg-[#1a2f5e] text-white" : "text-gray-600 hover:bg-gray-100",
      )}
    >
      {children}
    </button>
  )
}

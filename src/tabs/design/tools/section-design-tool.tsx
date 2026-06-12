import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { SectionId, StructureModel } from "@/lib/model"
import { REBAR_SIZES, STIRRUP_SIZES, barDia, type RebarSize } from "@/lib/design/rebar"
import {
  AGG_SIZE_MM,
  checkArrangement,
  checkTransverse,
  maxBarsTwoLayers,
  maxSideBars,
  type ArrangementCheck,
  type TransverseChecks,
} from "@/lib/design/bar-layout"
import {
  defaultSectionDesignInput,
  isSectionDesignable,
  type BarLayer,
  type DesignCriteria,
  type DesignMode,
  type RebarArrangement,
  type SectionDesignInput,
  type SectionDesignInputs,
} from "@/lib/design/types"
import { RcSectionPreview } from "./rc-section-preview"
import { AdvancedPill } from "@/tabs/model/tools/material/advanced-pill"
import { AdvancedReportDeck } from "./advanced-report"

type ZoneKey = "support" | "midspan"

interface SectionDesignToolProps {
  model?: StructureModel
  selectedSectionId: SectionId | null
  onSelectSection: (id: SectionId) => void
  inputs: SectionDesignInputs
  onPatchInput: (id: SectionId, patch: Partial<SectionDesignInput>) => void
  criteria: DesignCriteria
}

/**
 * SECTION DESIGN — per-RC-section reinforcement input with a live cross-section
 * preview. Rebar is defined per section with two arrangements (Support zone =
 * member ends over 2h, Midspan = in between), book Tabel 5-7 style.
 */
export function SectionDesignToolContent({
  model,
  selectedSectionId,
  onSelectSection,
  inputs,
  onPatchInput,
  criteria,
}: SectionDesignToolProps) {
  const sections = model?.sections ?? {}
  const designableIds = Object.keys(sections).filter((id) => isSectionDesignable(sections[id]))

  // Auto-select the first designable section when nothing valid is selected.
  React.useEffect(() => {
    if ((!selectedSectionId || !sections[selectedSectionId]) && designableIds.length > 0) {
      onSelectSection(designableIds[0])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedSectionId, designableIds.join(",")])

  const [zone, setZone] = React.useState<ZoneKey>("support")
  const [advancedOpen, setAdvancedOpen] = React.useState(false)

  // Close the Advanced Report when leaving checked mode or losing the section.
  const inputMode = selectedSectionId ? inputs[selectedSectionId]?.mode ?? "required" : null
  React.useEffect(() => {
    if (inputMode !== "checked") setAdvancedOpen(false)
  }, [inputMode, selectedSectionId])

  const sec = selectedSectionId ? sections[selectedSectionId] : undefined
  const designable = isSectionDesignable(sec)
  const input: SectionDesignInput | null = selectedSectionId
    ? inputs[selectedSectionId] ?? defaultSectionDesignInput(selectedSectionId)
    : null

  const patch = (p: Partial<SectionDesignInput>) => {
    if (selectedSectionId) onPatchInput(selectedSectionId, p)
  }
  const patchArrangement = (key: ZoneKey, p: Partial<RebarArrangement>) => {
    if (!input) return
    patch({ [key]: { ...input[key], ...p } } as Partial<SectionDesignInput>)
  }

  const b = sec?.shape?.dims.b ?? 0
  const h = sec?.shape?.dims.h ?? 0

  return (
    <div className="space-y-3">
      {/* Material class — Reinforced Concrete only for now (steel later) */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Material Class</Label>
        <Select value="rc" onValueChange={() => {}}>
          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="rc">Reinforced Concrete</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Section picker — non-RC/rect sections are listed but disabled */}
      <div className="space-y-1.5">
        <Label className="text-xs text-gray-600">Section</Label>
        <Select
          value={selectedSectionId ?? ""}
          onValueChange={(v) => onSelectSection(v as SectionId)}
        >
          <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select section…" /></SelectTrigger>
          <SelectContent>
            {Object.values(sections).map((s) => {
              const ok = isSectionDesignable(s)
              return (
                <SelectItem key={s.id} value={s.id} disabled={!ok}>
                  {s.name}{ok ? "" : " — N.A."}
                </SelectItem>
              )
            })}
          </SelectContent>
        </Select>
        {designableIds.length === 0 && (
          <p className="text-[10px] text-amber-600 leading-snug">
            No designable sections. RC beam design requires a concrete rectangular
            section (Model tab → MATERIAL).
          </p>
        )}
      </div>

      {designable && input && sec && (
        <>
          {/* Design mode */}
          <div className="space-y-1.5 pt-2 border-t border-gray-200">
            <Label className="text-xs text-gray-600">Design Mode</Label>
            <div className="grid grid-cols-2 gap-1">
              <ModeButton
                active={input.mode === "required"}
                onClick={() => patch({ mode: "required" as DesignMode })}
                title="Program computes the required steel areas"
              >
                As required
              </ModeButton>
              <ModeButton
                active={input.mode === "checked"}
                onClick={() => patch({ mode: "checked" as DesignMode })}
                title="Check the capacity of bars you define"
              >
                As checked
              </ModeButton>
            </div>
          </div>

          {input.mode === "required" ? (
            <>
              {/* As-required: cover to rebar centroid → fixed d′ */}
              <CoverInput
                label="Cover to rebar centroid"
                min={1}
                value={input.dPrime}
                onCommit={(v) => patch({ dPrime: v })}
              />
              <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-0.5">
                <p className="text-[10px] text-gray-600 font-mono">
                  d = h − d′ = {h} − {input.dPrime} = {(h - input.dPrime).toFixed(1)} mm
                </p>
                <p className="text-[10px] text-gray-500 leading-snug">
                  Run Design Check to get required As (top/bottom) and stirrup Av/s per zone.
                </p>
              </div>
            </>
          ) : (
            <>
              {/* As-checked: cover + per-zone arrangements */}
              <CoverInput value={input.cover} onCommit={(v) => patch({ cover: v })} />

              <div className="space-y-1.5">
                <Label className="text-xs text-gray-600">Reinforcement Zone</Label>
                <div className="grid grid-cols-2 gap-1">
                  <ModeButton active={zone === "support"} onClick={() => setZone("support")} title="End zones (2h from each member end)">
                    Support
                  </ModeButton>
                  <ModeButton active={zone === "midspan"} onClick={() => setZone("midspan")} title="Between the end zones">
                    Midspan
                  </ModeButton>
                </div>
              </div>

              <ArrangementEditor
                arrangement={input[zone]}
                b={b}
                h={h}
                cover={input.cover}
                onPatch={(p) => patchArrangement(zone, p)}
              />

              <RcSectionPreview b={b} h={h} cover={input.cover} arrangement={input[zone]} />

              <DetailingChecksCard
                longitudinal={checkArrangement(b, h, input.cover, input[zone], {
                  fy: criteria.fy,
                  frameType: criteria.frameType,
                })}
                transverse={checkTransverse(b, h, input.cover, input[zone], zone, {
                  frameType: criteria.frameType,
                  fyt: criteria.fyt,
                  fc: sec.strength?.fc ?? 0,
                  legs: criteria.stirrupLegs,
                })}
              />

              {/* Advanced Capacity Report — pill + portal deck (checked mode only) */}
              <AdvancedPill open={advancedOpen} onToggle={() => setAdvancedOpen((v) => !v)} />
              <AdvancedReportDeck
                open={advancedOpen}
                b={b}
                h={h}
                cover={input.cover}
                arrangement={input[zone]}
                zone={zone}
                fc={sec.strength?.fc ?? 0}
                criteria={criteria}
              />
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── Sub-components ───────────────────────────────────────────────────────────

const CHECK_GLYPH: Record<ArrangementCheck["status"], { glyph: string; cls: string }> = {
  pass: { glyph: "✓", cls: "text-green-600" },
  warn: { glyph: "⚠", cls: "text-amber-500" },
  fail: { glyph: "✗", cls: "text-red-500" },
}

/**
 * ACI 318-14 reinforcement detailing checks (longitudinal + transverse) in one
 * card — live, no Run needed. Assumption/clarification notes are greyed at the
 * bottom, below the stirrup rows.
 */
function DetailingChecksCard({
  longitudinal,
  transverse,
}: {
  longitudinal: ArrangementCheck[]
  transverse: TransverseChecks
}) {
  const notes = [`Aggregate size assumed ${AGG_SIZE_MM} mm.`, ...transverse.notes]
  const row = (c: ArrangementCheck, key: string) => {
    const g = CHECK_GLYPH[c.status]
    return (
      <div key={key} className="flex items-start gap-1.5">
        <span className={cn("text-[10px] leading-snug shrink-0 w-3 text-center", g.cls)}>
          {g.glyph}
        </span>
        <p className="text-[10px] text-gray-600 leading-snug flex-1">
          {c.text}{" "}
          <span className="text-gray-400 whitespace-nowrap">({c.clause})</span>
        </p>
      </div>
    )
  }
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e] leading-snug">
        Reinforcement Detailing Checks
      </p>
      {longitudinal.map((c, i) => row(c, `l${i}`))}
      <div className="border-t border-gray-200 my-1" />
      {transverse.checks.map((c, i) => row(c, `t${i}`))}
      {notes.map((n, i) => (
        <p key={i} className="text-[10px] text-gray-400 leading-snug pt-0.5">
          {n}
        </p>
      ))}
    </div>
  )
}

function ModeButton({
  active, onClick, title, children,
}: {
  active: boolean
  onClick: () => void
  title?: string
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "h-7 rounded text-xs font-medium transition-colors",
        active
          ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
          : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
      )}
    >
      {children}
    </button>
  )
}

function CoverInput({
  value,
  onCommit,
  label = "Clear cover",
  min = 10,
}: {
  value: number
  onCommit: (v: number) => void
  label?: string
  min?: number
}) {
  const [text, setText] = React.useState(String(value))
  React.useEffect(() => setText(String(value)), [value])
  const commit = () => {
    const n = Math.round(parseFloat(text))
    if (!Number.isFinite(n) || n < min) {
      setText(String(value))
      return
    }
    setText(String(n))
    if (n !== value) onCommit(n)
  }
  return (
    <div className="flex items-center gap-2">
      <Label className="text-xs text-gray-600 flex-1">{label}</Label>
      <Input
        type="number"
        step={1}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-7 text-xs font-mono w-16"
      />
      <span className="text-xs text-gray-500 w-8 shrink-0">mm</span>
    </div>
  )
}

function ArrangementEditor({
  arrangement, b, h, cover, onPatch,
}: {
  arrangement: RebarArrangement
  b: number
  h: number
  cover: number
  onPatch: (p: Partial<RebarArrangement>) => void
}) {
  const dbS = barDia(arrangement.stirrup.size)
  const maxTop = maxBarsTwoLayers(b, cover, dbS, barDia(arrangement.top.size))
  const maxBot = maxBarsTwoLayers(b, cover, dbS, barDia(arrangement.bottom.size))
  const maxSide = maxSideBars(b, h, cover, arrangement)
  return (
    <div className="space-y-1.5">
      <BarLayerRow label="Top bars" layer={arrangement.top} max={maxTop} onChange={(l) => onPatch({ top: l })} />
      <BarLayerRow label="Bottom bars" layer={arrangement.bottom} max={maxBot} onChange={(l) => onPatch({ bottom: l })} />
      <BarLayerRow label="Side bars" layer={arrangement.side} allowZero max={maxSide} onChange={(l) => onPatch({ side: l })} />
      <StirrupRow
        stirrup={arrangement.stirrup}
        onChange={(s) => onPatch({ stirrup: s })}
      />
    </div>
  )
}

function BarLayerRow({
  label, layer, allowZero, max, onChange,
}: {
  label: string
  layer: BarLayer
  allowZero?: boolean
  /** Max count that fits the spacing limits (top/bottom: 2 layers; side: pitch). */
  max: number
  onChange: (l: BarLayer) => void
}) {
  const [countText, setCountText] = React.useState(String(layer.count))
  React.useEffect(() => setCountText(String(layer.count)), [layer.count])
  const min = allowZero ? 0 : 1
  const cap = Math.max(min, max) // never below the floor
  // Live commit: update the parent (and the preview sketch) on every valid edit,
  // including stepper clicks. Counts beyond the spacing-limited cap are rejected
  // so the user can't enter an arrangement whose bars violate clear spacing.
  const handleChange = (raw: string) => {
    setCountText(raw)
    const n = Math.round(parseFloat(raw))
    if (Number.isFinite(n) && n >= min && n <= cap && n !== layer.count) {
      onChange({ ...layer, count: n })
    }
  }
  const commitCount = () => {
    const n = Math.round(parseFloat(countText))
    if (!Number.isFinite(n) || n < min) {
      setCountText(String(layer.count))
      return
    }
    const clamped = Math.min(cap, n)
    setCountText(String(clamped))
    if (clamped !== layer.count) onChange({ ...layer, count: clamped })
  }
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs text-gray-600 flex-1">{label}</Label>
      <Input
        type="number"
        value={countText}
        onChange={(e) => handleChange(e.target.value)}
        onBlur={commitCount}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        title={`Max ${cap} bars (clear-spacing limit)`}
        className="h-7 text-xs font-mono w-16 text-center"
      />
      <span className="text-xs text-gray-400">×</span>
      <Select value={layer.size} onValueChange={(v) => onChange({ ...layer, size: v as RebarSize })}>
        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
        <SelectContent>
          {REBAR_SIZES.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function StirrupRow({
  stirrup, onChange,
}: {
  stirrup: RebarArrangement["stirrup"]
  onChange: (s: RebarArrangement["stirrup"]) => void
}) {
  const [spacingText, setSpacingText] = React.useState(String(stirrup.spacing))
  React.useEffect(() => setSpacingText(String(stirrup.spacing)), [stirrup.spacing])
  const commitSpacing = () => {
    const n = Math.round(parseFloat(spacingText))
    if (!Number.isFinite(n) || n < 25) {
      setSpacingText(String(stirrup.spacing))
      return
    }
    setSpacingText(String(n))
    if (n !== stirrup.spacing) onChange({ ...stirrup, spacing: n })
  }
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs text-gray-600 flex-1">Stirrup</Label>
      <Select value={stirrup.size} onValueChange={(v) => onChange({ ...stirrup, size: v as RebarSize })}>
        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
        <SelectContent>
          {STIRRUP_SIZES.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-gray-400">@</span>
      <Input
        type="number"
        value={spacingText}
        onChange={(e) => setSpacingText(e.target.value)}
        onBlur={commitSpacing}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-7 text-xs font-mono w-20 text-center"
      />
    </div>
  )
}

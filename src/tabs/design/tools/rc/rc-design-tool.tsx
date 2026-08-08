import * as React from "react"
import { cn } from "@/lib/utils"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import type { SectionId, StructureModel } from "@/lib/model"
import { REBAR_SIZES, STIRRUP_SIZES, barDia, type RebarSize } from "@/lib/design/rc/shared/rebar"
import {
  AGG_SIZE_MM,
  buildBarLayout,
  maxBarsTwoLayers,
  maxSideBars,
} from "@/lib/design/rc/shared/bar-geometry"
import type { ArrangementCheck, TransverseChecks } from "@/lib/design/rc/shared/types"
import { getRcCode } from "@/lib/design/rc/codes"
import { type DesignMode, type ElementType } from "@/lib/design/core/types"
import type { DesignRunResult, MemberDesignResult, ZoneId } from "@/lib/design/core/types"
import { isSectionDesignable, materialOf } from "@/lib/design/core/designability"
import type { DesignCriteria } from "@/lib/design/core/criteria"
import { asRcInput, type SectionDesignInputs } from "@/lib/design/core/section-input"
import type {
  BarLayer,
  ColumnArrangement,
  RectColumnArrangement,
  CircleColumnArrangement,
  RcSectionInput,
  RebarArrangement,
} from "@/lib/design/rc/types"
import { isCircle } from "@/lib/design/rc/types"
import { designColorForDC } from "@/lib/constants"
import type { ColumnGeom } from "@/lib/design/rc/shared/types"
import { RcSectionPreview } from "./beam/preview"
import { RcColumnPreview } from "./column/preview"
import { AdvancedPill } from "@/tabs/model/tools/material/advanced-pill"
import { AdvancedReportDeck } from "./beam/report"
import { ColumnAdvancedReportDeck } from "./column/report"
import {
  VerdictGroup, VerdictDC, VerdictStatus, VerdictTally, VerdictText,
} from "../shared/verdict-group"

type ZoneKey = "support" | "midspan"

interface SectionDesignToolProps {
  model?: StructureModel
  selectedSectionId: SectionId | null
  onSelectSection: (id: SectionId) => void
  inputs: SectionDesignInputs
  onPatchInput: (id: SectionId, patch: Partial<RcSectionInput>) => void
  criteria: DesignCriteria
  /** Latest design run — feeds the column report's demand markers and the
   *  Results group's verdict. Recomputed automatically; never stale. */
  designResult?: DesignRunResult | null
}

/**
 * RC SECTION — per-RC-section reinforcement input with a live cross-section
 * preview, step 2 of the RC design tool. Rebar is defined per section with two
 * arrangements (Support zone = member ends over 2h, Midspan = in between), book
 * Tabel 5-7 style.
 *
 * The body is grouped into collapsible cards whose headers carry their own
 * verdict — see `../shared/verdict-group.tsx` for why. Inputs stay in the
 * Reinforcement group, which is the one open by default; everything else is
 * evidence, readable from its header without expanding.
 */
export function SectionDesignToolContent({
  model,
  selectedSectionId,
  onSelectSection,
  inputs,
  onPatchInput,
  criteria,
  designResult,
}: SectionDesignToolProps) {
  const sections = model?.sections ?? {}
  const rc = criteria.rc
  const code = getRcCode(rc.code)
  // RC tool: only concrete sections are designable here (steel → Steel tool).
  const designableIds = Object.keys(sections).filter(
    (id) => isSectionDesignable(sections[id]) && materialOf(sections[id]) === "rc",
  )

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
  const inputMode = selectedSectionId
    ? asRcInput(inputs[selectedSectionId], selectedSectionId).mode
    : null
  React.useEffect(() => {
    if (inputMode !== "checked") setAdvancedOpen(false)
  }, [inputMode, selectedSectionId])

  const sec = selectedSectionId ? sections[selectedSectionId] : undefined
  const designable = isSectionDesignable(sec)
  const input: RcSectionInput | null = selectedSectionId
    ? asRcInput(inputs[selectedSectionId], selectedSectionId)
    : null

  const patch = (p: Partial<RcSectionInput>) => {
    if (selectedSectionId) onPatchInput(selectedSectionId, p)
  }
  const patchArrangement = (key: ZoneKey, p: Partial<RebarArrangement>) => {
    if (!input) return
    patch({ [key]: { ...input[key], ...p } } as Partial<RcSectionInput>)
  }
  const patchColumnChecked = (p: Partial<ColumnArrangement>) => {
    if (!input) return
    patch({ column: { ...input.column, checked: { ...colArr, ...p } as ColumnArrangement } })
  }
  const patchColumnReq = (p: Partial<RcSectionInput["column"]["required"]>) => {
    if (!input) return
    patch({ column: { ...input.column, required: { ...input.column.required, ...p } } })
  }

  const circle = sec?.shape?.kind === "circle"
  const D = sec?.shape?.dims.d ?? 0
  // For circular sections the preview/report take the diameter in both b & h.
  const b = circle ? D : (sec?.shape?.dims.b ?? 0)
  const h = circle ? D : (sec?.shape?.dims.h ?? 0)
  const colGeom: ColumnGeom = circle ? { kind: "circle", D } : { kind: "rect", b, h }

  // The stored checked arrangement, normalized to the section's shape so the
  // editor/preview/checks always agree with the geometry (a rect arrangement on
  // a circular section is coerced to a ring, and vice-versa).
  const rawChecked = input?.column.checked
  const colArr: ColumnArrangement | null = !rawChecked
    ? null
    : circle
      ? isCircle(rawChecked)
        ? rawChecked
        : { shape: "circle", n: 8, size: rawChecked.size, confinement: "spiral", tie: rawChecked.tie }
      : isCircle(rawChecked)
        ? { shape: "rect", nx: 3, ny: 3, size: rawChecked.size, confinement: "tied", tie: rawChecked.tie }
        : rawChecked

  // The user explicitly picks beam vs column. Legacy "auto" inputs fall back to beam.
  const effectiveType: "beam" | "column" =
    input?.elementType === "column" ? "column" : "beam"

  // SMF beam dimensional limits (18.6.2.1), live. Lₙ = the SHORTEST node-to-node
  // span among members using this section (governs 4d); [] for OMF/IMF or when no
  // member references the section. d = bottom effective depth (checked) or h−d′.
  const beamDimChecks = React.useMemo<ArrangementCheck[]>(() => {
    if (!model || !sec || effectiveType !== "beam" || !input) return []
    const lens = Object.values(model.members)
      .filter((m) => m.section === selectedSectionId)
      .map((m) => {
        const na = model.nodes[m.a]
        const nb = model.nodes[m.b]
        return na && nb ? Math.hypot(nb.x - na.x, nb.y - na.y) * 1000 : Infinity
      })
      .filter((v) => Number.isFinite(v))
    if (lens.length === 0) return []
    const dEff =
      input.mode === "checked"
        ? buildBarLayout(b, h, input.cover, input.support).bottom.centroid
        : h - input.dPrime
    return code.checkBeamDimensions(b, h, dEff, Math.min(...lens), rc.frameType)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model, sec, effectiveType, input, b, h, selectedSectionId, rc.frameType, rc.code])

  // Demand (P,M) markers + governing for the column advanced report: gather every
  // column member that uses this section from the last run.
  const colDemand = React.useMemo(() => {
    const pairs: { P: number; M: number }[] = []
    let governing: { P: number; M: number; dc: number } | undefined
    let result: import("@/lib/design/core/types").ColumnDesignResult | undefined
    let govId: string | undefined
    if (!designResult || !selectedSectionId || !model) return { pairs, governing, result, joint: undefined }
    for (const m of Object.values(model.members)) {
      if (m.section !== selectedSectionId) continue
      const r = designResult.members[m.id]
      if (r?.kind !== "column" || !r.column) continue
      if (r.column.pmPairs) for (const p of r.column.pmPairs) pairs.push({ P: p.P, M: p.M })
      const g = r.column.governing
      if (g && (!governing || r.column.worstDC > governing.dc)) {
        governing = { P: g.Pu, M: g.Mu, dc: r.column.worstDC }
        result = r.column
        govId = m.id
      }
    }
    // A joint the governing column frames into (prefer a failing one for the sketch).
    const joints = designResult.joints?.filter((j) => govId !== undefined && j.columnIds.includes(govId)) ?? []
    const joint = joints.find((j) => !j.pass) ?? joints[0]
    return { pairs, governing, result, joint }
  }, [designResult, selectedSectionId, model])

  // Worst designed member using this section — drives the Results group's
  // header verdict and the per-zone beam card. Design now runs automatically,
  // so this is always current with the inputs above it.
  const govMember = React.useMemo(() => {
    if (!designResult || !selectedSectionId || !model) return null
    let worst: MemberDesignResult | null = null
    for (const m of Object.values(model.members)) {
      if (m.section !== selectedSectionId) continue
      const r = designResult.members[m.id]
      if (!r || r.status !== "designed") continue
      if (!worst || (r.worstFlexureDC ?? 0) > (worst.worstFlexureDC ?? 0)) worst = r
    }
    return worst
  }, [designResult, selectedSectionId, model])

  // Detailing checks are computed here rather than inline in the JSX, so the
  // group header can tally them without the body being expanded.
  const beamLongChecks = designable && input && sec && effectiveType === "beam" && input.mode === "checked"
    ? code.checkArrangement(b, h, input.cover, input[zone], { fy: rc.fy, frameType: rc.frameType })
    : []
  const beamTransverse = designable && input && sec && effectiveType === "beam" && input.mode === "checked"
    ? code.checkTransverse(b, h, input.cover, input[zone], zone, {
        frameType: rc.frameType,
        fyt: rc.fyt,
        fc: sec.strength?.fc ?? 0,
        legs: rc.stirrupLegs,
      })
    : null
  const colChecks = designable && input && sec && effectiveType === "column" && input.mode === "checked" && colArr
    ? code.checkColumnArrangement(colGeom, input.cover, colArr, { frameType: rc.frameType })
    : []

  const allChecks: ArrangementCheck[] = [
    ...beamLongChecks,
    ...(beamTransverse?.checks ?? []),
    ...colChecks,
    ...beamDimChecks,
    ...(colDemand.result?.confinement ?? []),
  ]

  const showAdvanced = input?.mode === "checked"

  return (
    <div className="space-y-2">
      {/* ── Step A: what is being designed ─────────────────────────────────── */}
      <VerdictGroup
        title="Section & Type"
        defaultOpen={!designable || !selectedSectionId}
        verdict={
          <VerdictText>
            {sec?.name ?? "none"}
            {designable && input && ` · ${effectiveType === "column" ? "Column" : "Beam"}`}
          </VerdictText>
        }
      >
        {/* Section picker — only RC-designable sections are listed */}
        <div className="space-y-1.5">
          <Label className="text-xs text-gray-600">Section</Label>
          <Select
            value={selectedSectionId ?? ""}
            onValueChange={(v) => onSelectSection(v as SectionId)}
          >
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Select section…" /></SelectTrigger>
            <SelectContent>
              {designableIds.map((id) => (
                <SelectItem key={id} value={id}>{sections[id].name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {designableIds.length === 0 && (
            <p className="text-[10px] text-amber-600 leading-snug">
              No designable sections. RC beam design requires a concrete rectangular
              section (Model tab → MATERIAL).
            </p>
          )}
        </div>

        {/* Element type — user picks beam vs column */}
        {designable && input && (
          <div className="space-y-1.5">
            <Label className="text-xs text-gray-600">Element Type</Label>
            <div className="grid grid-cols-2 gap-1">
              <ModeButton
                active={effectiveType === "beam"}
                onClick={() => patch({ elementType: "beam" as ElementType })}
                title="Design this section as a flexural beam"
              >
                Beam
              </ModeButton>
              <ModeButton
                active={effectiveType === "column"}
                onClick={() => patch({ elementType: "column" as ElementType })}
                title="Design this section as an axial-flexure column"
              >
                Column
              </ModeButton>
            </div>
          </div>
        )}

        {/* Design mode */}
        {designable && input && sec && (
          <div className="space-y-1.5">
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
        )}
      </VerdictGroup>

      {designable && input && sec && (
        <>
          {/* ── Step B: the reinforcement itself ───────────────────────────── */}
          <VerdictGroup
            title="Reinforcement"
            defaultOpen
            verdict={
              <VerdictText>
                {arrangementSummary(input, effectiveType, zone, colArr)}
              </VerdictText>
            }
          >
            {effectiveType === "beam" ? (
              input.mode === "required" ? (
                <>
                  {/* As-required: cover to rebar centroid → fixed d′ */}
                  <CoverInput
                    label="Cover to rebar centroid"
                    min={1}
                    value={input.dPrime}
                    onCommit={(v) => patch({ dPrime: v })}
                  />
                  <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5">
                    <p className="text-[10px] text-gray-600 font-mono">
                      d = h − d′ = {h} − {input.dPrime} = {(h - input.dPrime).toFixed(1)} mm
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
                </>
              )
            ) : input.mode === "required" ? (
              <>
                {/* Column As-required: cover + representative-ring bar/tie sizes */}
                <CoverInput value={input.cover} onCommit={(v) => patch({ cover: v })} />
                <SizeSelectRow
                  label="Bar size"
                  value={input.column.required.barSize}
                  options={REBAR_SIZES}
                  onChange={(s) => patchColumnReq({ barSize: s })}
                />
                <SizeSelectRow
                  label="Tie size"
                  value={input.column.required.tieSize}
                  options={STIRRUP_SIZES}
                  onChange={(s) => patchColumnReq({ tieSize: s })}
                />
                <p className="text-[10px] text-gray-500 leading-snug">
                  ρg (1–8%) and Aₛₜ are sized on a symmetric perimeter ring for the
                  worst (P, M) — see Results.
                </p>
              </>
            ) : (
              <>
                {/* Column As-checked: bar grid/ring + preview */}
                <CoverInput value={input.cover} onCommit={(v) => patch({ cover: v })} />
                {colArr && isCircle(colArr) ? (
                  <ColumnRingEditor arr={colArr} onPatch={patchColumnChecked} />
                ) : (
                  colArr && <ColumnGridEditor arr={colArr} onPatch={patchColumnChecked} />
                )}
                {colArr && (
                  <RcColumnPreview b={b} h={h} cover={input.cover} arrangement={colArr} />
                )}
              </>
            )}
          </VerdictGroup>

          {/* ── Step C: detailing verdicts ─────────────────────────────────── */}
          {allChecks.length > 0 && (
            <VerdictGroup title="Checks" verdict={<VerdictTally checks={allChecks} />}>
              {beamTransverse && (
                <DetailingChecksCard
                  longitudinal={beamLongChecks}
                  transverse={beamTransverse}
                />
              )}
              {colChecks.length > 0 && <ColumnDetailingCard checks={colChecks} />}
              {beamDimChecks.length > 0 && <DimensionChecksCard checks={beamDimChecks} />}
            </VerdictGroup>
          )}

          {/* ── Step D: what the run produced ──────────────────────────────── */}
          {/* In "as required" mode the engine's dc is a flag, not a ratio (0 when
              the section can carry the demand, Infinity when it cannot), so the
              header states adequacy instead of printing a meaningless 0.00. */}
          <VerdictGroup
            title="Results"
            verdict={
              !govMember ? (
                <VerdictText>—</VerdictText>
              ) : input.mode === "required" ? (
                <VerdictStatus
                  ok={Number.isFinite(govMember.worstFlexureDC ?? Infinity)}
                  okText="adequate"
                  failText="enlarge section"
                />
              ) : (
                <VerdictDC dc={govMember.worstFlexureDC} />
              )
            }
          >
            {govMember ? (
              <>
                <p className="text-[10px] text-gray-500">
                  Governing member —{" "}
                  <span className="font-mono text-gray-700">{govMember.memberId}</span>
                </p>
                {effectiveType === "column" && colDemand.result ? (
                  <ColumnRequiredResultsCard result={colDemand.result} joint={colDemand.joint} />
                ) : (
                  govMember.zones && <BeamZoneResultsCard member={govMember} />
                )}
              </>
            ) : (
              <p className="text-[10px] text-gray-400 leading-snug">
                No result for this section yet — it is not used by any member, or
                no load combination produced demands. Design runs automatically.
              </p>
            )}
          </VerdictGroup>

          {/* Advanced Capacity Report — pill + portal deck (checked mode only) */}
          {showAdvanced && (
            <AdvancedPill open={advancedOpen} onToggle={() => setAdvancedOpen((v) => !v)} />
          )}
          {showAdvanced && effectiveType === "beam" && (
            <AdvancedReportDeck
              open={advancedOpen}
              b={b}
              h={h}
              cover={input.cover}
              arrangement={input[zone]}
              zone={zone}
              fc={sec.strength?.fc ?? 0}
              criteria={rc}
            />
          )}
          {showAdvanced && effectiveType === "column" && colArr && (
            <ColumnAdvancedReportDeck
              open={advancedOpen}
              b={b}
              h={h}
              cover={input.cover}
              arrangement={colArr}
              fc={sec.strength?.fc ?? 0}
              criteria={rc}
              demandPairs={colDemand.pairs}
              governing={colDemand.governing}
              result={colDemand.result}
              joint={colDemand.joint}
            />
          )}
        </>
      )}
    </div>
  )
}

/** One-line description of the current arrangement, for the group header. */
function arrangementSummary(
  input: RcSectionInput,
  type: "beam" | "column",
  zone: ZoneKey,
  colArr: ColumnArrangement | null,
): string {
  if (input.mode === "required") return "as required"
  if (type === "column") {
    if (!colArr) return "—"
    return isCircle(colArr)
      ? `${colArr.n}${colArr.size}`
      : `${2 * colArr.nx + 2 * colArr.ny - 4}${colArr.size}`
  }
  const a = input[zone]
  return `${a.top.count}${a.top.size} / ${a.bottom.count}${a.bottom.size}`
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

/** SMF beam dimensional-limit checks (18.6.2.1), shown only for SMF beams that
 *  are placed on at least one member. Lₙ is the shortest span using the section. */
function DimensionChecksCard({ checks }: { checks: ArrangementCheck[] }) {
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e] leading-snug">
        SMF Dimensional Limits
      </p>
      {checks.map((c, i) => {
        const g = CHECK_GLYPH[c.status]
        return (
          <div key={i} className="flex items-start gap-1.5">
            <span className={cn("text-[10px] leading-snug shrink-0 w-3 text-center", g.cls)}>
              {g.glyph}
            </span>
            <p className="text-[10px] text-gray-600 leading-snug flex-1">
              {c.text} <span className="text-gray-400 whitespace-nowrap">({c.clause})</span>
            </p>
          </div>
        )
      })}
      <p className="text-[10px] text-gray-400 leading-snug pt-0.5">
        Lₙ = shortest node-to-node span using this section (no column-face offset).
      </p>
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

// ── Column sub-components ──────────────────────────────────────────────────────

function ColumnGridEditor({
  arr, onPatch,
}: {
  arr: RectColumnArrangement
  onPatch: (p: Partial<RectColumnArrangement>) => void
}) {
  const total = 2 * arr.nx + 2 * arr.ny - 4
  // Rectangular columns are tied-only (spiral belongs to circular sections).
  return (
    <div className="space-y-1.5">
      <CountInputRow label="Bars across width (nₓ)" value={arr.nx} min={2} onChange={(n) => onPatch({ nx: n })} />
      <CountInputRow label="Bars up height (n_y)" value={arr.ny} min={2} onChange={(n) => onPatch({ ny: n })} />
      <SizeSelectRow label="Bar size" value={arr.size} options={REBAR_SIZES} onChange={(s) => onPatch({ size: s })} />
      <TieRow tie={arr.tie} onChange={(t) => onPatch({ tie: t })} />
      <p className="text-[10px] text-gray-500">
        Tied column · Total = 2·nₓ + 2·n_y − 4 = <span className="font-mono">{total}</span> bars
      </p>
    </div>
  )
}

function ColumnRingEditor({
  arr, onPatch,
}: {
  arr: CircleColumnArrangement
  onPatch: (p: Partial<CircleColumnArrangement>) => void
}) {
  const confinement = arr.confinement ?? "spiral"
  return (
    <div className="space-y-1.5">
      <CountInputRow label="Bars on ring (n)" value={arr.n} min={4} onChange={(n) => onPatch({ n })} />
      <SizeSelectRow label="Bar size" value={arr.size} options={REBAR_SIZES} onChange={(s) => onPatch({ size: s })} />
      <div className="flex items-center gap-1.5">
        <Label className="text-xs text-gray-600 flex-1">Confinement</Label>
        <div className="grid grid-cols-2 gap-1 w-32">
          <ModeButton active={confinement === "spiral"} onClick={() => onPatch({ confinement: "spiral" })} title="Spiral: Pn,max = 0.85·Po, φc 0.75">
            Spiral
          </ModeButton>
          <ModeButton active={confinement === "tied"} onClick={() => onPatch({ confinement: "tied" })} title="Circular tie: Pn,max = 0.80·Po, φc 0.65">
            Tie
          </ModeButton>
        </div>
      </div>
      <TieRow tie={arr.tie} onChange={(t) => onPatch({ tie: t })} label={confinement === "spiral" ? "Spiral" : "Hoop"} />
      <p className="text-[10px] text-gray-500">
        {confinement === "spiral" ? "Spiral-confined" : "Circular-tied"} · <span className="font-mono">{Math.max(4, Math.round(arr.n))}</span> bars on one ring
      </p>
    </div>
  )
}

function CountInputRow({
  label, value, min, onChange,
}: {
  label: string
  value: number
  min: number
  onChange: (n: number) => void
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
    if (n !== value) onChange(n)
  }
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs text-gray-600 flex-1">{label}</Label>
      <Input
        type="number"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className="h-7 text-xs font-mono w-16 text-center"
      />
    </div>
  )
}

function SizeSelectRow({
  label, value, options, onChange,
}: {
  label: string
  value: RebarSize
  options: RebarSize[]
  onChange: (s: RebarSize) => void
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs text-gray-600 flex-1">{label}</Label>
      <Select value={value} onValueChange={(v) => onChange(v as RebarSize)}>
        <SelectTrigger className="h-7 text-xs w-20"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((s) => (
            <SelectItem key={s} value={s}>{s}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  )
}

function TieRow({
  tie, onChange, label = "Tie",
}: {
  tie: ColumnArrangement["tie"]
  onChange: (t: ColumnArrangement["tie"]) => void
  label?: string
}) {
  const [spacingText, setSpacingText] = React.useState(String(tie.spacing))
  React.useEffect(() => setSpacingText(String(tie.spacing)), [tie.spacing])
  const commitSpacing = () => {
    const n = Math.round(parseFloat(spacingText))
    if (!Number.isFinite(n) || n < 25) {
      setSpacingText(String(tie.spacing))
      return
    }
    setSpacingText(String(n))
    if (n !== tie.spacing) onChange({ ...tie, spacing: n })
  }
  return (
    <div className="flex items-center gap-1.5">
      <Label className="text-xs text-gray-600 flex-1">{label}</Label>
      <Select value={tie.size} onValueChange={(v) => onChange({ ...tie, size: v as RebarSize })}>
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

/** Column detailing checks card (longitudinal only; transverse confinement is a
 *  later pass). Reuses the same glyph styling as the beam card. */
function ColumnDetailingCard({ checks }: { checks: ArrangementCheck[] }) {
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e] leading-snug">
        Reinforcement Detailing Checks
      </p>
      {checks.map((c, i) => {
        const g = CHECK_GLYPH[c.status]
        return (
          <div key={i} className="flex items-start gap-1.5">
            <span className={cn("text-[10px] leading-snug shrink-0 w-3 text-center", g.cls)}>
              {g.glyph}
            </span>
            <p className="text-[10px] text-gray-600 leading-snug flex-1">
              {c.text} <span className="text-gray-400 whitespace-nowrap">({c.clause})</span>
            </p>
          </div>
        )
      })}
      <p className="text-[10px] text-gray-400 leading-snug pt-0.5">
        Shear (Ve), transverse confinement (ties / Aₛₕ) and slenderness are
        evaluated per member — see the Advanced Report after a Run.
      </p>
    </div>
  )
}

const ZONE_LABEL: Record<ZoneId, string> = {
  "end-i": "End i",
  midspan: "Midspan",
  "end-j": "End j",
}

/**
 * Per-zone beam results for the governing member using this section. Required
 * mode reports the steel the code demands (As top/bottom, Av/s + a suggested
 * stirrup); checked mode reports the capacity of the bars the user drew
 * (φMn per face, D/C, φVn). One row per zone, worst face first.
 */
function BeamZoneResultsCard({ member }: { member: MemberDesignResult }) {
  const zones = member.zones
  if (!zones) return null
  const r1 = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? n.toFixed(1) : "—")
  const r0 = (n: number | undefined) => (n !== undefined && Number.isFinite(n) ? Math.round(n) : "—")
  const required = member.mode === "required"

  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1.5">
      {(Object.keys(ZONE_LABEL) as ZoneId[]).map((z) => {
        const zr = zones[z]
        if (!zr) return null
        const f = zr.flexure
        const v = zr.shear
        const worstDC = Math.max(f.dcPos ?? 0, f.dcNeg ?? 0)
        return (
          <div key={z} className="space-y-0.5">
            <div className="flex items-baseline justify-between">
              <p className="text-[10px] font-semibold text-[#1a2f5e]">{ZONE_LABEL[z]}</p>
              {!required && (
                <span
                  className="text-[10px] font-mono font-semibold"
                  style={{ color: designColorForDC(worstDC) }}
                >
                  D/C {Number.isFinite(worstDC) ? worstDC.toFixed(2) : "O/S"}
                </span>
              )}
              {required && !f.adequate && (
                <span className="text-[10px] font-mono font-semibold text-red-600">
                  section inadequate
                </span>
              )}
            </div>
            <div className="font-mono text-[10px] text-gray-700 space-y-0.5">
              <p>
                Mu⁺ {r1(f.MuPos)} · Mu⁻ {r1(f.MuNeg)} kN·m
              </p>
              {required ? (
                <p>
                  As bot {r0(f.AsReqBottom)} · top {r0(f.AsReqTop)} mm²
                  {f.AsPrimeReq !== undefined && f.AsPrimeReq > 0 && (
                    <> · A′s {r0(f.AsPrimeReq)} mm²</>
                  )}
                </p>
              ) : (
                <p>
                  φMn⁺ {r1(f.phiMnPos)} · φMn⁻ {r1(f.phiMnNeg)} kN·m
                </p>
              )}
              <p>
                V_d {r1(v.Vdesign)} kN
                {v.Ve !== undefined && <> (Vₑ {r1(v.Ve)})</>}
                {required
                  ? v.AvSReq !== undefined && (
                      <>
                        {" "}· Aᵥ/s {r1(v.AvSReq)} mm²/m
                        {v.suggested && <> → {v.suggested.size}@{v.suggested.spacing}</>}
                      </>
                    )
                  : v.phiVn !== undefined && <> · φVn {r1(v.phiVn)} kN</>}
              </p>
              {!v.crossSectionOk && (
                <p className="text-red-600">✗ shear exceeds the φVmax cross-section limit</p>
              )}
              {v.crossSectionOk && !v.pass && (
                <p className="text-red-600">✗ shear demand exceeds capacity</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** Required-mode column results from the run (the governing column member of
 *  this section): ρg/Aₛₜ, shear Ve + suggested hoop, confinement, slenderness δns,
 *  and the SCWB verdict. Mirrors the checked-mode Advanced Report numbers. */
function ColumnRequiredResultsCard({
  result,
  joint,
}: {
  result: import("@/lib/design/core/types").ColumnDesignResult
  joint?: import("@/lib/design/core/types").JointCheckResult
}) {
  const r1 = (n: number) => (Number.isFinite(n) ? n.toFixed(1) : "—")
  const s = result.shear
  const ok = result.rhoGRequired !== undefined
  return (
    <div className="rounded bg-gray-50 border border-gray-200 px-2 py-1.5 space-y-1">
      <p className="text-[10px] font-semibold text-[#1a2f5e] leading-snug">Column Design Results</p>
      <div className="font-mono text-[10px] text-gray-700 space-y-0.5">
        <p className={ok ? "" : "text-red-600"}>
          ρg required = {ok ? `${(result.rhoGRequired! * 100).toFixed(2)}%` : "over 8% — enlarge section"}
          {" · "}Aₛₜ = {Math.round(result.Ast)} mm²
        </p>
        {s && (
          <>
            <p>
              {s.Ve !== undefined && <>Vₑ = {r1(s.Ve)} kN · </>}V_d = {r1(s.Vdesign)} kN
              {s.AvSReq !== undefined && <> · Aᵥ/s = {r1(s.AvSReq)} mm²/m</>}
              {s.suggested && <> → {s.suggested.size}@{s.suggested.spacing}</>}
            </p>
            {!s.crossSectionOk && <p className="text-red-600">✗ shear exceeds φVmax cross-section limit</p>}
          </>
        )}
        {result.deltaNs !== undefined && (
          <p>
            δns = {result.deltaNs.toFixed(3)} (k·lu/r = {r1(result.slenderness ?? 0)})
            {result.deltaNs > 1.001 && <span className="text-amber-600"> magnified</span>}
          </p>
        )}
        {joint && (
          <p className={joint.pass ? "" : "text-red-600"}>
            SCWB {joint.pass ? "✓" : "✗"} ratio {Number.isFinite(joint.ratio) ? joint.ratio.toFixed(2) : "∞"} (18.7.3.2)
          </p>
        )}
      </div>
      {result.confinement && result.confinement.length > 0 && (
        <div className="space-y-0.5 pt-0.5 border-t border-gray-200">
          {result.confinement.map((c, i) => {
            const g = CHECK_GLYPH[c.status]
            return (
              <div key={i} className="flex items-start gap-1.5">
                <span className={cn("text-[10px] leading-snug shrink-0 w-3 text-center", g.cls)}>{g.glyph}</span>
                <p className="text-[10px] text-gray-600 leading-snug flex-1">
                  {c.text} <span className="text-gray-400 whitespace-nowrap">({c.clause})</span>
                </p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

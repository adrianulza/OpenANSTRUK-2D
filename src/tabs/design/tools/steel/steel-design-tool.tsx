/**
 * STEEL — structural steel member design (AISC 360-16 / SNI 1729:2020).
 *
 * Router for the steel branch of the Design tab, mirroring the RC tool's shape:
 * section picker → element type → member parameters → live cross-section → the
 * beam or column Advanced Report deck. It shares no code path with the RC tool;
 * only the material-agnostic SVG and chart primitives are common.
 *
 * Steel has no "As required" / "As checked" split. There is no rebar-style
 * unknown to solve for, so this is always a CHECK of the assigned section — the
 * inputs are the ones AISC needs beyond geometry: unbraced length, Cb, and the
 * effective-length factors.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import type { Section, SectionId, StructureModel } from "@/lib/model"
import type { SectionDesignInputs } from "@/lib/design/core/section-input"
import { asSteelInput } from "@/lib/design/core/section-input"
import type { SteelSectionInput } from "@/lib/design/steel/types"
import type { DesignCriteria } from "@/lib/design/core/criteria"
import type { DesignRunResult, ElementType, MemberDesignResult } from "@/lib/design/core/types"
import {
  isSectionDesignable, isSectionInTargetMatrix, materialOf,
} from "@/lib/design/core/designability"
import { NumericInput } from "@/components/ui/numeric-input"
import { SectionSelect } from "@/components/flyout-shared"
import { designColorForDC } from "@/lib/constants"
import { SteelSectionPreview } from "./preview"
import { SteelBeamReportDeck } from "./beam/report"
import { SteelColumnReportDeck } from "./column/report"

const NAVY = "#1a2f5e"

export interface SteelDesignToolProps {
  model: StructureModel
  selectedSectionId: SectionId | null
  onSelectSection: (id: SectionId) => void
  inputs: SectionDesignInputs
  onPatchInput: (id: SectionId, patch: Partial<SteelSectionInput>) => void
  designResult: DesignRunResult | null
  criteria: DesignCriteria
}

function Row({ label, children, hint }: { label: React.ReactNode; children: React.ReactNode; hint?: string }) {
  return (
    <div className="space-y-0.5">
      <div className="flex items-center justify-between gap-2">
        <label className="text-[10px] text-gray-600">{label}</label>
        <div className="w-24">{children}</div>
      </div>
      {hint && <p className="text-[9px] text-gray-400 leading-snug">{hint}</p>}
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
        "h-7 rounded text-[11px] font-medium transition-colors px-1",
        active
          ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
          : "border border-gray-200 text-gray-400 hover:border-[#2563eb] hover:text-[#2563eb] hover:bg-[#2563eb]/5",
      )}
    >
      {children}
    </button>
  )
}

export function SteelDesignToolContent({
  model, selectedSectionId, onSelectSection, inputs, onPatchInput, designResult, criteria,
}: SteelDesignToolProps) {
  const [showDeck, setShowDeck] = React.useState(false)

  const steelSections: Record<SectionId, Section> = Object.fromEntries(
    Object.entries(model.sections).filter(([, s]) => materialOf(s) === "steel"),
  )
  const steelIds = Object.keys(steelSections)

  if (steelIds.length === 0) {
    return (
      <div className="rounded bg-gray-50 border border-gray-200 px-2 py-3">
        <p className="text-[10px] text-gray-500 leading-snug">
          No steel sections in this model. Create one with the MATERIAL tool on
          the Model tab — parametric mode, material class “steel”, shape IWF /
          RHS / CHS / Tee / Angle, with a yield stress f<sub>y</sub>.
        </p>
      </div>
    )
  }

  const sid = selectedSectionId && steelSections[selectedSectionId]
    ? selectedSectionId
    : steelIds[0]
  const section: Section = model.sections[sid]
  const di = asSteelInput(inputs[sid], sid)
  const designable = isSectionDesignable(section)
  const planned = !designable && isSectionInTargetMatrix(section, "steel")

  // Every member using this section, worst first — the deck reports on the
  // governing one, and the list makes clear which member that is.
  const members: MemberDesignResult[] = designResult
    ? Object.values(designResult.members)
        .filter((r) => r.steel && model.members[r.memberId]?.section === sid)
        .sort((a, b) => b.steel!.ratio - a.steel!.ratio)
    : []
  const governing = members[0]
  const st = governing?.steel

  // Which deck to show. `auto` resolves the same way the engine does — by
  // orientation — so the preview matches what will actually be reported.
  const resolvedKind: "beam" | "column" =
    governing?.kind ??
    (di.elementType === "column" ? "column"
      : di.elementType === "beam" ? "beam"
        : autoKind(model, sid))

  const Lb = di.Lb && di.Lb > 0 ? di.Lb : (st?.Lb ?? 0)
  const Cb = di.Cb && di.Cb > 0 ? di.Cb : (st?.Cb ?? 1)

  return (
    <div className="space-y-3">
      <SectionSelect sections={steelSections} value={sid} onChange={onSelectSection} />

      {!designable && (
        <div className="rounded bg-amber-50 border border-amber-200 px-2 py-2">
          <p className="text-[10px] text-amber-800 leading-snug">
            {planned
              ? `${section.shape?.kind?.toUpperCase() ?? "This shape"} is in the target matrix but its AISC clause path is not built yet.`
              : "Not designable: needs a parametric IWF / RHS / CHS / Tee / Angle section, authored in the MATERIAL tool, with a yield stress fy defined."}
          </p>
        </div>
      )}

      {designable && (
        <>
          <SteelSectionPreview section={section} />

          <div className="space-y-1.5">
            <label className="text-[10px] text-gray-600">Element Type</label>
            <div className="grid grid-cols-3 gap-1">
              {(["auto", "beam", "column"] as ElementType[]).map((t) => (
                <ModeButton
                  key={t}
                  active={di.elementType === t}
                  onClick={() => onPatchInput(sid, { elementType: t })}
                  title={
                    t === "auto"
                      ? "By member orientation — vertical members are columns"
                      : t === "beam" ? "Force beam" : "Force column"
                  }
                >
                  {t === "auto" ? "Auto" : t === "beam" ? "Beam" : "Column"}
                </ModeButton>
              ))}
            </div>
            <p className="text-[9px] text-gray-400 leading-snug">
              Steel runs the same Chapter H check either way — unlike RC there is
              no separate beam and column formulation. The choice selects the
              report and the canvas label, not the math.
            </p>
          </div>

          <div className="space-y-2 rounded border border-gray-200 px-2 py-2">
            <p className="text-[10px] font-semibold" style={{ color: NAVY }}>
              Member parameters
            </p>
            <Row
              label={<>Unbraced length L<sub>b</sub> (m)</>}
              hint="0 = use the full member length (conservative). There is no intermediate brace concept in the model, so enter the real braced length yourself."
            >
              <NumericInput
                value={di.Lb ?? 0}
                onChange={(v: number) => onPatchInput(sid, { Lb: Math.max(0, v) })}
              />
            </Row>
            <Row
              label={<>C<sub>b</sub></>}
              hint="0 = computed from the member's own moment diagram (AISC F1-1). Enter 1.0 to force the conservative uniform-moment value. Single angles are pinned to 1.0 by F10."
            >
              <NumericInput
                value={di.Cb ?? 0}
                onChange={(v: number) => onPatchInput(sid, { Cb: v > 0 ? v : undefined })}
              />
            </Row>
            <Row label={<>K major (K<sub>33</sub>)</>} hint="1.0 per the AISC Direct Analysis Method. Sway-frame K is not computed.">
              <NumericInput
                value={di.K33 ?? 1}
                onChange={(v: number) => onPatchInput(sid, { K33: v > 0 ? v : 1 })}
              />
            </Row>
            <Row label={<>K minor (K<sub>22</sub>)</>}>
              <NumericInput
                value={di.K22 ?? 1}
                onChange={(v: number) => onPatchInput(sid, { K22: v > 0 ? v : 1 })}
              />
            </Row>
          </div>

          <button
            onClick={() => setShowDeck((v) => !v)}
            className={cn(
              "w-full h-8 rounded text-[11px] font-medium transition-colors",
              showDeck
                ? "border-2 border-[#2563eb] bg-[#2563eb]/5 text-[#2563eb]"
                : "border border-gray-200 text-gray-500 hover:border-[#2563eb] hover:text-[#2563eb]",
            )}
          >
            {showDeck ? "Hide" : "Show"} Advanced Report — {resolvedKind === "column" ? "Column" : "Beam"}
          </button>

          {st ? (
            <div className="space-y-1.5 rounded border border-gray-200 px-2 py-2">
              <p className="text-[10px] font-semibold" style={{ color: NAVY }}>
                Governing member — {governing!.memberId}
              </p>
              <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
                <dt className="text-gray-500">Classification</dt>
                <dd className="text-right font-mono">{st.sectionClass}</dd>
                <dt className="text-gray-500">Governing eq.</dt>
                <dd className="text-right font-mono">{st.equation}</dd>
                <dt className="text-gray-500">D/C</dt>
                <dd
                  className="text-right font-mono font-semibold"
                  style={{ color: Number.isFinite(st.ratio) ? designColorForDC(st.ratio) : undefined }}
                >
                  {Number.isFinite(st.ratio) ? st.ratio.toFixed(3) : "O/S"}
                </dd>
                <dt className="text-gray-500">φPn comp.</dt>
                <dd className="text-right font-mono">{st.PcComp.toFixed(0)} kN</dd>
                <dt className="text-gray-500">φMn</dt>
                <dd className="text-right font-mono">{st.Mc33.toFixed(1)} kN·m</dd>
                <dt className="text-gray-500">φVn</dt>
                <dd className="text-right font-mono">{st.Vc.toFixed(0)} kN</dd>
                <dt className="text-gray-500">Shear D/C</dt>
                <dd className={`text-right font-mono ${st.shearRatio <= 1 ? "" : "text-red-600 font-semibold"}`}>
                  {Number.isFinite(st.shearRatio) ? st.shearRatio.toFixed(3) : "O/S"}
                </dd>
                <dt className="text-gray-500">Flexure limit</dt>
                <dd className="text-right font-mono">{st.flexureLimit}</dd>
                <dt className="text-gray-500">Cb used</dt>
                <dd className="text-right font-mono">{st.Cb?.toFixed(3) ?? "—"}</dd>
                {st.Lp !== undefined && st.Lr !== undefined && (
                  <>
                    <dt className="text-gray-500">Lp / Lr</dt>
                    <dd className="text-right font-mono">
                      {st.Lp.toFixed(2)} / {st.Lr.toFixed(2)} m
                    </dd>
                  </>
                )}
                <dt className="text-gray-500">KL/r</dt>
                <dd className="text-right font-mono">
                  {st.slenderness?.toFixed(0) ?? "—"} ({st.slendernessAxis ?? "—"})
                </dd>
              </dl>
              {members.length > 1 && (
                <div className="pt-1 border-t border-gray-100">
                  <p className="text-[9px] text-gray-400 pb-0.5">
                    {members.length} members use this section
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {members.map((m) => (
                      <span
                        key={m.memberId}
                        className="font-mono text-[9px] px-1 rounded"
                        style={{
                          color: designColorForDC(m.steel!.ratio),
                          background: "#f8fafc",
                        }}
                        title={`${m.memberId}: D/C ${m.steel!.ratio.toFixed(3)} (${m.steel!.equation})`}
                      >
                        {m.memberId} {Number.isFinite(m.steel!.ratio) ? m.steel!.ratio.toFixed(2) : "O/S"}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {st.warnings.length > 0 && (
                <ul className="space-y-0.5 pt-1">
                  {st.warnings.map((w) => (
                    <li key={w} className="text-[9px] text-amber-700 leading-snug">⚠ {w}</li>
                  ))}
                </ul>
              )}
            </div>
          ) : (
            <p className="text-[10px] text-gray-400 leading-snug">
              Run the design check to see results for this section. The beam
              report draws its capacity curve from the section alone, so it works
              before a run; the column envelope needs the run's demands.
            </p>
          )}

          {resolvedKind === "column" ? (
            <SteelColumnReportDeck
              open={showDeck}
              section={section}
              result={st}
              memberId={governing?.memberId}
            />
          ) : (
            <SteelBeamReportDeck
              open={showDeck}
              section={section}
              criteria={criteria.steel}
              Lb={Lb}
              Cb={Cb}
              result={st}
              memberId={governing?.memberId}
            />
          )}
        </>
      )}
    </div>
  )
}

/** Orientation rule the engine uses for `elementType: "auto"`. */
function autoKind(model: StructureModel, sid: SectionId): "beam" | "column" {
  for (const m of Object.values(model.members)) {
    if (m.section !== sid) continue
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (!a || !b) continue
    if (Math.abs(b.y - a.y) > Math.abs(b.x - a.x)) return "column"
  }
  return "beam"
}

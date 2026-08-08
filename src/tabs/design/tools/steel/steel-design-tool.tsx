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
import type { DesignCriteria } from "@/lib/design/core/criteria"
import type { DesignRunResult, MemberDesignResult } from "@/lib/design/core/types"
import {
  isSectionDesignable, isSectionInTargetMatrix, materialOf,
} from "@/lib/design/core/designability"
import { inferSteelRole, steelRoleLabel, type SteelMemberRole } from "@/lib/design/steel/member-role"
import { ductilityLabel, type SeismicChecks } from "@/lib/design/steel/seismic"
import { SectionSelect } from "@/components/flyout-shared"
import { COLOR_DESIGN_FAIL, designColorForDC } from "@/lib/constants"
import { SteelSectionPreview } from "./preview"
import { SteelBeamReportDeck } from "./beam/report"
import { SteelColumnReportDeck } from "./column/report"

const NAVY = "#1a2f5e"

export interface SteelDesignToolProps {
  model: StructureModel
  selectedSectionId: SectionId | null
  onSelectSection: (id: SectionId) => void
  designResult: DesignRunResult | null
  criteria: DesignCriteria
}

export function SteelDesignToolContent({
  model, selectedSectionId, onSelectSection, designResult, criteria,
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

  // Role per member using this section, inferred from geometry. Resolvable
  // without a design run, and never user-set — see steel/member-role.ts.
  // Not memoised: this sits after an early return, and a hook here would break
  // the rules of hooks. The walk is O(members) on a flyout render.
  const roles = sectionRoles(model, sid)

  // Which deck to show. Braces get the column deck: like a column they are
  // axial-dominated, so the interaction envelope is the informative view.
  const governingRole: SteelMemberRole =
    governing?.kind ?? roles[0]?.role ?? "beam"
  const deckKind: "beam" | "column" =
    governingRole === "beam" ? "beam" : "column"

  const Lb = st?.Lb ?? 0
  const Cb = st?.Cb ?? 1

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

          <div className="space-y-1.5 rounded border border-gray-200 px-2 py-2">
            <p className="text-[10px] font-semibold" style={{ color: NAVY }}>
              Member role
            </p>
            <div className="flex flex-wrap gap-1">
              {roles.map((r) => (
                <span
                  key={r.memberId}
                  className="font-mono text-[9px] px-1 py-0.5 rounded bg-gray-50 text-gray-600"
                  title={`${r.memberId}: ${steelRoleLabel(r.role)} (from orientation)`}
                >
                  {r.memberId} {steelRoleLabel(r.role)}
                </span>
              ))}
              {roles.length === 0 && (
                <span className="text-[9px] text-gray-400">No members use this section.</span>
              )}
            </div>
            <p className="text-[9px] text-gray-400 leading-snug">
              Inferred from each member’s orientation — not a setting. AISC 360 is
              organised by limit state, not member type: every steel member runs
              the same Chapter H check, and a beam simply reaches it with
              P<sub>r</sub> = 0. The role picks the report and the canvas label.
            </p>
          </div>

          <div className="space-y-1 rounded bg-gray-50 border border-gray-200 px-2 py-2">
            <p className="text-[10px] font-semibold text-gray-600">Member parameters</p>
            <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <dt className="text-gray-500">L<sub>b</sub></dt>
              <dd className="text-right font-mono">
                {Lb > 0 ? `${Lb.toFixed(2)} m` : "full length"}
              </dd>
              <dt className="text-gray-500">C<sub>b</sub> (F1-1)</dt>
              <dd className="text-right font-mono">{st ? Cb.toFixed(3) : "auto"}</dd>
              <dt className="text-gray-500">K<sub>33</sub> / K<sub>22</sub></dt>
              <dd className="text-right font-mono">1.0 / 1.0</dd>
            </dl>
            <p className="text-[9px] text-gray-400 leading-snug">
              Members are taken as laterally unbraced over their full length —
              <strong> subdivide a member to model bracing</strong>. C<sub>b</sub>
              {" "}is computed per combination from the moment diagram. K = 1.0
              limits the engine to <strong>braced frames</strong>.
            </p>
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
            {showDeck ? "Hide" : "Show"} Advanced Report — {steelRoleLabel(governingRole)}
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

              {st.seismic && <SeismicCard s={st.seismic} />}
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

          {deckKind === "column" ? (
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

/**
 * AISC 341 detailing for the governing member. Rendered only when a seismic
 * framing type is selected — for OMF/RMB the engine returns no seismic block at
 * all, so nothing appears and the tool reads exactly as it did before.
 */
function SeismicCard({ s }: { s: SeismicChecks }) {
  const fail = !s.ductilityPass
  return (
    <div
      className="mt-1.5 pt-1.5 border-t border-gray-100 space-y-1"
      data-testid="steel-seismic"
    >
      <div className="flex items-baseline justify-between">
        <p className="text-[10px] font-semibold" style={{ color: NAVY }}>
          Seismic — AISC 341
        </p>
        <span
          className="text-[9px] font-medium"
          style={{ color: fail ? COLOR_DESIGN_FAIL : "#16a34a" }}
        >
          {ductilityLabel(s.level)}: {fail ? "not met" : "OK"}
        </span>
      </div>

      <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
        <dt className="text-gray-500">C<sub>a</sub> = P<sub>u</sub>/φ<sub>c</sub>P<sub>y</sub></dt>
        <dd className="text-right font-mono">{s.Ca.toFixed(3)}</dd>
        <dt className="text-gray-500">R<sub>y</sub> applied</dt>
        <dd className="text-right font-mono">{s.Ry.toFixed(2)}</dd>
      </dl>

      {/* λ against its Table D1.1 limit, element by element. */}
      <div className="space-y-0.5">
        {s.elements.map((e) => (
          <div key={e.name} className="flex items-baseline gap-2 text-[10px]">
            <span className="flex-1 text-gray-500">{e.name}</span>
            <span
              className="font-mono"
              style={{ color: e.pass ? undefined : COLOR_DESIGN_FAIL }}
            >
              λ {e.lambda.toFixed(1)} / {e.limit.toFixed(1)}
            </span>
          </div>
        ))}
      </div>

      {s.bracing && (
        <div className="flex items-baseline gap-2 text-[10px]">
          <span className="flex-1 text-gray-500">D1.2 bracing</span>
          <span
            className="font-mono"
            style={{ color: s.bracing.pass ? undefined : "#d97706" }}
          >
            L<sub>b</sub> {s.bracing.Lb.toFixed(2)} / {s.bracing.LbMax.toFixed(2)} m
          </span>
        </div>
      )}

      <ul className="space-y-0.5 pt-0.5">
        {s.notes.map((n) => (
          <li key={n} className="text-[9px] text-gray-400 leading-snug">{n}</li>
        ))}
      </ul>
    </div>
  )
}

interface MemberRole {
  memberId: string
  role: SteelMemberRole
}

/**
 * Role of every member using this section, resolved from geometry through the
 * SAME function the engine uses — so the flyout can never disagree with the run.
 * Columns sort first: a section serving both is usually of interest as a column.
 */
function sectionRoles(model: StructureModel, sid: SectionId): MemberRole[] {
  const out: MemberRole[] = []
  for (const m of Object.values(model.members)) {
    if (m.section !== sid) continue
    const a = model.nodes[m.a]
    const b = model.nodes[m.b]
    if (!a || !b) continue
    out.push({ memberId: m.id, role: inferSteelRole(a.x, a.y, b.x, b.y) })
  }
  const rank: Record<SteelMemberRole, number> = { column: 0, brace: 1, beam: 2 }
  return out.sort((p, q) => rank[p.role] - rank[q.role] || p.memberId.localeCompare(q.memberId))
}

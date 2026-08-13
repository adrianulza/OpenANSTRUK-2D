/**
 * STEEL SECTION — structural steel member design (AISC 360-16 / SNI
 * 1729:2020), step 2 of the Steel design tool.
 *
 * Router for the steel branch of the Design tab, mirroring the RC tool's shape:
 * section picker → live cross-section → member data → results → the beam or
 * column Advanced Report deck. It shares no code path with the RC tool; only
 * the material-agnostic SVG and chart primitives are common.
 *
 * Steel has no "As required" / "As checked" split. There is no rebar-style
 * unknown to solve for, so this is always a CHECK of the assigned section — the
 * inputs are the ones AISC needs beyond geometry: unbraced length, Cb, and the
 * effective-length factors.
 *
 * The body is grouped into collapsible cards whose headers carry their own
 * verdict, matching the RC pane — see `../shared/verdict-group.tsx`.
 */

import * as React from "react"
import { cn } from "@/lib/utils"
import type { Section, SectionId, StructureModel } from "@/lib/model"
import type { DesignCriteria } from "@/lib/design/core/criteria"
import type { DesignRunResult, MemberDesignResult } from "@/lib/design/core/types"
import {
  assignedSectionIds, isSectionDesignable, isSectionInTargetMatrix, materialOf,
} from "@/lib/design/core/designability"
import { inferSteelRole, steelRoleLabel, type SteelMemberRole } from "@/lib/design/steel/member-role"
import { ductilityLabel, type SeismicChecks } from "@/lib/design/steel/seismic"
import { DesignSectionPicker } from "../shared/section-picker"
import { COLOR_DESIGN_FAIL, designColorForDC } from "@/lib/constants"
import { SteelSectionPreview } from "./preview"
import { SteelBeamReportDeck } from "./beam/report"
import { SteelColumnReportDeck } from "./column/report"
import {
  VerdictGroup, VerdictDC, VerdictStatus, VerdictText,
} from "../shared/verdict-group"

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

  // Only sections a member actually carries: the tool designs members, so an
  // unassigned section has nothing to report and would open an empty pane.
  const assigned = assignedSectionIds(model)
  const steelSections: Record<SectionId, Section> = Object.fromEntries(
    Object.entries(model.sections).filter(
      ([id, s]) => materialOf(s) === "steel" && assigned.has(id),
    ),
  )
  const steelIds = Object.keys(steelSections)

  if (steelIds.length === 0) {
    const inCatalogue = Object.values(model.sections).some((s) => materialOf(s) === "steel")
    return (
      <p className="text-[10px] text-gray-500 leading-snug">
        {inCatalogue
          ? "No member uses a steel section."
          : "No steel sections — add one in Model → MATERIAL."}
      </p>
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
    <div className="space-y-2">
      {/* ── Step A: which section ───────────────────────────────────────────── */}
      <VerdictGroup
        title="Section"
        defaultOpen
        verdict={<VerdictText>{section.name}</VerdictText>}
      >
        <DesignSectionPicker
          sections={steelSections}
          ids={steelIds}
          value={sid}
          onChange={onSelectSection}
        />

        {!designable && (
          <p
            className="text-[10px] text-amber-700 leading-snug"
            title={
              planned
                ? "Listed in the design target matrix, but its AISC clause path is not implemented yet."
                : "Needs a parametric IWF / RHS / CHS / Tee / Angle authored in the MATERIAL tool, with a yield stress fy."
            }
          >
            {planned
              ? `AISC path for ${section.shape?.kind?.toUpperCase() ?? "this shape"} not built yet.`
              : "Not designable — needs a parametric steel shape with fy."}
          </p>
        )}

        {designable && <SteelSectionPreview section={section} />}
      </VerdictGroup>

      {designable && (
        <>
          {/* ── Step B: the members carrying it ───────────────────────────── */}
          <VerdictGroup
            title="Member"
            verdict={
              <VerdictText>
                {steelRoleLabel(governingRole)}
                {Lb > 0 && ` · Lb ${Lb.toFixed(2)} m`}
              </VerdictText>
            }
          >
            {/* Role, then the three AISC inputs. Reference register: this is a
                spec block, so the reasoning behind each row lives on its
                tooltip. The one line that stays visible is the K = 1.0 limit,
                because it is the engine's only non-conservative assumption. */}
            <div className="flex flex-wrap items-center gap-1">
              <span
                className="text-[10px] text-gray-500 mr-0.5"
                title={
                  "Inferred from each member's orientation — not a setting. AISC 360 is " +
                  "organised by limit state, not member type: every steel member runs the " +
                  "same Chapter H check, and a beam simply reaches it with Pr = 0. The role " +
                  "picks the report and the canvas label."
                }
              >
                Role
              </span>
              {roles.map((r) => (
                <span
                  key={r.memberId}
                  className="font-mono text-[9px] px-1 py-0.5 rounded bg-gray-50 text-gray-600"
                  title={`${r.memberId}: ${steelRoleLabel(r.role)} (from orientation)`}
                >
                  {r.memberId} {steelRoleLabel(r.role)}
                </span>
              ))}
            </div>

            <dl className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px]">
              <dt
                className="text-gray-500"
                title="Taken as laterally unbraced over the full member length. Subdivide a member to model bracing."
              >
                L<sub>b</sub>
              </dt>
              <dd className="text-right font-mono">
                {Lb > 0 ? `${Lb.toFixed(2)} m` : "full length"}
              </dd>
              <dt className="text-gray-500" title="Computed per load combination from the moment diagram (F1-1).">
                C<sub>b</sub> (F1-1)
              </dt>
              <dd className="text-right font-mono">{st ? Cb.toFixed(3) : "auto"}</dd>
              <dt
                className="text-gray-500"
                title="The direct analysis method's prescription — but second-order analysis, reduced stiffness and notional loads are not modelled, so this engine is limited to braced frames."
              >
                K<sub>33</sub> / K<sub>22</sub>
              </dt>
              <dd className="text-right font-mono">1.0 / 1.0</dd>
            </dl>
            <p className="text-[9px] text-gray-400 leading-snug">
              Unbraced over full length · K = 1.0, <strong>braced frames only</strong>
            </p>
          </VerdictGroup>

          {/* ── Step C: what the run produced ─────────────────────────────── */}
          <VerdictGroup title="Results" verdict={<VerdictDC dc={st?.ratio} />}>
            {st ? (
              <div className="space-y-1.5">
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
              <p
                className="text-[10px] text-gray-400 leading-snug"
                title="Design runs automatically on every edit. The beam report below draws its capacity curve from the section alone, so it works without demands; the column envelope does not."
              >
                No demands from the enabled load combinations.
              </p>
            )}
          </VerdictGroup>

          {/* ── Step D: seismic detailing, when a seismic system is selected ─ */}
          {st?.seismic && (
            <VerdictGroup
              title="Seismic — AISC 341"
              verdict={
                <VerdictStatus
                  ok={st.seismic.ductilityPass}
                  okText={`${ductilityLabel(st.seismic.level)}: OK`}
                  failText={`${ductilityLabel(st.seismic.level)}: not met`}
                />
              }
            >
              <SeismicCard s={st.seismic} />
            </VerdictGroup>
          )}

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
 * all, so the enclosing group never appears and the tool reads exactly as it
 * did before. The overall verdict lives on that group's header, so this card
 * carries only the evidence behind it.
 */
function SeismicCard({ s }: { s: SeismicChecks }) {
  return (
    <div className="space-y-1" data-testid="steel-seismic">
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

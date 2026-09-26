/**
 * Define Seismic Load — ASCE 7-16 / SNI 1726:2019, for a plane frame.
 *
 * Ported from OpenANSTRUK-3D's seismic window: the same three tracks (two
 * input columns, then what they produce), the same row family, the same
 * spectrum chart and summary strip. The 2D port drops what a plane frame has
 * no use for — the direction (always global X), accidental eccentricity and
 * torsion (plan quantities), and time history.
 *
 * Unlike the 3D window this one DOES show W and V live: a plane frame's weight
 * takeoff is a few hundred additions, not a nine-second storey survey, so the
 * dialog can afford the run it describes.
 *
 * Draft-and-commit: nothing reaches the case until OK.
 */

import { useEffect, useMemo, useState } from "react"
import { createPortal } from "react-dom"
import { Info, X } from "lucide-react"

import {
  Drop,
  Group,
  Hint,
  NumInline,
  NumRow,
  PickRow,
  Radio,
  ReadRow,
  ValueRow,
  type RadioOption,
} from "@/components/dialog-fields"
import type { StructureModel } from "@/lib/model"
import { Z_DIALOG } from "@/lib/z-layers"
import { spectralAcceleration } from "@/lib/seismic/spectrum"
import {
  lthSettingsOf,
  type SeismicDefinition,
  type SeismicLthSettings,
} from "@/lib/seismic/definition"
import {
  BUILT_IN_RECORDS,
  recordDuration,
  recordPeak,
  resolveRecord,
  type GroundMotionRecord,
  type GroundMotionUnit,
} from "@/lib/seismic/ground-motion"
import {
  SEISMIC_CODES,
  SEISMIC_CODE_LABELS,
  SITE_CLASSES,
  SITE_TABLE_REF,
  siteClassCode,
  siteTable,
  type SiteSpecificFlag,
} from "@/lib/seismic/site"
import { RISK_CATEGORIES, IMPORTANCE_FACTOR } from "@/lib/seismic/sdc"
import { SYSTEM_CT, SYSTEM_LABELS, type PeriodMode, type StructuralSystem } from "@/lib/seismic/period"
import { runElf, seismicLadder, type ElfRun, type SeismicLadder } from "@/lib/seismic/run"
import type { MassReport } from "@/lib/seismic/mass"
import { dominantModeX, type ModalSolution } from "@/lib/seismic/modal"
import { SpectrumChart } from "./spectrum-chart"
import { SiteTablePopover } from "./site-table-popover"
import { AccelerogramChart } from "./accelerogram-chart"
import { GmImportDialog } from "./gm-import-dialog"

export interface SeismicDialogProps {
  model: StructureModel
  caseName: string
  value: SeismicDefinition
  /** The mass-source takeoff, for W and V. Null when nothing has been prepared. */
  mass: MassReport | null
  /** The modal solution, for the Auto period and the mode markers. */
  modal: ModalSolution | null
  /** Imported ground-motion records, and the write that adds one (through, not drafted). */
  groundMotions: readonly GroundMotionRecord[]
  onImportRecord: (record: GroundMotionRecord) => void
  onCommit: (next: SeismicDefinition) => void
  onCancel: () => void
}

function fmt(v: number, dp = 3): string {
  if (!Number.isFinite(v)) return "—"
  return v.toFixed(dp)
}

const MRS_DAMPING_NOTE =
  "Couples the modes in the CQC combination. The design spectrum itself stays drawn at 5 %."

/** A footnote mark carrying one sentence on hover. A span: it sits inside a <label>. */
function NoteDot({ title }: { title: string }) {
  return (
    <span
      title={title}
      aria-label={title}
      className="shrink-0 cursor-help text-gray-300 transition-colors hover:text-[#2563eb]"
    >
      <Info size={10} strokeWidth={2.25} className="block" />
    </span>
  )
}

export function SeismicDialog({
  model,
  caseName,
  value,
  mass,
  modal,
  groundMotions,
  onImportRecord,
  onCommit,
  onCancel,
}: SeismicDialogProps) {
  const [draft, setDraft] = useState<SeismicDefinition>(value)
  const [openTable, setOpenTable] = useState<SiteSpecificFlag | null>(null)
  const [openImport, setOpenImport] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return
      // An open Radix list takes the Escape first (capture phase: Radix has
      // unmounted it by the time a bubble handler asks), then the popover,
      // then the window — so one Escape never throws away what was typed.
      if (document.querySelector('[data-radix-popper-content-wrapper], [role="listbox"]')) return
      if (openImport) return setOpenImport(false)
      if (openTable !== null) return setOpenTable(null)
      onCancel()
    }
    window.addEventListener("keydown", onKey, true)
    return () => window.removeEventListener("keydown", onKey, true)
  }, [onCancel, openTable, openImport])

  const modalOk = modal && modal.ok ? modal : null
  const computedT = modalOk ? dominantModeX(modalOk).T : undefined

  const ladder: SeismicLadder | null = useMemo(() => {
    try {
      return seismicLadder(model, draft, computedT)
    } catch {
      return null
    }
  }, [model, draft, computedT])

  const run: ElfRun | null = useMemo(() => {
    if (!mass) return null
    try {
      return runElf(model, draft, mass, computedT)
    } catch {
      return null
    }
  }, [model, draft, mass, computedT])

  const edit = (patch: Partial<SeismicDefinition>) => setDraft((d) => ({ ...d, ...patch }))
  const code = draft.code
  const isMrs = draft.analysis === "mrs"
  const isLth = draft.analysis === "lth"

  // Time history: the record, its unit and the integration settings.
  const lth = lthSettingsOf(draft)
  const editLth = (patch: Partial<SeismicLthSettings>) => edit({ lth: { ...lth, ...patch } })
  const allRecords: readonly GroundMotionRecord[] = [...BUILT_IN_RECORDS, ...groundMotions]
  const record = resolveRecord(lth.recordId, groundMotions)
  const lthUnit: GroundMotionUnit = lth.unit ?? record?.unit ?? "g"
  const lthDt = lth.dt ?? record?.dt ?? 0.02
  const lthDuration = record ? recordDuration(record) : 0
  const lthPoints = record ? Math.max(2, Math.round(lthDuration / lthDt) + 1) : 0
  const lthPeak = record ? recordPeak(record) : { value: 0, at: 0 }
  const lthOk = !!record && lthDt > 0 && Number.isFinite(lth.scale)
  const refused = ladder?.siteSpecific ?? []

  const periodOptions: RadioOption<PeriodMode>[] = [
    { value: "computed", label: "Auto (modal)" },
    { value: "approximate", label: "Empirical" },
    {
      value: "user",
      label: "User defined",
      trailing: (
        <NumInline
          value={draft.userT ?? 1}
          unit="s"
          disabled={draft.periodMode !== "user"}
          ariaLabel="User period T"
          onChange={(userT) => edit({ userT })}
        />
      ),
    },
  ]

  const callout = (which: SiteSpecificFlag) => (
    <>
      <button
        type="button"
        title={`${SEISMIC_CODE_LABELS[code]} — the ${which} table`}
        onClick={() => setOpenTable((t) => (t === which ? null : which))}
        className="ml-0.5 align-super text-[8px] font-semibold text-[#1a2f5e] hover:underline"
      >
        {SITE_TABLE_REF[code][which]}
      </button>
      {openTable === which && ladder && (
        <SiteTablePopover
          view={siteTable(code, which)}
          activeClass={draft.siteClass}
          value={which === "Fa" ? ladder.Fa : ladder.Fv}
          at={which === "Fa" ? draft.Ss : draft.S1}
          onClose={() => setOpenTable(null)}
        />
      )}
    </>
  )

  const modeMarks =
    isMrs && modalOk && ladder
      ? modalOk.modes
          .filter((m) => m.ratioX >= 0.01)
          .slice(0, 12)
          .map((m) => ({
            T: m.T,
            Sa: spectralAcceleration(m.T, { SDS: ladder.SDS, SD1: ladder.SD1, TL: draft.TL }),
          }))
      : undefined

  const body = (
    <div className="flex max-h-[94dvh] w-[min(940px,94vw)] flex-col overflow-hidden rounded-xl border border-gray-200 bg-white shadow-2xl">
      <div className="flex shrink-0 items-center justify-between border-b border-gray-100 px-4 py-3">
        <span className="truncate text-sm font-medium text-[#1e293b]">
          Seismic load — {caseName}
        </span>
        <button
          aria-label="Close"
          onClick={onCancel}
          className="rounded p-0.5 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
        >
          <X size={15} />
        </button>
      </div>

      {/* The one scroll container. Columns stack below `lg`. */}
      <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overflow-x-hidden p-4 lg:flex-row">
        {/* ── what you set ─────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-col gap-4 sm:flex-row">
          <div className="w-full min-w-0 shrink-0 space-y-3 sm:w-[236px]">
            {!isLth && (
              <Drop
                label="Code"
                value={code}
                options={SEISMIC_CODES.map((c) => [c, SEISMIC_CODE_LABELS[c]] as const)}
                onChange={(c) => edit({ code: c })}
              />
            )}

            <Radio
              label="Analysis method"
              value={draft.analysis}
              options={[
                { value: "elf", label: "Static equivalent (ELF)" },
                { value: "mrs", label: "Response spectrum (MRS)" },
                { value: "lth", label: "Linear time history (LTH)" },
              ]}
              onChange={(analysis) => edit({ analysis })}
            />

            <Group title="Direction">
              <ReadRow label="Global axis">X</ReadRow>
              <Hint>A plane frame shakes in its own plane, along global X.</Hint>
            </Group>

            {!isLth && (
              <Radio
                label="Period"
                value={draft.periodMode}
                options={periodOptions}
                onChange={(periodMode) => edit({ periodMode })}
              />
            )}
            {!isLth && draft.periodMode === "computed" && (
              <Hint>
                {computedT !== undefined
                  ? `T₁ = ${computedT.toFixed(3)} s from the dominant X mode, capped at Cu·Ta.`
                  : "Taken from the dominant X mode, capped at Cu·Ta. No modal solution yet — Ta is shown."}
              </Hint>
            )}
            {!isLth && draft.periodMode === "user" && (
              <Hint>Used as given. The Cu·Ta cap is not applied to a period you state yourself.</Hint>
            )}

            {isMrs && (
              <NumRow
                label={
                  <span className="flex items-center gap-1">
                    Modal damping, ζ
                    <NoteDot title={MRS_DAMPING_NOTE} />
                  </span>
                }
                name="Modal damping"
                value={draft.damping}
                onChange={(v) =>
                  edit({ damping: Number.isFinite(v) && v >= 0 && v < 1 ? v : draft.damping })
                }
              />
            )}
          </div>

          {isLth && (
            <div className="w-full min-w-0 shrink-0 space-y-3 sm:w-[252px]">
              <Group title="Ground motion (X)">
                <select
                  value={lth.recordId}
                  aria-label="Ground-motion record"
                  onChange={(e) => editLth({ recordId: e.target.value, dt: undefined, unit: undefined })}
                  className="h-7 w-full rounded-md border border-gray-200 bg-white px-2 font-mono text-[11px] text-gray-700 focus:border-[#2563eb] focus:outline-none"
                >
                  {allRecords.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                  {!record && <option value={lth.recordId}>{lth.recordId} (missing)</option>}
                </select>
                <PickRow
                  label="Record unit"
                  name="Record unit"
                  value={lthUnit}
                  options={[
                    { value: "g", label: "g — gravitational acceleration", short: "g" },
                    { value: "m/s2", label: "m/s² — metres per second squared", short: "m/s²" },
                  ]}
                  onChange={(unit) => editLth({ unit })}
                />
                <NumRow
                  label="Scale factor"
                  name="Record scale factor"
                  value={lth.scale}
                  invalid={!Number.isFinite(lth.scale)}
                  onChange={(scale) => editLth({ scale })}
                />
                <button
                  type="button"
                  onClick={() => setOpenImport(true)}
                  className="h-7 w-full rounded-md border border-gray-200 font-mono text-[11px] text-gray-600 hover:border-[#2563eb] hover:text-[#2563eb]"
                >
                  Import record…
                </button>
              </Group>

              <Group title="Integration">
                <NumRow
                  label="Time step, Δt"
                  name="Time step seconds"
                  unit="s"
                  value={lthDt}
                  invalid={!(lthDt > 0)}
                  onChange={(v) => editLth({ dt: v > 0 ? v : undefined })}
                />
                <ReadRow label="Steps">{record ? lthPoints : "—"}</ReadRow>
                <ReadRow label="Duration">{record ? `${lthDuration.toFixed(2)} s` : "—"}</ReadRow>
                <NumRow
                  label="Damping, ζ (Rayleigh)"
                  name="Damping ratio"
                  value={lth.dampingRatio}
                  onChange={(v) =>
                    editLth({ dampingRatio: Number.isFinite(v) && v >= 0 && v < 1 ? v : lth.dampingRatio })
                  }
                />
                <NumRow
                  label="Newmark γ"
                  name="Newmark gamma"
                  value={lth.gamma ?? 0.5}
                  onChange={(v) => editLth({ gamma: v > 0 ? v : undefined })}
                />
                <NumRow
                  label="Newmark β"
                  name="Newmark beta"
                  value={lth.beta ?? 0.25}
                  onChange={(v) => editLth({ beta: v > 0 ? v : undefined })}
                />
              </Group>
            </div>
          )}

          {!isLth && (
          <div className="w-full min-w-0 shrink-0 space-y-3 sm:w-[252px]">
            <Group title="Earthquake parameters">
              <NumRow
                label={
                  <>
                    Short-period S<sub>a</sub> (S<sub>S</sub>)
                  </>
                }
                name="Short-period spectral acceleration Ss"
                value={draft.Ss}
                onChange={(Ss) => edit({ Ss })}
              />
              <NumRow
                label={
                  <>
                    1-second S<sub>a</sub> (S<sub>1</sub>)
                  </>
                }
                name="One-second spectral acceleration S1"
                value={draft.S1}
                onChange={(S1) => edit({ S1 })}
              />
              <NumRow
                label={
                  <>
                    Long-period transition (T<sub>L</sub>)
                  </>
                }
                name="Long-period transition TL"
                value={draft.TL}
                onChange={(TL) => edit({ TL })}
              />
              <PickRow
                label="Site class"
                name="Site class"
                value={draft.siteClass}
                options={SITE_CLASSES.map((c) => ({ value: c, label: siteClassCode(code, c) }))}
                onChange={(siteClass) => edit({ siteClass })}
              />
            </Group>

            <Group title="Building system">
              <PickRow
                label="Risk category"
                name="Risk category"
                value={draft.riskCategory}
                options={RISK_CATEGORIES.map((c) => ({ value: c, label: c }))}
                onChange={(riskCategory) =>
                  edit({ riskCategory, Ie: IMPORTANCE_FACTOR[riskCategory] })
                }
              />
              <ReadRow
                label={
                  <>
                    Occupancy importance, I<sub>e</sub>
                  </>
                }
              >
                <span>{draft.Ie}</span>
              </ReadRow>
              <PickRow
                label="Building type"
                name="Building type"
                value={draft.system}
                options={(Object.keys(SYSTEM_CT) as StructuralSystem[]).map((sys, i) => ({
                  value: sys,
                  label: `${i + 1}. ${SYSTEM_LABELS[sys]}`,
                  short: String(i + 1),
                }))}
                onChange={(system) => edit({ system })}
              />
              <ReadRow
                label={
                  <>
                    Period coefficient, C<sub>t</sub>
                  </>
                }
              >
                <span title="Table 12.8-2, SI — hₙ in metres">{SYSTEM_CT[draft.system].Ct}</span>
              </ReadRow>
              <ReadRow label="Period exponent, x">
                <span title="Table 12.8-2, SI — hₙ in metres">{SYSTEM_CT[draft.system].x}</span>
              </ReadRow>
              <NumRow
                label="Response modification, R"
                name="Response modification R"
                value={draft.R}
                invalid={!(draft.R > 0)}
                onChange={(R) => edit({ R })}
              />
              <NumRow
                label={
                  <>
                    System overstrength, Ω<sub>0</sub>
                  </>
                }
                name="System overstrength omega zero"
                value={draft.omega0}
                onChange={(omega0) => edit({ omega0 })}
              />
              <NumRow
                label={
                  <>
                    Deflection amplification, C<sub>d</sub>
                  </>
                }
                name="Deflection amplification Cd"
                value={draft.Cd}
                onChange={(Cd) => edit({ Cd })}
              />
            </Group>
          </div>
          )}
        </div>

        {/* ── what it produces ─────────────────────────────────────────── */}
        <div className="flex min-w-0 flex-1 flex-col gap-3">
          {isLth ? (
            <>
              <div className="h-[340px] shrink-0 rounded-lg border border-gray-200 bg-[#F0F2F5] p-2">
                <AccelerogramChart
                  strips={
                    record
                      ? [
                          {
                            key: record.id,
                            label: `X — ${record.name}${lth.scale !== 1 ? ` (×${lth.scale})` : ""}`,
                            record,
                            scale: lth.scale,
                            unit: lthUnit,
                          },
                        ]
                      : []
                  }
                />
              </div>
              <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 pt-2.5 sm:grid-cols-3">
                <ValueRow
                  label="PGA"
                  name="Peak ground acceleration"
                  value={`${fmt(Math.abs(lthPeak.value * lth.scale))} ${lthUnit === "g" ? "g" : "m/s²"}`}
                />
                <ValueRow label="at" name="Time of peak" value={`${fmt(lthPeak.at, 2)} s`} />
                <ValueRow label="Δt" name="Record step" value={`${record?.dt ?? "—"} s`} />
              </div>
              <Hint>
                R, I<sub>e</sub> and the design spectrum are not applied: the record × scale is the
                input. Results are the peak response over the whole record.
              </Hint>
            </>
          ) : !ladder ? (
            <p className="text-[11px] text-gray-500">
              The model cannot be resolved yet. Add members and supports first.
            </p>
          ) : (
            <>
              {/* 340px tall: the chart's viewBox is drawn 1:1 to this box. */}
              <div className="h-[340px] shrink-0 rounded-lg border border-gray-200 bg-[#F0F2F5] p-2">
                <SpectrumChart
                  SDS={ladder.SDS}
                  SD1={ladder.SD1}
                  S1={draft.S1}
                  TL={draft.TL}
                  R={draft.R}
                  Ie={draft.Ie}
                  riskCategory={draft.riskCategory}
                  periodSource={ladder.periodSource}
                  T={ladder.T}
                  Sa={spectralAcceleration(ladder.T, {
                    SDS: ladder.SDS,
                    SD1: ladder.SD1,
                    TL: draft.TL,
                  })}
                  modes={modeMarks}
                />
              </div>

              <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2 border-t border-gray-100 pt-2.5 sm:grid-cols-3">
                <ValueRow
                  label={<>F<sub>a</sub></>}
                  name="Fa"
                  value={fmt(ladder.Fa, 2)}
                  editable={refused.includes("Fa")}
                  supplied={draft.FaOverride}
                  onChange={(FaOverride) => edit({ FaOverride })}
                >
                  {callout("Fa")}
                </ValueRow>
                <ValueRow
                  label={<>F<sub>v</sub></>}
                  name="Fv"
                  value={fmt(ladder.Fv, 2)}
                  editable={refused.includes("Fv")}
                  supplied={draft.FvOverride}
                  onChange={(FvOverride) => edit({ FvOverride })}
                >
                  {callout("Fv")}
                </ValueRow>
                <ValueRow label={<>T<sub>0</sub></>} name="T0" value={`${fmt(ladder.T0)} s`} />

                <ValueRow label={<>S<sub>MS</sub></>} name="SMS" value={`${fmt(ladder.SMS)} g`} />
                <ValueRow label={<>S<sub>M1</sub></>} name="SM1" value={`${fmt(ladder.SM1)} g`} />
                <ValueRow
                  label={<>C<sub>u</sub>T<sub>a</sub></>}
                  name="CuTa"
                  value={`${fmt(ladder.cuTa)} s`}
                />

                <ValueRow label={<>S<sub>DS</sub></>} name="SDS" value={`${fmt(ladder.SDS)} g`} />
                <ValueRow label={<>S<sub>D1</sub></>} name="SD1" value={`${fmt(ladder.SD1)} g`} />
                <ValueRow label={<>C<sub>s</sub></>} name="Cs" value={fmt(ladder.Cs, 5)} />

                <ValueRow label="SDC" name="Seismic design category" value={ladder.sdc} />
                <ValueRow label="W" name="Seismic weight" value={run ? `${fmt(run.W, 1)} kN` : "—"} />
                <ValueRow
                  label={<>V<sub>ELF</sub></>}
                  name="ELF base shear"
                  value={run ? `${fmt(run.V, 1)} kN` : "—"}
                />
              </div>

              <div className="space-y-1">
                {ladder.siteNote && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                    {ladder.siteNote}
                  </p>
                )}
                {run && run.W <= 0 && (
                  <p className="rounded-md border border-amber-300 bg-amber-50 px-2.5 py-1.5 text-[11px] leading-snug text-amber-900">
                    W = 0: no mass-source case carries load above the base. Set the mass source
                    from the Vibration analysis case (MOD).
                  </p>
                )}
                <Hint>
                  {isMrs
                    ? "Every mode is combined by CQC and the base shear is scaled up to V_ELF where it falls short (§12.9.1.4). W comes from the Vibration analysis mass source."
                    : "Lateral forces Fx = Cvx·V at every massed node above the base, h measured from the lowest support. W comes from the Vibration analysis mass source."}
                </Hint>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-gray-100 px-4 py-2.5">
        <button
          onClick={onCancel}
          className="h-8 rounded-md border border-gray-200 px-4 text-xs font-medium text-gray-600 hover:bg-gray-50"
        >
          Cancel
        </button>
        <button
          onClick={() => onCommit(draft)}
          disabled={isLth ? !lthOk : !(draft.R > 0)}
          title={
            isLth
              ? !lthOk
                ? "Pick an available record and a positive time step."
                : undefined
              : !(draft.R > 0)
                ? "R must be greater than zero."
                : undefined
          }
          className={`h-8 rounded-md px-6 text-xs font-medium ${
            (isLth ? lthOk : draft.R > 0)
              ? "bg-[#1a2f5e] text-white transition-transform hover:scale-[1.02] active:scale-95"
              : "bg-gray-200 text-gray-400"
          }`}
        >
          OK
        </button>
      </div>
    </div>
  )

  return createPortal(
    <div
      style={{ zIndex: Z_DIALOG }}
      className="fixed inset-0 flex items-center justify-center bg-black/25 p-4"
    >
      {body}
      {openImport && (
        <GmImportDialog
          existing={groundMotions}
          onCommit={(rec) => {
            onImportRecord(rec)
            editLth({ recordId: rec.id, dt: undefined, unit: undefined })
            setOpenImport(false)
          }}
          onCancel={() => setOpenImport(false)}
        />
      )}
    </div>,
    document.body,
  )
}

/**
 * The saved file: the model plus everything the analysis and design are set
 * up with.
 *
 * Format history:
 *  - v1 (legacy): the bare `StructureModel`. Load cases, combinations and
 *    design settings lived in App state only and were lost on reopen.
 *  - v2: `{ format, version, model, loadCases, combinations,
 *    combinationSettings, groundMotions, design }`.
 *
 * ⚠ UNTRUSTED INPUT. Every field is guarded field by field and a malformed
 * part is dropped with a warning; parsing never throws. Defaults fill what a
 * file omits, so a v2 file written by an older build (or edited by hand)
 * still opens.
 */

import { isStructureModel, type SectionId, type StructureModel } from "./model"
import {
  CODE_PRESETS,
  DEFAULT_LOAD_CASES,
  LOAD_CASE_KINDS,
  MODAL_CASE_ID,
  type CodePreset,
  type LoadCase,
  type LoadCaseId,
  type LoadCaseKind,
  type LoadCombination,
  type LoadComboId,
} from "./load-cases"
import {
  defaultSeismicDefinition,
  lthSettingsOf,
  type SeismicDefinition,
  type SeismicLthSettings,
} from "./seismic/definition"
import { SEISMIC_CODES, SITE_CLASSES } from "./seismic/site"
import { RISK_CATEGORIES } from "./seismic/sdc"
import { SYSTEM_CT } from "./seismic/period"
import { resolveMassSource, type MassSource } from "./seismic/mass-source"
import { reconcileGroundMotions, type GroundMotionRecord } from "./seismic/ground-motion"
import { defaultDesignCriteria, type DesignCriteria } from "./design/core/criteria"
import {
  defaultSectionDesignInput,
  type SectionDesignInput,
  type SectionDesignInputs,
} from "./design/core/section-input"

export const DOCUMENT_FORMAT = "openanstruk-2d"
export const DOCUMENT_VERSION = 2

export interface CombinationSettings {
  enabled: boolean
  mode: "manual" | "code"
  preset: CodePreset
}

export interface DocumentState {
  model: StructureModel
  loadCases: Record<LoadCaseId, LoadCase>
  combinations: Record<LoadComboId, LoadCombination>
  combinationSettings: CombinationSettings
  groundMotions: GroundMotionRecord[]
  design: { criteria: DesignCriteria; sectionInputs: SectionDesignInputs }
}

export function serializeDocument(state: DocumentState): string {
  return JSON.stringify(
    {
      format: DOCUMENT_FORMAT,
      version: DOCUMENT_VERSION,
      model: state.model,
      loadCases: state.loadCases,
      combinations: state.combinations,
      combinationSettings: state.combinationSettings,
      groundMotions: state.groundMotions,
      design: state.design,
    },
    null,
    2,
  )
}

export type ParsedDocument =
  | { ok: true; legacy: true; model: StructureModel }
  | { ok: true; legacy: false; state: DocumentState; warnings: string[] }
  | { ok: false; reason: string }

// ── Guards ───────────────────────────────────────────────────────────────────

const isObj = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === "object" && !Array.isArray(v)
const finite = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v)

/**
 * `raw` laid over `base`, keeping only values of the same JSON type as the
 * default. Objects recurse; arrays are taken whole when both are arrays. A key
 * the default does not have is kept only when the default marks it optional
 * by being absent AND the value is a primitive — so optional numeric fields
 * (overrides, user periods) survive, while junk structures do not.
 */
function mergeOnto<T>(base: T, raw: unknown): T {
  if (!isObj(base) || !isObj(raw)) return base
  const out: Record<string, unknown> = { ...base }
  for (const [k, v] of Object.entries(raw)) {
    const d = (base as Record<string, unknown>)[k]
    if (d === undefined) {
      if (finite(v) || typeof v === "string" || typeof v === "boolean") out[k] = v
      continue
    }
    if (isObj(d)) out[k] = mergeOnto(d, v)
    else if (Array.isArray(d)) out[k] = Array.isArray(v) ? v : d
    else if (typeof d === typeof v && (typeof v !== "number" || Number.isFinite(v))) out[k] = v
  }
  return out as T
}

const KINDS = new Set<LoadCaseKind>([...LOAD_CASE_KINDS, "Modal"])

/** Enumerated fields must hold one of their values, else take the default. */
const SEISMIC_ENUMS: Partial<Record<keyof SeismicDefinition, readonly string[]>> = {
  analysis: ["elf", "mrs", "lth"],
  code: SEISMIC_CODES,
  siteClass: SITE_CLASSES,
  riskCategory: RISK_CATEGORIES,
  system: Object.keys(SYSTEM_CT),
  periodMode: ["approximate", "computed", "user"],
}

function guardSeismic(raw: Record<string, unknown>): SeismicDefinition {
  const base = defaultSeismicDefinition()
  const def = mergeOnto<SeismicDefinition>(base, raw)
  for (const [k, allowed] of Object.entries(SEISMIC_ENUMS)) {
    const key = k as keyof SeismicDefinition
    if (!allowed!.includes(def[key] as string)) (def as unknown as Record<string, unknown>)[key] = base[key]
  }
  if (isObj(raw.lth)) def.lth = lthSettingsOf({ lth: raw.lth as unknown as SeismicLthSettings })
  return def
}

function guardLoadCases(raw: unknown, warnings: string[]): Record<LoadCaseId, LoadCase> {
  const defaults = DEFAULT_LOAD_CASES()
  const out: Record<LoadCaseId, LoadCase> = {}
  if (!isObj(raw)) {
    warnings.push("The file's load cases were unreadable; the defaults were used.")
    return defaults
  }
  for (const [id, v] of Object.entries(raw)) {
    if (!isObj(v) || typeof v.name !== "string" || !KINDS.has(v.kind as LoadCaseKind)) {
      warnings.push(`Load case "${id}" was malformed and was dropped.`)
      continue
    }
    const kind = v.kind as LoadCaseKind
    // The locked cases are identified by id, never trusted from the file.
    if ((kind === "Modal") !== (id === MODAL_CASE_ID)) {
      warnings.push(`Load case "${id}" claimed an invalid type and was dropped.`)
      continue
    }
    const c: LoadCase = {
      id,
      name: v.name,
      kind,
      enabled: v.enabled === true,
      ...(id === "selfweight" || id === MODAL_CASE_ID ? { locked: true } : {}),
    }
    if (kind === "Seismic" && isObj(v.seismic)) c.seismic = guardSeismic(v.seismic)
    if (kind === "Modal" && isObj(v.modal) && isObj(v.modal.terms)) {
      const terms: MassSource["terms"] = {}
      for (const [cid, t] of Object.entries(v.modal.terms)) {
        if (isObj(t) && finite(t.factor) && typeof t.include === "boolean") {
          terms[cid] = { factor: Math.max(t.factor, 0), include: t.include }
        }
      }
      c.modal = { terms }
    }
    out[id] = c
  }
  // The two locked cases always exist, whatever the file held.
  for (const id of [MODAL_CASE_ID, "selfweight"]) {
    if (!out[id]) out[id] = defaults[id]
  }
  // Keep Modal first (it heads the Load Case table), then the file's order.
  const ordered: Record<LoadCaseId, LoadCase> = { [MODAL_CASE_ID]: out[MODAL_CASE_ID] }
  for (const [id, c] of Object.entries(out)) if (id !== MODAL_CASE_ID) ordered[id] = c
  const modal = ordered[MODAL_CASE_ID]
  if (modal.modal) modal.modal = resolveMassSource(modal.modal, ordered)
  return ordered
}

function guardCombinations(
  raw: unknown,
  cases: Record<LoadCaseId, LoadCase>,
  warnings: string[],
): Record<LoadComboId, LoadCombination> {
  const out: Record<LoadComboId, LoadCombination> = {}
  if (!isObj(raw)) return out
  const presets = new Set<string>(CODE_PRESETS.map((p) => p.id))
  for (const [id, v] of Object.entries(raw)) {
    if (!isObj(v) || typeof v.name !== "string" || !Array.isArray(v.terms)) {
      warnings.push(`Combination "${id}" was malformed and was dropped.`)
      continue
    }
    const terms = v.terms.filter(
      (t): t is { factor: number; caseId: string } =>
        isObj(t) && finite(t.factor) && typeof t.caseId === "string" && !!cases[t.caseId] &&
        cases[t.caseId].kind !== "Modal",
    )
    if (terms.length < v.terms.length) {
      warnings.push(`Combination "${v.name}" referenced missing cases; those terms were dropped.`)
    }
    if (terms.length === 0) continue
    out[id] = {
      id,
      name: v.name,
      terms: terms.map((t) => ({ factor: t.factor, caseId: t.caseId })),
      source: v.source === "preset" ? "preset" : "custom",
      ...(typeof v.presetCode === "string" && presets.has(v.presetCode)
        ? { presetCode: v.presetCode as CodePreset }
        : {}),
      enabled: v.enabled !== false,
    }
  }
  return out
}

function guardCombinationSettings(raw: unknown): CombinationSettings {
  const presets = new Set<string>(CODE_PRESETS.map((p) => p.id))
  const r = isObj(raw) ? raw : {}
  return {
    enabled: r.enabled !== false,
    mode: r.mode === "code" ? "code" : "manual",
    preset: typeof r.preset === "string" && presets.has(r.preset) ? (r.preset as CodePreset) : "ASCE7-22",
  }
}

function guardDesign(raw: unknown, model: StructureModel): DocumentState["design"] {
  const r = isObj(raw) ? raw : {}
  const criteria = mergeOnto(defaultDesignCriteria(), r.criteria)
  const sectionInputs: SectionDesignInputs = {}
  if (isObj(r.sectionInputs)) {
    for (const [id, v] of Object.entries(r.sectionInputs)) {
      if (!model.sections[id as SectionId] || !isObj(v)) continue
      sectionInputs[id] = mergeOnto<SectionDesignInput>(defaultSectionDesignInput(id), v)
    }
  }
  return { criteria, sectionInputs }
}

// ── Parse ────────────────────────────────────────────────────────────────────

export function parseDocument(text: string): ParsedDocument {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    return { ok: false, reason: "invalid or corrupted JSON." }
  }
  if (isStructureModel(json)) return { ok: true, legacy: true, model: json }
  if (!isObj(json) || json.format !== DOCUMENT_FORMAT) {
    return { ok: false, reason: "not a valid OpenAnstruk model." }
  }
  if (!isStructureModel(json.model)) {
    return { ok: false, reason: "the file's model is missing or malformed." }
  }
  const warnings: string[] = []
  if (finite(json.version) && json.version > DOCUMENT_VERSION) {
    warnings.push(
      `This file was written by a newer version (format ${json.version}); anything this version does not know was ignored.`,
    )
  }
  const model = json.model
  const loadCases = guardLoadCases(json.loadCases, warnings)
  const combinations = guardCombinations(json.combinations, loadCases, warnings)
  const groundMotions = reconcileGroundMotions(json.groundMotions)
  return {
    ok: true,
    legacy: false,
    warnings,
    state: {
      model,
      loadCases,
      combinations,
      combinationSettings: guardCombinationSettings(json.combinationSettings),
      groundMotions,
      design: guardDesign(json.design, model),
    },
  }
}

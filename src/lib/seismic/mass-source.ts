/**
 * The mass source — which load cases become mass, and at what factor.
 *
 * Pure: no React, no model.
 *
 * One per document, stored on the Modal case (`LoadCase.modal`). Mass is a
 * property of the building, not of an earthquake case: the modal solution and
 * every seismic case read the same mass: one mass source shared by every
 * seismic case, as in OpenANSTRUK-3D's `mass-source.ts`.
 *
 * ⚠ ONLY GRAVITY CASES ARE ELIGIBLE. Dead (Selfweight and SIDL included) at 1.0
 * and any live load at 0.25 by default; wind, rain, snow and the seismic cases
 * themselves never become mass. A lateral case turned into mass would put the
 * earthquake's own load into the inertia that generates it.
 *
 * ⚠ INDEPENDENT OF THE CASE'S OWN CHECKBOX. Unticking Dead in the Load Case
 * table removes its loads from the static solve; it does not make the building
 * lighter. Mass inclusion is decided here alone.
 */

import type { LoadCase, LoadCaseId, LoadCaseKind } from "../load-cases"

export interface MassCaseTerm {
  factor: number
  include: boolean
}

export interface MassSource {
  terms: Record<LoadCaseId, MassCaseTerm>
}

/** Default factor per eligible kind. Kinds not listed are never mass. */
export const MASS_DEFAULTS: Partial<Record<LoadCaseKind, number>> = {
  Dead: 1.0,
  Live: 0.25,
  "Roof Live": 0.25,
}

export function isMassEligible(c: LoadCase): boolean {
  return MASS_DEFAULTS[c.kind] !== undefined
}

export function massEligibleCases(cases: Record<LoadCaseId, LoadCase>): LoadCase[] {
  return Object.values(cases).filter(isMassEligible)
}

/**
 * The mass source brought into step with the case list: every eligible case
 * has a term (new ones at the kind default), ineligible and deleted cases have
 * none. A term the user edited is kept — unless the case's kind changed to
 * another default, in which case the stored factor is kept too: the user's
 * number outranks the table.
 */
export function resolveMassSource(
  source: MassSource | undefined,
  cases: Record<LoadCaseId, LoadCase>,
): MassSource {
  const terms: Record<LoadCaseId, MassCaseTerm> = {}
  for (const c of massEligibleCases(cases)) {
    terms[c.id] = source?.terms[c.id] ?? { factor: MASS_DEFAULTS[c.kind] ?? 0, include: true }
  }
  return { terms }
}

/** The terms that actually contribute: ticked and non-zero. */
export function activeMassTerms(source: MassSource): { caseId: LoadCaseId; factor: number }[] {
  return Object.entries(source.terms)
    .filter(([, t]) => t.include && t.factor !== 0)
    .map(([caseId, t]) => ({ caseId, factor: t.factor }))
}
